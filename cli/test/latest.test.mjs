// #448: a daily, cached check for a newer onRails on npm, one line at session start and /back, quiet when it can't
// reach the registry. Every test talks to a fake registry on 127.0.0.1 and a temp HOME: none touches the real network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runChecks } from "../src/checks.mjs";
import { exists, fakeSystem, put, read, tmp } from "./helpers.mjs";
import { HOOK, SCRIPT, line, project, registry, run } from "./latest-fakes.mjs";

const CACHE = ".onrails/latest.json";
const DAY = 24 * 3600e3;
const at = (ms) => ({ ONRAILS_NOW: new Date(Date.parse("2026-11-28T09:00:00Z") + ms).toISOString() });

/** Runs `body` with a fake registry, a project at `kit`, and a temp HOME; closes the registry after. */
async function withFake(options, body) {
  const reg = await registry(options.registry);
  try {
    await body({ reg, dir: project(options.project), home: tmp("onrails-home-") });
  } finally {
    await reg.close();
  }
}

test("AC-448-1: WHEN npm's latest is newer than the repo's kit THEN the session start prints one update line with the command", async () => {
  await withFake({ registry: { version: "0.8.0" } }, async ({ reg, dir, home }) => {
    const out = await run(HOOK, [], { dir, home, reg });
    const lines = out.stdout.split("\n").filter((l) => /onRails 0\.8\.0/.test(l));
    assert.equal(lines.length, 1, out.stdout);
    assert.match(lines[0], /onRails 0\.8\.0 is out \(this repo has 0\.7\.1\)\. Run \/update to get it\./);
  });
});

test("AC-448-1: WHEN /back asks THEN it gets the same line, naming each plugin that is behind", async () => {
  await withFake({ registry: { version: "0.8.0" } }, async ({ reg, dir, home }) => {
    put(home, ".claude/plugins/installed_plugins.json", JSON.stringify({ plugins: { "core@onrails": [{ version: "0.7.0" }] } }));
    const out = await line(dir, home, reg);
    assert.equal(out.stdout.trim(), "onRails 0.8.0 is out (this repo has 0.7.1, the Claude Code plugin 0.7.0). Run /update to get it.");
  });
});

test("AC-448-1: WHEN the repo is current THEN nothing is printed", async () => {
  await withFake({ registry: { version: "0.8.0" }, project: { kit: "0.8.0" } }, async ({ reg, dir, home }) => {
    assert.equal((await line(dir, home, reg)).stdout, "");
  });
});

test("AC-448-1: WHEN the release is a major version THEN the line says so and links the changelog", async () => {
  await withFake({ registry: { version: "1.0.0" } }, async ({ reg, dir, home }) => {
    const out = (await line(dir, home, reg)).stdout.trim();
    assert.match(out, /^onRails 1\.0\.0 is a major release \(this repo has 0\.7\.1\)/);
    assert.match(out, /https:\/\/github\.com\/[\w-]+\/onrails\/blob\/main\/CHANGELOG\.md/);
    assert.match(out, /\/update/);
  });
});

test("AC-448-1: WHEN the release's changelog has a Breaking section THEN the line says so and links the changelog", async () => {
  const changelog = "## [0.8.0]\n\n### Breaking\n\n- the thing\n\n## [0.7.2]\n\n### Added\n\n- more\n";
  await withFake({ registry: { version: "0.8.0", changelog } }, async ({ reg, dir, home }) => {
    const out = (await line(dir, home, reg)).stdout.trim();
    assert.match(out, /^onRails 0\.8\.0 is out \(this repo has 0\.7\.1\) and its changelog has a Breaking section/);
    assert.match(out, /CHANGELOG\.md/);
    assert.equal(JSON.parse(read(home, CACHE)).breaking, true);
  });
});

test("AC-448-1: a Breaking section of an older release does not count", async () => {
  const changelog = "## [0.8.0]\n\n### Added\n\n- more\n\n## [0.7.0]\n\n### Breaking\n\n- old\n";
  await withFake({ registry: { version: "0.8.0", changelog } }, async ({ reg, dir, home }) => {
    assert.doesNotMatch((await line(dir, home, reg)).stdout, /Breaking/);
  });
});

test("AC-448-1: the request carries nothing about the project", async () => {
  await withFake({ registry: { version: "0.8.0" } }, async ({ reg, dir, home }) => {
    await line(dir, home, reg);
    assert.equal(reg.seen[0].url, "/onrails/latest");
    const sent = JSON.stringify(reg.seen[0]);
    for (const secret of [dir, home, "0.7.1", ".onrails"]) assert.ok(!sent.includes(secret), `${secret} not in the request`);
    for (const name of ["authorization", "cookie", "referer", "x-onrails", "x-project"]) assert.ok(!(name in reg.seen[0].headers), name);
  });
});

test("AC-448-2: WHEN the registry hangs THEN nothing is printed, and the session start waits no longer than the timeout", async () => {
  await withFake({ registry: { hang: true } }, async ({ reg, dir, home }) => {
    const out = await run(HOOK, [], { dir, home, reg });
    assert.ok(!/onRails .* is out|major release/.test(out.stdout), out.stdout);
    assert.ok(out.ms < 3000, `session start took ${out.ms} ms`);
    assert.equal(reg.count(), 1);
    const direct = await line(dir, home, reg, at(2 * DAY));
    assert.deepEqual([direct.stdout, direct.stderr, direct.status], ["", "", 0]);
    assert.ok(direct.ms < 3000, `the check took ${direct.ms} ms`);
  });
});

test("AC-448-2: WHEN the registry refuses, errors or answers nonsense THEN nothing is printed", async () => {
  await withFake({ registry: { status: 503 } }, async ({ reg, dir, home }) => {
    const out = await line(dir, home, reg);
    assert.deepEqual([out.stdout, out.stderr, out.status], ["", "", 0]);
  });
  await withFake({ registry: { version: "not a version" } }, async ({ reg, dir, home }) => {
    assert.equal((await line(dir, home, reg)).stdout, "");
  });
  const dir = project();
  const refused = await run(join(dir, SCRIPT), ["line"], { dir, home: tmp("onrails-home-") });
  assert.deepEqual([refused.stdout, refused.stderr, refused.status], ["", "", 0]);
});

test("AC-448-3: WHEN it already checked today THEN it reads the cache and makes no network call", async () => {
  await withFake({ registry: { version: "0.8.0" } }, async ({ reg, dir, home }) => {
    await line(dir, home, reg, at(0));
    assert.equal(reg.count(), 1);
    const again = await line(dir, home, reg, at(DAY - 60e3));
    assert.equal(reg.count(), 1, "no second request inside a day");
    assert.match(again.stdout, /onRails 0\.8\.0 is out/);
    await line(dir, home, reg, at(DAY + 60e3));
    assert.equal(reg.count(), 2, "a request once a day has passed");
  });
});

test("AC-448-3: WHEN a check failed THEN the next session start inside the day does not wait again", async () => {
  await withFake({ registry: { hang: true } }, async ({ reg, dir, home }) => {
    await line(dir, home, reg, at(0));
    const second = await line(dir, home, reg, at(3600e3));
    assert.equal(reg.count(), 1);
    assert.ok(second.ms < 1500, `took ${second.ms} ms`);
  });
});

test("AC-448-3: [updates] check = weekly keeps the answer for seven days", async () => {
  await withFake({ registry: { version: "0.8.0" }, project: { profile: '[updates]\ncheck = "weekly"\n' } }, async ({ reg, dir, home }) => {
    await line(dir, home, reg, at(0));
    await line(dir, home, reg, at(6 * DAY));
    assert.equal(reg.count(), 1);
    await line(dir, home, reg, at(7 * DAY + 60e3));
    assert.equal(reg.count(), 2);
  });
});

test("AC-448-5: WHEN [updates] check = off in the project's profile THEN nothing is fetched or written", async () => {
  await withFake({ registry: { version: "0.8.0" }, project: { profile: '[updates]\ncheck = "off"   # no thanks\n' } }, async ({ reg, dir, home }) => {
    const out = await line(dir, home, reg);
    const hook = await run(HOOK, [], { dir, home, reg });
    assert.equal(out.stdout, "");
    assert.ok(!/onRails 0\.8\.0/.test(hook.stdout));
    assert.equal(reg.seen.length, 0);
    assert.ok(!exists(home, CACHE));
  });
});

test("AC-448-5: WHEN [updates] check = off in the home profile THEN nothing is fetched", async () => {
  await withFake({ registry: { version: "0.8.0" } }, async ({ reg, dir, home }) => {
    put(home, ".onrails/profile.toml", '[updates]\ncheck = "off"\n');
    assert.equal((await line(dir, home, reg)).stdout, "");
    assert.equal(reg.seen.length, 0);
  });
});

test("AC-448-5: the project's profile wins over the home one, and an unknown value means daily", async () => {
  await withFake({ registry: { version: "0.8.0" }, project: { profile: '[updates]\ncheck = "daily"\n' } }, async ({ reg, dir, home }) => {
    put(home, ".onrails/profile.toml", '[updates]\ncheck = "off"\n');
    assert.match((await line(dir, home, reg)).stdout, /onRails 0\.8\.0/);
  });
  await withFake({ registry: { version: "0.8.0" }, project: { profile: '[updates]\ncheck = "hourly"\n' } }, async ({ reg, dir, home }) => {
    assert.match((await line(dir, home, reg)).stdout, /onRails 0\.8\.0/);
  });
});

test("the cache lives in the home folder, never in the project", async () => {
  await withFake({ registry: { version: "0.8.0" } }, async ({ reg, dir, home }) => {
    await line(dir, home, reg);
    assert.equal(JSON.parse(readFileSync(join(home, CACHE), "utf8")).latest, "0.8.0");
    assert.ok(!existsSync(join(dir, "latest.json")) && !exists(dir, CACHE));
  });
});

test("doctor shows what the check last kept and never asks npm", () => {
  const home = tmp("onrails-home-");
  const dir = tmp("onrails-latest-");
  put(dir, ".onrails.json", JSON.stringify({ kitVersion: "0.7.1" }));
  const labels = () => runChecks(dir, { sys: fakeSystem({ home }) }).map((c) => c.label);
  assert.ok(!labels().some((l) => /is out/.test(l)));
  put(home, CACHE, JSON.stringify({ checkedAt: "2026-01-01T00:00:00.000Z", latest: "0.8.0", breaking: false }));
  assert.ok(labels().includes("onRails 0.8.0 is out (this repo has 0.7.1). Run /update to get it."));
});
