// Every stop, wait or ask writes an ask record naming the rule that caused it (#334, part of #281): AC-334-1 to AC-334-6.
// #497 hardens how the rule is checked and the writers are run: AC-497-1 to AC-497-3.
// notify.mjs runs from this checkout in a temp repo that holds a copy of the coordinate scripts, with a temp home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { validate } from "../src/insights-record.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const NOTIFY = join(REPO, ".claude/hooks/notify.mjs");
const SCRIPTS = ".agents/skills/coordinate/scripts";
const NOW = "2026-11-28T09:15:00.000Z";

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
}

/** A temp git repo with the coordinate scripts, a 20-line AGENTS.md and docs/stack.md at the given level. */
function repo({ level = "full", scripts = true } = {}) {
  const dir = tmp("onrails-ask-record-");
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "AGENTS.md"), Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs", "stack.md"), `# Stack\n\n## Automation level\n\n- **Level:** ${level}\n`);
  if (scripts) cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  return dir;
}

function env(extra = {}) {
  const home = tmp("onrails-ask-home-");
  const e = safeEnv({ HOME: home, USERPROFILE: home, ONRAILS_NOW: NOW, ONRAILS_NOTIFY_PRINT: "1", ...extra });
  delete e.CLAUDE_PROJECT_DIR;
  return e;
}

/** Runs notify.mjs's CLI in dir and returns its exit code and the JSON it printed. */
function notify(dir, ...args) {
  const r = spawnSync(process.execPath, [NOTIFY, "--level", "decision", "--title", "t", "--print", "--no-board", ...args], { cwd: dir, encoding: "utf8", env: env() });
  return { status: r.status, out: JSON.parse(r.stdout.trim().split("\n").at(-1)) };
}

/** Every record under dir's docs/insights/, with its file name. */
function records(dir) {
  const top = join(dir, "docs", "insights");
  let days = [];
  try { days = readdirSync(top); } catch { return []; }
  return days.flatMap((day) => readdirSync(join(top, day)).map((name) => ({ name, ...JSON.parse(readFileSync(join(top, day, name), "utf8")) })));
}

const only = (dir) => {
  const all = records(dir);
  assert.equal(all.length, 1, JSON.stringify(all));
  const { name, ...record } = all[0];
  assert.deepEqual(validate(record), [], name);
  return { name, record };
};

test("AC-334-1: WHEN notify.mjs --level decision --title t --rule AGENTS.md:12 --print runs in a temp repo THEN one ask record exists with rule AGENTS.md:12 and level decision", () => {
  const dir = repo();
  const { status, out } = notify(dir, "--rule", "AGENTS.md:12", "--issue", "14");
  assert.equal(status, 0);
  const { name, record } = only(dir);
  assert.equal(record.kind, "ask");
  assert.equal(record.rule, "AGENTS.md:12");
  assert.equal(record.level, "decision");
  assert.equal(record.rule_ok, true);
  assert.equal(record.issue, 14);
  assert.equal(record.title, "t");
  assert.equal(record.at, NOW);
  assert.equal(basename(out.record.path), name, "notify prints the record's path in its JSON");
  assert.equal(out.action, "sent", "the ping is decided as before");
});

test("AC-334-1 guard: WHEN --rule is left out THEN the record says rule missing and notify's JSON says so", () => {
  const dir = repo();
  const { status, out } = notify(dir);
  assert.equal(status, 0);
  assert.equal(only(dir).record.rule, "missing");
  assert.equal(out.record.rule, "missing");
});

test("AC-334-2: WHEN --rule names a file that doesn't exist or a line past its end THEN the record says rule_ok false and notify still exits 0", () => {
  for (const rule of ["NOPE.md:3", "AGENTS.md:21", "AGENTS.md:0", "../AGENTS.md:1"]) {
    const dir = repo();
    const { status, out } = notify(dir, "--rule", rule);
    assert.equal(status, 0, rule);
    const { record } = only(dir);
    assert.equal(record.rule_ok, false, rule);
    assert.equal(record.rule, rule, rule);
    assert.equal(out.action, "sent", rule);
  }
  // The last line of the file is still a line of it.
  const dir = repo();
  notify(dir, "--rule", "AGENTS.md:20");
  assert.equal(only(dir).record.rule_ok, true);
});

test("AC-334-2 guard: WHEN --rule isn't <path>:<line> THEN the record says rule missing and rule_ok false, and the JSON names the problem", () => {
  const dir = repo();
  const { status, out } = notify(dir, "--rule", "AGENTS.md");
  assert.equal(status, 0);
  const { record } = only(dir);
  assert.equal(record.rule, "missing");
  assert.equal(record.rule_ok, false);
  assert.match(out.record.warning, /--rule/);
});

test("AC-334-3: WHEN docs/stack.md says Full and --always-stop isn't passed THEN full_should_prevent is true; WHEN --always-stop is passed THEN it is false", () => {
  const plain = repo();
  notify(plain, "--rule", "AGENTS.md:12");
  assert.equal(only(plain).record.full_should_prevent, true);
  const stop = repo();
  notify(stop, "--rule", "AGENTS.md:12", "--always-stop");
  assert.equal(only(stop).record.full_should_prevent, false);
  // Below Full, nothing on Full could have prevented it.
  const recommended = repo({ level: "recommended" });
  notify(recommended, "--rule", "AGENTS.md:12");
  assert.equal(only(recommended).record.full_should_prevent, false);
});

/** Runs main's writer in dir at the given time. */
function writer(dir, now, ...args) {
  const e = safeEnv({ ONRAILS_NOW: now });
  delete e.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [join(dir, SCRIPTS, "insights.mjs"), ...args], { cwd: dir, encoding: "utf8", env: e });
}

test("AC-334-4: WHEN write ask … answered=<first file> runs 42 minutes (by ONRAILS_NOW) after the first THEN its waited is 42", () => {
  const dir = repo();
  notify(dir, "--rule", "AGENTS.md:12", "--issue", "14");
  const first = only(dir);
  const r = writer(dir, "2026-11-28T09:57:00Z", "write", "ask", `answered=${first.name}`);
  assert.equal(r.status, 0, r.stderr);
  const second = JSON.parse(readFileSync(r.stdout.trim(), "utf8"));
  assert.deepEqual(validate(second), []);
  assert.equal(second.waited_minutes, 42);
  assert.equal(second.answered, first.name);
  // The answer names the same stop: its rule, level and issue come from the first record.
  assert.equal(second.rule, "AGENTS.md:12");
  assert.equal(second.level, "decision");
  assert.equal(second.issue, 14);
});

test("AC-334-4 guard: WHEN answered names no record, an answer, a time after the answer, or comes with waited_minutes THEN the writer exits 2 and writes nothing", () => {
  const dir = repo();
  notify(dir, "--rule", "AGENTS.md:12");
  const first = only(dir).name;
  const cases = [
    ["2026-11-28T09:57:00Z", "answered=0915-ask-0-abcdef.json"],
    ["2026-11-28T09:57:00Z", "answered=../stack.md"],
    ["2026-11-28T09:00:00Z", `answered=${first}`],
    ["2026-11-28T09:57:00Z", `answered=${first}`, "waited_minutes=5"],
  ];
  for (const [now, ...pairs] of cases) {
    const r = writer(dir, now, "write", "ask", ...pairs);
    assert.equal(r.status, 2, `${pairs.join(" ")}: ${r.stderr}`);
    assert.match(r.stderr, /answered|waited_minutes/, pairs.join(" "));
  }
  assert.equal(records(dir).length, 1, "nothing was written");
  const ok = writer(dir, "2026-11-28T09:57:00Z", "write", "ask", `answered=${first}`);
  const answer = basename(ok.stdout.trim());
  const twice = writer(dir, "2026-11-28T10:00:00Z", "write", "ask", `answered=${answer}`);
  assert.equal(twice.status, 2, "an answer to an answer is refused");
});

test("AC-334-5: WHEN the hook mode gets a permission-prompt event THEN its record has rule hook:Notification", () => {
  const dir = repo();
  const input = { hook_event_name: "Notification", notification_type: "permission_prompt", message: "Claude needs your permission to use Bash\u001b[2J", cwd: dir };
  const r = spawnSync(process.execPath, [NOTIFY], { cwd: dir, input: JSON.stringify(input), encoding: "utf8", env: env() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "", "the hook mode prints nothing");
  const { record } = only(dir);
  assert.equal(record.rule, "hook:Notification");
  assert.equal(record.level, "blocker");
  assert.doesNotMatch(record.title, /[\u0000-\u001f\u007f]/, "a control character in the message never reaches the record");
});

test("AC-334-6: WHEN ask/SKILL.md is read THEN its ping step names --rule and its answer step names the answered record", () => {
  const text = readFileSync(join(REPO, ".agents/skills/ask/SKILL.md"), "utf8");
  const ping = text.split("3. **Ping and record it:**")[1].split("\n4. ")[0];
  assert.match(ping, /node \.claude\/hooks\/notify\.mjs [^\n]*--rule <file>:<line>/);
  assert.match(ping, /--always-stop/);
  const replies = text.split("## Replies")[1].split("\n## ")[0];
  const cmd = replies.match(/`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs (write ask answered=<[^>]+>)`/);
  assert.ok(cmd, "the answer step names insights.mjs write ask answered=<...>");
  // The command as the skill prints it works: it writes the answered record.
  const dir = repo();
  notify(dir, "--rule", "AGENTS.md:12");
  const first = only(dir).name;
  const r = writer(dir, "2026-11-28T09:20:00Z", ...cmd[1].replace(/<[^>]+>/, first).split(" "));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(r.stdout.trim(), "utf8")).waited_minutes, 5);
});

test("#334 guard: WHEN an ask record has a control character in its rule or title, a bad answered, or answered without waited_minutes THEN validate refuses it", () => {
  const ask = { v: 1, kind: "ask", at: NOW, issue: null, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown", rule: "AGENTS.md:12", level: "decision" };
  assert.deepEqual(validate(ask), []);
  assert.deepEqual(validate({ ...ask, answered: "0915-ask-14-abcdef.json", waited_minutes: 42 }), []);
  const bad = [
    [{ rule: "AGENTS\u001b.md:12" }, /^rule:/],
    [{ title: "Deploy?\nRun: forged" }, /^title: holds a control character/],
    [{ answered: "../stack.md", waited_minutes: 1 }, /^answered:/],
    [{ answered: "0915-job-14-abcdef.json", waited_minutes: 1 }, /^answered:/],
    [{ answered: "0915-ask-14-abcdef.json" }, /^waited_minutes: required with answered/],
  ];
  for (const [change, want] of bad) {
    const errors = validate({ ...ask, ...change });
    assert.ok(errors.some((e) => want.test(e)), `${JSON.stringify(change)}: ${errors.join("; ")}`);
  }
});

test("#334 guard: WHEN the repo has no insights scripts THEN notify.mjs still decides the ping, exits 0 and says no record was written", () => {
  const dir = repo({ scripts: false });
  const { status, out } = notify(dir, "--rule", "AGENTS.md:12");
  assert.equal(status, 0);
  assert.equal(out.action, "sent");
  assert.match(out.record.skipped, /insights\.mjs/);
  assert.equal(records(dir).length, 0);
});

test("#334 guard: WHEN the record write fails THEN the ping still goes out and notify.mjs exits 0", () => {
  const dir = repo();
  writeFileSync(join(dir, SCRIPTS, "insights.mjs"), 'process.stderr.write("insights: disk full\\n"); process.exit(1);\n');
  const { status, out } = notify(dir, "--rule", "AGENTS.md:12");
  assert.equal(status, 0);
  assert.equal(out.action, "sent");
  assert.match(out.record.error, /disk full/);
});

test("AC-497-1: WHEN --rule names a symlink inside the repo that points outside it THEN rule_ok is false; a broken link fails closed and a normal in-repo path stays true", () => {
  const outside = tmp("onrails-ask-outside-");
  writeFileSync(join(outside, "other.md"), "a\nb\nc\n");
  const dir = repo();
  mkdirSync(join(dir, "docs", "inner"));
  writeFileSync(join(dir, "docs", "inner", "real.md"), "a\nb\nc\n");
  symlinkSync(join(outside, "other.md"), join(dir, "leak.md"));
  symlinkSync(outside, join(dir, "leakdir"));
  symlinkSync(join(dir, "docs", "inner", "real.md"), join(dir, "inside-link.md"));
  symlinkSync(join(outside, "gone.md"), join(dir, "broken.md"));
  const want = { "leak.md:1": false, "leakdir/other.md:1": false, "broken.md:1": false, "inside-link.md:3": true, "docs/inner/real.md:3": true, "AGENTS.md:20": true };
  for (const rule of Object.keys(want)) assert.equal(notify(dir, "--rule", rule).status, 0, rule);
  assert.deepEqual(Object.fromEntries(records(dir).map((r) => [r.rule, r.rule_ok])), want);
});

test("AC-497-2: WHEN a rule starts with hook: and what follows isn't [\\w-]+ THEN the record's rule is missing; hook:Stop and hook:pre-commit are kept", () => {
  for (const rule of ["hook:a b", "hook:", "hook:../x"]) {
    const dir = repo();
    const { status, out } = notify(dir, "--rule", rule);
    assert.equal(status, 0, rule);
    assert.equal(only(dir).record.rule, "missing", rule);
    assert.equal(out.record.rule, "missing", rule);
  }
  for (const rule of ["hook:Stop", "hook:pre-commit"]) {
    const dir = repo();
    notify(dir, "--rule", rule);
    assert.equal(only(dir).record.rule, rule);
  }
});

// A script that ignores SIGTERM and runs for 12 seconds. notify's own limit is 5 seconds, so only SIGKILL stops it in time.
const STUBBORN = 'process.on("SIGTERM", () => {}); setTimeout(() => {}, 12000);\n';

/** Runs notify.mjs in dir and resolves with its exit code and how many milliseconds it took. */
function timed(dir, ...args) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [NOTIFY, "--level", "decision", "--title", "t", "--print", "--rule", "AGENTS.md:12", ...args], { cwd: dir, stdio: "ignore", env: env() });
    child.on("close", (code) => resolve({ code, ms: Date.now() - started }));
  });
}

test("AC-497-3: WHEN the record writer or the board script ignores SIGTERM and runs past the timeout THEN notify.mjs still returns within it", async () => {
  const writerDir = repo();
  writeFileSync(join(writerDir, SCRIPTS, "insights.mjs"), STUBBORN);
  const boardDir = repo();
  writeFileSync(join(boardDir, SCRIPTS, "board.mjs"), STUBBORN);
  // Both run at once, so the test waits out the timeout once.
  const [writer, board] = await Promise.all([timed(writerDir, "--no-board"), timed(boardDir)]);
  assert.equal(writer.code, 0);
  assert.equal(board.code, 0);
  assert.ok(writer.ms < 9000, `the writer held notify for ${writer.ms} ms`);
  assert.ok(board.ms < 9000, `the board script held notify for ${board.ms} ms`);
});
