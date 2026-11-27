// Watches which files a call opens, for the lesson deny set's tests (#322, #392): a file it must never read.
import { createRequire, syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";

const fs = createRequire(import.meta.url)("node:fs");

const realOrSame = (path) => (fs.existsSync(path) ? fs.realpathSync(path) : resolve(path));

/**
 * Runs build while watching fs opens, and returns its result with each opened path that is, or links to, one of
 * banned (absolute paths).
 */
export function watchOpens(banned, build) {
  const watched = new Set(banned.flatMap((path) => [resolve(path), realOrSame(path)]));
  const opened = [];
  const watch = (name) => {
    const real = fs[name];
    fs[name] = (path, ...rest) => {
      if (typeof path === "string" && (watched.has(resolve(path)) || watched.has(realOrSame(path)))) opened.push(path);
      return real(path, ...rest);
    };
    return () => { fs[name] = real; };
  };
  const restore = ["readFileSync", "openSync", "createReadStream"].map(watch);
  syncBuiltinESMExports();
  try {
    return { set: build(), opened };
  } finally {
    for (const undo of restore) undo();
    syncBuiltinESMExports();
  }
}
