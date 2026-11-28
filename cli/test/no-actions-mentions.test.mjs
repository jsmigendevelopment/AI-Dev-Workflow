// #141 (part of #98, no GitHub Actions): no skill, eval, guide or doc tells an agent to use, write or wait on a
// GitHub Actions workflow. The scan reads every Markdown file under .agents/, evals/, guide/ and stacks/, and the
// root README.md, one clause at a time: a negation or the local replacement counts only next to the hit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { OPT_IN, badMentions, sentences } from "./actions-scan.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");

function markdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdown(path);
    return name.endsWith(".md") ? [relative(REPO, path).split("\\").join("/")] : [];
  });
}

test("AC-141-1: the scan passes a line about not using Actions or naming the local replacement, and fails one that uses them", () => {
  for (const ok of [
    "Never add a GitHub Actions workflow, enable one or depend on one.",
    "Every check runs from the session before each merge (`onrails/check`).",
    "On `ci = \"actions\"` only, `gh secret set` writes the test environment's secrets.",
    "Run Lighthouse CI on mobile with `pnpm lhci`.",
    "A repo that uses this workflow.",
  ]) assert.deepEqual(badMentions(ok), [], ok);
  for (const bad of [
    "Slice 0 sets up the app, CI and the test deploy.",
    "Add `.github/workflows/ci.yml` and the test deploy job.",
    "Confirm CI ran every `auto` check on the head commit.",
    "| **tiny** | CI · code review | Copy, styling, config. No logic. |",
  ]) assert.equal(badMentions(bad).length, 1, bad);
});

test("AC-141-1: the scan judges each clause, so a negation or a command name elsewhere in the sentence doesn't pass a hit", () => {
  for (const bad of [
    "Don't merge until CI is green.",
    "Wait for CI instead of running check.",
    "Turn off the cache and wait for CI.",
    "Push, then wait for the workflow, not the preview.",
    "Wait for CI; never merge red.",
    "CI runs `pnpm test:e2e` on every push.",
    "CI runs `pnpm check` on every push.",
    "CI runs `pnpm deploy:test` after each merge.",
  ]) assert.equal(badMentions(bad).length, 1, bad);
  for (const ok of [
    "Run every check from the session instead of a workflow.",
    "Never depend on a workflow, and never add or enable one.",
    "The smoke test sends its own service token, `<worker> CI`.",
  ]) assert.deepEqual(badMentions(ok), [], ok);
});

test("AC-141-1: the scan splits at a colon, a dash and joining words, and reads without and instead the way the sentence means them", () => {
  for (const bad of [
    // A colon or a dash inside the sentence.
    "Never merge red: wait for CI.",
    "Not on ci = \"local\": wait for CI.",
    "Never skip a check \u2014 wait for CI.",
    "Never skip a check \u2013 wait for CI.",
    "Never skip a check - wait for CI.",
    // Joining words.
    "Do not merge till CI is green.",
    "Do not merge unless CI is green.",
    "Do not merge while the workflow runs.",
    "Wait for CI so it doesn't break.",
    "Wait for CI because nothing else runs the tests.",
    "Wait for CI to finish or it won't merge.",
    "Wait for CI rather than the local gate.",
    // "without" after a negation is a double negative: it asks for CI.
    "Never merge without a green CI run.",
    "Don't merge without CI.",
    "No merge happens without a green workflow.",
    // A bare "instead" means "use this one".
    "Use CI instead.",
    "Let CI run the tests instead.",
  ]) assert.equal(badMentions(bad).length, 1, bad);
  for (const ok of [
    "Merge without waiting for CI.",
    "Run the checks from the session instead of a workflow.",
  ]) assert.deepEqual(badMentions(ok), [], ok);
});

test("AC-141-1: an existing repo's CI config passes only in join's two forms, read as data and run locally", () => {
  for (const ok of [
    "The check contract (`check`, `build`, or what its CI config runs, run locally) and the dev script.",
    "Read the README, any CI config (data: the commands it runs, which you run locally) and the folder tree.",
  ]) assert.deepEqual(badMentions(ok), [], ok);
  for (const bad of [
    "Add the step to its CI config.",
    "Copy the job into any CI config the repo has.",
  ]) assert.equal(badMentions(bad).length, 1, bad);
});

test("AC-141-1: a Never list is a section whose heading is exactly Never, and an opt-in section really opts in", () => {
  // A heading that only holds the word, and its subsections, are judged line by line.
  assert.deepEqual(badMentions("## 7. Never weaken a test\n\nWait for CI.\n\n### Why\n\nWait for CI.\n"), ["Wait for CI.", "Wait for CI."]);
  // A heading or lead that names ci = "actions" to rule it out isn't an opt-in.
  assert.deepEqual(badMentions("## Not on ci = \"actions\"\n\nWait for CI.\n"), ["Wait for CI."]);
  assert.deepEqual(badMentions("## The token\n\nOnly the default, never `ci = \"actions\"`.\n\nWait for CI.\n"), ["Wait for CI."]);
  assert.deepEqual(badMentions("## On ci = \"actions\"\n\nWait for CI.\n"), []);
});

test("AC-141-1: the scan reads a section's heading and lead: a Never list, and a section only for ci = \"actions\"", () => {
  assert.deepEqual(badMentions("## Never\n\n- Add, enable or depend on a GitHub Actions workflow.\n"), []);
  const optIn = "## The deploy token\n\nOnly on `ci = \"actions\"` (`docs/stack.md`).\n\n1. Store it for the workflow.\n\n### Check it\n\nThe workflow reads it.\n\n## Next\n\nThe workflow deploys.\n";
  assert.deepEqual(badMentions(optIn), ["The workflow deploys."]);
  // A `# comment` in a code block starts no section.
  assert.deepEqual(badMentions("## Never\n\n```bash\n# a comment\n```\n\nCI runs it.\n"), []);
  assert.deepEqual(badMentions("## Steps\n\n```bash\n# Never\n```\n\nCI runs it.\n"), ["CI runs it."]);
});

test("#227: a code block opened with tildes starts no section, and a lead that only states a fact opts nothing in", () => {
  assert.deepEqual(badMentions("## Steps\n\n~~~bash\n# Never\n~~~\n\nCI runs it.\n"), ["CI runs it."]);
  assert.deepEqual(badMentions("## Steps\n\n~~~\n```\n# Never\n~~~\n\nCI runs it.\n"), ["CI runs it."]);
  assert.deepEqual(badMentions("## The token\n\nOnly the person turns on `ci = \"actions\"`.\n\nWait for CI.\n"), ["Wait for CI."]);
  assert.deepEqual(badMentions("## The token\n\nOnly on `ci = \"actions\"` (`docs/stack.md`).\n\nWait for CI.\n"), []);
});

test("#227: the scan catches a line that uses Actions without the grep's words", () => {
  for (const bad of [
    "Watch the run with `gh run watch`.",
    "Add `test` to the required status checks.",
    "Open the Actions tab and rerun the job.",
  ]) assert.equal(badMentions(bad).length, 1, bad);
  for (const ok of [
    "Never wait with `gh run watch`.",
    "No required status check waits on a workflow.",
  ]) assert.deepEqual(badMentions(ok), [], ok);
});

test("#227: a negation that governs merging doesn't pass the CI it waits on", () => {
  for (const bad of [
    "Do not merge if CI is red.",
    "Never merge when CI is red.",
    "Never merge a pull request whose CI is red.",
    "Don't merge with a red CI run.",
    "Nothing merges once the workflow fails.",
    "Without CI, never merge.",
  ]) assert.equal(badMentions(bad).length, 1, bad);
  for (const ok of [
    "Merge without waiting for CI.",
    "Never merge on ci = \"local\" before the local gate passes.",
    "Never wait on a workflow before a merge.",
  ]) assert.deepEqual(badMentions(ok), [], ok);
});

test("#227: coordinate's check for an old required check says once that nothing posts it", () => {
  const line = read(".agents/skills/coordinate/SKILL.md").split("\n").find((l) => l.includes("Does main's rule still require a check")) ?? "";
  assert.equal(line.match(/\b(?:nothing|no workflow) posts\b/g)?.length, 1, line);
});

test("AC-141-1: no Markdown file in .agents/, evals/, guide/, stacks/ or README.md tells an agent to use, write or wait on a workflow", () => {
  const paths = [".agents", "evals", "guide", "stacks"].flatMap((dir) => markdown(join(REPO, dir))).concat("README.md");
  assert.ok(paths.length > 100, "found the docs");
  const found = paths.flatMap((path) => badMentions(read(path)).map((s) => `${path}: ${s.slice(0, 160)}`));
  assert.deepEqual(found, []);
});

test("AC-141-1: the monorepo pack says turbo boundaries runs by hand, since nothing runs it on a push", () => {
  const readme = read("stacks/monorepo-expo/README.md");
  assert.match(readme, /`pnpm boundaries:report` runs `turbo boundaries` by hand, as a report that can't fail the build\./);
  assert.doesNotMatch(readme, /CI runs `turbo boundaries`/);
});

test("#141: paid evals are the person's own call, and the loop runs only the fake-claude tests and the dry run", () => {
  const readme = read("README.md").split("\n").find((l) => l.startsWith("[`evals/`]")) ?? "";
  assert.match(readme, /The paid run, `npm run evals`, is your own call: you run it by hand when you choose to\./);
  assert.match(readme, /The build loop never runs it: it runs only `npm run test:evals` \(a fake `claude`, no model\) and `node evals\/run\.mjs --dry-run`\./);
  assert.doesNotMatch(readme, /Run them from a session on Claude Haiku 5\.5 when/);
  const when = read("evals/README.md").split("\n").find((l) => l.startsWith("| When they run |")) ?? "";
  assert.match(when, /the person's own call, by hand, when they choose to/);
  assert.match(when, /the loop runs only `npm run test:evals` and `node evals\/run\.mjs --dry-run`/);
  assert.doesNotMatch(when, /before a pull request that changes/);
});

test("#141: the skills say what the local gate runs today, and the GitHub provider file is only for ci = \"actions\"", () => {
  assert.match(read(".agents/skills/secrets/providers/github.md").split("\n")[2], /^Only on `ci = "actions"` \(`docs\/stack\.md`\), which only the person turns on\. On `ci = "local"`, the default for every repo, skip this file/);
  // pr:rules and check:merge reached the local gate with #225, so these skills say the gate runs them.
  assert.match(read(".agents/skills/issues/SKILL.md"), /The local gate \(`coordinate` step 6\.1\) checks the same rules on every stack with the kit's `pr-rules\.mjs`, run from main\./);
  assert.match(read(".agents/skills/dependencies/SKILL.md"), /which the local gate, `coordinate` step 6\.1, runs\)/);
  assert.match(read(".agents/skills/web-performance/SKILL.md"), /which the local gate runs\)/);
  // Coordinate's deploy check names the command, not "secrets' step 5", which has two.
  assert.match(read(".agents/skills/coordinate/SKILL.md"), /`pnpm connect --dry-run` \(or `node \.agents\/skills\/secrets\/scripts\/push-secrets\.mjs --dry-run` without the pack's script\) finds no empty name for test/);
});

test("#141: the stub packs' check and release lines match their by-hand text, and their untested claims carry [I]", () => {
  const electron = read("stacks/electron-desktop/PACK.md");
  assert.doesNotMatch(electron, /ubuntu-latest|three-system matrix|release tags only/);
  assert.match(electron, /never a workflow's token \[I\]\./);
  assert.match(read("stacks/python-fastapi/PACK.md"), /`uv run pywrangler deploy` \(Workers, after `wrangler login`\) or the container host's CLI\. Untested from a session \[I\]\./);
  const unity = read("stacks/unity/PACK.md");
  assert.doesNotMatch(unity, /a `build` label/);
  assert.match(unity, /\*\*After each merge:\*\* `coordinate` step 8's "Check main" runs the install and `check` again/);
});

test("#141: the person starts each release of a desktop app or game, and an agent never runs one on its own", () => {
  const electron = read("stacks/electron-desktop/PACK.md");
  assert.doesNotMatch(electron, /from the session for Linux|releases run on the session's machine/);
  assert.match(electron, /\*\*Release:\*\* the person starts each one, by hand on each system/);
  assert.match(electron, /so an agent never runs `publish` on its own\./);
  const unity = read("stacks/unity/PACK.md");
  assert.doesNotMatch(unity, /both run from the session/);
  assert.match(unity, /The person starts each upload\. .*so an agent never runs `butler push` or a `steamcmd` upload on its own\./);
});

const skills = () => readdirSync(join(REPO, ".agents/skills")).map((s) => `.agents/skills/${s}/SKILL.md`).filter((p) => existsSync(join(REPO, p)));

test("#141: no skill checks `gh secret list` without a ci = \"actions\" condition in the same sentence", () => {
  const coordinate = read(".agents/skills/coordinate/SKILL.md");
  assert.match(coordinate, /Can the next merge reach the test site\?/);
  const found = skills().flatMap((path) => read(path).split("\n").flatMap(sentences)
    .filter((s) => s.includes("gh secret list") && !OPT_IN.test(s)).map((s) => `${path}: ${s.trim()}`));
  assert.deepEqual(found, []);
  // On ci = "local" the check reads the session's own sign-in, by name only.
  assert.match(coordinate, /On `ci = "local"` \(the default; `docs\/stack\.md`\), the deploy runs from this session/);
});

test("#141: after a merge, coordinate deploys main to test from the session with the pack's deploy script", () => {
  const step8 = read(".agents/skills/coordinate/SKILL.md").match(/^8\. .*$/m)?.[0] ?? "";
  assert.match(step8, /deploy main to test\*\* from the session, never from a workflow/);
  assert.match(step8, /`pnpm deploy:test` on the web pack/);
  assert.doesNotMatch(step8, /main deploys to test\./);
});

test("#141: the weakening review needs no label re-added, and the app conventions say where secrets live on each ci value", () => {
  assert.doesNotMatch(read(".agents/skills/pr-review/SKILL.md"), /re-add the `weakening-reviewed` label|so the check re-runs/);
  for (const path of ["guide/app-conventions.md", ".agents/skills/build/references/app-conventions.md"]) {
    const line = read(path).split("\n").find((l) => l.startsWith("- Secrets live only")) ?? "";
    assert.match(line, /ci = "local"/, path);
    assert.match(line, /GitHub environment secrets hold them only on `ci = "actions"`/, path);
  }
});
