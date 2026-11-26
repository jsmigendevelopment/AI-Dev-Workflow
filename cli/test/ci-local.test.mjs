// #133 (part of #98, no GitHub Actions): `npx onrails ci local` moves a repo off Actions in one command, and
// `update` runs it for a repo on ci = "local" that still has workflow files. A fake `run` stands in for git and gh:
// it answers from a table and records every call, so no test reaches GitHub or pushes anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ciLocal, withCiLocal } from "../src/ci-local.mjs";
import { init } from "../src/init.mjs";
import { update } from "../src/update.mjs";
import { fakeAsk, logger, makeKit, put, tmp } from "./helpers.mjs";

const FULL = "# Stack\n\n## Automation level\n\n- **Level:** full\n";
const RECOMMENDED = "# Stack\n\n## Automation level\n\n- **Level:** recommended\n";
const PUT = "gh api --method PUT repos/acme/app/actions/permissions -F enabled=false";

/** A repo with two workflows and a GitHub remote. */
function repo(stack = FULL) {
  const dir = tmp();
  put(dir, ".github/workflows/ci.yml", "on: push\n");
  put(dir, ".github/workflows/deploy.yml", "on: push\n");
  put(dir, ".github/ISSUE_TEMPLATE/bug.md", "a bug\n");
  put(dir, "docs/stack.md", stack);
  return dir;
}

/**
 * git and gh, faked. `git worktree add` copies the repo into the worktree folder, the way a checkout of main would,
 * and `git commit` records what the worktree holds then. Every call is in `calls`, in order.
 */
function fakeRun(dir, { answers = {} } = {}) {
  const calls = [];
  const seen = {};
  const run = (cmd, args, { cwd } = {}) => {
    const line = [cmd, ...args].join(" ");
    calls.push(line);
    if (line.startsWith("git worktree add")) {
      mkdirSync(args.at(-2), { recursive: true });
      cpSync(dir, args.at(-2), { recursive: true });
    }
    if (line.startsWith("git commit")) {
      seen.stack = readFileSync(join(cwd, "docs", "stack.md"), "utf8");
      seen.workflows = existsSync(join(cwd, ".github", "workflows"));
      seen.templates = existsSync(join(cwd, ".github", "ISSUE_TEMPLATE", "bug.md"));
    }
    const table = {
      "git rev-parse --show-toplevel": { ok: true, out: dir },
      "git remote get-url origin": { ok: true, out: "git@github.com:acme/app.git" },
      [PUT]: { ok: true, out: "" },
      "gh api repos/acme/app": { ok: true, out: JSON.stringify({ default_branch: "main" }) },
      "git status --porcelain": { ok: true, out: " D .github/workflows/ci.yml" },
      "gh api --method POST repos/acme/app/issues": { ok: true, out: JSON.stringify({ number: 7 }) },
      "gh api --method POST repos/acme/app/pulls": { ok: true, out: JSON.stringify({ number: 8, html_url: "https://github.com/acme/app/pull/8" }) },
      ...answers,
    };
    const key = Object.keys(table).filter((k) => line === k || line.startsWith(`${k} `)).sort((a, b) => b.length - a.length)[0];
    return key ? table[key] : { ok: true, out: "" };
  };
  return { run, calls, seen };
}

test("AC-133-1: WHEN `npx onrails ci local --dry-run` runs in a repo with workflows THEN it lists the files it would remove and the API call it would make", async () => {
  const dir = repo();
  const fake = fakeRun(dir);
  const log = logger();
  assert.equal(await ciLocal(dir, { dryRun: true, log, run: fake.run }), 0);
  const text = log.text();
  assert.match(text, /\.github\/workflows\/ci\.yml/);
  assert.match(text, /\.github\/workflows\/deploy\.yml/);
  assert.match(text, /PUT \/repos\/acme\/app\/actions\/permissions enabled=false/);
  assert.match(text, /fix\/<n>-no-actions/);
  assert.match(text, /ci = "local" to docs\/stack\.md/);
  assert.doesNotMatch(text, /ISSUE_TEMPLATE/, "only the workflows go");
  assert.deepEqual(fake.calls, ["git rev-parse --show-toplevel", "git remote get-url origin"], "a dry run only reads");
  assert.equal(readFileSync(join(dir, "docs", "stack.md"), "utf8"), FULL);
  assert.ok(existsSync(join(dir, ".github", "workflows", "ci.yml")));
});

test("#133: on Full, ci local turns Actions off first, then opens the issue and a pull request on fix/<n>-no-actions, without asking", async () => {
  const dir = repo();
  const fake = fakeRun(dir);
  const ask = fakeAsk();
  const log = logger();
  assert.equal(await ciLocal(dir, { log, run: fake.run, ask }), 0, log.text());
  assert.deepEqual(ask.questions, [], "Full asks nothing");
  const at = (start) => fake.calls.findIndex((c) => c.startsWith(start));
  // Actions goes off before anything that could start a workflow: the issue, the push, the pull request.
  assert.ok(at(PUT) >= 0, "turns Actions off");
  for (const later of ["gh api --method POST repos/acme/app/issues", "git push", "gh api --method POST repos/acme/app/pulls"]) {
    assert.ok(at(later) > at(PUT), `${later} comes after Actions is off`);
  }
  assert.ok(fake.calls.includes("git switch -c fix/7-no-actions"));
  assert.ok(fake.calls.includes("git push -u origin fix/7-no-actions"));
  const pr = fake.calls[at("gh api --method POST repos/acme/app/pulls")];
  assert.match(pr, /head=fix\/7-no-actions/);
  assert.match(pr, /base=main/);
  assert.match(pr, /Closes #7/);
  assert.equal(fake.seen.workflows, false, "the commit removes .github/workflows/");
  assert.equal(fake.seen.templates, true, "and keeps the rest of .github/");
  assert.match(fake.seen.stack, /^ci = "local"$/m);
  assert.match(log.text(), /https:\/\/github\.com\/acme\/app\/pull\/8/);
  assert.ok(fake.calls.some((c) => c.startsWith("git worktree remove --force")), "the temp worktree goes");
  assert.equal(readFileSync(join(dir, "docs", "stack.md"), "utf8"), FULL, "the person's checkout is left as it was");
});

test("#133: below Full, ci local asks once; a no changes nothing", async () => {
  const dir = repo(RECOMMENDED);
  const fake = fakeRun(dir);
  const ask = fakeAsk(["n"]);
  const log = logger();
  assert.equal(await ciLocal(dir, { log, run: fake.run, ask }), 0);
  assert.equal(ask.questions.length, 1);
  assert.deepEqual(fake.calls.filter((c) => c.startsWith("gh")), []);
  const yes = fakeRun(dir);
  const again = fakeAsk(["y"]);
  assert.equal(await ciLocal(dir, { log: logger(), run: yes.run, ask: again }), 0);
  assert.equal(again.questions.length, 1);
  assert.ok(yes.calls.includes(PUT));
});

test("#133: when GitHub refuses to turn Actions off, ci local stops before the issue, the push and the pull request", async () => {
  const dir = repo();
  const fake = fakeRun(dir, { answers: { [PUT]: { ok: false, out: "", err: "HTTP 403: Must have admin rights to Repository." } } });
  const log = logger();
  assert.equal(await ciLocal(dir, { log, run: fake.run }), 1);
  assert.match(log.text(), /admin/);
  assert.deepEqual(fake.calls.filter((c) => /issues|pulls|git push|worktree/.test(c)), []);
});

test("#133: with nothing left to remove, ci local only turns Actions off and opens no pull request", async () => {
  const dir = repo();
  const fake = fakeRun(dir, { answers: { "git status --porcelain": { ok: true, out: "" } } });
  assert.equal(await ciLocal(dir, { log: logger(), run: fake.run }), 0);
  assert.ok(fake.calls.includes(PUT));
  assert.deepEqual(fake.calls.filter((c) => /issues|pulls|git push/.test(c)), []);
});

test("#133: ci local writes ci = \"local\" in place, or adds the section", () => {
  assert.equal(withCiLocal('# Stack\n\nci = "actions"  # on\n\nmore\n'), '# Stack\n\nci = "local"\n\nmore\n');
  assert.equal(withCiLocal("# Stack\n\n- **Level:** full"), '# Stack\n\n- **Level:** full\n\n## Checks and deploys\n\nci = "local"\n');
  assert.equal(withCiLocal(""), '# Stack\n\n## Checks and deploys\n\nci = "local"\n');
});

test("#133: a repo with no GitHub remote gets a plain reason, and nothing runs", async () => {
  const dir = repo();
  const fake = fakeRun(dir, { answers: { "git remote get-url origin": { ok: true, out: "https://gitlab.com/acme/app.git" } } });
  const log = logger();
  assert.equal(await ciLocal(dir, { log, run: fake.run }), 1);
  assert.match(log.text(), /no GitHub remote/);
  assert.deepEqual(fake.calls.filter((c) => c.startsWith("gh")), []);
});

/** A kit installed in a repo with workflows, and a newer kit to update to. */
function installed(stack) {
  const dir = repo(stack);
  init(dir, { kitDir: makeKit("0.1.0", { "AGENTS.md": "rules v1\n" }), log: logger() });
  return { dir, kitDir: makeKit("0.2.0", { "AGENTS.md": "rules v2\n" }) };
}

test("#133: update runs ci local for a repo on ci = \"local\" that still has workflow files", async () => {
  const { dir, kitDir } = installed(FULL);
  const fake = fakeRun(dir);
  const log = logger();
  assert.equal(await update(dir, { kitDir, log, run: fake.run }), 0);
  assert.match(log.text(), /npx onrails ci local/);
  assert.ok(fake.calls.includes(PUT), log.text());
  assert.ok(fake.calls.includes("git push -u origin fix/7-no-actions"));

  const dry = installed(FULL);
  const plan = fakeRun(dry.dir);
  const out = logger();
  assert.equal(await update(dry.dir, { kitDir: dry.kitDir, log: out, dryRun: true, run: plan.run }), 0);
  assert.match(out.text(), /PUT \/repos\/acme\/app\/actions\/permissions enabled=false/);
  assert.deepEqual(plan.calls.filter((c) => c.startsWith("gh")), [], "a dry run calls no API");
});

test("#133: update leaves workflows alone on ci = \"actions\", and runs nothing when there are none", async () => {
  const { dir, kitDir } = installed(`${FULL}\nci = "actions"\n`);
  const fake = fakeRun(dir);
  assert.equal(await update(dir, { kitDir, log: logger(), run: fake.run }), 0);
  assert.deepEqual(fake.calls, []);
  const clean = tmp();
  init(clean, { kitDir: makeKit("0.1.0", { "AGENTS.md": "v1\n" }), log: logger() });
  const none = fakeRun(clean);
  assert.equal(await update(clean, { kitDir: makeKit("0.2.0", { "AGENTS.md": "v2\n" }), log: logger(), run: none.run }), 0);
  assert.deepEqual(none.calls, []);
});
