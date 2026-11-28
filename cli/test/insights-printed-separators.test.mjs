// The run line prints job, model, effort and model_from, and a viewer may break a line at U+2028, U+2029 or U+0085
// (#513, from the review of #502). validate refuses them there, as it does a control character; text fields keep them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { validate } from "../src/insights-record.mjs";
import { recordProblem } from "../../.agents/skills/coordinate/scripts/insights-land.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const WRITER = join(REPO, ".agents/skills/coordinate/scripts/insights.mjs");
const STARTED = "2026-11-27T14:20:00Z";
const PRINTED = ["job", "model", "effort", "model_from"];
// U+0085 next line, U+2028 line separator, U+2029 paragraph separator.
const SEPARATORS = { "U+0085": "\u0085", "U+2028": " ", "U+2029": " " };

function repo() {
  const dir = tmp("insights-separators-");
  const r = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  return dir;
}

function writer(cwd, args) {
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [WRITER, ...args], { cwd, encoding: "utf8", env });
}

const job = { v: 1, kind: "job", at: "2026-11-27T14:32:00.000Z", job: "qa", pr: 40, model: "opus", effort: "low", outcome: "pass" };

test("AC-513-1: WHEN job, model, effort or model_from holds U+2028, U+2029 or U+0085 THEN write and line exit 2 and name the field", () => {
  const dir = repo();
  for (const field of PRINTED) {
    for (const [name, sep] of Object.entries(SEPARATORS)) {
      for (const cmd of ["write", "line"]) {
        const r = writer(dir, [cmd, "job", "job=qa", "pr=40", "outcome=pass", `started=${STARTED}`, `${field}=a${sep}b`]);
        assert.equal(r.status, 2, `${cmd} ${field} ${name}: ${r.stdout}`);
        assert.match(r.stderr, new RegExp(`\\b${field}: `), `${cmd} ${field} ${name}: ${r.stderr}`);
        assert.equal(r.stdout, "", `${cmd} ${field} ${name}`);
      }
      assert.match(validate({ ...job, [field]: `a${sep}b` }).join("; "), new RegExp(`\\b${field}: `), `validate ${field} ${name}`);
    }
  }
});

test("AC-513-1: WHEN a text field holds U+2028, U+2029 or U+0085 THEN write and line still accept it", () => {
  const dir = repo();
  for (const [name, sep] of Object.entries(SEPARATORS)) {
    const from = `status${sep}line`;
    const r = writer(dir, ["line", "job", "job=qa", "pr=40", "outcome=pass", "usage_before=41%", "usage_after=44%", `usage_from=${from}`, `started=${STARTED}`]);
    assert.equal(r.status, 0, `line usage_from ${name}: ${r.stderr}`);
    const w = writer(dir, ["write", "note", "kind_of=went-right", "belongs=kit", `text=before${sep}after`]);
    assert.equal(w.status, 0, `write note text ${name}: ${w.stderr}`);
    assert.deepEqual(validate({ ...job, usage_before: "41%", usage_after: "44%", usage_from: from }), [], `validate usage_from ${name}`);
  }
});

test("AC-513-1: WHEN every record under docs/insights/ on main is checked THEN all of them pass", () => {
  const top = join(REPO, "docs/insights");
  const files = readdirSync(top).flatMap((day) => readdirSync(join(top, day)).map((file) => `docs/insights/${day}/${file}`));
  assert.ok(files.length > 0);
  for (const file of files) assert.equal(recordProblem(file, readFileSync(join(REPO, file))), null, file);
});
