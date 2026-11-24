#!/usr/bin/env node
// The coordinator's one sweep timer. Its state is one line in docs/state.md, so every session
// that opens the repo sees the same timer:
//   Sweep timer: live · <kind> · <id> · every <n> min · next <ISO time, UTC>
//   Sweep timer: none
// No dependencies. Exit 0 means yes or done, 1 means no, 2 means a usage error.
//   node timer.mjs status                         live <id> <kind> <interval> <next>, or none
//   node timer.mjs should-arm                     0: no live timer, or past due by more than 3x its interval
//   node timer.mjs armed <kind> <id> <interval>   writes the line; next = now + interval minutes
//   node timer.mjs fired <tag>                    0: the line names this timer (next moves on); 1: stale or duplicate
//   node timer.mjs interval <10|30>               rewrites the interval only; prints changed or same
//   node timer.mjs cancelled                      writes none
// An id is <tag>+<tool id>. The tag is yours and goes in the firing message ("Sweep timer fired <tag>"),
// because the message is set before the tool returns its own id, which you need to cancel the timer.
// --file <path> (default docs/state.md) and --now <ISO time> (for tests) work with every command.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MINUTE = 6e4;
const LINE = /^[-*]?\s*(\*\*)?Sweep timer:(\*\*)?[^\n]*$/m;
const LIVE = /Sweep timer:(?:\*\*)?\s*live · (\S+) · (\S+) · every (\d+) min · next (\S+)/;

/** The timer in a state file's text: { kind, id, interval, next } or null. */
export function parse(text) {
  const m = LIVE.exec(text.match(LINE)?.[0] ?? "");
  return m ? { kind: m[1], id: m[2], interval: Number(m[3]), next: m[4] } : null;
}

/** The line for a timer, or for none. */
export const format = (t) => (t ? `Sweep timer: live · ${t.kind} · ${t.id} · every ${t.interval} min · next ${t.next}` : "Sweep timer: none");

/** The text with its Sweep timer line replaced, or added at the end. */
export function withLine(text, timer) {
  const line = format(timer);
  if (LINE.test(text)) return text.replace(LINE, line);
  return `${text.replace(/\n*$/, "")}\n\n${line}\n`;
}

/** True when there's no live timer, or it is past due by more than 3 times its interval. */
export function shouldArm(timer, now) {
  if (!timer) return true;
  const next = Date.parse(timer.next);
  return !Number.isFinite(next) || now - next > 3 * timer.interval * MINUTE;
}

const at = (now, minutes) => new Date(now + minutes * MINUTE).toISOString().replace(/\.\d{3}Z$/, "Z");
const SAFE = /^[A-Za-z0-9_./:+-]+$/;
const tagOf = (id) => id.split("+")[0];

/** Runs one command on the state text. Returns { code, out, text } where text is the new file, if it changed. */
export function run(args, text, now) {
  const timer = parse(text);
  const [cmd, ...rest] = args;
  const usage = (out) => ({ code: 2, out });
  switch (cmd) {
    case "status":
      return { code: 0, out: timer ? `live ${timer.id} ${timer.kind} ${timer.interval} ${timer.next}` : "none" };
    case "should-arm":
      return shouldArm(timer, now) ? { code: 0, out: timer ? "arm: the recorded timer is dead" : "arm: no timer" } : { code: 1, out: `live ${timer.id}: arm nothing` };
    case "armed": {
      const [kind, id, minutes] = rest;
      const interval = Number(minutes);
      if (!kind || !id || !SAFE.test(kind) || !SAFE.test(id) || !Number.isInteger(interval) || interval <= 0) return usage("armed <kind> <id> <interval-min>");
      const next = { kind, id, interval, next: at(now, interval) };
      return { code: 0, out: format(next), text: withLine(text, next) };
    }
    case "fired": {
      const [id] = rest;
      if (!id) return usage("fired <id>");
      if (!timer || (timer.id !== id && tagOf(timer.id) !== id)) return { code: 1, out: `stale: ${id} isn't the live timer. Do the sweep, arm nothing.` };
      const next = { ...timer, next: at(now, timer.interval) };
      return { code: 0, out: format(next), text: withLine(text, next) };
    }
    case "interval": {
      const interval = Number(rest[0]);
      if (interval !== 10 && interval !== 30) return usage("interval <10|30>");
      if (!timer) return { code: 1, out: "none: no timer to change" };
      if (timer.interval === interval) return { code: 0, out: "same" };
      return { code: 0, out: "changed", text: withLine(text, { ...timer, interval }) };
    }
    case "cancelled":
      return { code: 0, out: "Sweep timer: none", text: withLine(text, null) };
    default:
      return usage("status | should-arm | armed <kind> <id> <interval-min> | fired <id> | interval <10|30> | cancelled");
  }
}

function main(argv) {
  const args = [];
  let file = "docs/state.md";
  let now = Date.now();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--now") now = Date.parse(argv[++i]);
    else args.push(argv[i]);
  }
  if (!file || !Number.isFinite(now)) return console.error("--file needs a path, --now an ISO time"), 2;
  const path = resolve(file);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "# State\n";
  const r = run(args, text, now);
  if (r.text !== undefined && r.text !== text) writeFileSync(path, r.text);
  (r.code === 2 ? console.error : console.log)(r.code === 2 ? `Usage: timer.mjs ${r.out}` : r.out);
  return r.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
