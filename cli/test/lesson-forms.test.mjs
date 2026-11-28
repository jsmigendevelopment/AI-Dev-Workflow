// Kit lessons that carry a project detail in another form (#385, #392): joined or split names, issue numbers, and
// lesson files from a pipe or over the size cap. Local only: temp git repos, a temp home folder and the CLI in a child.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { checkLesson } from "../src/lesson-check.mjs";
import { denySet, projectTerm } from "../src/lesson-deny.mjs";
import { CLI, check, gitEnv, good, manifest, project, small } from "./lesson-fixture.mjs";
import { put, tmp } from "./helpers.mjs";

test("AC-385-1: WHEN the project is brightpaper THEN a lesson saying bright paper or bright-paper is refused", () => {
  const dir = small("brightpaper", { "package.json": JSON.stringify({ name: "brightpaper" }) });
  for (const lesson of ["The builder broke the bright paper check before the merge.",
    "The builder broke the bright-paper check before the merge."]) {
    assert.equal(checkLesson(good({ lesson }), { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(good({ lesson }), dir);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name)\)$/m);
    assert.doesNotMatch(r.stdout + r.stderr, /bright|paper/i);
  }
  // Each word alone is no part of the name: only the run of words that joins into it is.
  for (const lesson of ["The builder broke the paper check.", "The builder saw a bright light before the merge."]) {
    assert.equal(check(good({ lesson }), dir).status, 0, lesson);
  }
});

test("AC-385-2: WHEN .env.example names RIVER_SIGNAL_TOKEN THEN river signal token is refused", () => {
  const dir = small("cedar", { ".env.example": "RIVER_SIGNAL_TOKEN=\nRIVERSIGNAL_KEY=\n" });
  // Spaced, hyphenated, both at once, and a name with a joined part read as two words.
  for (const lesson of ["The builder lost the river signal token on the branch.",
    "The builder lost the river-signal-token on the branch.", "The builder lost the river-signal token on the branch.",
    "The builder lost the river signal-token on the branch.", "The builder lost the river signal key on the branch.",
    "The builder lost the river-signal key on the branch."]) {
    assert.equal(checkLesson(good({ lesson }), { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(good({ lesson }), dir);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \(env name\)$/m);
    assert.doesNotMatch(r.stdout + r.stderr, /river|signal/i);
  }
  // An env name stays whole (decision 322-1): its words alone don't block a lesson.
  assert.equal(check(good({ lesson: "The builder lost the token by the river on the branch." }), dir).status, 0);
});

test("AC-385-3: WHEN --project is given THEN issue 41 and #41 are refused, and the error never prints the number", () => {
  for (const lesson of ["The builder closed issue 41 on the branch.", "The builder closed #41 on the branch.",
    "The builder closed issue 57 on the branch.", "The builder closed PR 41 on the branch.",
    "The builder closed pull request 41 on the branch.", "The builder closed pull 41 on the branch.",
    "The builder closed pulls 41 and 42 on the branch.", "The builder closed issue: 41 on the branch.",
    // A number before "times out" is still an issue's: only a count of times passes.
    "The check on pull request 41 times out after an hour.", "The build on issue 41 times out after an hour.",
    "The builder saw that pull 12 times out on the branch."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: (contains a project term \(issue number\)|issue-number)$/m);
    assert.doesNotMatch(r.stdout + r.stderr, /41|42|57|12/);
  }
  const bare = good({ lesson: "The builder closed issue 41 on the branch." });
  assert.equal(checkLesson(bare, { manifest }).ok, true, "without a project, the allowlist alone passes it");
  // A small number that isn't an issue's still passes, and so does a count after the word issue.
  assert.equal(check(good({ lesson: "The coordinator ran the test 3 times before it passed." })).status, 0);
  for (const lesson of ["The builder hit the same issue 3 times before the merge.", "The builder hit the issue 2 times."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 0, `${lesson}\n${r.stderr}`);
  }
  // Only times makes a count: issue 3 x is still an issue number, besides the word rule that refuses x.
  assert.match(check(good({ lesson: "The builder hit the issue 3 x before the merge." })).stderr,
    /^ {2}lesson: contains a project term \(issue number\)$/m);
});

// The lesson file read from a pipe, as /dev/stdin, the way `lesson check <(...)` hands one over. A shell pipe, since
// a child's own stdin from spawnSync is a socket that /dev/stdin can't open.
function checkPiped(text) {
  const folder = tmp("onrails-lesson-");
  put(folder, "lesson.json", text);
  const script = 'cat "$1" | "$2" "$3" lesson check /dev/stdin --project "$4"';
  return spawnSync("sh", ["-c", script, "sh", join(folder, "lesson.json"), process.execPath, CLI, project],
    { encoding: "utf8", env: gitEnv(folder), cwd: folder });
}

test("lesson check: a lesson file from a pipe is read, and refused past 1 MB", { skip: process.platform === "win32" ? "no /dev/stdin on Windows" : false }, () => {
  const small = checkPiped(JSON.stringify(good()));
  assert.equal(small.status, 0, small.stderr);
  const big = checkPiped(JSON.stringify(good({ lesson: "the merge ".repeat(110_000) })));
  assert.equal(big.status, 1);
  assert.match(big.stderr, /^ {2}record: too-large$/m);
});

test("lesson check: a lesson file over 1 MB is refused unread, and a long field is scanned fast", () => {
  const big = check(good({ lesson: "the merge ".repeat(110_000) }));
  assert.equal(big.status, 1);
  assert.match(big.stderr, /^ {2}record: too-large$/m);
  // A long run of short words against a long one-word term: each field is scanned in a bounded time.
  const long = "ab".repeat(29) + "c";
  const started = performance.now();
  assert.equal(projectTerm("ab ".repeat(300_000), new Map([[long, "package name"]])), null);
  assert.ok(performance.now() - started < 1000, "the scan took over a second");
});

test("AC-392-1: WHEN a project is named party THEN a lesson saying parties is refused, and the same for Memories and memory", () => {
  for (const [name, lesson] of [["party", "The builder broke the parties check before the merge."],
    ["Memories", "The builder lost the memory check before the merge."]]) {
    const dir = small(name, { "package.json": JSON.stringify({ name: name.toLowerCase() }) });
    assert.equal(checkLesson(good({ lesson }), { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(good({ lesson }), dir);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name)\)$/m);
  }
  // The other forms still match: the plain -s singular of an -ies word, and a joined name in its -ies plural.
  const set = new Map([["movies", "docs"], ["key-story", "env name"]]);
  assert.equal(projectTerm("One movie ran.", set), "docs");
  for (const text of ["The key stories moved.", "The key-stories moved."]) assert.equal(projectTerm(text, set), "env name", text);
});

test("AC-392-2: WHEN a doc title is # iPhoneSync THEN phone sync is refused", () => {
  const dir = small("cedar", { "docs/vision.md": "# iPhoneSync\n\nThe app keeps a list, built with useState.\n" });
  const set = denySet(dir, { home: tmp("onrails-home-") });
  assert.equal(projectTerm("The phone sync check failed.", set), "docs");
  // Only a title gives a name that starts lower-case: in a sentence such a word is code.
  assert.equal(set.has("state"), false);
  for (const lesson of ["The builder broke the phone sync check before the merge.",
    "The builder broke the phone check before the merge."]) {
    const r = check(good({ lesson }), dir);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \(docs\)$/m, lesson);
    assert.doesNotMatch(r.stdout + r.stderr, /phone/i);
  }
});

test("lesson check: a count of times out of a total passes, and issue 41 times out is still refused (#392 item 5)", () => {
  for (const lesson of ["The builder hit the same issue 3 times out of five.",
    "The builder hit the same issue 3 times out of the last five runs."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 0, `${lesson}\n${r.stderr}`);
  }
  for (const lesson of ["The build on issue 41 times out after an hour.", "The check on pull request 41 times out."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \(issue number\)$/m, lesson);
  }
});

test("AC-410-4: WHEN issue 41 times out of is not followed by a number THEN it is refused, and a count of a total still passes", () => {
  for (const lesson of ["The builder hit the same issue 3 times out of 10 runs.", "The builder hit the same issue 3 times out of five.",
    "The builder hit the same issue 3 times out of the last five runs."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 0, `${lesson}\n${r.stderr}`);
  }
  for (const lesson of ["The build on issue 41 times out of memory.", "The build on issue 41 times out of the blue.",
    "The build on issue 41 times out of.", "The check on pull request 41 times out of order."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \(issue number\)$/m, lesson);
  }
});

test("lesson check: a pipe is read up to 1 MB and one byte, and no further (#392 item 6)", { skip: process.platform === "win32" ? "no /dev/stdin on Windows" : false }, () => {
  const total = 2 * 1024 * 1024;
  // The CLI and wc share the pipe, so wc counts the bytes the CLI left unread.
  const script = 'head -c "$1" /dev/zero | { "$2" "$3" lesson check /dev/stdin --project "$4" 2>&1; wc -c; }';
  const r = spawnSync("sh", ["-c", script, "sh", String(total), process.execPath, CLI, project],
    { encoding: "utf8", env: gitEnv(tmp("onrails-lesson-")) });
  assert.match(r.stdout, /^ {2}record: too-large$/m);
  assert.equal(Number(r.stdout.trim().split("\n").at(-1)), total - (1024 * 1024 + 1));
});
