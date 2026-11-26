// Tests for the loop's supervisor (#206): on Full, an hourly scheduled task restarts the loop when its session died with
// work left, and a one-shot at a usage reset does the same. Its state is one line in docs/state.md, kept by timer.mjs.
// The script runs against a temp state file only: no real claude, codex or scheduled task. Times are written out.
// AC-206-7 is an agent check: a session on a scratch repo arms both timers and "stop" cancels both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/timer.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const COPIES = [".agents/skills", ".claude/skills", "plugin/cli/kit/files/core/.agents/skills"];
const STATE = "# State\n\n- **Phase:** building pass 1\n\n## Waiting on you\n\n";
const SWEEP_LIVE = "Sweep timer: live · send_later · sweep-1000+trig_a · every 10 min · next 2026-11-26T10:10:00Z";
const SUP_LIVE = "Supervisor: live · scheduled-task · sup-1+abc · every 60 min";

/** A state file in a temp folder, and a runner for the real script against it at a given time. */
function state(text = STATE) {
  const file = join(tmp("onrails-supervisor-"), "state.md");
  writeFileSync(file, text);
  const timer = (now, ...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args, "--file", file, "--now", now], { encoding: "utf8", env: safeEnv() });
    return { code: r.status, out: (r.stdout + r.stderr).trim() };
  };
  return { timer, text: () => readFileSync(file, "utf8") };
}

test("AC-206-1: WHEN supervisor-armed scheduled-task sup-1+abc runs on a state file THEN it holds the live line, and supervisor-cancelled turns it into Supervisor: none", () => {
  const s = state();
  assert.equal(s.timer("2026-11-26T10:00:00Z", "supervisor-armed", "scheduled-task", "sup-1+abc").code, 0);
  assert.equal(s.text(), `# State\n\n${SUP_LIVE}\n\n- **Phase:** building pass 1\n\n## Waiting on you\n\n`);
  assert.equal(s.timer("2026-11-26T10:05:00Z", "supervisor-cancelled").code, 0);
  assert.equal(s.text(), "# State\n\nSupervisor: none\n\n- **Phase:** building pass 1\n\n## Waiting on you\n\n");
});

test("AC-206-1: the supervisor line sits under the sweep timer line, and each command leaves the other line alone", () => {
  const s = state();
  s.timer("2026-11-26T10:00:00Z", "armed", "send_later", "sweep-1000+trig_a", "10");
  s.timer("2026-11-26T10:00:00Z", "supervisor-armed", "scheduled-task", "sup-1+abc");
  assert.equal(s.text(), `# State\n\n${SWEEP_LIVE}\n${SUP_LIVE}\n\n- **Phase:** building pass 1\n\n## Waiting on you\n\n`);
  s.timer("2026-11-26T10:05:00Z", "cancelled");
  assert.equal(s.text(), `# State\n\nSweep timer: none\n${SUP_LIVE}\n\n- **Phase:** building pass 1\n\n## Waiting on you\n\n`);
  s.timer("2026-11-26T10:06:00Z", "supervisor-cancelled");
  assert.equal(s.text(), "# State\n\nSweep timer: none\nSupervisor: none\n\n- **Phase:** building pass 1\n\n## Waiting on you\n\n");
});

test("AC-206-1: a sweep timer armed after the supervisor goes right above its line", () => {
  const s = state(`# State\n\n## Loop\n\n${SUP_LIVE}\n\n- Phase: x\n`);
  s.timer("2026-11-26T10:00:00Z", "armed", "send_later", "sweep-1000+trig_a", "10");
  assert.equal(s.text(), `# State\n\n## Loop\n\n${SWEEP_LIVE}\n${SUP_LIVE}\n\n- Phase: x\n`);
});

test("AC-206-1: supervisor-armed with a missing or unsafe kind or id exits 2 and changes nothing", () => {
  const s = state();
  for (const args of [["supervisor-armed"], ["supervisor-armed", "scheduled-task"], ["supervisor-armed", "scheduled-task", "a b"], ["supervisor-armed", "x;y", "sup-1"]]) {
    assert.equal(s.timer("2026-11-26T10:00:00Z", ...args).code, 2, args.join(" "));
  }
  assert.equal(s.text(), STATE);
});

test("AC-206-2: WHEN the sweep timer line is live and not past due THEN supervise prints alive and exits 1", () => {
  const s = state(`# State\n\n${SWEEP_LIVE}\n${SUP_LIVE}\n`);
  assert.deepEqual(s.timer("2026-11-26T10:05:00Z", "supervise"), { code: 1, out: "alive" });
  // 30 minutes past due is late, not dead: three intervals of 10.
  assert.deepEqual(s.timer("2026-11-26T10:40:00Z", "supervise"), { code: 1, out: "alive" });
});

test("AC-206-3: WHEN the supervisor line is live and the sweep timer is none THEN supervise prints restart and exits 0", () => {
  assert.deepEqual(state(`# State\n\nSweep timer: none\n${SUP_LIVE}\n`).timer("2026-11-26T10:05:00Z", "supervise"), { code: 0, out: "restart" });
  assert.deepEqual(state(`# State\n\n${SUP_LIVE}\n`).timer("2026-11-26T10:05:00Z", "supervise"), { code: 0, out: "restart" }, "no sweep line at all");
});

test("AC-206-3: WHEN the supervisor line is live and the sweep timer is past due by more than three intervals THEN supervise prints restart and exits 0", () => {
  const s = state(`# State\n\n${SWEEP_LIVE}\n${SUP_LIVE}\n`);
  // Next was 10:10 at a 10-minute interval: 10:41 is 31 minutes past due.
  assert.deepEqual(s.timer("2026-11-26T10:41:00Z", "supervise"), { code: 0, out: "restart" });
  assert.equal(s.text(), `# State\n\n${SWEEP_LIVE}\n${SUP_LIVE}\n`, "supervise only reads");
});

test("AC-206-4: WHEN the supervisor line is none or missing THEN supervise prints stopped and exits 1, whatever the sweep timer says", () => {
  const sweeps = ["", `${SWEEP_LIVE}\n`, "Sweep timer: none\n"];
  for (const sweep of sweeps) {
    for (const sup of ["", "Supervisor: none\n"]) {
      const s = state(`# State\n\n${sweep}${sup}`);
      for (const now of ["2026-11-26T10:05:00Z", "2026-11-26T12:00:00Z"]) {
        assert.deepEqual(s.timer(now, "supervise"), { code: 1, out: "stopped" }, JSON.stringify({ sweep, sup, now }));
      }
    }
  }
});

test("AC-206-4: the try line: one state file each prints alive, restart and stopped", () => {
  const now = "2026-11-26T10:05:00Z";
  assert.equal(state(`# State\n\n${SWEEP_LIVE}\n${SUP_LIVE}\n`).timer(now, "supervise").out, "alive");
  assert.equal(state(`# State\n\nSweep timer: live · loop · sweep-0700+c · every 10 min · next 2026-11-26T07:10:00Z\n${SUP_LIVE}\n`).timer(now, "supervise").out, "restart");
  assert.equal(state(`# State\n\n${SWEEP_LIVE}\nSupervisor: none\n`).timer(now, "supervise").out, "stopped");
});

/** The text of a skill, from `start` up to (not including) `end`. */
const section = (file, start, end) => {
  const text = read(file);
  const a = text.indexOf(start);
  assert.ok(a >= 0, `${file} has ${start}`);
  const b = end ? text.indexOf(end, a + start.length) : text.length;
  assert.ok(b > a, `${file}: ${end} follows ${start}`);
  return text.slice(a, b);
};
const sentences = (text) => text.split(/(?<=[.?!])\s+/);
const MESSAGE = "*\"Supervisor <tag>: run `timer.mjs supervise`. On `restart`, run `/back`, then `coordinate`. Otherwise do nothing.\"*";

test("AC-206-5: WHEN the test reads coordinate THEN Start step 1 arms the supervisor on Full, hourly, with its message, next to the sweep timer", () => {
  const step = section(".agents/skills/coordinate/SKILL.md", "1. **One sweep timer,**", "\n2. **Pick the mode.**");
  const sup = step.slice(step.indexOf("**The supervisor**"));
  assert.ok(step.includes("**The supervisor**"), "Start step 1 has the supervisor");
  assert.match(sup, /On Full, arm one/);
  assert.match(sup, /hourly/);
  assert.ok(sup.includes(MESSAGE), "the supervisor's message, word for word");
  assert.match(sup, /`T supervisor-armed <kind> <tag>\+<tool's id>`/);
  assert.match(sup, /`T supervise`[^.]*`stopped`/, "arms only when none is live");
  assert.match(sup, /into this session where the tool can resume it; start a fresh session only where it can't/);
  assert.match(sup, /No recurring task in this tool\?[^.]*`Supervisor: none`/);
  assert.match(sup, /Recommended: only under `\/afk` with the overnight loop on\. Hands-on: never\./);
  // "To stop" names both timers.
  const stop = step.slice(step.indexOf("**To stop:**"));
  assert.match(stop, /`T cancelled`/);
  assert.match(stop, /`T supervisor-cancelled`/);
  assert.match(step, /\*\*Done when\*\* `T status` prints `live` and, on Full, `T supervise` prints `alive`/);
});

test("AC-206-5: WHEN the test reads coordinate THEN step 10's None left cancels the supervisor", () => {
  const step = section(".agents/skills/coordinate/SKILL.md", "10. **End of sweep:**", "\n## End of a pass");
  const none = step.split("\n").find((l) => l.includes("None left:"));
  assert.ok(none, "step 10 has None left");
  assert.match(none, /the supervisor/);
  assert.match(none, /`T supervisor-cancelled`/);
});

test("AC-206-5: WHEN the test reads coordinate THEN the usage-limit rule arms a one-shot at the reset time on the same account", () => {
  const rules = section(".agents/skills/coordinate/SKILL.md", "## Rules", "\n## References");
  const rule = rules.split("\n").find((l) => l.startsWith("- **An account at its usage limit:**"));
  assert.ok(rule, "the usage-limit rule");
  const arm = sentences(rule).find((s) => /one-shot/.test(s));
  assert.ok(arm, "a sentence arms a one-shot");
  assert.match(arm, /at the reset time/);
  assert.match(arm, /on the same account/);
  assert.match(arm, /the supervisor's message/);
  assert.match(rule, /Never move or spread its work to another account/);
});

test("AC-206-6: WHEN the test reads afk THEN its hard stop cancels the supervisor", () => {
  const hard = section(".agents/skills/afk/SKILL.md", "- **Hard stop:**", "\n## Checking usage");
  const stop = hard.split("\n").find((l) => l.includes("stop the sweep timer"));
  assert.ok(stop, "the hard stop stops the sweep timer");
  assert.match(stop, /and the supervisor/);
  assert.match(stop, /`timer\.mjs supervisor-cancelled`/);
});

test("AC-206-6: WHEN the test reads afk THEN a usage limit waits for a one-shot on the same account, and no line moves work to another account", () => {
  const afk = read(".agents/skills/afk/SKILL.md");
  const step2 = section(".agents/skills/afk/SKILL.md", "2. **Check usage**", "\n3. **Confirm the safety basics**");
  assert.match(step2, /On Full, don't ask: wait for the reset and carry on[^.]*one-shot at the reset time on the same account/);
  // Every sentence that moves, switches, spreads or hands work to another account says never or don't.
  const MOVES = /\b(?:move|moves|moving|switch|switches|spread|spreads|fall back|falls back|send|sends|hand|hands|rotate|rotates)\b[^.]*\b(?:another|other|a different|the next|a second) (?:Claude )?account\b/i;
  const moving = sentences(afk).filter((s) => MOVES.test(s));
  assert.ok(moving.length >= 2, "afk still says where work never goes");
  for (const s of moving) assert.match(s, /\b(?:never|don't|do not|not)\b/i, s);
});

test("AC-206-5, AC-206-6: the synced copies carry the same supervisor lines", () => {
  for (const root of COPIES) {
    assert.ok(read(`${root}/coordinate/SKILL.md`).includes(MESSAGE), `${root}/coordinate`);
    assert.match(read(`${root}/afk/SKILL.md`), /stop the sweep timer and the supervisor/, `${root}/afk`);
    assert.match(read(`${root}/coordinate/scripts/timer.mjs`), /supervisor-armed/, `${root}/coordinate/scripts/timer.mjs`);
  }
});
