// Tests for #747: an issue that adds a refusal says what happens to every other input (default deny), and
// check-gate-acs.mjs fails an issue that only names the refused spelling. The fixtures are short bodies written out
// here: AC lines copied from public gate issues (#707 to #712, #733, #740, #590) and made-up ones for the shapes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";
import { spellings } from "./spellings.mjs";
import { gateGap, readAcs } from "../../.agents/skills/issues/scripts/check-gate-acs.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/issues/scripts/check-gate-acs.mjs", import.meta.url));
const consistency = readFileSync(new URL("../../.agents/skills/issues/references/consistency.md", import.meta.url), "utf8");
const run = (args, input = "", cwd = tmp()) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, input, encoding: "utf8", env: safeEnv() });
const lines = (r) => r.stdout.split("\n").filter(Boolean);
const issue = (number, body, title = `Issue ${number}`) => ({ number, title, body });
const stdin = (...issues) => JSON.stringify(issues);
const withAcs = (...acs) => `## Goal\n\nA gate.\n\n## Acceptance checks\n\n${acs.map((a) => `- [ ] \`auto\` ${a}`).join("\n")}\n\n## Out of scope\n\n- Nothing else.\n`;

// The refusing-only body with one more line put inside the acceptance section, before "Out of scope".
const before = (line) => withAcs(REFUSE_ONLY).replace("## Out of scope", `${line}\n\n## Out of scope`);
const REFUSE_ONLY = "AC-1: WHEN the flag is --dry-run THEN it refuses";
const COVER = "AC-2: WHEN the flag is not on the allowed list THEN it refuses";

// AC lines from the issues named, each as written there (the ID forms differ between them).
const AC_707 = [
  "AC-707-1: WHEN a `*.service.ts` file imports another `*.service.ts` file THEN `pnpm lint` fails with a message that says a controller composes services.",
  "AC-707-3: WHEN a Drizzle or memory adapter imports its own port, or a service imports a repository port, or a controller imports services THEN lint passes.",
];
const AC_708 = [
  "AC-708-1: WHEN a key is set only in the personal profile THEN `config get <section.key>` prints the personal value and says `personal`.",
  "AC-708-4: WHEN no layer has the key THEN it exits 1 with one plain line that names the key, and prints nothing else.",
  "AC-708-5: WHEN a layer's file is missing THEN that layer is skipped without an error.",
];
const AC_709 = [
  "AC-709-1: WHEN `map` runs on a fixture app with modules under `src/modules/` THEN `docs/map.generated.md` lists each module with its file count and lines of code.",
  "AC-709-3: WHEN two or more modules import each other in a loop THEN the file lists the cycle by module names.",
  "AC-709-4: WHEN one feature module under `src/modules/` imports another THEN the file flags it as a sideways import.",
  "AC-709-5: WHEN `map` runs twice with no code change THEN the two outputs are identical byte for byte.",
];
const AC_712 = [
  "AC-712-1: WHEN check 5 of `consistency.md` is read THEN it accepts a `Wireframes approved` row or, on Full, a `Wireframes: AI pick, not reviewed` row.",
  "AC-712-2: WHEN `node scripts/sync-skills.mjs --check` runs THEN it passes with the synced copies updated.",
];
const AC_710 = [
  "AC-710-1: WHEN `new:module tasks --dry` runs THEN no file is created or changed, and the output lists each file it would create.",
  "AC-710-3: WHEN a generator would refuse (a bad name, a missing module, a file already there) THEN `--dry` refuses with the same message.",
  "AC-710-5: WHEN a generator runs without `--dry` THEN it behaves as before and every existing pack test passes unchanged.",
];
const AC_733 = [
  "AC-733-1: WHEN `config get` is asked for any name above, in any case or as a plural THEN it prints nothing on stdout, and it exits 1.",
  "AC-733-3: WHEN a value is a URL with `user:password@` THEN it is refused (AI pick: refuse rather than mask, simpler and safer).",
  "AC-733-5: harmless keys still read, including every key in the kit's profile template.",
];
const AC_740 = [
  "AC-1: WHEN the key is not in the kit template THEN nothing is printed and exit is 1, whatever its name or value.",
  "AC-2: WHEN the key is in the template and its value has no secret shape THEN it prints with its layer, as today.",
  "AC-3: WHEN an allowed key holds a secret-shaped value THEN it is refused.",
];
const AC_590 = [
  "AC-A-1 (auto): WHEN a Dependabot Go bump changes a `go.mod` or `go.sum` under a folder whose name starts with `_` or `.`, at any depth THEN `own-branch.mjs` exits 1 and names the file.",
  "AC-A-2 (auto): WHEN a bump changes only the honest `go.mod` and `go.sum` THEN it passes as before, and so do folders such as `svc/` or `my_vendor/`.",
];

test("AC-747-1: WHEN an issue refuses one input and no AC covers every other THEN it exits 1 with one line naming the issue and the AC", () => {
  const r = run([], stdin(issue(747, withAcs(REFUSE_ONLY)), issue(5, withAcs("AC-5-1: WHEN the page loads THEN it shows the title"))));
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(lines(r), ["#747 Issue 747: AC-1 refuses an input and no AC says what happens to every other input. Add `AC-<issue>-<n>: WHEN the input is not on the allowed list THEN it is refused`."]);
});

test("AC-747-1: WHEN the body is a saved file THEN the run prints one line that names the file's issue and the AC", () => {
  const dir = tmp();
  put(dir, "747-gate.md", `# A gate\n\n${withAcs("AC-747-1: WHEN the flag is --dry-run THEN it refuses")}`);
  const r = run(["747-gate.md"], "", dir);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(lines(r).length, 1);
  assert.match(r.stdout, /^#747 A gate: AC-747-1 refuses an input and no AC says what happens to every other input\./);
});

test("AC-747-1: WHEN each refusal word is the AC's THEN result and nothing covers the rest THEN the check fails the issue", () => {
  for (const then of ["it refuses", "it is blocked", "it blocks the call", "the file is hidden", "it hides the value", "it exits non-zero",
    "it exits 2", "the build fails", "it is rejected", "access is denied", "nothing is printed", "it prints nothing", "`pnpm lint` fails"]) {
    assert.equal(gateGap(withAcs(`AC-1: WHEN the input is --dry THEN ${then}`))?.id, "AC-1", then);
  }
});

test("AC-747-1: WHEN the real gate issues #710, #733, #707, #708 and #590 name only a refused case THEN each fails and names its first refusing AC", () => {
  const cases = [[710, AC_710, "AC-710-3"], [733, AC_733, "AC-733-1"], [707, AC_707, "AC-707-1"], [708, AC_708, "AC-708-4"], [590, AC_590, "AC-A-1"]];
  for (const [number, acs, id] of cases) {
    const r = run([], stdin(issue(number, withAcs(...acs))));
    assert.equal(r.status, 1, `#${number}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, new RegExp(`^#${number} Issue ${number}: ${id} refuses an input`), `#${number}`);
    assert.equal(lines(r).length, 1);
  }
});

test("AC-747-1: WHEN a pass has two gap issues and one clean one THEN each gap is named on its own line", () => {
  const r = run([], stdin(issue(1, withAcs(REFUSE_ONLY)), issue(2, withAcs(REFUSE_ONLY, COVER)), issue(3, withAcs("AC-3-1: WHEN it runs THEN it exits 1"))));
  assert.equal(r.status, 1);
  assert.deepEqual(lines(r).map((l) => l.slice(0, 2)), ["#1", "#3"]);
});

test("AC-747-2: WHEN an AC names the rest in its WHEN and refuses in its THEN THEN the issue passes", () => {
  for (const when of ["the input is not on the allowed list", "the flag is any other flag", "the flag is unknown", "the flag is not listed",
    "the key is not in the kit template", "anything else is typed", "every other spelling is given", "a flag is unrecognized",
    "the name is not allowed", "the key is not in the allowlist", "it is an unsupported flag"]) {
    assert.equal(gateGap(withAcs(REFUSE_ONLY, `AC-2: WHEN ${when} THEN it is refused`)), null, when);
  }
  assert.equal(gateGap(withAcs(REFUSE_ONLY, "AC-2: WHEN the flag is anything else THEN the run blocks")), null);
  assert.equal(gateGap(withAcs(REFUSE_ONLY, "AC-2: WHEN the flag is unlisted THEN it exits 1")), null);
});

test("AC-747-2: WHEN one AC names the refused input and the rest together THEN it covers itself", () => {
  assert.equal(gateGap(withAcs("AC-1: WHEN the flag is --dry-run or any other unknown flag THEN it is refused")), null);
  const r = run([], stdin(issue(747, withAcs(REFUSE_ONLY, COVER))));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^1 issue read\. No AC refuses an input without an AC for every other input\.$/m);
});

test("AC-747-2: WHEN #740, the issue that asked for an allowlist, is read THEN it passes", () => {
  const r = run([], stdin(issue(740, `## Acceptance\n\n${AC_740.map((a) => `- [ ] \`auto\` ${a}`).join("\n")}\n\n## Out of scope\nWriting settings.\n`)));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("AC-747-2: WHEN the covering words sit anywhere but a real AC's WHEN THEN the gate still fails (no magic word)", () => {
  const gamed = {
    "in the goal": `## Goal\n\nRefuse anything else, any other and unknown flags, not on the allowed list.\n\n${withAcs(REFUSE_ONLY)}`,
    "in the THEN part": withAcs(REFUSE_ONLY, "AC-2: WHEN the flag is --DRY-RUN THEN it refuses any other unknown flag too"),
    "in an AC that does not refuse": withAcs(REFUSE_ONLY, "AC-2: WHEN the flag is not on the allowed list THEN it is accepted"),
    "with the refusal negated": withAcs(REFUSE_ONLY, "AC-2: WHEN the flag is unknown THEN it is not refused"),
    "with a negated block": withAcs(REFUSE_ONLY, "AC-2: WHEN the flag is any other THEN it never blocks the run"),
    "with no refusal word": withAcs(REFUSE_ONLY, "AC-2: WHEN the flag is unknown THEN a warning is shown"),
    "in an agent check": withAcs(REFUSE_ONLY).replace("## Out", "- [ ] `agent` AC-2: WHEN the flag is not on the allowed list THEN it is refused\n\n## Out"),
    "in an HTML comment": before("<!-- AC-2: WHEN the flag is not on the allowed list THEN it is refused -->"),
    "in a fenced block": before("```\nAC-2: WHEN the flag is unknown THEN it is refused\n```"),
    "in a quote": before("> AC-2: WHEN the flag is unknown THEN it is refused"),
    "in the out of scope section": `${withAcs(REFUSE_ONLY)}\n- AC-2: WHEN the flag is unknown THEN it is refused\n`,
    "as a mention in a sentence": withAcs(REFUSE_ONLY, "AC-3: see AC-2 where WHEN the flag is unknown THEN it is refused is said"),
    "with no WHEN and THEN": withAcs(REFUSE_ONLY, "AC-2: unknown flags are refused"),
    "with no AC id": before("- [ ] WHEN the flag is unknown THEN it is refused"),
    "with an AC id and no colon": before("- [ ] AC-2 is the one where the flag is unknown, and then it is refused"),
  };
  for (const [how, body] of Object.entries(gamed)) {
    assert.equal(gateGap(body)?.id, "AC-1", how);
    assert.equal(run([], stdin(issue(9, body))).status, 1, how);
  }
});

test("AC-747-2: WHEN a covering AC wraps over two lines THEN it still counts", () => {
  assert.equal(gateGap(`## Acceptance checks\n\n- [ ] \`auto\` ${REFUSE_ONLY}\n- [ ] \`auto\` AC-2: WHEN the flag is not on the\n  allowed list THEN it is refused\n`), null);
});

test("AC-747-3: WHEN an issue has no refusing AC THEN it exits 0 (shapes of #709 and #712)", () => {
  for (const [number, acs] of [[709, AC_709], [712, AC_712]]) {
    const r = run([], stdin(issue(number, withAcs(...acs))));
    assert.equal(r.status, 0, `#${number}: ${r.stdout}`);
  }
  assert.equal(run([], stdin(issue(1, withAcs("AC-1-1: WHEN a layer's file is missing THEN that layer is skipped without an error")))).status, 0);
});

test("AC-747-3: WHEN an issue has a refusing AC and an AC that says what passes THEN it still fails (shapes of #707 and #708)", () => {
  for (const [number, acs] of [[707, AC_707], [708, AC_708]]) assert.equal(run([], stdin(issue(number, withAcs(...acs)))).status, 1, `#${number}`);
});

test("AC-747-3: WHEN a THEN names a refusal word inside another word THEN it is not a refusal", () => {
  assert.equal(gateGap(withAcs("AC-1: WHEN it runs THEN the blockchain, the unblocked path and a refusenik page are listed")), null);
});

test("AC-747-4: WHEN a body has no readable AC line, or there is no input, THEN it exits 2, never 0", () => {
  const empty = run([], "");
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /^check-gate-acs: expected a JSON list/);
  for (const input of ["[]", "{}", "not json", stdin(issue(1, null)), stdin(issue(1, "")), stdin(issue(1, "## Goal\n\nRefuse everything.\n"))]) {
    const r = run([], input);
    assert.equal(r.status, 2, input);
    assert.doesNotMatch(r.stdout, /No AC refuses/, input);
  }
  const dir = tmp();
  put(dir, "blank.md", "");
  put(dir, "prose.md", "# Prose\n\nAC-1 is mentioned here: WHEN x THEN it refuses.\n");
  assert.equal(run(["blank.md"], "", dir).status, 2);
  assert.equal(run(["prose.md"], "", dir).status, 2);
  assert.equal(run(["missing.md"], "", dir).status, 2);
});

test("AC-747-4: WHEN one issue in a list has no readable AC beside a clean one THEN it exits 2 and names it", () => {
  const r = run([], stdin(issue(1, withAcs(REFUSE_ONLY, COVER)), issue(2, "just words", "No ACs")));
  assert.equal(r.status, 2);
  assert.match(r.stdout, /^#2 No ACs: no AC line the check can read\./);
});

test("AC-747-4: WHEN every issue is done THEN it exits 2 and a done file is skipped otherwise", () => {
  const dir = tmp();
  put(dir, "1-done.md", `# Done\nStatus: done\n\n${withAcs(REFUSE_ONLY)}`);
  put(dir, "2-open.md", `# Open\n\n${withAcs("AC-2-1: WHEN it runs THEN it prints the title")}`);
  assert.equal(run(["1-done.md"], "", dir).status, 2);
  const r = run(["1-done.md", "2-open.md"], "", dir);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^1 issue read, 1 done skipped\./);
});

test("AC-747-4: WHEN the AC id forms of real issues are read THEN each is one AC with its text", () => {
  const ids = (acs) => readAcs(withAcs(...acs)).map((a) => a.id);
  assert.deepEqual(ids(AC_590), ["AC-A-1", "AC-A-2"]);
  assert.deepEqual(ids(AC_740), ["AC-1", "AC-2", "AC-3"]);
  assert.equal(readAcs("1. **AC-4:** WHEN a THEN b")[0].text, "WHEN a THEN b");
});

test("AC-747-5: WHEN spellings('--dry') is called THEN it returns case, separator, plural and =1 forms with no duplicates", () => {
  const all = spellings("--dry");
  for (const form of ["--dry", "--DRY", "--Dry", "--dRy", "-dry", "__dry", "_dry", "dry", "--drys", "--dries", "--dry=1", "--DRY=1", "--dry="]) {
    assert.ok(all.includes(form), form);
  }
  assert.equal(all.length, new Set(all).size, "no duplicates");
  assert.equal(all[0], "--dry");
});

test("AC-747-5: WHEN spellings gets a two-word flag THEN the separator forms are joined with - _ and nothing", () => {
  const all = spellings("--dry-run");
  for (const form of ["--dry_run", "--dryrun", "--DRY_RUN", "--Dry-Run", "--dryRun", "--dry-runs", "--dry_run=1", "--DRYRUN"]) assert.ok(all.includes(form), form);
  assert.equal(all.length, new Set(all).size);
  assert.deepEqual(spellings("--dry"), spellings("--dry"));
  assert.throws(() => spellings("--"), /no word/);
});

test("AC-747-6: WHEN consistency.md is read THEN check 13 runs check-gate-acs.mjs and the numbered checks run 1 to 13 with the same report line", () => {
  const checks = consistency.split("\n").filter((l) => /^\d+\. \*\*/.test(l));
  assert.deepEqual(checks.map((l) => Number(l.match(/^\d+/)[0])), Array.from({ length: 13 }, (_, i) => i + 1));
  const check13 = checks[12];
  assert.match(check13, /node \.agents\/skills\/issues\/scripts\/check-gate-acs\.mjs/);
  assert.match(check13, /gh issue list --milestone "<name>" --state open --limit 200 --json number,title,body,labels \| node \.agents\/skills\/issues\/scripts\/check-gate-acs\.mjs/);
  assert.match(check13, /docs\/issues\/\*\.md/);
  assert.match(check13, /exits 1 on a gap, and exits 2/);
  assert.match(check13, /WHEN the input is not on the allowed list THEN it is refused/);
  assert.match(consistency, /^Consistency check · pass <N> · <date> · <k> issues read$/m);
  assert.match(consistency, /^1\. \[<check number>\] /m);
});
