// Tests for what the session hooks print from a record (#231's scope additions from #244): a record's command goes
// through the same printable helper as its id, and the helper escapes the invisible characters that could make two
// ids look alike. They run on the fake machine in procs-fake.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { processChecks } from "../src/project-checks.mjs";
import { fakeSys, run, seed } from "./procs-fake.mjs";

// The one line session start prints for a stale record with this id and command.
async function startLine(id, command) {
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id, pid: 4000, start: "start-4000", command });
  const { out } = await run(sys, ["session-start"]);
  return out.split("\n").find((l) => l.startsWith("- ") && l.endsWith(" · 3d 0h · its owner session is gone"))?.slice(2, -" · 3d 0h · its owner session is gone".length);
}

// What session end prints for one record whose id the registry didn't make.
async function endId(id) {
  const sys = fakeSys({ procs: { 4000: {} }, stdin: '{"session_id":"s-1"}' });
  seed(sys, { id, pid: 4000, start: "start-4000", command: "pnpm dev" });
  const line = (await run(sys, ["session-end"])).out.split("\n").find((l) => l.startsWith("Not stopping 1 "));
  return /make \((.*)\), so the id never/s.exec(line ?? "")?.[1];
}

test("#231: WHEN a stale record's command holds an ANSI escape, a C1 control or a bidi override THEN session start prints it escaped and quoted", async () => {
  assert.equal(await startLine("pold1", "\u001b[2Jrm -rf \u009b‮ved"), 'pold1 · "\\u001b[2Jrm -rf \\u009b\\u202eved"');
  assert.equal(await startLine("pold1", "pnpm dev --port 5173"), "pold1 · pnpm dev --port 5173", "a plain command prints bare, as before");
});

test("#231: WHEN a stale record's command is long THEN session start prints it quoted and cut to 80 characters", async () => {
  assert.equal(await startLine("pold1", "x".repeat(300)), `pold1 · "${"x".repeat(78)}…`);
  assert.equal(await startLine("pold1", "y".repeat(78)), `pold1 · ${"y".repeat(78)}`, "80 with the quotes: kept whole and bare");
});

test("#231: WHEN an id holds a Hangul filler THEN session start and session end print it escaped", async () => {
  const id = "aᅟbᅠcㅤdﾠ";
  const want = '"a\\u115fb\\u1160c\\u3164d\\uffa0"';
  assert.equal(await startLine(id, "pnpm dev"), `${want} · pnpm dev`);
  assert.equal(await endId(id), want);
});

test("#231: WHEN an id holds a variation selector THEN it prints escaped, one escape per UTF-16 unit", async () => {
  // VS16, a Mongolian free variation selector, and VS17 past U+FFFF.
  assert.equal(await endId("x️y᠋z\u{e0100}"), '"x\\ufe0fy\\u180bz\\udb40\\udd00"');
  assert.equal(await startLine("p\u{fe00}x", "pnpm dev"), '"p\\ufe00x" · pnpm dev', "at session start too");
});

test("#231: WHEN an id holds a long run of combining marks THEN the first 3 print raw and the rest escaped; shorter runs print raw", async () => {
  const acute = "́";
  assert.equal(await endId(`e${acute.repeat(6)}`), `"e${acute.repeat(3)}${"\\u0301".repeat(3)}"`);
  assert.equal(await endId(`x${acute.repeat(3)}y${acute}`), `"x${acute.repeat(3)}y${acute}"`, "a run of 3, then a new run");
  assert.equal(await startLine("việt", "pnpm dev"), "việt · pnpm dev", "precomposed text prints bare");
  assert.equal(await startLine("việt", "pnpm dev"), "việt · pnpm dev", "two marks on one letter print bare");
  assert.equal(await endId("a͏b"), '"a\\u034fb"', "the combining grapheme joiner is invisible: always escaped");
});

test("#231: WHEN a combining mark follows an escape THEN it prints escaped too, so it can't draw on the escape's last letter", async () => {
  assert.equal(await endId("\\́"), '"\\\\\\u0301"', "after JSON's own escape of a backslash");
  assert.equal(await endId("a​̸b"), '"a\\u200b\\u0338b"', "after an escaped zero-width space");
  assert.equal(await endId("​́̂x́"), '"\\u200b\\u0301\\u0302x́"', "a run after an escape, then a mark on a plain letter");
  assert.equal(await startLine("pold1", "\u001b́ls"), 'pold1 · "\\u001b\\u0301ls"', "in a command at session start too");
});

test("#231: WHEN an id or command holds a blank other than the plain space THEN it prints escaped", async () => {
  assert.equal(await endId("a b　c⠀d e f g"), '"a\\u00a0b\\u3000c\\u2800d\\u2003e\\u202ff g"');
  assert.equal(await startLine("pold1", "pnpm dev"), 'pold1 · "pnpm\\u00a0dev"');
  assert.equal(await startLine("pold1", "pnpm dev --port 5173"), "pold1 · pnpm dev --port 5173", "the plain space prints bare");
});

test("#231: WHEN an id or command starts with a combining mark THEN it prints escaped, so it can't draw on the opening quote", async () => {
  assert.equal(await endId("́x"), '"\\u0301x"');
  assert.equal(await startLine("pold1", "̸ls"), 'pold1 · "\\u0338ls"', "in a command at session start too");
  assert.equal(await endId("x́"), '"x́"', "a mark on a plain letter still prints raw");
});

// What list and ps print for one stale record seeded with these fields, and doctor's stale label for it (#250).
async function shown(fields) {
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev", ...fields });
  const [list, ps] = [(await run(sys, ["list"])).out, (await run(sys, ["ps", sys.cwd])).out];
  return { list, ps, doctor: processChecks(sys.cwd, { sys }).at(-1).label };
}

test("AC-250-1: WHEN a record's id, command, why or until holds a control, bidi or invisible character THEN list and ps print it escaped and quoted", async () => {
  const { list, ps } = await shown({ id: "p‮o", command: "\u001b[2Jrm", why: "a​b", until: "\u009bx" });
  for (const out of [list, ps]) {
    assert.match(out, /^- "p\\u202eo" · /m);
    assert.ok(out.includes('    "\\u001b[2Jrm" · why: "a\\u200bb" · until: "\\u009bx"'), out);
    assert.doesNotMatch(out, /[\u001b\u009b​‮]/u);
  }
});

test("AC-250-2: WHEN a stale record's id or command holds one THEN doctor's label prints it escaped", async () => {
  const { doctor } = await shown({ id: "p‮o", command: "\u001b[2Jrm" });
  assert.equal(doctor, '1 stale background process(es): "p\\u202eo" "\\u001b[2Jrm" (its owner session is gone)');
});

test("AC-250-3: WHEN every field is plain THEN list, ps and doctor print it as before, long ones uncut", async () => {
  const long = `pnpm dev ${"x".repeat(200)}`;
  const { list, ps, doctor } = await shown({ command: long, why: "dev server", until: "task done" });
  for (const out of [list, ps]) {
    assert.match(out, /^- pold1 · /m);
    assert.ok(out.includes(`    ${long} · why: dev server · until: task done`), out);
  }
  assert.equal(doctor, `1 stale background process(es): pold1 ${long} (its owner session is gone)`);
});
