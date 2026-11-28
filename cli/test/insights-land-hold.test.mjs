// `insights.mjs land` holds records for a batch (#748): AC-748-1 to -4 here, AC-748-5 (flow.mjs) and AC-748-6 (the
// skill texts) below. The set-up is insights-land-fakes.mjs: a temp bare remote, a clone with a copy of the coordinate
// scripts, a fake gh and fake claude and codex. The fake clock is 2026-11-27 14:32 UTC. No test touches GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp, put as putFile, unixOnly } from "./helpers.mjs";
import { flow, report } from "../../.agents/skills/coordinate/scripts/flow.mjs";
import { REPO, SHA, branch, git, json, pathOf, pullOf, put, record, run, setup } from "./insights-land-fakes.mjs";

const OPEN = "repos/acme/app/pulls?state=open&per_page=100";
const PULLS = {
  [OPEN]: [], "repos/acme/app/pulls": { number: 77 }, "repos/acme/app/issues/77/labels": [],
  "repos/acme/app/issues/66/labels": [], "repos/acme/app/pulls/66": { number: 66 },
};
const LAND = ["land", "--repo", "acme/app"];
const HELD = (n, age) => `held: ${n} record${n === 1 ? "" : "s"}, oldest ${age} min; lands at 12 records, 90 min or with --now\n`;

/** `n` valid, different records written into the checkout, the oldest `ageMin` minutes before the fake clock. Returns their paths. */
function pile(dir, n, ageMin) {
  const paths = [];
  for (let i = 0; i < n; i++) {
    const at = new Date(Date.parse("2026-11-27T14:32:00Z") - (ageMin - i) * 60000).toISOString();
    const r = record("job", { at, issue: 100 + i, pr: 200 + i, outcome: "finished", job: "build" });
    const path = pathOf(r, i.toString(16).padStart(6, "0"));
    put(dir, path, json(r));
    paths.push(path);
  }
  return paths;
}
const branches = (dir) => git(dir, "ls-remote", "--heads", "origin", "chore/*");
const staged = (dir) => git(dir, "diff", "--cached", "--name-only");

test("AC-748-1: WHEN 3 records are unlanded, the oldest is 12 minutes old and --now is not given THEN land prints one held: line, opens no pull request, calls no API and exits 0", unixOnly, () => {
  const { dir } = setup();
  const files = pile(dir, 3, 12);
  const r = run(dir, LAND, PULLS, { raw: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, HELD(3, 12));
  assert.equal(r.calls, "", "no gh call");
  assert.equal(branches(dir), "", "no records branch pushed");
  assert.equal(staged(dir), "", "nothing staged");
  for (const f of files) assert.ok(git(dir, "ls-files", "--others", "--exclude-standard").includes(f), `${f} stays in the checkout`);
});

test("AC-748-1: the thresholds are 12 records and 90 minutes: 11 records at 89 minutes are held, one record at 90 is not", unixOnly, () => {
  const { dir } = setup();
  pile(dir, 11, 89);
  const held = run(dir, LAND, PULLS, { raw: true });
  assert.equal(held.stdout, HELD(11, 89));
  assert.equal(held.calls, "");

  const old = setup();
  pile(old.dir, 1, 90);
  const lands = run(old.dir, LAND, PULLS, { raw: true });
  assert.equal(lands.stdout, "77\n", lands.stderr);
});

test("AC-748-1: a held record is not lost: it stays on disk, and the next land counts it with the new ones", unixOnly, () => {
  const { dir } = setup();
  const files = pile(dir, 2, 5);
  assert.equal(run(dir, LAND, PULLS, { raw: true }).stdout, HELD(2, 5));
  assert.equal(run(dir, LAND, PULLS, { raw: true }).stdout, HELD(2, 5), "held again, not dropped");
  const more = pile(dir, 10, 4).filter((f) => !files.includes(f));
  assert.equal(files.length + more.length, 12);
  const r = run(dir, LAND, PULLS, { raw: true });
  assert.equal(r.stdout, "77\n", r.stderr);
  git(dir, "fetch", "-q", "origin");
  const diff = git(dir, "diff", "--name-only", "origin/main...origin/chore/insights-2026-11-27-1432").split("\n");
  assert.deepEqual(diff.sort(), [...new Set([...files, ...more])].sort(), "the pull request holds every held file");
});

test("AC-748-2: WHEN 12 records are unlanded THEN land opens the one records pull request, as before", unixOnly, () => {
  const { dir } = setup();
  const files = pile(dir, 12, 3);
  const r = run(dir, LAND, PULLS, { raw: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n");
  assert.ok(r.calls.includes("-f head=chore/insights-2026-11-27-1432 -f base=main repos/acme/app/pulls\n"), r.calls);
  assert.deepEqual(staged(dir).split("\n").sort(), files.sort(), "and stages them, as before");
});

test("AC-748-2: WHEN the oldest record is 90 minutes old THEN land extends the open records pull request, whatever the count", unixOnly, () => {
  const { dir, seed } = setup();
  const [first, second] = pile(dir, 2, 95);
  const ref = "chore/insights-2026-11-27-1200";
  const sha = branch(seed, ref, { [first]: readFileSync(join(dir, first), "utf8") });
  const r = run(dir, LAND, { ...PULLS, [OPEN]: [pullOf(66, ref, sha)] }, { raw: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "66\n");
  git(dir, "fetch", "-q", "origin");
  assert.deepEqual(git(dir, "diff", "--name-only", `origin/main...origin/${ref}`).split("\n").sort(), [first, second].sort());
});

test("AC-748-3: WHEN --now is given THEN land opens the records pull request whatever the count", unixOnly, () => {
  const { dir } = setup();
  pile(dir, 1, 1);
  const r = run(dir, [...LAND, "--now"], PULLS, { raw: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n");
  assert.equal(branches(dir).split("\n").length, 1, "one records branch");
  const flagFirst = setup();
  pile(flagFirst.dir, 1, 1);
  assert.equal(run(flagFirst.dir, ["land", "--now", "--repo", "acme/app"], PULLS, { raw: true }).stdout, "77\n");
});

test("AC-748-4: WHEN land gets another flag, a repeat, a flag without its value, a stray word, or --verify with --now THEN it exits 2 with the usage, runs no git command and calls no API", unixOnly, () => {
  const { dir } = setup();
  pile(dir, 12, 3);
  const bad = [
    ["--force"], ["--repo", "acme/app", "--force"], ["--now", "--now"], ["--repo"], ["--repo", "--now"], ["--repo", "a/b", "--repo", "a/b"],
    ["extra"], ["--verify"], ["--verify", "x"], ["--verify", "5", "--now"], ["--now", "--verify", "5"], ["--verify", "5", "--force"], ["--help"], ["-n"],
  ];
  for (const args of bad) {
    const r = run(dir, ["land", ...args], PULLS, { raw: true, logGitEnv: true });
    assert.equal(r.status, 2, `land ${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /usage: insights\.mjs land \[--repo <owner>\/<name>\] \[--now\] \| land --verify <pr> \[--repo <owner>\/<name>\]/, args.join(" "));
    assert.equal(r.stdout, "");
    assert.equal(r.gitEnv, "", `land ${args.join(" ")} ran a git command`);
    assert.equal(r.calls, "", `land ${args.join(" ")} called gh`);
  }
  assert.equal(branches(dir), "", "nothing was opened");
});

test("#748: has-records and land --verify keep working for a pull request whose records are held", unixOnly, () => {
  const { dir, seed } = setup();
  const check = record("check", {
    job: null, tool: null, state: "success", commands: [{ name: "npm test", result: "pass", seconds: 4 }], failed_step: null, flaky_rerun: false,
  });
  const mine = [record("job", { outcome: "pass" }), check, record("review", { round: 1, verdict: "pass", must: 0, nice: 0, categories: ["tests"] })];
  mine.forEach((r, i) => put(dir, pathOf(r, `${i}`.padStart(6, "a")), json(r)));
  const held = run(dir, LAND, PULLS, { raw: true });
  assert.equal(held.stdout, HELD(3, 22), "all three are held");

  // The merge gate reads the checkout's own docs/insights/ (harvest fills it), not main.
  const gate = run(dir, ["has-records", "--pr", "40", "--sha", SHA]);
  assert.equal(gate.status, 0, gate.stderr);
  assert.match(gate.stdout, /job, check and review records found/);

  // A records-only pull request from an earlier batch is still reviewed from its own branch, not from the held files.
  const earlier = record("job", { at: "2026-11-26T10:00:00.000Z", issue: 7, pr: 7, outcome: "finished", job: "build" });
  const ref = "chore/insights-2026-11-26-1000";
  const sha = branch(seed, ref, { [pathOf(earlier, "b1b2b3")]: json(earlier) });
  const verified = run(dir, ["land", "--verify", "66", "--repo", "acme/app"], { "repos/acme/app/pulls/66": pullOf(66, ref, sha) });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(verified.stdout, `${sha}\n`);
  assert.equal(branches(dir).includes("1432"), false, "and --verify opened nothing");
});

const pr = (number, title) => ({ number, title, headRefName: "x", createdAt: "2026-11-22T08:00:00Z", mergedAt: `2026-11-22T0${number - 19}:00:00Z`, additions: 5, deletions: 1 });

test("AC-748-5: WHEN flow.mjs reads a merged list with pull requests titled Insights records THEN its report has one line records-only pull requests: <n> of <m> merges", () => {
  const items = [pr(20, "Insights records (no issue)"), pr(21, "Add the list"), pr(22, "Insights records (no issue)"), pr(23, "Fix the tick"), pr(24, "Add insights records page")];
  const f = flow(items, { days: 7, now: new Date("2026-11-23T12:00:00Z") });
  assert.equal(f.recordsOnly, 2);
  const lines = report(f).split("\n").filter((l) => l.startsWith("records-only pull requests"));
  assert.deepEqual(lines, ["records-only pull requests: 2 of 5 merges"]);

  const dir = tmp("onrails-flow-");
  putFile(dir, "merged.json", JSON.stringify(items));
  const cli = spawnSync(process.execPath, [join(REPO, ".agents/skills/coordinate/scripts/flow.mjs"), "--github", join(dir, "merged.json"), "--now", "2026-11-23T12:00:00Z"], { encoding: "utf8", env: safeEnv() });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /^records-only pull requests: 2 of 5 merges$/m);
});

test("AC-748-5: WHEN no merged pull request is titled Insights records THEN the report has no such line", () => {
  const f = flow([pr(21, "Add the list"), pr(23, "Fix the tick")], { days: 7, now: new Date("2026-11-23T12:00:00Z") });
  assert.doesNotMatch(report(f), /records-only/);
});

const skill = (name) => readFileSync(join(REPO, `.agents/skills/${name}/SKILL.md`), "utf8");
const NOW_CMD = "`node .agents/skills/coordinate/scripts/insights.mjs land --now --repo <owner>/<repo>`";

test("AC-748-6: WHEN the afk and back skill texts are read THEN each says to run insights.mjs land --now, afk at the hard stop and back at the end of the retro", () => {
  const afk = skill("afk");
  const stop = afk.slice(afk.indexOf("- **Hard stop:**"), afk.indexOf("\n\n", afk.indexOf("- **Hard stop:**")));
  assert.ok(stop.includes(NOW_CMD), "afk's hard stop runs land --now");
  const back = skill("back");
  const retro = back.slice(back.indexOf("\n## Retro"));
  assert.ok(retro.includes(NOW_CMD), "back's retro ends with land --now");
  assert.ok(retro.indexOf(NOW_CMD) > retro.indexOf("6. **Write it down.**"), "after the retro's own steps");
  const copies = [".claude/skills/afk/SKILL.md", ".claude/skills/back/SKILL.md"].map((p) => readFileSync(join(REPO, p), "utf8"));
  copies.forEach((text) => assert.ok(text.includes(NOW_CMD), "the synced copy has it too"));
});

test("AC-748-6: the coordinate step names the held line and the three flags", () => {
  const text = skill("coordinate");
  const step10 = text.slice(text.indexOf("10. **End of sweep:**"), text.indexOf("## End of a pass"));
  assert.match(step10, /`held: <n> records, oldest <m> min; lands at 12 records, 90 min or with --now`/);
  assert.match(step10, /`--repo`, `--verify <pr>` and `--now`/);
});
