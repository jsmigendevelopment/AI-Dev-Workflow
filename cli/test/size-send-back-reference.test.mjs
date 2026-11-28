// #558: the local path of `pr-size.mjs --record` is documented in local-mode.md, and coordinate step 6.1.1 keeps a
// one-line pointer while the send-back detail lives in references/size-send-back.md. These are text rules the agents
// read, so the tests read the shipped skill text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(path(p), "utf8");
const COORDINATE = ".agents/skills/coordinate/SKILL.md";
const LOCAL_MODE = ".agents/skills/coordinate/references/local-mode.md";
const SIZE_REFERENCE = ".agents/skills/coordinate/references/size-send-back.md";

/** The step 6.1.1 bullet of coordinate's SKILL.md. */
const sizeFirst = () => {
  const lines = read(COORDINATE).split("\n").filter((l) => l.includes("**Size first**"));
  assert.equal(lines.length, 1, "one **Size first** bullet");
  return lines[0];
};

test("AC-558-1: WHEN local-mode.md is read THEN it documents pr-size.mjs --base ... --head ... --record", () => {
  const local = read(LOCAL_MODE);
  const step = local.slice(local.indexOf("**Size first**"), local.indexOf("**Review from the diff.**"));
  assert.match(step, /`node \.agents\/skills\/coordinate\/scripts\/pr-size\.mjs --base main --head <sha> --record issue=<issue> model=<model> effort=<effort> tool=<tool>`/);
  assert.match(step, /last on the line/);
  assert.match(step, /writes the `job=size-check` record itself[^.]*`pr=null`/);
  assert.match(step, /pass or fail/);
  assert.match(step, /Couldn't record the size/);
  // The hand-written command stays, as the fallback for an exit 2 that wrote nothing.
  assert.match(step, /`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs write job job=size-check issue=<issue> pr=null sha=<sha> outcome=fail send_back=size model=<model> effort=<effort> tool=<tool>`/);
});

test("AC-558-2: WHEN coordinate step 6.1.1 is read THEN it is a one-line pointer to references/size-send-back.md", () => {
  const line = sizeFirst();
  assert.ok(line.includes("`references/size-send-back.md`"), "the bullet points at the reference");
  assert.ok(line.length < 900, `the bullet is a short pointer, not the detail (${line.length} characters)`);
  assert.match(line, /Exit 0: go on to 6\.1\.2/);
  for (const moved of ["Split this. Either", "Before you call a send-back free", "Couldn't record the size", "holds no `lines`"]) {
    assert.ok(!line.includes(moved), `${moved} moved to the reference`);
  }
  const table = read(COORDINATE).slice(read(COORDINATE).indexOf("## References"));
  assert.match(table, /\| `references\/size-send-back\.md` \| [^|]*6\.1\.1[^|]*\|/);
});

test("AC-558-2: WHEN the reference is read THEN it holds every rule 6.1.1 had, word for word", () => {
  assert.ok(existsSync(path(SIZE_REFERENCE)), "references/size-send-back.md exists");
  const ref = read(SIZE_REFERENCE);
  const rules = [
    "Local mode: `pr-size.mjs --base main --head <sha>` from your checkout of main, before the review.",
    "**Record every count** (#427): add `--record issue=<issue> model=<model> effort=<effort> tool=<tool>`, last on the line, with your own session's model and effort (#380), to the pull request command.",
    "On every head it counts, pass or fail, the script writes the `job=size-check` record itself, in your checkout of main: the pull request, the head sha and the counted lines come from its count, and an exit 1 carries `outcome=fail send_back=size`.",
    "The weekly report buckets pull requests by that count. Never type the lines or write this record by hand.",
    "An exit 2 that says `Couldn't record the size` wrote nothing: fix what it names (a bad value, a missing writer) and run it again. Step 10 lands it.",
    "Exit 1: no clone, no checks, no review and no `qa`.",
    "Comment `Sent back · <sha> · size: <count> counted lines, over 1,000` with the split brief on the pull request and on its issue (a comment on the issue; in local mode, under `## Comments` of its issue file), and give it to a fresh builder on the same branch:",
    "Split this. Either file child issues through `issues`, each under 1,000, and narrow this pull request to the first; or, when the parts can't stand alone on main, stack it: pull requests of under 1,000 each, each based on the branch before it. Only a change that can't be split, like a mechanical rename, stays whole, with the `size-exception` label and a `Size exception: <reason>` line. Put `Split from #<n>` on each child issue.",
    "The send-back's record is the one the `--record` run wrote.",
    "Only when it still exits 2 with `Couldn't record the size` after an over-limit count (nothing was written) do you send it back anyway and write the record by hand, with your own session's model and effort (#380): `node .agents/skills/coordinate/scripts/insights.mjs write job job=size-check issue=<issue> pr=<n> sha=<sha> outcome=fail send_back=size model=<model> effort=<effort> tool=<tool>`.",
    "It holds no `lines`, so the weekly report keeps that pull request under `unknown`. Local mode writes its own, as `references/local-mode.md` step 3 says.",
    "The first send-back is not a review round: it doesn't count toward the review cap.",
    "Before you call a send-back free, look for an earlier `Sent back · <sha> · size:` line on the issue, not only on this pull request, so a later pull request or a fresh coordinator session sees it was used.",
    "A child of a size split (its issue says `Split from #<n>`) gets no free send-back: its first head at 1,000 or more counts as a failed review round.",
    "A later head of the same issue still at 1,000 or more counts as a failed review round, so the review cap and its escalation below take over.",
    "Each new head runs this again.",
  ];
  for (const rule of rules) assert.ok(ref.includes(rule), `the reference keeps: ${rule}`);
});
