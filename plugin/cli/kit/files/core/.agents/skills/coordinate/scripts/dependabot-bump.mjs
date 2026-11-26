// Does a Dependabot pull request only bump versions (#226)? own-branch.mjs calls it for a pull request opened by
// dependabot[bot] from a branch in the repo. The opener alone proves nothing about the commits: anyone who can push
// to the branch can add one. So a bump passes only when all of these hold, and fails closed otherwise:
// - every changed file is a modified package.json or an npm-family text lockfile, outside the agent and GitHub
//   folders: none added, removed or renamed;
// - every commit is authored by dependabot[bot], committed by it or GitHub's web-flow, and verified;
// - each package.json, read at the merge base and at the head, differs only in the versions of existing entries of
//   its dependency fields, and each new version is a plain registry range: no URL, git, file or alias form;
// - each lockfile's new lines point at the npm registry only.
// It reads the API only. A read with no answer throws, which own-branch.mjs turns into exit 2.
import { isDeepStrictEqual } from "node:util";
import { RULE_FILES } from "./agent-files.mjs";

const ONLY = "The local gate only runs the loop's own branches.";
export const DEPENDABOT = "dependabot[bot]";
// Dependabot's signed commits name GitHub's web-flow as committer.
const COMMITTERS = new Set([DEPENDABOT, "web-flow"]);
const BUMP_BRANCH = /^dependabot(?:\/[A-Za-z0-9._-]+)+$/;
// npm's manifest and text lockfiles, the ecosystem the packs' Dependabot config names. pnpm-workspace.yaml and .npmrc
// stay out: they decide which install scripts run and where packages come from. Bun's lockfiles stay out: no pack
// uses Bun, and bun.lockb is binary, so it can't be read.
const MANIFEST = /(?:^|\/)package\.json$/;
const LOCKFILE = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock)$/;
const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
// A plain version or range: digits first (after an operator), then only range characters. No ":" or "/", so no
// URL, git, github, file, link, workspace or npm: alias form, and no dist-tag.
const VERSION = /^(?:[\^~]|[<>]=?|=)?v?\d[0-9A-Za-z.+\-<>=^~|* ]*$/;
const REGISTRY = /^https:\/\/registry\.(?:npmjs\.org|yarnpkg\.com)\//;
const URL_IN = /[a-z][a-z0-9+.-]*:\/\/[^\s"',)}]*/gi;
// Specs that resolve outside the registry, as a lockfile writes them: pnpm's link:, file: and directory resolutions,
// npm's workspace links, yarn's portal: and patch:. An npm: alias stays on the registry.
const NOT_REGISTRY = /(?:^|[\s"'(@,{])(?:file|link|directory|git|git\+[a-z]+|github|gitlab|bitbucket|gist|ssh|portal|patch|exec):|"link":\s*true/i;
// npm's and yarn's "resolved" value: a registry URL, never a path or a git spec without a scheme.
const RESOLVED = /\bresolved"?:?\s*"([^"]*)"/;

/** A file list that can't be trusted for the head: short, or read while the head moved. Exit 2, never a pass. */
export class Unsettled extends Error {}

const refuse = (why) => ({ pass: false, why: `${why} ${ONLY}` });
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Why a manifest change is more than version bumps, or null. `before` and `after` are the file's texts. */
export function manifestChange(before, after) {
  let a;
  let b;
  try {
    [a, b] = [JSON.parse(before), JSON.parse(after)];
  } catch {
    return "isn't valid JSON at both ends";
  }
  if (!isObject(a) || !isObject(b)) return "isn't a JSON object at both ends";
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!DEP_FIELDS.includes(key)) {
      if (!isDeepStrictEqual(a[key], b[key])) return `changes "${key}", which isn't a dependency field`;
      continue;
    }
    const [from, to] = [a[key], b[key]];
    if (!isObject(from) || !isObject(to)) return `"${key}" isn't an object at both ends`;
    const names = Object.keys(from);
    if (names.length !== Object.keys(to).length || !names.every((n) => Object.hasOwn(to, n))) return `adds or removes a package in "${key}"`;
    for (const name of names) {
      if (from[name] === to[name]) continue;
      if (typeof to[name] !== "string" || !VERSION.test(to[name])) return `sets ${key}.${name} to something other than a registry version`;
    }
  }
  return null;
}

/** Why a lockfile's new lines point outside the npm registry, or null. Lines already at the merge base aren't judged. */
export function lockfileChange(before, after) {
  const old = new Set(before.split(/\r?\n/));
  for (const line of after.split(/\r?\n/)) {
    if (old.has(line)) continue;
    const off = (line.match(URL_IN) ?? []).find((url) => !REGISTRY.test(url));
    if (off) return `points a package at ${off}, not the npm registry`;
    const resolved = line.match(RESOLVED)?.[1];
    if (resolved !== undefined && !REGISTRY.test(resolved)) return `resolves a package to ${resolved}, not the npm registry`;
    if (NOT_REGISTRY.test(line.replace(URL_IN, ""))) return "points a package at a git, file, link or local source, not the npm registry";
  }
  return null;
}

/** Why a commit isn't Dependabot's own, or null. */
const notDependabots = ({ sha, author, committer, commit }) => {
  if (author?.login !== DEPENDABOT) return `${sha} is authored by ${author?.login ?? "an account GitHub can't name"}`;
  if (!COMMITTERS.has(committer?.login)) return `${sha} is committed by ${committer?.login ?? "an account GitHub can't name"}`;
  if (commit?.verification?.verified !== true) return `${sha} isn't verified`;
  return null;
};

/**
 * Pass for a Dependabot pull request that only bumps versions. `read` gives `files()` (every file, for the head),
 * `commits()` (every commit), `mergeBase()` (the merge base's sha) and `text(path, sha)` (a file's text at a commit).
 * Each is called only once the checks before it pass.
 */
export function dependabotBump(pull, read) {
  const { number, changed_files: total, commits: count, head: { ref = "", sha } = {} } = pull;
  if (!BUMP_BRANCH.test(ref)) return refuse(`Dependabot's ${ref} isn't a dependabot/ branch with only letters, digits, dots, dashes and underscores.`);
  if (total > 3000) return refuse(`#${number} changes ${total} files, more than GitHub lists (3000).`);
  const files = read.files();
  if (!files.length) return refuse(`#${number} changes no files, so there's no bump to check.`);
  const other = files.filter((f) => f.status !== "modified" || f.previous_filename || RULE_FILES.test(f.filename) || !(MANIFEST.test(f.filename) || LOCKFILE.test(f.filename)));
  if (other.length) return refuse(`Dependabot's #${number} changes more than existing manifests and lockfiles: ${other.map((f) => `${f.filename} (${f.status})`).join(", ")}.`);
  const commits = read.commits();
  if (commits.length !== count || commits.at(-1)?.sha !== sha) throw new Unsettled(`GitHub listed ${commits.length} commits ending at ${commits.at(-1)?.sha}, but #${number} has ${count} ending at ${sha}`);
  const stranger = commits.map(notDependabots).find(Boolean);
  if (stranger) return refuse(`Not every commit on #${number} is Dependabot's: ${stranger}.`);
  const base = read.mergeBase();
  for (const { filename } of files) {
    const change = (MANIFEST.test(filename) ? manifestChange : lockfileChange)(read.text(filename, base), read.text(filename, sha));
    if (change) return refuse(`Dependabot's #${number}: ${filename} ${change}.`);
  }
  return { pass: true, why: `${sha}: ${ref} is a Dependabot bump of dependency versions only` };
}
