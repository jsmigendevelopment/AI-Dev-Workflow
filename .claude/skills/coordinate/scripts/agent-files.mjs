#!/usr/bin/env node
// The agent-file guard. `coordinate` runs it from the session before every merge (`gate`), and a repo that
// hasn't removed .github/workflows/agent-files.yml yet runs it there too (`--pr`). A pull request that changes the
// agents' rules, check code or the automation level needs, on Recommended and Hands-on, the
// `human-approved` label. On Full automation the label doesn't count (agents share the owner's login,
// so it proves nothing, #103): only the weakening review does, a comment from someone with write access
// that is the line
//   Weakening review: pass @ <full head sha>
// `gate` also takes that line at an earlier commit when the head is only clean merges of origin/main on top of it, each
// proved as `insights.mjs carry` proves one, in the checkout this file is in (#478).
// On every level, a writer's fail at the head refuses first, whatever the labels say. A fail that is
// there when the guard decides beats every pass; one deleted, or edited to drop the fail line, doesn't.
// `gate` runs this file from the default branch, as does a workflow not yet removed, and reads the level from
// docs/stack.md there, so a pull request can't change either. The pull request's files, labels and comments are read
// through the API as data; none of its code runs.
//   node agent-files.mjs gate <n> --repo owner/name --head <sha>   before a merge, from your checkout of main: the
//                                          guard on the live files, comments and labels at that head, with
//                                          docs/stack.md from the default branch. Needs no workflow. It fails if
//                                          the pull request moved.
//   node agent-files.mjs --pr <n>          the check of a workflow not yet removed (env REPO, GH_TOKEN, HEAD_SHA: the event's head)
//   node agent-files.mjs verify-run <n> [--repo owner/name] [--head <sha>]   optional, where a workflow isn't removed yet: the head's agent-files
//                                          runs are real and green, and the guard still passes on the live comments
//                                          and labels. --head pins the sha; it fails if the pull request moved.
// Tests: --files <json> --packages <json> --stack <file> --comments <json> --labels a,b --head <sha> --trusted a,b
//        (--packages maps each package.json path to { "base": text, "head": text }; null is a side without the file)
//        verify-run --runs <json> [the flags above, for the live decision]
// Exit 0 passes, 1 fails. No dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandFor } from "./command-for.mjs";

/** Paths that change the agents' rules, the checks, or the automation level the guard reads. */
// Any case: a case-insensitive checkout (macOS, Windows) puts `.Claude/x` in `.claude/` and opens
// `Claude.md` as CLAUDE.md. The agent folders and instruction files count at any depth (an app in a
// subfolder loads its own); `.github/` and docs/stack.md only at the root, where GitHub and the guard read
// them. `.gitmodules` counts too: a submodule can bring in any of these.
export const RULE_FILES = /(?:^|\/)(?:\.agents|\.claude|\.codex)(?:\/|$)|^\.github(?:\/|$)|^docs\/stack\.md$|(?:^|\/)(?:AGENTS(?:\.override)?|CLAUDE(?:\.local)?|GEMINI)\.md$|(?:^|\/)\.gitmodules$/i;
/** Check code (#162): `.mcp.json`, lint, format, type and test-runner config, budgets and the packs' check scripts. */
// Any depth, any case, like the agent folders: a monorepo's apps each have their own. Under a `scripts/` folder only
// the check folders and `check-*` files; its deploy, connect, cloudflare and generate scripts aren't checks.
export const CHECK_FILES = new RegExp([
  String.raw`(?:^|/)(?:\.mcp\.json|eslint(?:\.[^/]+)?\.config\.[^/]+|\.eslintrc[^/]*|\.eslintignore|eslint-rules\.[^/]+|\.prettierrc[^/]*`,
  String.raw`|prettier\.config\.[^/]+|\.prettierignore|knip\.jsonc?|knip\.config\.[^/]+|\.jscpd\.json|lefthook\.ya?ml|\.semgrep\.ya?ml`,
  String.raw`|tsconfig[^/]*\.jsonc?|(?:vitest\.(?:config|workspace)|jest\.config|playwright\.config)\.[^/]+|\.?lighthouserc\.[^/]+`,
  // Package-manager settings and other manifest names change how scripts run (#220, decision 220-1); .gitattributes
  // decides what the size rule counts (#220).
  String.raw`|\.npmrc|\.yarnrc(?:\.ya?ml)?|pnpm-workspace\.ya?ml|\.pnpmfile\.c?js|package\.ya?ml|package\.json5|\.gitattributes)$`,
  String.raw`|(?:^|/)\.semgrep(?:/|$)`,
  String.raw`|(?:^|/)scripts/(?:(?:budgets|checks|lint|pr|migrations)/|(?:[^/]+/)*check-[^/]*$)`,
].join(""), "i");
// Every protected path: the agents' rules and level, or check code.
const isProtected = (path) => RULE_FILES.test(path) || CHECK_FILES.test(path);
/** A package.json at any depth (#163): its scripts and inline check config are check code, its dependencies aren't. */
export const PACKAGE_FILE = /(?:^|\/)package\.json$/i;
/**
 * The package.json keys that are check code: `pnpm check` lives in `scripts`, the rest hold check config inline,
 * pick the packages the checks run over (`workspaces`), or can swap a checker for another package (`pnpm`,
 * `overrides`, `resolutions`; #220, decision 220-1).
 */
export const CHECK_KEYS = ["scripts", "eslintConfig", "eslintIgnore", "prettier", "stylelint", "jest", "knip", "jscpd", "lint-staged",
  "workspaces", "pnpm", "overrides", "resolutions"];

// One side of a package.json as an object. A missing side is empty; an unreadable or unparsable one is an error.
function packageSide(side, name) {
  if (side === null || side === undefined) return { value: {} };
  if (typeof side !== "string") return { error: `couldn't read the ${name}: ${side.error ?? "no text"}` };
  let value;
  try {
    value = JSON.parse(side);
  } catch (error) {
    return { error: `the ${name} isn't valid JSON: ${error.message}` };
  }
  return value && typeof value === "object" && !Array.isArray(value) ? { value } : { error: `the ${name} isn't a JSON object` };
}

/**
 * The package.json files whose check keys changed, as "path (scripts, prettier)". `packages` maps each path to
 * { base, head }: text, null when the file isn't there, or { error } when it couldn't be read. Every changed
 * package.json needs an entry: one with none, or a side that can't be read or parsed, counts as changed (fails closed).
 */
export function packageChanges(changed, packages = {}) {
  const paths = [...new Set([...changed.filter((p) => PACKAGE_FILE.test(p)), ...Object.keys(packages)])];
  return paths.flatMap((path) => {
    const sides = packages[path] ?? { base: { error: "no text" } };
    const [base, head] = [packageSide(sides.base, "base"), packageSide(sides.head, "head")];
    const error = base.error ?? head.error ?? (sides.base == null && sides.head == null ? "it isn't there at either side" : null);
    if (error) return [`${path} (${error})`];
    const keys = CHECK_KEYS.filter((key) => JSON.stringify(base.value[key]) !== JSON.stringify(head.value[key]));
    return keys.length ? [`${path} (${keys.join(", ")})`] : [];
  });
}
/** A test file (#164): `.test.` or `.spec.` in its name, or a test, e2e or snapshot folder on its path. */
export const TEST_FILE = /(?:^|\/)[^/]*\.(?:test|spec)\.[^/]*$|(?:^|\/)(?:tests?|__tests__|e2e|__snapshots__|[^/]*-snapshots)\//i;

/**
 * Tests a pull request deletes (#164): a removed test file, or one renamed to a name that isn't a test. Adding or
 * editing a test isn't listed: that stays the weakening review's reading, so a normal build needs no extra review.
 */
export const deletedTests = (files) => files.flatMap((f) => {
  if (f.status === "removed" && TEST_FILE.test(f.filename)) return [`${f.filename} (a deleted test)`];
  if (f.status === "renamed" && f.previous_filename && TEST_FILE.test(f.previous_filename) && !TEST_FILE.test(f.filename)) {
    return [`${f.previous_filename} (a deleted test: renamed to ${f.filename})`];
  }
  return [];
});

// A submodule entry in the API's file list: its patch is a "Subproject commit <sha>" line.
const SUBPROJECT = /^[-+]Subproject commit [0-9a-f]{40}/m;
export const GUARD_WORKFLOW = ".github/workflows/agent-files.yml";
// GitHub's pull request file list stops at 3000 files.
export const MAX_FILES = 3000;
// A pass line is exact. A fail line counts with anything after the sha: "fail @ <sha> (removed a test)".
const PASS_LINE = /^Weakening review: pass @ ([0-9a-f]{40})\s*$/gm;
const FAIL_LINE = /^Weakening review: fail @ ([0-9a-f]{40})\b/gm;
const WRITE = new Set(["admin", "maintain", "write"]);
// GitHub reads "triage" as permission "read"; "none" is a user with no access.
const READ = new Set(["read", "triage", "none"]);
// A path with a line break or control character could forge a log command, so it's refused.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f]");

/** The automation level in a docs/stack.md text: "- **Level:** full". Recommended when it's missing. */
export const level = (stack = "") => stack.match(/\*\*Level:\*\*\s*`?([a-z-]+)/i)?.[1].toLowerCase() ?? "recommended";

/** Every path a pull request touches, from the API's file list: a rename counts both names. */
export const changedPaths = (files) => files.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean));

/** Submodule entries (git mode 160000) in the API's file list: every one is protected, whatever its path. */
export const submodules = (files) => files.filter((f) => f.mode === "160000" || SUBPROJECT.test(f.patch ?? "")).map((f) => f.filename);

/** The verdicts a comment gives at this commit: a Set of "pass" and "fail". */
const verdictsIn = (body = "", head) => new Set([
  ...[...body.matchAll(PASS_LINE)].filter((m) => m[1] === head).map(() => "pass"),
  ...[...body.matchAll(FAIL_LINE)].filter((m) => m[1] === head).map(() => "fail"),
]);

/** A comment's verdict at this commit: "pass", "fail", or null. Both lines in one comment count as a fail. */
export function verdictOf(body, head) {
  const found = verdictsIn(body, head);
  return found.has("fail") ? "fail" : found.has("pass") ? "pass" : null;
}

/** The verdict at the head from trusted logins: a fail there now beats every pass, in any order. */
export function headVerdict(comments, head, trusted) {
  const verdicts = comments.filter((c) => trusted.has(c.user?.login)).map((c) => verdictOf(c.body, head));
  return verdicts.includes("fail") ? "fail" : verdicts.includes("pass") ? "pass" : null;
}

/** Pass or fail, and why. `unchecked` maps a voter whose access got no answer to why. */
export function decide({ changed = [], labels = [], stack = "", comments = [], head = "", trusted = new Set(), unchecked = new Map(), expected = null, total = null, modules = [], packages = {}, deleted = [] }) {
  if (expected && head && expected !== head) return { pass: false, why: `The pull request's head moved from ${expected} to ${head}. The run for the new head decides.` };
  if (total !== null && (total > MAX_FILES || total > changed.length)) {
    return { pass: false, why: `The pull request changes ${total} files, and the API listed ${changed.length} (it stops at ${MAX_FILES}). The guard can't see them all, so it fails. Split the pull request.` };
  }
  const odd = changed.filter((p) => CONTROL.test(p));
  if (odd.length) return { pass: false, why: `A file name has a control character or a line break: ${odd.map((p) => JSON.stringify(p)).join(", ")}. Rename it.` };
  const rules = [...new Set([...changed.filter(isProtected), ...modules.map((p) => `${p} (a submodule)`), ...packageChanges(changed, packages), ...deleted])];
  if (!rules.length) return { pass: true, why: "no agent rule, check or level files changed" };
  const full = level(stack) === "full";
  const blocked = comments.find((c) => unchecked.has(c.user?.login) && verdictOf(c.body, head) === "fail");
  if (blocked) return { pass: false, why: `${unchecked.get(blocked.user.login)}. The guard fails until GitHub answers: a fail is never dropped.` };
  const verdict = headVerdict(comments, head, trusted);
  if (verdict === "fail") {
    return { pass: false, why: `The weakening review failed at ${head}. A fail refuses on every level, whatever the labels say:\n${rules.join("\n")}` };
  }
  if (full && verdict === "pass") return { pass: true, why: `the weakening review passed at ${head}` };
  if (!full && labels.includes("human-approved")) return { pass: true, why: "the human-approved label" };
  const need = full ? `a "Weakening review: pass @ ${head || "<head sha>"}" comment from someone with write access (Full automation: the label doesn't count)`
    : "the human-approved label";
  // `need` marks the one refusal a carried pass can lift (#478): Full, and no verdict at this commit.
  return { pass: false, need: full, why: `These files change the agents' rules or checks, or delete tests, and need ${need}:\n${rules.join("\n")}` };
}

/** Before a merge: the runs are real and green, and the live decision still passes (a fail posted later blocks it). */
export function verifyMerge(runs, live) {
  const r = verifyRuns(runs);
  if (!r.pass) return r;
  if (!live.pass) return { pass: false, why: `The check run passed, but the guard fails now: ${live.why}` };
  return { pass: true, why: `${r.why}, and the guard still passes now` };
}

/**
 * Before a merge, where a repo hasn't removed the guard's workflow: every `agent-files` check run on the head
 * comes from its own `agent-files.yml` (a second job with that name is refused), and the latest run of the guard
 * on a pull_request_target event passed.
 * Runs: [{ id, status, conclusion, path, event }].
 */
export function verifyRuns(runs) {
  const others = runs.filter((r) => r.path !== GUARD_WORKFLOW);
  if (others.length) return { pass: false, why: `A check named agent-files comes from another file than the guard's: ${[...new Set(others.map((r) => r.path))].join(", ")}. Refused.` };
  const guard = runs.filter((r) => r.event === "pull_request_target").sort((a, b) => a.id - b.id);
  const latest = guard.at(-1);
  if (!latest) return { pass: false, why: "No agent-files run from the guard's workflow on a pull_request_target event at the head." };
  if (latest.status !== "completed" || latest.conclusion !== "success") return { pass: false, why: `The latest agent-files run is ${latest.status}, ${latest.conclusion ?? "no result yet"}.` };
  return { pass: true, why: `agent-files passed at the head (run ${latest.id}, ${GUARD_WORKFLOW}, pull_request_target)` };
}

/** `gh api` with these arguments, its output as text. Throws when gh fails. */
export function gh(...args) {
  // By gh's full path on PATH, never a gh.exe in the current folder or the repo (#274).
  const how = commandFor("gh", ["api", ...args]);
  // Not on PATH is ENOENT, as a bare gh's start would say: callers tell the person to install it.
  if (how.why) throw Object.assign(new Error(how.why), { code: /isn't on your PATH$/.test(how.why) ? "ENOENT" : undefined });
  return execFileSync(how.file, how.args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: how.env, windowsVerbatimArguments: how.verbatim });
}
/** Every page of an API list, as one array. */
export const pages = (path) => JSON.parse(gh("--paginate", "--slurp", path)).flat();

/** An access check that got no answer: a proxy's 403, a 5xx, a rate limit, the network. Never "no access". */
export class AccessUnknown extends Error {}

// gh ends its error with "(HTTP nnn)". Only that trailing status counts, not one quoted in the message (#158).
const httpStatus = (error) => Number(String(error.stderr ?? "").trim().match(/\(HTTP (\d{3})\)$/)?.[1]) || null;
const reason = (error) => String(error.stderr || error.message).trim();

// Some proxies refuse the permission path with a 403 but allow `user` and `repos/<repo>` (#131). For the
// token's own login, the repo's `permissions` answers the same question. Anyone else stays unknown.
function ownAccess(repo, login, me, refused) {
  let perms;
  try {
    if (me().toLowerCase() === login.toLowerCase()) perms = JSON.parse(gh(`repos/${repo}`)).permissions;
  } catch (error) {
    throw new AccessUnknown(`Couldn't check ${login}'s access to ${repo}: ${reason(refused)}; then ${reason(error)}`);
  }
  if (!perms) throw new AccessUnknown(`Couldn't check ${login}'s access to ${repo}: ${reason(refused)}`);
  return Boolean(perms.push || perms.maintain || perms.admin);
}

/** True or false only from a real answer: write or higher, or read, triage, none, or a 404 for the user. */
function canWrite(repo, login, me) {
  let p;
  try {
    p = JSON.parse(gh(`repos/${repo}/collaborators/${login}/permission`));
  } catch (error) {
    if (httpStatus(error) === 404) return false;
    return ownAccess(repo, login, me, error);
  }
  if (WRITE.has(p.permission) || WRITE.has(p.role_name)) return true;
  if (READ.has(p.permission)) return false;
  throw new AccessUnknown(`Couldn't check ${login}'s access to ${repo}: GitHub answered permission ${JSON.stringify(p.permission)}`);
}

/**
 * Sorts logins by access: `writers` have write, maintain or admin; `unchecked` maps each login whose check got
 * no answer to why. A claim or a pass only adds trust, so a caller drops the unchecked ones there. A fail must
 * never be dropped, so an unchecked fail still fails the guard (#158).
 */
export function access(repo, logins) {
  const writers = new Set();
  const unchecked = new Map();
  for (const login of logins) {
    try {
      if (canWrite(repo, login, me)) writers.add(login);
    } catch (error) {
      if (!(error instanceof AccessUnknown)) throw error;
      unchecked.set(login, error.message);
    }
  }
  return { writers, unchecked };
}

// The token's own login, read at most once per run.
let self;
const me = () => (self ??= JSON.parse(gh("user")).login);

/** docs/stack.md as it is on the default branch, from the API. */
function defaultStack(repo) {
  try {
    return Buffer.from(JSON.parse(gh(`repos/${repo}/contents/docs/stack.md`)).content, "base64").toString("utf8");
  } catch {
    return ""; // no docs/stack.md on the default branch: Recommended, the careful default
  }
}

/** A file's text at a commit, from the contents API: null on a 404. Throws on any other failure, or on no text. */
function textAt(repo, path, ref) {
  let file;
  try {
    file = JSON.parse(gh(`repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`));
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
  // A folder, a symlink out of the repo or a file over 1 MB comes back without base64 text. A symlink to a file in
  // the repo comes back as that file, with its own path: only a reply for the path asked for is the file itself.
  if (file?.type !== "file" || file.encoding !== "base64") throw new Error(`the contents API gave no text (type ${file?.type}, encoding ${file?.encoding})`);
  if (file.path !== path) throw new Error("the contents API answered with another file (a symlink?)");
  return Buffer.from(file.content, "base64").toString("utf8");
}

// The sides a package.json may be missing from, by the file list: an added or copied file has no base, a removed one
// no head, and a rename's new name no base and its old name no head. Listed twice, a side may be missing only if both say so.
function packageFiles(files) {
  const found = new Map();
  const add = (path, base, head) => {
    if (!PACKAGE_FILE.test(path)) return;
    const was = found.get(path) ?? { base: true, head: true };
    found.set(path, { base: was.base && base, head: was.head && head });
  };
  for (const f of files) {
    add(f.filename, ["added", "copied", "renamed"].includes(f.status), f.status === "removed");
    if (f.previous_filename) add(f.previous_filename, false, f.status === "renamed");
  }
  return found;
}

/** Each changed package.json at the merge base and at the head (#163), in the shape packageChanges() reads. */
function packagesFromApi(repo, pull, files) {
  const wanted = packageFiles(files);
  if (!wanted.size) return {};
  let mergeBase;
  try {
    // The live base branch, not the base tip GitHub stored for the pull request: the merge that will really happen.
    const base = pull.base.ref.split("/").map(encodeURIComponent).join("/");
    mergeBase = JSON.parse(gh(`repos/${repo}/compare/${base}...${pull.head.sha}`)).merge_base_commit.sha;
  } catch (error) {
    mergeBase = { error: `no merge base: ${reason(error)}` };
  }
  const side = (path, ref, mayBeMissing) => {
    if (typeof ref !== "string") return ref;
    try {
      const text = textAt(repo, path, ref);
      return text !== null || mayBeMissing ? text : { error: `not found at ${ref}, though the file list says it's there` };
    } catch (error) {
      return { error: `at ${ref}: ${reason(error)}` };
    }
  };
  return Object.fromEntries([...wanted].map(([path, missing]) => [path, { base: side(path, mergeBase, missing.base), head: side(path, pull.head.sha, missing.head) }]));
}

function fromApi(repo, pr, expected, stackText) {
  const pull = JSON.parse(gh(`repos/${repo}/pulls/${pr}`));
  const head = pull.head.sha;
  const files = pages(`repos/${repo}/pulls/${pr}/files`);
  const changed = changedPaths(files);
  const modules = submodules(files);
  const packages = packagesFromApi(repo, pull, files);
  const stack = stackText ?? (existsSync("docs/stack.md") ? readFileSync("docs/stack.md", "utf8") : "");
  const deleted = deletedTests(files);
  const watched = modules.length || deleted.length || changed.some(isProtected) || packageChanges(changed, packages).length;
  const comments = watched ? pages(`repos/${repo}/issues/${pr}/comments`) : [];
  const labels = pages(`repos/${repo}/issues/${pr}/labels`).map((l) => l.name);
  // An unchecked voter's pass is dropped; its fail fails the guard (decide, above).
  const voters = [...new Set(comments.filter((c) => verdictOf(c.body, head)).map((c) => c.user?.login).filter(Boolean))];
  const { writers: trusted, unchecked } = access(repo, voters);
  return { changed, modules, packages, deleted, stack, comments, head, labels, trusted, unchecked, expected: expected || null, total: pull.changed_files };
}

/** The head's agent-files check runs, each with the .yml file and event that made it. */
function runsFromApi(repo, pr, pinned) {
  const head = pinned || JSON.parse(gh(`repos/${repo}/pulls/${pr}`)).head.sha;
  const checks = JSON.parse(gh("--paginate", "--slurp", `repos/${repo}/commits/${head}/check-runs?check_name=agent-files`)).flatMap((p) => p.check_runs);
  return checks.map((c) => {
    const run = JSON.parse(gh(`repos/${repo}/actions/runs?check_suite_id=${c.check_suite.id}`)).workflow_runs?.[0] ?? {};
    return { id: c.id, status: c.status, conclusion: c.conclusion, path: run.path ?? "(not a workflow run)", event: run.event ?? null };
  });
}

function fromFlags(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const read = (name, fallback) => (flag(name) ? readFileSync(flag(name), "utf8") : fallback);
  const list = (name) => (flag(name) ?? "").split(",").filter(Boolean);
  const files = JSON.parse(read("--files", "[]"));
  return {
    changed: changedPaths(files),
    modules: submodules(files),
    deleted: deletedTests(files),
    packages: JSON.parse(read("--packages", "{}")),
    stack: read("--stack", ""),
    comments: JSON.parse(read("--comments", "[]")),
    labels: list("--labels"),
    head: flag("--head") ?? "",
    trusted: new Set(list("--trusted")),
    expected: flag("--expected") ?? null,
    total: flag("--total") ? Number(flag("--total")) : null,
  };
}

/** `<n> --repo owner/name --head <sha>`. Env REPO stands in for --repo only when env is passed. */
export function prArgs(args, env = {}) {
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  return { pr: /^\d+$/.test(args[0] ?? "") ? args[0] : null, repo: flag("--repo") ?? env.REPO ?? null, head: flag("--head") ?? null };
}

/** The guard from the session (#131): the live decision at the pinned head, with no workflow run. */
async function gate(argv) {
  const { pr, repo, head } = prArgs(argv.slice(1));
  if (!pr || !repo || !head) return { pass: false, why: "Usage: agent-files.mjs gate <n> --repo <owner>/<name> --head <sha>" };
  // As in a workflow not yet removed, the level comes from the default branch, so a pull request can't change it.
  const live = fromApi(repo, pr, head, defaultStack(repo));
  const r = decide({ ...live, expected: head });
  const final = r.need ? await carried(repo, live, r) : r;
  return { ...final, why: `${head}: ${final.why}` };
}

// How many clean merges of main a pass may be carried across (#478): each one is a merge and an access check.
const MAX_CARRY = 20;

/**
 * On Full with no verdict at the head (#478): the verdict at an earlier commit decides when the head is a chain of clean
 * merges of origin/main on top of it, at most MAX_CARRY, each step proved as `insights.mjs carry` proves one. A writer's
 * fail at any commit of the chain refuses. Anything else keeps `need`, the refusal at the head, and says why.
 */
async function carried(repo, live, need) {
  const refuse = (why) => ({ ...need, why: `${need.why}\nNo earlier pass carries: ${why}.` });
  try {
    // Loaded only here, so the guard starts without the insights scripts and no import cycle runs through them.
    const { checkoutOf, fetchMain, mergedFrom } = await import("./insights-carry.mjs");
    // The checkout this file is in, which `gate` runs from (main's), never the folder it was started in: the redone merge
    // must read main's merge attributes, not a pull request clone's.
    const root = checkoutOf(dirname(fileURLToPath(import.meta.url)));
    fetchMain(root);
    let sha = live.head;
    for (let merges = 1; merges <= MAX_CARRY; merges++) {
      const step = mergedFrom(root, sha);
      if (step.why) return refuse(step.why);
      sha = step.from;
      const voters = [...new Set(live.comments.filter((c) => verdictOf(c.body, sha)).map((c) => c.user?.login).filter(Boolean))];
      const { writers: trusted, unchecked } = access(repo, voters);
      const r = decide({ ...live, head: sha, expected: null, trusted, unchecked });
      if (r.need) continue;
      if (!r.pass) return { pass: false, why: `${r.why}\nThe head is only clean merges of main on top of ${sha}, so that verdict stands.` };
      return { pass: true, why: `the weakening review passed at ${sha}, carried across ${merges} clean merge(s) of origin/main` };
    }
    return refuse(`no writer's verdict within ${MAX_CARRY} clean merges of main back from the head, where the carry stops`);
  } catch (error) {
    if (error instanceof AccessUnknown) throw error;
    return refuse(String(error.stderr || error.message).trim());
  }
}

/** Runs the guard and prints why. Resolves to the exit code: 0 passes, 1 fails. */
export async function main(argv, env = process.env) {
  let r;
  try {
    r = await run(argv, env);
  } catch (error) {
    // An access check with no answer outside the voters' sort fails the guard.
    if (!(error instanceof AccessUnknown)) throw error;
    r = { pass: false, why: `${error.message}. The guard fails until GitHub answers.` };
  }
  (r.pass ? console.log : console.error)(r.why);
  return r.pass ? 0 : 1;
}

async function run(argv, env) {
  let r;
  if (argv[0] === "gate") {
    r = await gate(argv);
  } else if (argv[0] === "verify-run") {
    if (argv.includes("--runs")) {
      r = verifyMerge(JSON.parse(readFileSync(argv[argv.indexOf("--runs") + 1], "utf8")), decide(fromFlags(argv)));
    } else {
      const { pr, repo, head: pinned } = prArgs(argv.slice(1), env);
      // The guard's checkout reads docs/stack.md from the default branch; here, read it from there too.
      const live = fromApi(repo, pr, pinned, defaultStack(repo));
      const sha = pinned || live.head;
      r = verifyMerge(runsFromApi(repo, pr, sha), decide({ ...live, expected: sha }));
      r.why = `${sha}: ${r.why}`;
    }
  } else {
    const pr = argv.includes("--pr") ? argv[argv.indexOf("--pr") + 1] : null;
    r = decide(pr ? fromApi(env.REPO, pr, env.HEAD_SHA) : fromFlags(argv));
  }
  return r;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Not a top-level await: gate's lazy import loads insights-land.mjs, which imports this file, so it must be done loading.
  main(process.argv.slice(2)).then((code) => (process.exitCode = code));
}
