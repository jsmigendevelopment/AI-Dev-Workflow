// The privacy eval for kit lessons (#253 AC-2, #322): a made-up project full of planted details, a table of candidate
// lessons that each carry one of them, and clean lessons. Nothing planted may get through `lesson check --project`.
// Local only: a temp git repo, a temp home folder and the CLI in a child process. No model, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { checkLesson } from "../src/lesson-check.mjs";
import { loadKit } from "../src/kit.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const kit = loadKit();
const manifest = { core: kit.core, templates: kit.templates };
const home = tmp("onrails-home-");
const gitEnv = (cwd, extra = {}) => safeEnv({ HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: "1", ...extra }, { cwd });

// Every detail planted in the fixture. All made up.
const PLANTED = {
  appName: "garden",
  owner: "north-river",
  person: "Faith Bridge",
  email: "faith@bright-paper.dev",
  emailDomain: "bright-paper",
  codeDomain: "green-market",
  filePath: "src/billing/sync-orders.ts",
  envName: "MARKET_SIGNAL_TOKEN",
  issueNumber: "#41",
  codeLine: "await chargeCard(orderTotal)",
  decisionName: "Grant",
};

function git(dir, args) {
  const author = { GIT_AUTHOR_NAME: PLANTED.person, GIT_AUTHOR_EMAIL: PLANTED.email,
    GIT_COMMITTER_NAME: PLANTED.person, GIT_COMMITTER_EMAIL: PLANTED.email };
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: gitEnv(dir, author) });
  assert.equal(r.status, 0, r.stderr);
}

function fixture({ repoName = PLANTED.appName, packageName = PLANTED.appName } = {}) {
  const dir = tmp("onrails-privacy-");
  const files = {
    "package.json": JSON.stringify({ name: packageName, private: true }),
    "docs/vision.md": `# Garden\n\nGarden keeps a small shop's Orders in one place.\n`,
    "docs/decisions.md": `# Decisions\n\n| 1 | Signed off by ${PLANTED.decisionName} after ${PLANTED.issueNumber}, which kept \`${PLANTED.codeLine}\` in ${PLANTED.filePath}. |\n`,
    "docs/profile.toml": `[me]\nname = "${PLANTED.person}"\ngithub_owner = "${PLANTED.owner}"\n`,
    "src/api.ts": `export const BASE = "https://api.${PLANTED.codeDomain}.io/v1";\n`,
    [PLANTED.filePath]: `export async function sync(orderTotal) {\n  ${PLANTED.codeLine};\n}\n`,
    ".env.example": `${PLANTED.envName}=\n`,
    ".env": `${PLANTED.envName}=not-a-real-value\n`,
    ".env.local": "LOCAL_ONLY=1\n",
    ".gitignore": ".env\n.env.local\n",
  };
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  git(dir, ["init", "-q"]);
  git(dir, ["remote", "add", "origin", `https://github.com/${PLANTED.owner}/${repoName}.git`]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "start"]);
  return dir;
}

const project = fixture();

const good = (extra = {}) => ({
  kit_version: "0.7.1", component: "back", category: "gate", tool: "claude-code", model_family: "opus",
  automation: "full", cost: { extra_runs: "2-5", hours_stuck: "<1" },
  lesson: "The builder waited on the review gate before the merge.",
  suggested_fix: "Run the overlap check before the [detail] step.",
  repo_key: "a".repeat(64), ...extra,
});

function check(record, dir = project) {
  const folder = tmp("onrails-lesson-");
  const text = JSON.stringify(record, null, 2);
  put(folder, "lesson.json", text);
  const file = join(folder, "lesson.json");
  const r = spawnSync(process.execPath, [CLI, "lesson", "check", file, "--project", dir],
    { encoding: "utf8", env: gitEnv(folder), cwd: folder });
  return { ...r, file, folder, text };
}

// One row per planted detail. `deny` marks a row the allowlist from #321 alone would pass, so only the deny set
// refuses it.
const ROWS = [
  { detail: "appName", deny: true, record: good({ lesson: "The builder broke the garden check before the merge." }) },
  { detail: "owner", deny: true, record: good({ suggested_fix: "Push to north-river before the review." }) },
  { detail: "person", deny: true, record: good({ lesson: "The builder waited on Faith Bridge for the review." }) },
  { detail: "email", record: good({ lesson: `The builder wrote to ${PLANTED.email} on the branch.` }) },
  { detail: "emailDomain", deny: true, record: good({ lesson: "The builder waited on the bright-paper review." }) },
  { detail: "codeDomain", deny: true, record: good({ suggested_fix: "Check the green-market server before the merge." }) },
  { detail: "filePath", record: good({ lesson: `The builder broke ${PLANTED.filePath} on the branch.` }) },
  { detail: "envName", record: good({ lesson: `The builder lost ${PLANTED.envName} on the branch.` }) },
  { detail: "issueNumber", record: good({ lesson: `The builder reopened ${PLANTED.issueNumber} on the branch.` }) },
  { detail: "codeLine", record: good({ suggested_fix: `Keep ${PLANTED.codeLine} on the branch.` }) },
  { detail: "decisionName", deny: true, record: good({ lesson: "The builder asked grant before the merge." }) },
];

const CLEAN = [
  good(),
  good({ lesson: "Two builders changed the same file and the merge failed." }),
  good({ lesson: "The coordinator ran the flaky test three times before it passed.", category: "flaky-test" }),
  good({ suggested_fix: "Ask the person once and then wait for the answer." }),
];

const results = [];

for (const row of ROWS) {
  test(`AC-322-1: WHEN a lesson carries the planted ${row.detail} THEN lesson check --project refuses it`, () => {
    assert.match(JSON.stringify(row.record), new RegExp(escape(PLANTED[row.detail]), "i"), "the row carries its detail");
    if (row.deny) assert.equal(checkLesson(row.record, { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(row.record);
    results.push(r);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    if (row.deny) assert.match(r.stderr, /: contains a project term \(/);
  });
}

test("AC-322-2: WHEN a record is refused THEN it is not altered on disk, and nothing is cleaned up and accepted", () => {
  const r = check(ROWS[0].record);
  assert.equal(r.status, 1);
  assert.equal(readFileSync(r.file, "utf8"), r.text);
  assert.deepEqual(readdirSync(r.folder), ["lesson.json"]);
  assert.doesNotMatch(r.stdout + r.stderr, /accepted/i);
});

test("AC-322-3: WHEN the planted app name is a common English word THEN the deny set still refuses it", () => {
  const record = good({ lesson: "The builder broke the garden check before the merge." });
  assert.equal(checkLesson(record, { manifest }).ok, true, "the allowlist alone passes it");
  const r = check(record);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name|docs)\)$/m);
});

test("AC-322-4: WHEN every lesson lesson check accepts is scanned for every planted detail THEN none is found", () => {
  for (const record of CLEAN) results.push(check(record));
  const accepted = results.filter((r) => r.status === 0);
  assert.equal(accepted.length, CLEAN.length, "every clean lesson is accepted");
  for (const r of accepted) {
    for (const [name, value] of Object.entries(PLANTED)) {
      assert.doesNotMatch(r.text, new RegExp(escape(value), "i"), `${name} got through`);
      for (const word of value.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)) {
        assert.doesNotMatch(r.text, new RegExp(`\\b${word}\\b`, "i"), `part of ${name} got through`);
      }
    }
  }
});

test("AC-322-6: WHEN the repo is named after a kit word such as review THEN a lesson that uses review is accepted", () => {
  const dir = fixture({ repoName: "review", packageName: "review" });
  const r = check(good({ lesson: "The builder waited on the review before the merge." }), dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(check(good({ lesson: "The builder broke the garden check." }), dir).status, 1);
});

test("AC-322-7: WHEN a record is refused for a project term THEN the output names the field and the source kind, never the term", () => {
  const r = check(good({ suggested_fix: "Check the green-market server before the merge." }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ {2}suggested_fix: contains a project term \(domain\)$/m);
  assert.doesNotMatch(r.stdout + r.stderr, /green|market/i);
  const name = check(good({ lesson: "The builder waited on Faith Bridge for the review." }));
  assert.match(name.stderr, /^ {2}lesson: contains a project term \(profile\)$/m);
  assert.doesNotMatch(name.stdout + name.stderr, /faith|bridge/i);
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
