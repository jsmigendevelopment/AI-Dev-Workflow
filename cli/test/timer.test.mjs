// Tests for the coordinator's sweep timer (#101, AC-6). Each case is one the reviews found by hand:
// timers that stacked, or a loop that stopped. Times are written out, not computed by the script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, run } from "../../.agents/skills/coordinate/scripts/timer.mjs";
import { tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/timer.mjs", import.meta.url));
const STATE = "# State\n\n- **Phase:** building pass 1\n\n## Waiting on you\n\n";

/** A state file in a temp folder, and a runner for the real script against it at a given time. */
function state(text = STATE) {
  const file = join(tmp("onrails-timer-"), "state.md");
  writeFileSync(file, text);
  const timer = (now, ...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args, "--file", file, "--now", now], { encoding: "utf8" });
    return { code: r.status, out: (r.stdout + r.stderr).trim() };
  };
  return { timer, text: () => readFileSync(file, "utf8") };
}

test("no timer: status none, should-arm yes; armed writes the line and keeps the rest", () => {
  const s = state();
  assert.deepEqual(s.timer("2026-11-24T10:00:00Z", "status"), { code: 0, out: "none" });
  assert.equal(s.timer("2026-11-24T10:00:00Z", "should-arm").code, 0);
  assert.equal(s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "trig_a", "10").code, 0);
  assert.match(s.text(), /^# State\n\n- \*\*Phase:\*\* building pass 1\n/);
  assert.match(s.text(), /\nSweep timer: live · send_later · trig_a · every 10 min · next 2026-11-24T10:10:00Z\n$/);
  assert.deepEqual(s.timer("2026-11-24T10:01:00Z", "status"), { code: 0, out: "live trig_a send_later 10 2026-11-24T10:10:00Z" });
});

test("an event sweep while a firing is queued arms nothing", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "trig_a", "10");
  // A builder finishes at 10:04; the coordinator opens and asks.
  assert.equal(s.timer("2026-11-24T10:04:00Z", "should-arm").code, 1);
});

test("a standalone build opening coordinate: arms only when no timer is live", () => {
  const live = state();
  live.timer("2026-11-24T10:00:00Z", "armed", "loop", "cron_1", "10");
  assert.equal(live.timer("2026-11-24T10:30:00Z", "should-arm").code, 1, "20 minutes past due is late, not dead");
  assert.equal(state().timer("2026-11-24T10:30:00Z", "should-arm").code, 0);
});

test("a late firing isn't dead: it re-arms once, and Start doesn't arm a second", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "trig_a", "10");
  // The firing waited behind a long turn: 25 minutes late, under 3 x 10.
  assert.equal(s.timer("2026-11-24T10:35:00Z", "should-arm").code, 1);
  assert.equal(s.timer("2026-11-24T10:35:00Z", "fired", "trig_a").code, 0);
  assert.equal(s.timer("2026-11-24T10:36:00Z", "armed", "send_later", "trig_b", "10").code, 0);
  assert.equal(s.timer("2026-11-24T10:36:00Z", "should-arm").code, 1);
});

test("a timer past due by more than 3 x its interval is dead", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "trig_a", "10");
  assert.equal(s.timer("2026-11-24T10:40:00Z", "should-arm").code, 1, "30 minutes past due: still live");
  assert.equal(s.timer("2026-11-24T10:41:00Z", "should-arm").code, 0, "31 minutes past due: dead");
});

test("a duplicate or stale firing re-arms nothing", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "trig_a", "10");
  assert.equal(s.timer("2026-11-24T10:10:00Z", "fired", "trig_a").code, 0);
  s.timer("2026-11-24T10:11:00Z", "armed", "send_later", "trig_b", "10");
  assert.equal(s.timer("2026-11-24T10:12:00Z", "fired", "trig_a").code, 1, "trig_a fired twice");
  assert.equal(s.timer("2026-11-24T10:12:00Z", "status").out, "live trig_b send_later 10 2026-11-24T10:21:00Z");
});

test("the firing message carries the tag; the line keeps the tool's id for cancelling", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "sweep-1000+trig_abc", "10");
  assert.equal(s.timer("2026-11-24T10:10:00Z", "fired", "sweep-1000").code, 0);
  assert.equal(s.timer("2026-11-24T10:10:00Z", "fired", "sweep-0950").code, 1);
  assert.equal(s.timer("2026-11-24T10:10:00Z", "status").out, "live sweep-1000+trig_abc send_later 10 2026-11-24T10:20:00Z");
});

test("a repeating timer's firing moves next on and keeps its id", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "loop", "cron_1", "10");
  assert.equal(s.timer("2026-11-24T10:10:00Z", "fired", "cron_1").code, 0);
  assert.equal(s.timer("2026-11-24T10:10:00Z", "status").out, "live cron_1 loop 10 2026-11-24T10:20:00Z");
});

test("switching to 30 inside a one-shot's own firing: one new timer, at 30", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "trig_a", "10");
  assert.equal(s.timer("2026-11-24T10:10:00Z", "fired", "trig_a").code, 0);
  assert.deepEqual(s.timer("2026-11-24T10:10:00Z", "interval", "30"), { code: 0, out: "changed" });
  assert.equal(s.timer("2026-11-24T10:10:00Z", "status").out.split(" ")[3], "30");
  s.timer("2026-11-24T10:11:00Z", "armed", "send_later", "trig_b", "30");
  assert.equal(s.timer("2026-11-24T10:11:00Z", "status").out, "live trig_b send_later 30 2026-11-24T10:41:00Z");
  assert.equal(s.timer("2026-11-24T10:12:00Z", "should-arm").code, 1);
});

test("staying under 20% across sweeps: the second switch is the same, so nothing is re-created", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "loop", "cron_1", "10");
  assert.equal(s.timer("2026-11-24T10:10:00Z", "interval", "30").out, "changed");
  assert.equal(s.timer("2026-11-24T10:40:00Z", "interval", "30").out, "same");
  assert.equal(s.timer("2026-11-24T11:10:00Z", "interval", "10").out, "changed");
});

test("cancelled writes none, and a firing after it re-arms nothing", () => {
  const s = state();
  s.timer("2026-11-24T10:00:00Z", "armed", "send_later", "trig_a", "10");
  assert.equal(s.timer("2026-11-24T10:05:00Z", "cancelled").code, 0);
  assert.match(s.text(), /\nSweep timer: none\n$/);
  assert.equal(s.timer("2026-11-24T10:10:00Z", "fired", "trig_a").code, 1);
  assert.equal(s.timer("2026-11-24T10:10:00Z", "should-arm").code, 0);
});

test("bad usage exits 2 and changes nothing", () => {
  const s = state();
  for (const args of [[], ["nope"], ["armed", "send_later"], ["armed", "send_later", "a b", "10"], ["armed", "loop", "x", "0"], ["interval", "15"], ["fired"]]) {
    assert.equal(s.timer("2026-11-24T10:00:00Z", ...args).code, 2, args.join(" "));
  }
  assert.equal(s.text(), STATE);
});

test("parse reads the line inside a list item, and run leaves other lines alone", () => {
  assert.deepEqual(parse("- **Sweep timer:** live · wake-up · w1 · every 10 min · next 2026-11-24T10:10:00Z\n"),
    { kind: "wake-up", id: "w1", interval: 10, next: "2026-11-24T10:10:00Z" });
  const r = run(["cancelled"], "# State\n\n- Sweep timer: live · loop · c · every 10 min · next 2026-11-24T10:10:00Z\n- Phase: x\n", Date.parse("2026-11-24T10:00:00Z"));
  assert.equal(r.text, "# State\n\nSweep timer: none\n- Phase: x\n");
});
