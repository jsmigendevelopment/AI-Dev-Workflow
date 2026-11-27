// Tests for `npx onrails lesson check` (#321): the closed allowlist for kit lessons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { checkLesson } from "../src/lesson-check.mjs";
import { denySet } from "../src/lesson-deny.mjs";
import { loadKit } from "../src/kit.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const kit = loadKit();
const manifest = { core: kit.core, templates: kit.templates };

const good = (extra = {}) => ({
  kit_version: "0.7.1", component: "back", category: "gate", tool: "claude-code", model_family: "opus",
  automation: "full", cost: { extra_runs: "2-5", hours_stuck: "<1" },
  lesson: "The builder waited on the review gate before the merge.",
  suggested_fix: "Run the overlap check before the [detail] step.",
  repo_key: "a".repeat(64), ...extra,
});
const fields = (record) => checkLesson(record, { manifest }).errors.map((e) => e.field);
const rules = (record) => checkLesson(record, { manifest }).errors.map((e) => `${e.field}:${e.rule}`);

function run(record) {
  const dir = tmp("onrails-lesson-");
  const text = typeof record === "string" ? record : JSON.stringify(record, null, 2);
  put(dir, "lesson.json", text);
  const file = join(dir, "lesson.json");
  // #322: the project is this temp folder, with no real repo or home folder behind it, so no deny set term applies.
  const result = spawnSync(process.execPath, [CLI, "lesson", "check", file, "--project", dir],
    { encoding: "utf8", env: safeEnv({ HOME: dir, USERPROFILE: dir }) });
  return { ...result, file, text };
}

test("AC-321-1: a record with every field allowed exits 0", () => {
  assert.deepEqual(checkLesson(good(), { manifest }), { ok: true, errors: [] });
  assert.equal(run(good()).status, 0);
});

test("AC-321-2: an extra key, a missing key or free text in a fixed field exits 1 and names the field", () => {
  assert.deepEqual(fields(good({ notes: "x" })), ["(extra key)"]);
  const missing = good();
  delete missing.tool;
  assert.deepEqual(fields(missing), ["tool"]);
  for (const key of ["category", "tool", "model_family", "automation"]) {
    assert.deepEqual(fields(good({ [key]: "something else" })), [key], key);
  }
  assert.deepEqual(fields(good({ cost: { extra_runs: "3", hours_stuck: "<1" } })), ["cost.extra_runs"]);
  assert.deepEqual(fields(good({ cost: { extra_runs: "1", hours_stuck: 2 } })), ["cost.hours_stuck"]);
  assert.deepEqual(fields(good({ kit_version: 7 })), ["kit_version"]);
  const r = run(good({ category: "my own words" }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /category: not-allowed/);
});

test("AC-321-3: component must come from the manifest", () => {
  assert.deepEqual(fields(good({ component: "my-app-auth" })), ["component"]);
  for (const name of ["back", "overlap", "unknown", "notify", "research-library"]) {
    assert.deepEqual(fields(good({ component: name })), [], name);
  }
});

test("AC-321-4: a path, URL, email, @name, #12, three digits, backtick, quote or foo() is refused", () => {
  const cases = {
    path: "The builder broke src/auth on the branch.",
    url: "The builder read https://example on the branch.",
    email: "The builder wrote to me@example on the branch.",
    mention: "The builder asked @jay on the branch.",
    "issue-number": "The builder broke #12 on the branch.",
    digits: "The builder waited 120 hours on the branch.",
    backtick: "The builder ran `check` on the branch.",
    quote: "The builder said \"no\" on the branch.",
    code: "The builder ran foo() on the branch.",
  };
  for (const [rule, lesson] of Object.entries(cases)) {
    assert.deepEqual(rules(good({ lesson })), [`lesson:${rule}`], rule);
  }
  assert.deepEqual(rules(good({ lesson: "The builder opened www.example on the branch." })), ["lesson:url"]);
});

test("AC-321-5: a word in neither list is refused, and [detail] in its place passes", () => {
  assert.deepEqual(rules(good({ lesson: "The builder broke the zorblax check." })), ["lesson:word"]);
  assert.deepEqual(fields(good({ lesson: "The builder broke the [detail] check." })), []);
  assert.deepEqual(rules(good({ suggested_fix: "Rename tranquiliti first." })), ["suggested_fix:word"]);
});

test("AC-321-6: over 200 characters, or two sentences, is refused", () => {
  assert.deepEqual(rules(good({ lesson: `${"the check ".repeat(20)}failed.` })), ["lesson:length"]);
  assert.deepEqual(rules(good({ lesson: "The check failed. The builder waited." })), ["lesson:one-sentence"]);
});

test("AC-321-7: a refused record is unchanged on disk and its text never printed", () => {
  const secret = "zorblax";
  const r = run(good({ lesson: `The builder broke the ${secret} check.`, [`${secret}_key`]: secret, "Odd Key!": secret }));
  assert.equal(r.status, 1);
  assert.equal(readFileSync(r.file, "utf8"), r.text);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(secret));
  assert.match(r.stderr, /\(extra key\): extra-key/);
  const record = good({ lesson: "x/y" });
  const copy = structuredClone(record);
  checkLesson(record, { manifest });
  assert.deepEqual(record, copy);
  const bad = run("{ not json zorblax");
  assert.equal(bad.status, 1);
  assert.doesNotMatch(bad.stderr, /zorblax/);
});

test("AC-321-8: repo_key must be 64 lowercase hex characters", () => {
  for (const key of ["A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64), `${"a".repeat(63)} `]) {
    assert.deepEqual(fields(good({ repo_key: key })), ["repo_key"], key);
  }
});

test("lesson check: bad usage exits 2", () => {
  const r = spawnSync(process.execPath, [CLI, "lesson", "check"], { encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 2);
  const missing = spawnSync(process.execPath, [CLI, "lesson", "check", join(tmp("onrails-lesson-"), "none.json")],
    { encoding: "utf8", env: safeEnv() });
  assert.equal(missing.status, 2);
});

test("lesson check: a value that passed its closed list is never refused as a project term, free text still is", () => {
  const project = tmp("onrails-project-");
  put(project, "docs/vision.md", "# Garden\n\nBuilt with Claude Code and Opus for the Gate team.\n");
  const deny = denySet(project, { home: tmp("onrails-home-") });
  assert.equal(checkLesson(good(), { manifest, deny }).ok, true);
  const refused = checkLesson(good({ lesson: "The builder broke the garden check.", tool: "codex", category: "nope" }), { manifest, deny });
  assert.deepEqual(refused.errors.map((e) => `${e.field}:${e.rule}`), ["category:not-allowed", "lesson:contains a project term (docs)"]);
});

test("lesson check: --project with no value, an unknown option or two lesson files exit 2, and --project=<dir> is read", () => {
  const dir = tmp("onrails-lesson-");
  put(dir, "lesson.json", JSON.stringify(good({ lesson: "The builder broke the garden check before the merge." })));
  put(dir, "other.json", JSON.stringify(good()));
  const project = tmp("onrails-project-");
  put(project, "package.json", JSON.stringify({ name: "garden" }));
  const cli = (...args) => spawnSync(process.execPath, [CLI, "lesson", "check", join(dir, "lesson.json"), ...args],
    { encoding: "utf8", env: safeEnv({ HOME: dir, USERPROFILE: dir }), cwd: dir });
  for (const args of [["--project"], ["--frobnicate"], [join(dir, "other.json"), "--project", project]]) {
    const r = cli(...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /Usage: npx onrails lesson check/);
  }
  assert.equal(cli(`--project=${dir}`).status, 0);
  const r = cli(`--project=${project}`);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ {2}lesson: contains a project term \(package name\)$/m);
});
