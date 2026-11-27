#!/usr/bin/env node
// The insights writer (#329, part of #281): every insights event goes through here, so every record has one format.
//   node insights.mjs write <kind> key=value ...   writes docs/insights/<UTC yyyy-mm-dd>/<hhmm>-<kind>-<n>-<id>.json
//                                                  in the git root and prints its path. Commit it with the work.
//   node insights.mjs line <kind> key=value ...    prints <!-- onrails-insights {json} --> for a session that commits
//                                                  nothing (a reviewer): put it at the end of the verdict comment.
// model and effort are what the caller passes from its own session, else "unknown". ONRAILS_NOW sets the clock (tests).
// Exit 2: an unknown kind, a missing field or a bad value, with the field named; nothing is written.
// Exit 1: the write failed for another reason. It never invents a value.
// Format and kinds: references/insights.md. Plain Node 22, no dependencies.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KINDS, VERSION, coerce, dayFolder, fileName, toLine, validate } from "./insights-record.mjs";

const USAGE = "usage: insights.mjs write|line <kind> key=value ...";

function fail(code, message) {
  process.stderr.write(`insights: ${message}\n`);
  process.exit(code);
}

function gitRoot() {
  const start = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: start, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fail(1, `${start} isn't in a git repo, so there's no docs/insights/ to write to`);
  }
}

function build(kind, pairs) {
  if (!KINDS[kind]) fail(2, `kind: "${kind}" isn't one of ${Object.keys(KINDS).join(", ")}`);
  const at = new Date(process.env.ONRAILS_NOW || Date.now());
  if (Number.isNaN(at.getTime())) fail(2, "at: ONRAILS_NOW isn't a time");
  const record = { v: VERSION, kind, at: at.toISOString(), issue: null, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown" };
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 1) fail(2, `"${pair}" isn't key=value`);
    const name = pair.slice(0, eq);
    if (["v", "kind", "at"].includes(name)) fail(2, `${name}: set by the writer, not passed`);
    try { record[name] = coerce(kind, name, pair.slice(eq + 1)); } catch (e) { fail(2, e.message); }
  }
  const errors = validate(record);
  if (errors.length) fail(2, errors.join("; "));
  return record;
}

const [cmd, kind, ...pairs] = process.argv.slice(2);
if (cmd !== "write" && cmd !== "line") fail(2, USAGE);
if (!kind) fail(2, `kind: missing. ${USAGE}`);
const record = build(kind, pairs);
if (cmd === "line") {
  process.stdout.write(`${toLine(record)}\n`);
} else {
  const dir = join(gitRoot(), dayFolder(record));
  const path = join(dir, fileName(record));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  } catch (e) {
    fail(1, `couldn't write ${path}: ${e.code || e.message}`);
  }
  process.stdout.write(`${path}\n`);
}
