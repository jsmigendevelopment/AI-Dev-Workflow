// `npx onrails map [dir]` (#709, first step of #114): docs/map.generated.md lists each module, who imports whom, the
// cycles and the sideways imports. Every fixture is a made-up app in a temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { logger, put, read, safeEnv, tmp } from "./helpers.mjs";
import { mapRepo } from "../src/map.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const OUT = "docs/map.generated.md";

/** A fixture app: `files` maps a path to its text. Returns the folder. */
function app(files) {
  const dir = tmp("onrails-map-");
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  return dir;
}

/** Runs map on the folder and returns the file it wrote. */
function mapped(dir) {
  const log = logger();
  assert.equal(mapRepo(dir, { log }), 0, log.text());
  return read(dir, OUT);
}

/** The non-empty lines under one "## <title>" heading, up to the next heading. */
function section(text, title) {
  const start = text.indexOf(`## ${title}\n`);
  assert.notEqual(start, -1, `no "${title}" section in:\n${text}`);
  const body = text.slice(start + title.length + 4).split("\n## ")[0];
  return body.split("\n").filter(Boolean);
}

/** A section's list items or table rows only, without its explaining sentence and table header. */
const items = (text, title) => section(text, title).filter((line) => /^(- |\| (?!Module|---))/.test(line) || line === "None.");

test("AC-709-1: WHEN map runs on a fixture app with modules under src/modules/ THEN docs/map.generated.md lists each module with its file count and lines of code, counting .ts, .tsx, .js, .jsx, .mjs and .cjs files", () => {
  const dir = app({
    "src/modules/billing/a.ts": "export const a = 1;\n\nexport const b = 2;\n",
    "src/modules/billing/view.tsx": "export const View = () => null;\n",
    "src/modules/billing/old.js": "module.exports = 1;\n",
    "src/modules/billing/old.jsx": "export default 1;\n",
    "src/modules/billing/tool.mjs": "export default 2;\n",
    "src/modules/billing/tool.cjs": "module.exports = 3;\n",
    "src/modules/billing/notes.md": "not code\n",
    "src/modules/billing/style.css": "a { color: red }\n",
    "src/modules/search/index.ts": "// just a comment\nexport const s = 1;\r\nexport const t = 2;\r\n",
  });
  const rows = items(mapped(dir), "Modules");
  assert.deepEqual(rows, ["| billing | 6 | 7 |", "| search | 1 | 3 |"]);
});

test("AC-709-2: WHEN module a imports module b (a relative path, an @/modules/b/... alias, export ... from, require() or import()) THEN the graph has the edge a -> b", () => {
  const forms = {
    relative: 'import { x } from "../b/x";\n',
    alias: "import x from '@/modules/b/x';\n",
    "export from": 'export * from "../b/x";\n',
    "multi-line import": 'import {\n  x,\n  y,\n} from "../b/x";\n',
    require: 'const x = require("../b/x");\n',
    "dynamic import": 'const x = await import("@/modules/b/x");\n',
  };
  for (const [name, line] of Object.entries(forms)) {
    const dir = app({ "src/modules/a/a.ts": line, "src/modules/b/x.ts": "export const x = 1;\n" });
    assert.deepEqual(items(mapped(dir), "Imports between modules"), ["- a -> b"], name);
  }
});

test("AC-709-2: an import inside a comment or a string, a package, or a module's own file is no edge", () => {
  const dir = app({
    "src/modules/a/a.ts": [
      '// import x from "../b/x";',
      '/* export * from "../b/x"; */',
      'const text = "import y from \'../b/y\'";',
      'import react from "react";',
      'import self from "./local";',
      "",
    ].join("\n"),
    "src/modules/a/local.ts": "export default 1;\n",
    "src/modules/b/x.ts": "export const x = 1;\n",
  });
  assert.deepEqual(items(mapped(dir), "Imports between modules"), ["None."]);
});

test("AC-709-3: WHEN two or more modules import each other in a loop THEN the file lists the cycle by module names", () => {
  const dir = app({
    "src/modules/a/a.ts": 'import "../b/b";\n',
    "src/modules/b/b.ts": 'import "../c/c";\n',
    "src/modules/c/c.ts": 'import "../a/a";\n',
    "src/modules/d/d.ts": 'import "../a/a";\n',
  });
  assert.deepEqual(items(mapped(dir), "Cycles"), ["- a -> b -> c -> a"]);
});

test("AC-709-3: two modules that import each other are one cycle, and no loop says so", () => {
  const loop = app({ "src/modules/a/a.ts": 'import "../b/b";\n', "src/modules/b/b.ts": 'import "../a/a";\n' });
  assert.deepEqual(items(mapped(loop), "Cycles"), ["- a -> b -> a"]);
  const none = app({ "src/modules/a/a.ts": 'import "../b/b";\n', "src/modules/b/b.ts": "export {};\n" });
  assert.deepEqual(items(mapped(none), "Cycles"), ["None."]);
});

test("AC-709-3: loops that share a module are one line that names every module in them", () => {
  const dir = app({
    "src/modules/a/a.ts": 'import "../b/b";\n',
    "src/modules/b/b.ts": 'import "../a/a";\nimport "../c/c";\n',
    "src/modules/c/c.ts": 'import "../b/b";\n',
  });
  assert.deepEqual(items(mapped(dir), "Cycles"), ["- a -> b -> a (linked loops: a, b, c)"]);
});

test("AC-709-4: WHEN one feature module under src/modules/ imports another THEN the file flags it as a sideways import", () => {
  const dir = app({
    "src/modules/a/a.ts": 'import "@/modules/b/b";\n',
    "src/modules/b/b.ts": "export {};\n",
    "src/routes/home.tsx": 'import "@/modules/a/a";\n',
  });
  assert.deepEqual(items(mapped(dir), "Sideways imports"), ["- a -> b"]);
});

test("AC-709-5: WHEN map runs twice with no code change THEN the two outputs are identical byte for byte (sorted, no dates, no absolute paths)", () => {
  const dir = app({
    "src/modules/zeta/z.ts": 'import "../alpha/a";\nimport "../mid/m";\n',
    "src/modules/alpha/a.ts": 'import "../zeta/z";\n',
    "src/modules/mid/m.ts": "export {};\n",
    "src/router.ts": 'import "./modules/zeta/z";\n',
  });
  const first = mapped(dir);
  const second = mapped(dir);
  assert.equal(second, first);
  assert.ok(first.endsWith("\n") && !first.includes("\r"));
  assert.ok(!first.includes(dir), "an absolute path is in the file");
  assert.doesNotMatch(first, /\b20\d\d-\d\d-\d\d\b|\d\d:\d\d/);
  assert.deepEqual(items(first, "Modules"), ["| alpha | 1 | 1 |", "| mid | 1 | 1 |", "| zeta | 1 | 2 |", "| (root) | 1 | 1 |"]);
  assert.deepEqual(items(first, "Imports between modules"), ["- alpha -> zeta", "- zeta -> alpha", "- zeta -> mid", "- (root) -> zeta"]);
});

test("AC-709-6: WHEN the repo has no src/modules/ THEN each direct subfolder of src/ is a module, and code outside any module is listed as (root)", () => {
  const dir = app({
    "src/auth/login.ts": 'import "../billing/pay";\nexport const l = 1;\n',
    "src/billing/pay.ts": "export const p = 1;\n",
    "src/main.ts": 'import "./auth/login";\nimport "@/billing/pay";\n',
  });
  const text = mapped(dir);
  assert.deepEqual(items(text, "Modules"), ["| auth | 1 | 2 |", "| billing | 1 | 1 |", "| (root) | 1 | 2 |"]);
  assert.deepEqual(items(text, "Imports between modules"), ["- auth -> billing", "- (root) -> auth", "- (root) -> billing"]);
  // Only modules under src/modules/ are feature modules, so nothing is flagged sideways here, and the file says why.
  assert.deepEqual(items(text, "Sideways imports"), []);
  assert.match(section(text, "Sideways imports")[0], /^Not checked: there is no `src\/modules\/`/);
});

test("AC-709-6: with src/modules/, code elsewhere in src/ is (root), and (root) is never part of a cycle", () => {
  const dir = app({
    "src/modules/a/a.ts": 'import "@/lib/util";\n',
    "src/lib/util.ts": 'import "../modules/a/a";\n',
  });
  const text = mapped(dir);
  assert.deepEqual(items(text, "Modules"), ["| a | 1 | 1 |", "| (root) | 1 | 1 |"]);
  assert.deepEqual(items(text, "Cycles"), ["None."]);
});

test("node_modules, build output, dot folders, .gen. files and links are not read", () => {
  const dir = app({
    "src/modules/a/a.ts": "export {};\n",
    "src/modules/a/node_modules/dep/index.js": "export {};\n",
    "src/modules/a/dist/out.js": "export {};\n",
    "src/modules/a/.cache/c.js": "export {};\n",
    "src/routeTree.gen.ts": "export {};\n",
  });
  assert.deepEqual(items(mapped(dir), "Modules"), ["| a | 1 | 1 |"]);
});

test("a link to a folder or a file is not followed, so a link back up the tree cannot loop or leave the app", { skip: process.platform === "win32" && "links need rights on Windows" }, () => {
  const dir = app({ "src/modules/a/a.ts": "export {};\n", "outside/o.ts": "export {};\n" });
  symlinkSync(join(dir, "src"), join(dir, "src/modules/a/loop"));
  symlinkSync(join(dir, "outside"), join(dir, "src/modules/a/out"));
  symlinkSync(join(dir, "outside/o.ts"), join(dir, "src/modules/a/o.ts"));
  assert.deepEqual(items(mapped(dir), "Modules"), ["| a | 1 | 1 |"]);
});

test("an app with no src/ folder writes an empty map and says so", () => {
  const dir = app({ "package.json": "{}\n" });
  assert.deepEqual(section(mapped(dir), "Modules"), ["No src/ folder: nothing to map."]);
});

test("map through the binary writes the file, prints one line, and a missing folder exits 1", () => {
  const dir = app({ "src/modules/a/a.ts": "export {};\n" });
  const run = (...args) => spawnSync(process.execPath, [CLI, "map", ...args], { encoding: "utf8", env: safeEnv() });
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "Wrote docs/map.generated.md: 1 module.");
  assert.match(read(dir, OUT), /\| a \| 1 \| 1 \|/);
  assert.equal(run(`${dir}/nope`).status, 1);
  assert.match(spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8", env: safeEnv() }).stdout, /onrails map \[dir\]/);
});
