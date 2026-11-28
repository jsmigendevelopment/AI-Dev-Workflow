// #320, #425: an add-on's lint step makes the Worker's types first, then fixes and formats only the files the
// add-on touched. Without worker-configuration.d.ts (git-ignored, made by `wrangler types`) the typed rules'
// fixes misread the code: they drop needed type assertions in files the add-on never touched, and typecheck
// fails. Applying an add-on needs a network install, so this reads its ADDON.md; a full fresh-app run is by hand.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAddon } from "../src/addon-doc.mjs";

export const ADDONS = fileURLToPath(new URL("../../stacks/tanstack-start-addons/", import.meta.url));
export const PACK = fileURLToPath(new URL("../../stacks/tanstack-start/", import.meta.url));

// Generated files the pack's lint and format skip (src/routeTree.gen.ts): a step may name one, but never fixes it.
const IGNORED = new Set(readFileSync(join(PACK, ".prettierignore"), "utf8").split("\n").map((l) => l.trim()));
// What the pack's lint covers: ESLint's file types, and the types `prettier --check .` formats.
const LINTS = /\.(ts|tsx|js|mjs|cjs)$/;
const FORMATS = /\.(ts|tsx|js|mjs|cjs|json|jsonc|css|md|ya?ml|html)$/;

// The only commands the lint step may hold, in this order, one per line. A path with a `$` (a route
// such as `files.$id.ts`) is single-quoted, or the shell would expand it.
// Paths are split by exactly one space, so a line that doesn't match fails fast instead of backtracking.
const P = String.raw`(?:[\w./-]+|'[\w./$-]+')`;
const PATHS = `(${P}(?: ${P})*)`;
/** The lint step's allowed commands, exported so a test can time a line that must not match. */
export const ALLOWED = [
  { name: "pnpm cf-typegen", re: /^pnpm cf-typegen$/ },
  { name: "pnpm exec eslint --fix <files>", re: new RegExp(`^pnpm exec eslint --fix ${PATHS}$`) },
  { name: "pnpm exec prettier --write <files>", re: new RegExp(`^pnpm exec prettier --write ${PATHS}$`) },
];
const SHAPE = `${ALLOWED.map((a) => a.name).join(", then ")}, joined by &&`;

function copied(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? copied(root, join(dir, d.name)) : [relative(root, join(dir, d.name)).replaceAll("\\", "/")]);
}

/** Reads one add-on's Apply steps and works out the files it touches and the lint step it runs. */
export function addonLint(name) {
  const dir = join(ADDONS, name);
  const files = join(dir, "files");
  const { apply } = parseAddon(readFileSync(join(dir, "ADDON.md"), "utf8"));

  // The files the Apply steps edit by hand. The rule this relies on: a step names each file it edits
  // or creates as a backticked path in its prose, outside any code block ("`vite.config.ts`: add ...").
  // Such a path counts when it is a file in the pack, or a new file under src/. A path named only in a
  // code block, a comment or plain prose is not seen. The package.json and lockfile that `pnpm add`
  // writes are named only in code, and nothing lints them. So backtick a pack path only for a file
  // the steps really edit: every one counts as touched, and the lint step must lint and format it.
  const isPackFile = (f) => existsSync(join(PACK, f)) && statSync(join(PACK, f)).isFile();
  const isNewSrcFile = (f) => /^src\/[\w./-]+\.\w+$/.test(f) && !f.includes("..");
  const edited = [...new Set([...apply.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\s]+)`/g)].map((m) => m[1]))]
    .filter((f) => (isPackFile(f) || isNewSrcFile(f)) && !IGNORED.has(f));
  const copiedFiles = existsSync(files) ? copied(files) : [];
  const touched = new Set([...copiedFiles, ...edited]);
  // A folder the add-on brings whole (new to the pack) may stand for all its files in the step.
  const ownFolder = (t) => !existsSync(join(PACK, t)) && existsSync(join(files, t)) && statSync(join(files, t)).isDirectory();
  const covers = (list, f) => list.some((t) => t === f || (ownFolder(t) && f.startsWith(`${t}/`)));

  // The lint step is the one whose sh block starts with `pnpm cf-typegen`. Returns the block's lines.
  function lintBlock() {
    const blocks = [...apply.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1].split("\n").map((l) => l.trim()).filter(Boolean));
    const block = blocks.find((lines) => lines[0]?.startsWith("pnpm cf-typegen"));
    assert.ok(block, `${name}: the lint step has an sh block that starts with \`pnpm cf-typegen\``);
    return block;
  }

  function lintStep() {
    const block = lintBlock();
    const cmds = block.map((line) => line.replace(/ &&$/, ""));
    cmds.forEach((cmd, i) =>
      assert.ok(ALLOWED[i]?.re.test(cmd), `${name}: lint step line ${i + 1} is not allowed: \`${cmd}\`. It holds only: ${SHAPE}`));
    assert.equal(cmds.length, ALLOWED.length, `${name}: the lint step holds exactly: ${SHAPE}`);
    // Each line but the last ends in `&&`, so a command runs only after the one before it passed.
    block.forEach((line, i) =>
      assert.equal(line.endsWith(" &&"), i < block.length - 1, i < block.length - 1
        ? `${name}: lint step line ${i + 1} ends in &&, so the next command runs only after it passed`
        : `${name}: the lint step's last line has no && after it`));
    const [, eslint, prettier] = cmds.map((cmd, i) =>
      ALLOWED[i].re.exec(cmd)[1]?.trim().split(" ").map((p) => p.replace(/^'(.*)'$/, "$1")) ?? []);
    return { eslint, prettier };
  }

  /** Asserts the lint step names only touched files, and fixes and formats every touched file the pack's lint covers. */
  function assertScoped(known) {
    for (const f of known) assert.ok(edited.includes(f), `${name}: Apply edits ${f}`);
    const why = (f) => edited.includes(f) && !copiedFiles.includes(f) && !known.includes(f)
      ? ` (Apply backticks \`${f}\`, so it counts as edited. If no step edits it, don't backtick it)` : "";
    const { eslint, prettier } = lintStep();
    for (const f of [...eslint, ...prettier]) assert.ok(touched.has(f) || ownFolder(f), `${name}: ${f} is a file the add-on touched`);
    // Every file the add-on touched that the pack's lint covers is fixed here, or the `pnpm check` after it fails.
    for (const f of touched) {
      if (LINTS.test(f)) assert.ok(covers(eslint, f), `${name}: ${f} is linted${why(f)}`);
      if (FORMATS.test(f)) assert.ok(covers(prettier, f), `${name}: ${f} is formatted${why(f)}`);
    }
    // The old whole-project step is gone, not kept beside the new one.
    assert.doesNotMatch(apply, /`pnpm exec eslint --fix \.[ `]/, `${name}: no whole-project \`eslint --fix .\` step is left`);
  }

  return { apply, lintBlock, assertScoped };
}
