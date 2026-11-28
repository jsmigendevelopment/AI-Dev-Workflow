// map [dir]: writes docs/map.generated.md, the module list of src/ with each module's files and lines of code, the
// imports between modules, the import cycles and the sideways imports between feature modules (#709, step 1 of #114).
// A built-in scan, JS and TS only: the same code always gives the same file (sorted, no dates, no absolute paths).
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { specifiers } from "./map-scan.mjs";

const ROOT = "(root)";
const OUT = "docs/map.generated.md";
const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
// Never read: dependencies, build output, hidden folders (.output, .cache) and generated files (routeTree.gen.ts).
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

const byName = (a, b) => (a === ROOT) - (b === ROOT) || (a < b ? -1 : a > b ? 1 : 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every code file under `root`, as a path relative to it with `/`. Links are not followed. */
function walk(root, rel = "", found = []) {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)) walk(root, path, found);
    } else if (entry.isFile() && CODE.test(entry.name) && !entry.name.includes(".gen.")) found.push(path);
  }
  return found;
}

/** What is at a path, without following a link: "missing", "link", "dir", "file" or "other". */
function kind(path) {
  try {
    const s = lstatSync(path);
    return s.isSymbolicLink() ? "link" : s.isDirectory() ? "dir" : s.isFile() ? "file" : "other";
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return "missing";
    throw error;
  }
}

const isDir = (path) => kind(path) === "dir";

/** The src-relative path an import points at, or null for a package or a path outside src/. */
function target(spec, fromRel) {
  const path = spec.startsWith("@/") ? spec.slice(2) : /^\.\.?\//.test(spec) ? posix.join(posix.dirname(fromRel), spec) : null;
  return path === null || path.startsWith("..") ? null : path;
}

/** Files, lines and imports of every module of one app folder. */
function scan(dir) {
  const src = join(dir, "src");
  const srcKind = kind(src);
  if (srcKind === "link") throw new Error("src/ is a link, and map does not follow links: nothing was written. Run map on the folder it links to.");
  if (srcKind !== "dir") return null;
  const featureLayout = isDir(join(src, "modules"));
  const known = new Set(readdirSync(join(src, featureLayout ? "modules" : "."), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
  const ownerOf = (rel) => {
    const [first, second] = rel.split("/");
    const name = featureLayout ? (first === "modules" ? second : undefined) : first;
    return known.has(name) ? name : ROOT;
  };
  const modules = new Map();
  const imports = new Map();
  for (const rel of walk(src)) {
    const text = readFileSync(join(src, rel), "utf8");
    const owner = ownerOf(rel);
    const row = modules.get(owner) ?? { files: 0, lines: 0 };
    modules.set(owner, { files: row.files + 1, lines: row.lines + text.split(/\r?\n/).filter((l) => l.trim()).length });
    for (const spec of specifiers(text)) {
      const path = target(spec, rel);
      const to = path === null ? null : ownerOf(path);
      if (to !== null && to !== owner) imports.set(`${owner}\n${to}`, [owner, to]);
    }
  }
  // An import of a folder with no code in it points at nothing, so it is no edge.
  const edges = [...imports.values()].filter(([, to]) => modules.has(to)).sort(([a, b], [c, d]) => byName(a, c) || byName(b, d));
  return { featureLayout, modules, edges };
}

const reachable = (graph, from) => {
  const seen = new Set();
  const stack = [...(graph.get(from) ?? [])];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    for (const next of graph.get(name) ?? []) stack.push(next);
  }
  return seen;
};

/** The shortest way round from `start` back to itself, inside `group`. */
function loopFrom(start, group, graph) {
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    for (const next of [...(graph.get(path.at(-1)) ?? [])].sort(byName)) {
      if (next === start) return [...path, start];
      if (group.includes(next) && !seen.has(next)) queue.push([...path, next]), seen.add(next);
    }
  }
  return [start];
}

/** One line per group of modules that import each other in a loop. (root) is a catch-all, so it never joins a loop. */
export function cycles(edges) {
  const graph = new Map();
  for (const [from, to] of edges) if (from !== ROOT && to !== ROOT) graph.set(from, (graph.get(from) ?? new Set()).add(to));
  const names = [...graph.keys()].sort(byName);
  const reach = new Map(names.map((name) => [name, reachable(graph, name)]));
  const done = new Set();
  const lines = [];
  for (const name of names) {
    const group = names.filter((other) => reach.get(name).has(other) && reach.get(other)?.has(name));
    if (done.has(name) || !group.includes(name)) continue;
    group.forEach((member) => done.add(member));
    const path = loopFrom(name, group, graph);
    lines.push(`- ${path.join(" -> ")}${new Set(path).size < group.length ? ` (linked loops: ${group.join(", ")})` : ""}`);
  }
  return lines;
}

const list = (lines) => (lines.length ? lines : ["None."]);

// A loop, not push(...lines): a spread of about 120,000 lines overflows the stack.
function add(out, lines) {
  for (const line of lines) out.push(line);
}

const HEAD = [
  "# Repo map",
  "",
  "Made by `npx onrails map`. Do not edit it: run the command again. It reads `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` and `.cjs` files under `src/`, and skips `node_modules`, build output, hidden folders, `.gen.` files and links. Imports it follows: a relative path, an `@/` path, `export ... from`, `require()` and `import()` with a plain string.",
  "",
  "## Modules",
  "",
];

/** The text of docs/map.generated.md for what `scan` found, and how many modules it lists ((root) not counted). */
export function render(found) {
  const out = [...HEAD];
  if (!found) {
    const empty = ["Imports between modules", "Cycles", "Sideways imports"].flatMap((title) => [`## ${title}`, "", "None.", ""]);
    return { text: [...out, "No src/ folder: nothing to map.", "", ...empty].join("\n"), count: 0 };
  }
  const { featureLayout, modules, edges } = found;
  const names = [...modules.keys()].sort(byName);
  const line = ([a, b]) => `- ${a} -> ${b}`;
  out.push(featureLayout ? "Each folder in `src/modules/` is a module." : "There is no `src/modules/`, so each folder in `src/` is a module.");
  out.push(`Lines of code are the non-blank lines of a module's files. \`${ROOT}\` is code in \`src/\` that is outside any module.`, "");
  out.push("| Module | Files | Lines of code |", "|---|---|---|");
  add(out, names.map((n) => `| ${n} | ${modules.get(n).files} | ${modules.get(n).lines} |`));
  out.push("", "## Imports between modules", "", "Each line is a module that imports another.", "");
  add(out, list(edges.map(line)));
  out.push("", "## Cycles", "", "Modules that import each other in a loop, directly or through others.", "");
  add(out, list(cycles(edges)));
  out.push("", "## Sideways imports", "");
  if (!featureLayout) out.push("Not checked: there is no `src/modules/`, so no folder is a feature module.");
  else {
    out.push("A feature module in `src/modules/` that imports another one. Feature modules do not import each other.", "");
    add(out, list(edges.filter(([a, b]) => a !== ROOT && b !== ROOT).map(line)));
  }
  out.push("");
  return { text: out.join("\n"), count: names.filter((n) => n !== ROOT).length };
}

/** The text of docs/map.generated.md for one app folder, and how many modules it lists ((root) not counted). */
export const buildMap = (dir) => render(scan(dir));

// Never through a link: a cloned repo can carry docs/ or docs/map.generated.md as a link to a file elsewhere.
function openOutput(root) {
  const docs = join(root, "docs");
  const docsKind = kind(docs);
  if (docsKind === "link") throw new Error("docs/ is a link, and map does not follow links: nothing was written.");
  if (docsKind === "missing") mkdirSync(docs);
  else if (docsKind !== "dir") throw new Error("docs is not a folder: nothing was written.");
  const out = join(root, OUT);
  const outKind = kind(out);
  if (outKind === "link") throw new Error(`${OUT} is a link, and map does not follow links: nothing was written.`);
  if (outKind !== "missing" && outKind !== "file") throw new Error(`${OUT} is not a file: nothing was written.`);
  // O_NOFOLLOW closes the gap between the check above and the open. Windows has no such flag; there the check stands alone.
  return openSync(out, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o644);
}

/** Writes <dir>/docs/map.generated.md and says so. */
export function mapRepo(dir = ".", { log = console.log } = {}) {
  const root = resolve(dir);
  // The folder the person names is theirs to point at, even through a link. Only what is inside it is never followed.
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Folder not found: ${dir}`);
  // Built before anything is opened, so a refused src/ leaves no file and no docs/ folder behind.
  const { text, count } = buildMap(root);
  const fd = openOutput(root);
  try {
    writeFileSync(fd, text);
  } finally {
    closeSync(fd);
  }
  log(`Wrote ${OUT}: ${plural(count, "module")}.`);
  return 0;
}
