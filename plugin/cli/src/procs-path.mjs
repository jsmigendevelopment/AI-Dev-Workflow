// The folders on the way to a registry, for the process registry's store (procs-store.mjs, #231): whoever can write
// one of them can rename what is below it and put another folder in its place. No dependencies.
// The master copy is scripts/procs-path.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { lstatSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";

const MAX_LINKS = 40; // as Linux's own limit: a loop of links ends here

// Every folder whose entries are read on the way to dir, from the filesystem root down, following each symlink on
// the way (a link's own folder, then each folder of its target), then dir's real folder last. Real paths only.
// Throws when a part is missing, can't be read, or there are too many links.
function lookups(dir) {
  const full = resolve(dir);
  let at = parse(full).root, rest = full.split(sep).filter(Boolean), links = 0;
  const seen = [];
  while (rest.length) {
    const name = rest.shift();
    if (name === ".") continue;
    if (name === "..") { at = dirname(at); continue; }
    seen.push(at);
    const next = join(at, name);
    if (!lstatSync(next).isSymbolicLink()) { at = next; continue; }
    if (++links > MAX_LINKS) throw Object.assign(new Error(`too many symlinks on the way to ${dir}`), { code: "ELOOP" });
    const to = readlinkSync(next);
    rest = [...to.split(sep).filter(Boolean), ...rest];
    if (isAbsolute(to)) at = parse(to).root;
  }
  return [...new Set([...seen, at])];
}

// Linux file systems whose ACLs are POSIX ACLs, which getfacl and GNU ls show, so the mode's group bits bound what any
// ACL entry grants. Any other (nfs and nfs4, whose NFSv4 ACLs neither shows, cifs, fuse, 9p, vfat) can't be told.
const POSIX_ACL = new Set(["ext2", "ext3", "ext4", "xfs", "btrfs", "tmpfs", "f2fs", "jfs", "reiserfs", "zfs", "overlay"]);

// On Linux, why who can write dir can't be told from its mode and getfacl: its file system's ACLs don't show. Else null.
function fsProblem(sys, dir) {
  if (sys.platform !== "linux") return null;
  const type = sys.fsType?.(dir);
  if (POSIX_ACL.has(type)) return null;
  return `${dir} is on a ${type ?? "unknown"} file system, whose ACLs getfacl and ls don't show, so who else can write it can't be told: use a repo on a local disk`;
}

/**
 * Why the folder that holds .onrails (holder: a repo root, or the home folder when home) can't be trusted on Linux
 * or macOS, or null: a folder on the way to it, or the home folder itself, that another account can write, or one on
 * a file system whose ACLs don't show (docs/decisions.md row 109). The repo root's own rule is rootProblem's, in
 * procs-store.mjs. group is procs-store.mjs's groupProblem, passed in so the group rule stays in one place.
 */
export function pathProblem(sys, holder, home, group) {
  let path;
  try { path = lookups(holder); } catch (error) { return `the folders on the way to ${holder} can't be read (${error.code})`; }
  const real = path.at(-1);
  for (const dir of path) {
    const why = fsProblem(sys, dir) ?? (dir !== real ? aboveProblem(sys, dir, holder, group) : home ? homeProblem(sys, real, group) : null);
    if (why) return why;
  }
  return null;
}

// A folder above: root's or this user's, and no one else may write it, unless it is sticky (as /tmp is): then nobody
// else may rename or remove what is in it.
function aboveProblem(sys, dir, holder, group) {
  const s = lstatSync(dir);
  if (s.uid !== sys.uid && s.uid !== 0) return `${dir}, above ${holder}, belongs to another user: use a repo in a folder only you can write`;
  if (s.mode & 0o1000) return null;
  if (s.mode & 0o002) return `others can write ${dir}, above ${holder}: run chmod o-w ${dir}`;
  return group(sys, s, dir, `the group can write ${dir}, above ${holder}`);
}

// The home folder holds ~/.onrails, as a repo root holds its .onrails: the same rule, in its own words.
function homeProblem(sys, home, group) {
  const s = lstatSync(home);
  if (s.uid !== sys.uid) return `the home folder ${home} belongs to another user`;
  if (s.mode & 0o002) return `others can write the home folder ${home}: run chmod o-w ${home}`;
  return group(sys, s, home, `the group can write the home folder ${home}`);
}
