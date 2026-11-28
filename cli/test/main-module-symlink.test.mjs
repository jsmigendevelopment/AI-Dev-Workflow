// #506: the kit's other scripts guard `main` the way pr-size.mjs does (#439): by real path, so a script started through
// a symlinked file or folder still runs, and one that another module imports doesn't. The table lists each script
// with arguments that make it exit non-zero (or, for npm-readme.mjs, print its sync line) without touching git, gh or
// the network, so a script whose guard silently skipped main shows as an empty answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const REPO = join(import.meta.dirname, "..", "..");
const COORDINATE = ".agents/skills/coordinate/scripts";
const symlinks = { skip: process.platform === "win32" ? "making a symlink needs extra rights on Windows" : false };

// [script, arguments, expected exit status, text its answer must hold]
const SCRIPTS = [
  ["scripts/check-research.mjs", [], 2, /Usage: node check-research\.mjs/],
  ["scripts/insights-runs.mjs", [], 2, /usage: insights-runs\.mjs/],
  ["scripts/insights-week.mjs", ["--no-such-option"], 2, /usage: insights-week\.mjs/],
  ["scripts/preflight.mjs", ["--no-such-option"], 2, /Unknown option: --no-such-option/],
  ["scripts/research-library.mjs", [], 2, /Usage: node research-library\.mjs/],
  ["scripts/npm-readme.mjs", ["--check"], 0, /cli\/README\.md in sync/],
  [`${COORDINATE}/agent-files.mjs`, ["gate"], 1, /Usage: agent-files\.mjs gate/],
  [`${COORDINATE}/fence.mjs`, [], 2, /Usage: fence\.mjs run/],
  [`${COORDINATE}/flow.mjs`, [], 2, /Usage: node flow\.mjs/],
  [`${COORDINATE}/mark-check.mjs`, [], 2, /Usage: mark-check\.mjs/],
  [`${COORDINATE}/orphans.mjs`, [], 2, /Usage: orphans\.mjs/],
  [`${COORDINATE}/overlap.mjs`, [], 2, /Usage: overlap\.mjs/],
  [`${COORDINATE}/own-branch.mjs`, [], 2, /Usage: own-branch\.mjs/],
  [`${COORDINATE}/pr-rules.mjs`, [], 2, /Usage: pr-rules\.mjs/],
  [`${COORDINATE}/timer.mjs`, [], 2, /Usage: timer\.mjs/],
  [".agents/skills/issues/scripts/check-issue-size.mjs", ["no-such-file.json"], 2, /check-issue-size: expected a JSON list/],
  [".agents/skills/issues/scripts/check-gate-acs.mjs", [], 2, /check-gate-acs: expected a JSON list/],
  [".agents/skills/pyramid/scripts/check-plan.mjs", [], 2, /No plan at docs\/pyramid\.md/],
  [".agents/skills/routing/scripts/roles.mjs", ["--no-such-option"], 2, /Unknown option "--no-such-option"/],
];

const run = (script, args, cwd) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env: safeEnv(), input: "" });

test("AC-506-1: WHEN a kit script is started through a symlinked file or folder THEN it runs main and exits as it does run directly", symlinks, () => {
  const scratch = tmp("onrails-main-link-");
  const cwd = join(scratch, "cwd");
  mkdirSync(cwd);
  const wrong = [];
  for (const [script, args, status, text] of SCRIPTS) {
    const real = join(REPO, script);
    const file = join(scratch, basename(script));
    symlinkSync(real, file);
    const folder = join(scratch, `folder-${basename(script, ".mjs")}`);
    symlinkSync(dirname(real), folder, "dir");
    const starts = { "run directly": real, "a symlinked file": file, "a symlinked folder": join(folder, basename(script)) };
    for (const [name, path] of Object.entries(starts)) {
      const r = run(path, args, cwd);
      if (r.status !== status || !text.test(r.stdout + r.stderr)) wrong.push(`${script}, ${name}: exit ${r.status}, ${JSON.stringify(r.stdout + r.stderr)}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("AC-506-2: WHEN a kit script is imported THEN it doesn't run main", () => {
  const importer = join(tmp("onrails-main-import-"), "importer.mjs");
  const urls = SCRIPTS.map(([script]) => pathToFileURL(join(REPO, script)).href);
  // The importer's own arguments are ones every script's main answers with a usage line or a non-zero exit, so a guard
  // that let main run would show in the output or the status.
  writeFileSync(importer, `for (const url of ${JSON.stringify(urls)}) await import(url);\nconsole.log("imported", ${urls.length});\n`);
  const r = spawnSync(process.execPath, [importer, "gate", "--no-such-option"], { cwd: tmp("onrails-main-import-cwd-"), encoding: "utf8", env: safeEnv(), input: "" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `imported ${urls.length}\n`);
  assert.equal(r.stderr, "");
});
