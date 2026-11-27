// The made-up project behind the kit lesson privacy tests (#253 AC-2, #322, #385): planted details, a small project
// of its own, a clean record and the CLI run in a child process. Local only: temp git repos and a temp home folder.
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { loadKit } from "../src/kit.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

export const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const kit = loadKit();
export const manifest = { core: kit.core, templates: kit.templates };
const home = tmp("onrails-home-");
export const gitEnv = (cwd, extra = {}) => safeEnv({ HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: "1", ...extra }, { cwd });

// Every detail planted in the fixture. All made up.
export const PLANTED = {
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
  docsWord: "Orders",
  pascalName: "StoneParty",
  pluralApp: "notes",
};

function git(dir, args, { name = PLANTED.person, email = PLANTED.email } = {}) {
  const author = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: gitEnv(dir, author) });
  assert.equal(r.status, 0, r.stderr);
}

// A small project of its own, so one planted detail is the only project term a lesson could hit. The author's
// domain is reserved, so it adds no domain.
export function small(repoName, files) {
  const dir = tmp("onrails-small-");
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  const author = { name: "Ada Quill", email: "ada@quill.test" };
  git(dir, ["init", "-q"], author);
  git(dir, ["remote", "add", "origin", `https://github.com/cedar-lane/${repoName}.git`], author);
  git(dir, ["add", "-A"], author);
  git(dir, ["commit", "-q", "-m", "start"], author);
  return dir;
}

export function fixture({ repoName = PLANTED.appName, packageName = PLANTED.appName } = {}) {
  const dir = tmp("onrails-privacy-");
  const files = {
    "package.json": JSON.stringify({ name: packageName, private: true }),
    "docs/vision.md": `# Garden\n\nGarden keeps a small shop's ${PLANTED.docsWord} in one place.\n`,
    "packages/notes/package.json": JSON.stringify({ name: PLANTED.pluralApp }),
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
  git(dir, ["remote", "add", "upstream", `https://github.com/${PLANTED.owner}/${PLANTED.pascalName}.git`]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "start"]);
  return dir;
}

export const project = fixture();

export const good = (extra = {}) => ({
  kit_version: "0.7.1", component: "back", category: "gate", tool: "claude-code", model_family: "opus",
  automation: "full", cost: { extra_runs: "2-5", hours_stuck: "<1" },
  lesson: "The builder waited on the review gate before the merge.",
  suggested_fix: "Run the overlap check before the [detail] step.",
  repo_key: "a".repeat(64), ...extra,
});

export function check(record, dir = project) {
  const folder = tmp("onrails-lesson-");
  const text = JSON.stringify(record, null, 2);
  put(folder, "lesson.json", text);
  const file = join(folder, "lesson.json");
  const r = spawnSync(process.execPath, [CLI, "lesson", "check", file, "--project", dir],
    { encoding: "utf8", env: gitEnv(folder), cwd: folder });
  return { ...r, file, folder, text };
}
