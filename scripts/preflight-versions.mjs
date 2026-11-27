// Preflight's Node and package manager row (#195): the version range reader and the manager it may run.
// The master copy is scripts/preflight-versions.mjs in the kit; sync-skills.mjs copies it next to each preflight.mjs.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLOSED, ladder, SAFE, selfFix, shown } from "./preflight-output.mjs";

// Only a small regular file is read: a symlink to a device, or a huge file, could stall preflight.
export const small = (path) => (existsSync(path) && statSync(path).isFile() && statSync(path).size < 65536 ? readFileSync(path, "utf8") : "");
const firstLine = (text = "") => text.split("\n").find((l) => l.trim())?.trim().slice(0, 140) ?? "";

/** True when a version fits a simple range (>=22, ^22, 22.x, "22.x || >= 24"). Range syntax it can't read never blocks. */
export function satisfies(version, range) {
  const v = String(version).split(".").map(Number);
  const cmp = (want) => { for (let i = 0; i < 3; i++) { const d = (v[i] ?? 0) - (want[i] ?? 0); if (d) return d; } return 0; };
  const one = (token) => {
    const m = /^(>=|>|<=|<|\^|~|=)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(token);
    if (!m) return null;
    const num = (s) => (s === undefined || s === "x" || s === "*" ? undefined : Number(s));
    const [op, b, c] = [m[1] ?? "", num(m[3]), num(m[4])];
    const want = [Number(m[2]), b ?? 0, c ?? 0];
    if (op === ">=") return cmp(want) >= 0;
    if (op === ">") return cmp(want) > 0;
    if (op === "<=") return cmp(want) <= 0;
    if (op === "<") return cmp(want) < 0;
    if (op === "^") return v[0] === want[0] && cmp(want) >= 0;
    if (op === "~") return v[0] === want[0] && (b === undefined || v[1] === b) && cmp(want) >= 0;
    return v[0] === want[0] && (b === undefined || v[1] === b) && (c === undefined || v[2] === c);
  };
  // A whole token that is a version: an optional operator, v?, then one to three parts of digits, x or *, or three
  // parts and a prerelease, as semver allows it (18.x.x-rc too). A hyphen range's "-" counts only as the middle of three tokens.
  const versionish = (token, i, tokens) => /^(>=|>|<=|<|\^|~|=)?v?((\d+|[xX*])(\.(\d+|[xX*])){0,2}|(\d+|[xX*])(\.(\d+|[xX*])){2}-[0-9A-Za-z.-]+)$/.test(token)
    || (token === "-" && i === 1 && tokens.length === 3);
  const parts = String(range).split("||").map((part) => part.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(" ").filter(Boolean))
    .filter((tokens) => tokens.length && tokens.every(versionish)).map((tokens) => tokens.map(one));
  // A part that isn't a version range at all (junk characters, or words such as "latest") was dropped above, so
  // the other parts decide. Version syntax this small reader can't follow (a hyphen range, a prerelease) may
  // still fit Node, so it never blocks. Nor does a range with nothing left.
  if (!parts.length || parts.some((results) => results.includes(null))) return true;
  return parts.some((results) => results.every(Boolean));
}

// package.json comes from the repo, so its packageManager is never a command by itself.
const MANAGERS = ["npm", "pnpm", "yarn", "bun"];
// With no usable packageManager, the lockfile names the manager, so a yarn project is never told to run npm.
export const LOCKS = { "pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn", "bun.lock": "bun", "bun.lockb": "bun" };

/** packageManager as { name, version }: null when unset, { name: null } unless it's a known manager with a plain or prerelease version. */
export function readManager(pkg) {
  const field = pkg?.packageManager;
  if (field === undefined || field === null || field === "") return null;
  const [name, version, ...rest] = String(field).split("+")[0].split("@");
  const known = MANAGERS.includes(name) && (version === undefined || SAFE.version.test(version)) && !rest.length;
  return known ? { name, version } : { name: null };
}

// The release's version, from its file name, when the folder's own config names it in the plain form. Shown, never run.
function ownYarnVersion(dir) {
  const rc = [[".yarnrc.yml", /^yarnPath:[ \t]*["']?([^"'\n#]+)/m], [".yarnrc", /^yarn-path[ \t]+["']?([^"'\n#]+)/m]]
    .map(([file, re]) => re.exec(small(join(dir, file)))?.[1]).find(Boolean);
  return rc ? shown(/yarn-([^/\\]+?)\.c?js\s*$/.exec(rc)?.[1], "version", null) : null;
}

// Until the repo has been read (/join or /back marks it), preflight runs no `<pm> --version`: a package manager can
// load files the repo ships, or a release the repo names, on any command, from more places than preflight could list.
// So it is only looked up on PATH, and a yarn release the folder's own config names gives its version by its file name.
/** The manager's version: { version, unread }. unread marks a manager found on PATH but not run, as the repo isn't read yet. */
async function managerVersion(dir, sys, pm, safe) {
  if (!safe.read) {
    if (!sys.has(pm, safe.path)) return { version: null };
    return { version: pm === "yarn" ? ownYarnVersion(dir) : null, unread: true };
  }
  const have = await sys.run(pm, ["--version"], { cwd: dir });
  return { version: have?.ok ? shown(firstLine(have.out), "version", "(version not shown)") : null };
}

export async function checkVersions(dir, tool, sys, pkg, manager, safe) {
  const range = pkg?.engines?.node ?? ">=22";
  const want = shown(range, "range", "the range in package.json's engines.node");
  const who = pkg?.engines?.node ? "the project" : "the kit";
  const node = shown(sys.node, "version", "(version not shown)");
  if (!satisfies(sys.node, range)) return { status: "blocked", detail: `Node ${node}, ${who} needs ${want}`, ladder: ladder("versions", tool, { want }) };
  if (!manager) return { status: "ok", detail: `Node ${node} (needs ${want})` };
  if (!manager.name) {
    return { status: "limited", detail: `Node ${node} (needs ${want}); unrecognised packageManager in package.json, so none ran. `
      + "Preflight runs only npm, pnpm, yarn or bun, with a plain or prerelease version" };
  }
  if (safe.closed) return { status: "limited", detail: `Node ${node} (needs ${want}); ${manager.name}: ${CLOSED}` };
  const { name: pm, version: pin } = manager;
  const { version, unread } = await managerVersion(dir, sys, pm, safe);
  // A prerelease pin (4.0.0-rc.42) keeps the name and its probe. Only a plain pin's major is compared.
  const compared = pin !== undefined && /^\d+(\.\d+){0,2}$/.test(pin);
  const note = pin !== undefined && !compared ? ` (pins ${pin}, a prerelease: not compared)` : "";
  const fits = version && (!compared || version.split(".")[0] === pin.split(".")[0]);
  if (unread && (fits || !version)) {
    const found = version ? `${pm} ${version} (from the repo's yarnPath file name, not run)` : `${pm} found on PATH, not run`;
    return { status: "limited", detail: `Node ${node} (needs ${want}), ${found}${note}: version checked after the repo is read` };
  }
  if (fits) return { status: "ok", detail: `Node ${node} (needs ${want}), ${pm} ${version}${note}` };
  return { status: "fix", detail: version ? `${pm} ${version}, the project pins ${pin}` : `${pm} isn't installed`,
    ladder: selfFix(`\`corepack enable && corepack prepare ${pm}@${pin ?? "latest"} --activate\`, then run preflight again.`) };
}
