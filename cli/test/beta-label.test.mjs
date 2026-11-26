// The beta label (#125): on while the version is 0.x, gone from 1.0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readJson } from "../src/files.mjs";

const repo = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const { version } = readJson(repo("cli/package.json"));
const beta = version.startsWith("0.");
const MANIFESTS = ["plugin/.claude-plugin/plugin.json", "plugin/.codex-plugin/plugin.json"];
const BADGE = "[![Status: beta](https://img.shields.io/badge/status-beta-";
const LINE = "Early and actively changing. Expect rough edges, especially on first setup.";

test("the version is plain x.y.z: a prerelease tag would hide it from npx onrails", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

test("both plugin descriptions say (beta) exactly while the version is 0.x", () => {
  for (const file of MANIFESTS) assert.equal(readJson(repo(file)).description.startsWith("onRails (beta): "), beta, file);
});

test("the README opens with the beta badge and its line, before the first section, exactly while the version is 0.x", () => {
  const top = readFileSync(repo("README.md"), "utf8").split("\n## ")[0];
  assert.equal(top.includes(BADGE) && top.includes(LINE), beta);
});
