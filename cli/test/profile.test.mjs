import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { init } from "../src/init.mjs";
import { profileCopy, profileInit, profilePath, profileShow } from "../src/profile.mjs";
import { exists, fakeAsk, logger, put, read, tmp } from "./helpers.mjs";

// #406: the fast tier is asked after everyday; Enter keeps it blank.
const ANSWERS = ["octo-org", "pro", "team", "festival themed", 'Model "Big"', "", "", "Creative X", ""];

test("profile init asks, keeps defaults on Enter, re-asks bad choices, and writes the template", async () => {
  const home = tmp();
  const ask = fakeAsk(ANSWERS);
  assert.equal(await profileInit({ home, ask, log: logger() }), 0);
  const toml = readFileSync(profilePath(home), "utf8");
  assert.match(toml, /^github_owner = "octo-org" +# account/m);
  assert.match(toml, /^github_plan = "team"/m);
  assert.match(toml, /^naming_style = "festival themed"/m);
  assert.match(toml, /^strongest = "Model \\"Big\\""/m);
  assert.match(toml, /^everyday = ""/m);
  assert.match(toml, /^creative = "Creative X"/m);
  assert.match(toml, /^framework = "TanStack Start"/m, "the rest of the template is kept");
  assert.equal(ask.questions.filter((q) => q.startsWith("GitHub plan")).length, 2, "'pro' was re-asked");
});

test("profile init never overwrites without asking", async () => {
  const home = tmp();
  put(home, ".onrails/profile.toml", "mine\n");
  assert.equal(await profileInit({ home, ask: fakeAsk(["n"]), log: logger() }), 0);
  assert.equal(read(home, ".onrails/profile.toml"), "mine\n");
  assert.equal(await profileInit({ home, yes: true, log: logger() }), 1, "--yes does not replace it");
  assert.equal(read(home, ".onrails/profile.toml"), "mine\n");
  assert.equal(await profileInit({ home, ask: fakeAsk(["y", "me"]), log: logger() }), 0);
  assert.match(read(home, ".onrails/profile.toml"), /^github_owner = "me"/m);
});

test("profile init --yes takes the template's defaults", async () => {
  const home = tmp();
  assert.equal(await profileInit({ home, yes: true, log: logger() }), 0);
  assert.match(read(home, ".onrails/profile.toml"), /^github_plan = "free"/m);
});

test("profile show prints it, or says how to make one", async () => {
  const home = tmp();
  const none = logger();
  assert.equal(profileShow({ home, log: none }), 1);
  assert.match(none.text(), /profile init/);
  put(home, ".onrails/profile.toml", 'github_owner = "octo"\n');
  const log = logger();
  assert.equal(profileShow({ home, log }), 0);
  assert.match(log.text(), /github_owner = "octo"/);
});

test("profile copy writes docs/profile.toml and asks before replacing a different one", async () => {
  const home = tmp(), dir = tmp();
  put(home, ".onrails/profile.toml", "v1\n");
  assert.equal(await profileCopy(dir, { home, log: logger() }), 0);
  assert.equal(read(dir, "docs/profile.toml"), "v1\n");
  put(home, ".onrails/profile.toml", "v2\n");
  await profileCopy(dir, { home, ask: fakeAsk(["n"]), log: logger() });
  assert.equal(read(dir, "docs/profile.toml"), "v1\n");
  await profileCopy(dir, { home, ask: fakeAsk(["y"]), log: logger() });
  assert.equal(read(dir, "docs/profile.toml"), "v2\n");
});

test("init copies the home profile into a project without one, and leaves an existing one", () => {
  const home = tmp();
  put(home, ".onrails/profile.toml", "home profile\n");
  const dir = tmp();
  const log = logger();
  init(dir, { home, log });
  assert.equal(read(dir, "docs/profile.toml"), "home profile\n");
  assert.match(log.text(), /copied your profile to docs\/profile\.toml/);

  const kept = tmp();
  put(kept, "docs/profile.toml", "project profile\n");
  init(kept, { home, log: logger() });
  assert.equal(read(kept, "docs/profile.toml"), "project profile\n");

  const noHome = tmp();
  init(noHome, { home: tmp(), log: logger() });
  assert.ok(!exists(noHome, "docs/profile.toml"));
});

// #100 AC-3: the tier question is asked once, at setup, and saved as ask_before_strongest.
test("AC-100-3: profile init asks once about the strongest model, and a yes turns the per-job question off", async () => {
  const home = tmp();
  const ask = fakeAsk(["", "", "", "", "", "", "", "", "yes"]); // one Enter per model question, the fast tier included (#406)
  assert.equal(await profileInit({ home, ask, log: logger() }), 0);
  assert.match(read(home, ".onrails/profile.toml"), /^ask_before_strongest = false +# ask before/m);
  assert.equal(ask.questions.filter((q) => q.startsWith("May the planner use your strongest model without asking each time?")).length, 1);

  const kept = tmp();
  assert.equal(await profileInit({ home: kept, ask: fakeAsk([]), log: logger() }), 0);
  assert.match(read(kept, ".onrails/profile.toml"), /^ask_before_strongest = true/m, "Enter keeps asking on");
});
