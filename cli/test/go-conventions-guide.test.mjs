// The Go version of the server-side app conventions (#348): one section per server-side rule of
// guide/app-conventions.md, numbered the same, and linked from the guide index and the original.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const GO_GUIDE = "guide/app-conventions-go.md";

// Rule number -> a word its heading must hold, in both guides.
const SECTIONS = new Map([
  [5, /error/i],
  [8, /API/],
  [10, /money/i],
  [11, /time/i],
  [12, /database/i],
  [13, /logging/i],
  [14, /event/i],
  [15, /OpenAPI/],
  [16, /environment/i],
  [18, /access/i],
]);

/** The body of `## <n>. ...` up to the next `## ` heading, or null when there is none. */
function section(text, n) {
  const start = text.search(new RegExp(`^## ${n}\\. `, "m"));
  if (start < 0) return null;
  const rest = text.slice(start);
  const next = rest.slice(3).search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next + 3);
}

test("AC-348-1: WHEN the test reads both guides THEN each of sections 5, 8, 10, 11, 12, 13, 14, 15, 16 and 18 has a matching section in the Go guide", () => {
  assert.ok(existsSync(new URL(GO_GUIDE, root)), `${GO_GUIDE} exists`);
  const ts = read("guide/app-conventions.md");
  const go = read(GO_GUIDE);
  for (const [n, word] of SECTIONS) {
    const original = section(ts, n);
    const goVersion = section(go, n);
    assert.ok(original, `section ${n} is in app-conventions.md`);
    assert.ok(goVersion, `section ${n} is in ${GO_GUIDE}`);
    assert.match(original.split("\n")[0], word, `section ${n} of app-conventions.md is the ${word} section`);
    assert.match(goVersion.split("\n")[0], word, `section ${n} of the Go guide has the same topic`);
    assert.match(goVersion, /^```/m, `section ${n} has a short example`);
  }
});

test("AC-348-2: WHEN the test reads the Go guide THEN it names no TypeScript library and stays under 300 lines", () => {
  const go = read(GO_GUIDE);
  for (const name of ["Zod", "Drizzle", "TanStack", "createServerFn"]) {
    assert.ok(!go.toLowerCase().includes(name.toLowerCase()), `${GO_GUIDE} names ${name}`);
  }
  const lines = go.replace(/\n$/, "").split("\n").length;
  assert.ok(lines < 300, `${GO_GUIDE} has ${lines} lines`);
});

test("AC-348-3: WHEN the test reads the guide index and the TypeScript guide THEN both link to the Go guide", () => {
  assert.match(read("guide/README.md"), /\]\(app-conventions-go\.md\)/);
  assert.match(read("guide/app-conventions.md"), /\]\(app-conventions-go\.md\)/);
});

// AC-348-4 is an `agent` check (a reviewer compares the guide with AGENTS.md's Code rules). This only
// guards the words that rule leans on, so a rewrite can't quietly drop one.
test("AC-348-4 support: the Go guide's money, time, logs, events and access sections name the same things as AGENTS.md", () => {
  const go = read(GO_GUIDE);
  assert.match(section(go, 10), /integer minor units/i);
  assert.match(section(go, 10), /currency/i);
  assert.match(section(go, 11), /UTC/);
  assert.match(section(go, 13), /log\/slog/);
  assert.match(section(go, 14), /track\(\)/);
  assert.match(section(go, 18), /check\(user, action, object\)/);
});

// #564: fixes from the review of the guide above. Each test reads the guide's words, so the examples
// and the lines they sit in can't drift back.
const bulletWith = (text, start) => text.split("\n").find((l) => l.startsWith(start)) ?? "";

test("AC-564-1: WHEN a reader opens the ReplaceAttr example THEN it guards len(groups) == 0 and checks the kind before .Time()", () => {
  const go = read(GO_GUIDE);
  const from = go.indexOf("ReplaceAttr: func(");
  assert.ok(from >= 0, "the guide has a ReplaceAttr example");
  const example = go.slice(from, go.indexOf("\n\t\t},\n", from));
  assert.match(example, /ReplaceAttr: func\(groups \[\]string, a slog\.Attr\)/, "groups is named, not dropped");
  const guard = example.indexOf("len(groups) == 0");
  const kind = example.indexOf("a.Value.Kind() == slog.KindTime");
  const call = example.indexOf(".Time()");
  assert.ok(guard >= 0, "the example guards len(groups) == 0");
  assert.ok(kind >= 0, "the example checks a.Value.Kind() == slog.KindTime");
  assert.ok(call >= 0, "the example still converts the time");
  assert.ok(guard < call, "the group guard comes before .Time()");
  assert.ok(kind < call, "the kind check comes before .Time()");
});

test("AC-564-2: WHEN a reader opens the Secret type THEN String() and MarshalJSON() both return [redacted]", () => {
  const go = read(GO_GUIDE);
  assert.match(go, /func \(Secret\) String\(\) string[^\n]*"\[redacted\]"/);
  assert.match(go, /func \(Secret\) MarshalJSON\(\) \(\[\]byte, error\)[^\n]*\[redacted\]/);
  assert.match(go, /func \(Secret\) LogValue\(\) slog\.Value[^\n]*\[redacted\]/, "the slog hook stays");
  const bullet = bulletWith(section(go, 13), "- **Redaction by default");
  assert.match(bullet, /`%s`/, "the text says it stays hidden in %s");
  assert.match(bullet, /JSON/, "the text says it stays hidden in JSON");
});

test("AC-564-3: WHEN a reader opens the error envelope line THEN it is not 'the web app's own' and says requestId was added and fields kept", () => {
  const go = read(GO_GUIDE);
  const line = bulletWith(section(go, 5), "- **One error envelope");
  assert.ok(line, "the envelope bullet exists");
  assert.doesNotMatch(line, /web app's own/);
  assert.match(line, /requestId`? (was )?added/);
  assert.match(line, /`fields`[^.]*kept|kept[^.]*`fields`/);
});

test("AC-564-4: WHEN a reader compares the two lines about the system clock THEN both place it in internal/platform/clock, in UTC, as the one caller of time.Now()", () => {
  const go = read(GO_GUIDE);
  const intro = bulletWith(go, "Shared code lives under");
  const bullet = bulletWith(section(go, 11), "- **A test clock");
  for (const [name, line] of [["intro", intro], ["rule 11 bullet", bullet]]) {
    assert.ok(line, `${name} line exists`);
    assert.match(line, /internal\/platform\/clock/, `${name} names the clock's folder`);
    assert.match(line, /time\.Now\(\)/, `${name} says where time.Now() is read`);
    assert.match(line, /UTC/, `${name} says the clock is UTC`);
  }
  assert.doesNotMatch(go, /system clock in `cmd\/api`/, "the old place is gone");
});

test("AC-564-5: WHEN a reader opens the default authorization adapter line THEN it says the Go adapter on Postgres is untested and drops research/authorization.md", () => {
  const go = read(GO_GUIDE);
  const line = bulletWith(section(go, 18).replace(/^ +- /gm, "- "), "- The default adapter");
  assert.ok(line, "the default adapter bullet exists");
  assert.match(line, /untested/i);
  assert.match(line, /Postgres/);
  assert.doesNotMatch(go, /research\/authorization\.md/);
  assert.ok(go.replace(/\n$/, "").split("\n").length < 300, "the guide stays under 300 lines");
});

// #574: three leftovers from #568's review. Each test reads the guide's words, so the examples can't
// drift back. (The snippets were also compiled with go vet and run in a scratch module.)
test("AC-574-1: WHEN a reader opens the error envelope example THEN it shows fields beside code, message and requestId", () => {
  const go = read(GO_GUIDE);
  const line = bulletWith(section(go, 5), "- **One error envelope");
  assert.ok(line, "the envelope bullet exists");
  const example = line.match(/\{"ok": false, "error": \{[^}]*\}\}/)?.[0];
  assert.ok(example, "the bullet has the example envelope");
  for (const key of ["code", "message", "requestId", "fields"]) {
    assert.ok(example.includes(`"${key}"`), `the example envelope shows ${key}`);
  }
});

test("AC-574-2: WHEN a reader opens the Secret type THEN it has GoString() returning [redacted] and the text says exported fields", () => {
  const go = read(GO_GUIDE);
  const from = go.indexOf("type Secret string");
  assert.ok(from >= 0, "the guide has the Secret type");
  const block = go.slice(from, go.indexOf("func New(", from));
  assert.match(block, /func \(Secret\) GoString\(\) string[^\n]*"\[redacted\]"/);
  assert.match(block, /%#v/, "the comment names %#v");
  assert.match(block, /exported fields/, "the comment says exported fields, so an unexported one isn't promised");
  assert.doesNotMatch(block, /even inside a logged struct/, "the unqualified claim is gone");
});

test("AC-574-3: WHEN a reader opens the ReplaceAttr example THEN its msg and level cases check the attribute's kind too", () => {
  const go = read(GO_GUIDE);
  const from = go.indexOf("ReplaceAttr: func(");
  assert.ok(from >= 0, "the guide has a ReplaceAttr example");
  const lines = go.slice(from, go.indexOf("\n\t\t},\n", from)).split("\n");
  const caseOf = (key) => lines.find((l) => l.includes("case ") && l.includes(`a.Key == slog.${key}`)) ?? "";
  const msg = caseOf("MessageKey");
  const level = caseOf("LevelKey");
  assert.match(msg, /topLevel/, "the msg case keeps the group guard");
  assert.match(msg, /a\.Value\.Kind\(\) == slog\.KindString/, "the msg case checks for a string");
  assert.match(level, /topLevel/, "the level case keeps the group guard");
  assert.match(level, /a\.Value\.Kind\(\) == slog\.KindAny/, "the level case checks for slog's Level value (kind Any)");
  assert.match(lines.join("\n"), /a\.Key = "event"/, "msg is still renamed to event");
  assert.match(lines.join("\n"), /strings\.ToLower\(a\.Value\.String\(\)\)/, "level is still lowercased");
});
