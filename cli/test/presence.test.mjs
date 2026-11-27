// Presence (#50): worklog.mjs keeps ~/.onrails/presence.json, adds the /afk rules and a
// staleness rule, and hands the skills the Presence tab row for the Google Sheet board.
// The sheet itself goes through the connector, so these tests pass its row in as JSON.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { fileURLToPath } from "node:url";
import { put, read, safeEnv, tmp } from "./helpers.mjs";

const WORKLOG = fileURLToPath(new URL("../../.agents/skills/afk/scripts/worklog.mjs", import.meta.url));
const presence = (home, ...args) => {
  const r = spawnSync(process.execPath, [WORKLOG, "presence", ...args], { encoding: "utf8", cwd: tmp(), env: safeEnv({ HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: "" }) });
  return JSON.parse(r.stdout);
};
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const row = (status, since, until = "") => JSON.stringify([["Status", "Since (UTC)", "Until (UTC)", "May merge", "Pings", "Machine"], [status, since, until, "", "", "laptop"]]);

test("presence afk records the hard stop and the rules, and the sheet row holds nothing else", () => {
  const home = tmp();
  const until = new Date(Date.now() + 8 * 3600e3).toISOString();
  const p = presence(home, "afk", "night", "on", "the", "billing", "page", "--until", until, "--merge", "normal lane", "--pings", "critical only");
  assert.equal(p.status, "away");
  assert.equal(p.until, until);
  assert.deepEqual(p.rules, { merge: "normal lane", pings: "critical only" });
  assert.equal(p.note, "night on the billing page");
  assert.match(read(home, ".onrails/presence.json"), /"until"/);

  const sheet = presence(home, "sheet");
  assert.equal(sheet.range, "Presence!A1:F2");
  assert.deepEqual(sheet.values[0], ["Status", "Since (UTC)", "Until (UTC)", "May merge", "Pings", "Machine"]);
  assert.deepEqual(sheet.values[1].slice(0, 5), ["away", p.since, until, "normal lane", "critical only"]);
  assert.doesNotMatch(JSON.stringify(sheet), /billing|night/);
});

test("presence reads local first, then the sheet's copy, and says which it used", () => {
  const empty = tmp();
  assert.equal(presence(empty).source, "default");
  const fromSheet = presence(empty, "--shared", row("away", hoursAgo(1)));
  assert.equal(fromSheet.source, "sheet");
  assert.equal(fromSheet.status, "away");
  assert.equal(fromSheet.machine, "laptop");

  const home = tmp();
  put(home, ".onrails/presence.json", JSON.stringify({ status: "here", since: hoursAgo(2) }));
  assert.equal(presence(home, "--shared", row("away", hoursAgo(1))).source, "sheet");
  const local = presence(home, "--shared", row("away", hoursAgo(3)));
  assert.equal(local.source, "local");
  assert.equal(local.status, "here");
  assert.equal(presence(home, "--shared", "not json").source, "local");
});

test("an away past its hard stop, or older than 24 hours, counts as unknown", () => {
  const home = tmp();
  put(home, ".onrails/presence.json", JSON.stringify({ status: "away", since: hoursAgo(2), until: hoursAgo(1) }));
  assert.equal(presence(home).status, "unknown");
  assert.equal(presence(home).stale, true);

  put(home, ".onrails/presence.json", JSON.stringify({ status: "away", since: hoursAgo(25) }));
  assert.equal(presence(home).status, "unknown");
  assert.equal(presence(tmp(), "--shared", row("away", hoursAgo(25))).status, "unknown");

  put(home, ".onrails/presence.json", JSON.stringify({ status: "away", since: hoursAgo(2), until: new Date(Date.now() + 3600e3).toISOString() }));
  assert.equal(presence(home).status, "away");
});

test("an open-ended away (Full automation, no hard stop) never goes stale; a hard stop still wins", () => {
  const home = tmp();
  assert.equal(presence(home, "afk", "weekend", "--open-ended").openEnded, true);
  put(home, ".onrails/presence.json", JSON.stringify({ status: "away", since: hoursAgo(60), openEnded: true }));
  assert.equal(presence(home).status, "away");
  assert.equal(presence(tmp(), "afk", "night", "--open-ended", "--until", new Date(Date.now() + 3600e3).toISOString()).openEnded, undefined);
});

test("presence back clears a stale away and flags it for the report", () => {
  const home = tmp();
  put(home, ".onrails/presence.json", JSON.stringify({ status: "away", since: hoursAgo(30) }));
  const back = presence(home, "back");
  assert.equal(back.status, "here");
  assert.equal(back.staleAway, true);
  assert.equal(presence(home, "sheet").values[1][0], "here");

  const fresh = tmp();
  presence(fresh, "afk", "lunch");
  assert.equal(presence(fresh, "back").staleAway, undefined);
});
