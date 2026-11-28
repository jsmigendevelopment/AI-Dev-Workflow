// Safe reads for the kit lesson deny set (#322): local files only, through links only into the project, never an .env
// file, a folder, a device or a pipe, and never more than MAX_SCAN bytes.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, relative, sep } from "node:path";

// Rule 9: .env and its siblings are never opened: .env.local, .env-local, .env_local, .envrc, .envrc.private, prod.env,
// any case (.ENV, .Envrc, for a case-blind file system), and anything inside a folder named so (.env.d/, .envrc.d/).
// .env.example is the one that may be, for its variable names.
const ENV_NAME = /^\.env(rc)?([._-].*)?$|^.+\.env(rc)?$/i;
export const ENV_EXAMPLE = ".env.example";
const MAX_SCAN = 1024 * 1024;

// A relative path is an env file when any of its parts is named so, except the file .env.example itself.
const isEnvFile = (path) => {
  const parts = path.replaceAll(sep, "/").split("/");
  return parts.some((part, i) => ENV_NAME.test(part) && !(i === parts.length - 1 && part === ENV_EXAMPLE));
};

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/**
 * Reads files under root. A link is followed only when its real path isn't an .env file and stays under root (or,
 * with `anywhere`, for the person's own profile kept in a dotfiles folder, goes anywhere); a folder, a device or a
 * pipe is never opened, and a file over MAX_SCAN gives nothing.
 */
export function reader(root, { anywhere = false } = {}) {
  let top;
  try { top = realpathSync(root); } catch { return { text: () => "", folder: () => null }; } // No such folder: nothing to read.
  const locate = (path) => {
    if (isEnvFile(path)) return null;
    const real = realpathSync(join(top, path));
    // Only the part under root counts: a project that lives in a folder such as ~/prod.env/ still reads. A target
    // outside root (the person's own profile) is judged by its own name.
    const within = inside(top, real);
    return (anywhere || within) && !isEnvFile(within ? relative(top, real) : basename(real)) ? real : null;
  };
  const text = (path) => {
    try {
      const real = locate(path);
      return real && lstatSync(real).isFile() ? readCapped(real) : "";
    } catch {
      // A missing or unreadable file adds nothing.
      return "";
    }
  };
  const folder = (path) => {
    try { return locate(path); } catch { return null; } // No such folder.
  };
  return { text, folder };
}

/**
 * A regular file of at most MAX_SCAN bytes, as text; anything else, a bigger file or a NUL byte gives "". With
 * `input` (the lesson file the person names), a link is followed, a pipe is read too, a bigger one gives
 * null, and anything else throws.
 */
export function readCapped(path, { input = false } = {}) {
  const fd = openSync(path, constants.O_RDONLY | (input ? 0 : constants.O_NOFOLLOW ?? 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() && !(input && info.isFIFO())) {
      if (input) throw new Error("not a file or a pipe");
      return "";
    }
    const bytes = readUpTo(fd, info.isFile() ? Math.min(info.size, MAX_SCAN) + 1 : 64 * 1024);
    if (!bytes) return input ? null : "";
    const text = bytes.toString("utf8");
    return text.includes("\0") ? "" : text;
  } finally {
    closeSync(fd);
  }
}

// Reads an open file or pipe in chunks of at most `chunk` bytes until it ends; null once it passes MAX_SCAN. It never
// reads past MAX_SCAN and one byte, from a pipe too. A regular file's first chunk is one byte past the size it says,
// so a file that grew past the cap is still caught.
function readUpTo(fd, chunk) {
  const buffer = Buffer.allocUnsafe(chunk);
  const parts = [];
  let size = 0;
  for (let n; size <= MAX_SCAN && (n = readSync(fd, buffer, 0, Math.min(chunk, MAX_SCAN + 1 - size), null)) > 0;) {
    parts.push(Buffer.from(buffer.subarray(0, n)));
    size += n;
  }
  return size > MAX_SCAN ? null : Buffer.concat(parts);
}
