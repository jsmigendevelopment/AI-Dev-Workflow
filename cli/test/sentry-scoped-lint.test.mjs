// #320: the Sentry add-on's lint step ran `eslint --fix .` before the Worker's types existed. Without
// worker-configuration.d.ts (git-ignored, made by `wrangler types`) the typed rules' fixes misread the
// code: they dropped needed type assertions in files the add-on never touched, and typecheck failed.
// The step now makes the types first and lints and formats only the add-on's files. Applying the
// add-on needs a network install, so this reads ADDON.md; the full run on a fresh app is checked by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAddon } from "../src/addon-doc.mjs";

const ADDON = fileURLToPath(new URL("../../stacks/tanstack-start-addons/sentry/", import.meta.url));
const PACK = fileURLToPath(new URL("../../stacks/tanstack-start/", import.meta.url));
const { apply } = parseAddon(readFileSync(join(ADDON, "ADDON.md"), "utf8"));

// The files the Apply steps edit by hand. The rule this relies on: a step names each file it edits
// or creates as a backticked path in its prose, outside any code block ("`vite.config.ts`: add ...").
// Such a path counts when it is a file in the pack, or a new file under src/. A path named only in a
// code block, a comment or plain prose is not seen. The package.json and lockfile that `pnpm add`
// writes are named only in code, and nothing lints them. So backtick a pack path only for a file
// the steps really edit: every one counts as touched, and step 11 must lint and format it.
const isPackFile = (f) => existsSync(join(PACK, f)) && statSync(join(PACK, f)).isFile();
const isNewSrcFile = (f) => /^src\/[\w./-]+\.\w+$/.test(f) && !f.includes("..");
const EDITED = [...new Set([...apply.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\s]+)`/g)].map((m) => m[1]))]
  .filter((f) => isPackFile(f) || isNewSrcFile(f));
// The ones the steps edit today: a floor, so a parser that finds nothing can't pass.
const KNOWN = ["src/env.d.ts", "wrangler.jsonc", "vite.config.ts", "eslint.config.js", ".env.example",
  "src/lib/security-headers.ts"];

function copied(dir = join(ADDON, "files")) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? copied(join(dir, d.name)) : [relative(join(ADDON, "files"), join(dir, d.name))]);
}
const COPIED = copied();
const touched = new Set([...COPIED, ...EDITED]);
// What the pack's lint covers: ESLint's file types, and the types `prettier --check .` formats.
const LINTS = /\.(ts|tsx|js|mjs|cjs)$/;
const FORMATS = /\.(ts|tsx|js|mjs|cjs|json|jsonc|css|md|ya?ml|html)$/;

// Step 11 is the step whose sh block starts with `pnpm cf-typegen`. Returns the block's lines.
function lintBlock() {
  const blocks = [...apply.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1].split("\n").map((l) => l.trim()).filter(Boolean));
  const block = blocks.find((lines) => lines[0]?.startsWith("pnpm cf-typegen"));
  assert.ok(block, "step 11 has an sh block that starts with `pnpm cf-typegen`");
  return block;
}

// The only commands step 11 may hold, in this order, one per line.
const ALLOWED = [
  { name: "pnpm cf-typegen", re: /^pnpm cf-typegen$/ },
  { name: "pnpm exec eslint --fix <files>", re: /^pnpm exec eslint --fix ((?:[\w./-]+ ?)+)$/ },
  { name: "pnpm exec prettier --write <files>", re: /^pnpm exec prettier --write ((?:[\w./-]+ ?)+)$/ },
];
const SHAPE = `${ALLOWED.map((a) => a.name).join(", then ")}, joined by &&`;

function lintStep() {
  const block = lintBlock();
  const cmds = block.map((line) => line.replace(/ &&$/, ""));
  cmds.forEach((cmd, i) =>
    assert.ok(ALLOWED[i]?.re.test(cmd), `step 11 line ${i + 1} is not allowed: \`${cmd}\`. It holds only: ${SHAPE}`));
  assert.equal(cmds.length, ALLOWED.length, `step 11 holds exactly: ${SHAPE}`);
  // Each line but the last ends in `&&`, so a command runs only after the one before it passed.
  block.forEach((line, i) =>
    assert.equal(line.endsWith(" &&"), i < block.length - 1, i < block.length - 1
      ? `step 11 line ${i + 1} ends in &&, so the next command runs only after it passed`
      : `step 11's last line has no && after it`));
  const [, eslint, prettier] = cmds.map((cmd, i) => ALLOWED[i].re.exec(cmd)[1]?.trim().split(" ") ?? []);
  return { eslint, prettier };
}

const why = (f) => EDITED.includes(f) && !COPIED.includes(f) && !KNOWN.includes(f)
  ? ` (Apply backticks \`${f}\`, so it counts as edited. If no step edits it, don't backtick it)` : "";

test("AC-320-1: WHEN the Sentry add-on's lint step runs THEN it lints and formats only the files the add-on touched", () => {
  for (const f of KNOWN) assert.ok(EDITED.includes(f), `Apply edits ${f}`);
  const { eslint, prettier } = lintStep();
  for (const f of [...eslint, ...prettier]) assert.ok(touched.has(f), `${f} is a file the add-on touched`);
  // Every file the add-on touched that the pack's lint covers is fixed here, or step 12 fails.
  for (const f of touched) {
    if (LINTS.test(f)) assert.ok(eslint.includes(f), `${f} is linted${why(f)}`);
    if (FORMATS.test(f)) assert.ok(prettier.includes(f), `${f} is formatted${why(f)}`);
  }
});

test("AC-320-1: WHEN the Sentry add-on's lint step runs THEN it makes the Worker's types first, so the typed fixes see real types", () => {
  assert.equal(lintBlock()[0], "pnpm cf-typegen &&", "ESLint runs only once the types are made");
  // Why it's needed: the pack's own lint does the same, and a fresh copy has no generated types.
  const pack = JSON.parse(readFileSync(join(PACK, "package.json"), "utf8"));
  assert.match(pack.scripts["cf-typegen"], /^wrangler types\b/);
  assert.match(pack.scripts.lint, /^pnpm cf-typegen && eslint/);
  assert.match(readFileSync(join(PACK, ".gitignore"), "utf8"), /^worker-configuration\.d\.ts$/m);
  assert.ok(!existsSync(join(PACK, "worker-configuration.d.ts")), "the pack ships no generated types");
});
