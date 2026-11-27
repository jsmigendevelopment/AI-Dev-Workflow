// #141 (part of #98, no GitHub Actions): no skill, eval, guide or doc tells an agent to use, write or wait on a
// GitHub Actions workflow. The scan reads every Markdown file under .agents/, evals/, guide/ and stacks/, and the
// root README.md, one clause at a time: a negation or the local replacement counts only next to the hit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");

/**
 * The issue's grep, `grep -ri "workflow\|github actions\|\bCI\b"`, and the Actions words it misses: `gh run`, a
 * required status check and the Actions tab (#227).
 */
const HIT = /workflow|github actions|\bCI\b|\bgh run\b|required status checks?|Actions tab/i;
// Names that hold the word but aren't GitHub Actions: Lighthouse CI (`pnpm lhci`, run locally), npm's clean install, a
// tool's `--ci` flag, the profile's `[workflow]` table, this kit ("a repo that uses this workflow", its old name),
// Cloudflare's and Expo's own Workflows products, the Claude Code Workflow tool, the TanStack pack's Access service
// token (named `<worker> CI`), the title of the GitHub page `dependencies` cites, and an existing repo's own CI config
// in `join`'s two forms only, read as data for the commands it runs locally (the text AC-173-3 pins). Removed from the
// whole line before it is split, so a form can name what follows its comma or bracket.
const NOT_ACTIONS = /Lighthouse CI|\bnpm ci\b|--ci\b|\[workflow\]|\b(?:this|the onRails|the kit's) workflow\b|ai-dev-workflow|Cloudflare Workflows|Expo Workflows|\bor Workflows\b|Workflow tool|`<worker> CI`|"About Dependabot on GitHub Actions runners"|\bwhat its CI config(?= runs, run locally\b)|\bany CI config(?= \(data: )/gi;
// A negation word. "Instead" counts only as "instead of", which starts its own clause: a bare "instead" at the end
// means "use this one".
const NEGATION = /\b(?:no|never|not|nothing|neither|nor|ignored?|ignores|instead of|off|removes?|removed|drops?|dropped|replaces?|swaps?)\b|n['’]t\b/i;
// A negation that governs merging, not CI: "Do not merge if CI is red" waits on CI (#227). "No merge waits on a
// workflow" rules the workflow out, so "no" isn't one.
const MERGE_BAN = /\b(?:never|not|nothing)\s+merges?\b|n['’]t\s+merge\b/gi;
/**
 * The hit is about not using Actions: a negation in the same clause, other than one that bans a merge. "Without" after
 * another negation, or in a sentence that bans a merge ("Without CI, never merge"), is a double negative.
 */
function negated(text, mergeBan = false) {
  const other = NEGATION.test(text.replace(MERGE_BAN, ""));
  return /\bwithout\b/i.test(text) ? !(other || mergeBan) : other;
}
// The hit names the local replacement in the same clause. A pack's command name alone isn't one: "CI runs
// `pnpm test:e2e`" names a command, not who runs it.
const LOCAL = /ci = "local"|onrails\/check|\b(?:from|in) (?:the|your|its own|the agent's|this) session\b|\blocal gate\b|\blocally\b|\bci local\b|Checks: (?:pass|fail)/i;
// The person's own opt-in: a clause only for repos whose docs/stack.md says ci = "actions".
const OPT_IN = /ci = "actions"/;
/** A real opt-in names `ci = "actions"` with no negation before it, so "Not on ci = "actions"" isn't one. */
function optsIn(text) {
  const at = text.search(OPT_IN);
  return at >= 0 && !negated(text.slice(0, at));
}

// A link is a cited source; the sentence around it is what's judged.
const URL_TEXT = /https?:\/\/\S+/g;

/** Each sentence of a line, and each cell of a table row. */
const sentences = (line) => line.split(/\s\|\s|(?<=[.!?:])\s+(?=[A-Z`*"(])/);
/**
 * Each clause of a sentence: split at a comma, a semicolon, a colon, an opening bracket or a dash (a spaced hyphen too),
 * and before and, then, until, till, unless, while, so, because, or, rather than, before, after or instead of. "Instead
 * of" stays with what follows it, since that is what it rules out.
 */
const clauses = (sentence) =>
  sentence.split(/[,;:(\u2014\u2013]|\s-\s|\s(?=(?:and|then|until|till|unless|while|so|because|or|rather than|before|after|instead of)\b)/i);

/**
 * Each line with what its section says about it: `never` under a heading that is exactly Never (a list of what not to
 * do), `optIn` when the heading opts in to `ci = "actions"`, or the first sentence of the paragraph right under it starts
 * "Only" and does. A section runs to the next heading of its level or higher, so a file whose title's lead paragraph
 * says so is opt-in throughout.
 */
function withSections(text) {
  const lines = text.split("\n");
  const out = [];
  let stack = [];
  // The mark that opened the code block: only the same mark closes it.
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const mark = /^\s*(```|~~~)/.exec(lines[i])?.[1];
    if (mark && !fence) fence = mark;
    else if (mark === fence) fence = null;
    const fenced = fence !== null;
    // A `# comment` in a code block isn't a heading.
    const heading = fenced ? null : /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (heading) {
      const level = heading[1].length;
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      let lead = "";
      for (; j < lines.length && lines[j].trim() && !/^#{1,6}\s/.test(lines[j]); j++) lead += `${lines[j]}\n`;
      stack = stack.filter((s) => s.level < level);
      const first = sentences(lead.replace(/^\*\*[^*]*\*\*\s*/, ""))[0];
      // "Only on ci = actions" sets a condition; "Only the person turns on ci = actions" states a fact (#227).
      const optIn = optsIn(heading[2]) || (/^Only (?:on|for|when|with|in|if)\b/.test(first) && optsIn(first));
      stack.push({ level, never: heading[2].trim() === "Never", optIn });
    }
    out.push({ line: lines[i], never: stack.some((s) => s.never), optIn: stack.some((s) => s.optIn) });
  }
  return out;
}

/** The clauses in text that mention Actions or CI and are neither about not using them nor name the local replacement. */
export function badMentions(text) {
  const out = [];
  for (const { line, never, optIn } of withSections(text)) {
    if (never || optIn) continue;
    for (const sentence of sentences(line.replace(URL_TEXT, "").replace(NOT_ACTIONS, ""))) {
      const mergeBan = sentence.search(MERGE_BAN) >= 0;
      for (const c of clauses(sentence)) {
        if (!HIT.test(c)) continue;
        if (negated(c, mergeBan) || LOCAL.test(c) || optsIn(c)) continue;
        out.push(c.trim());
      }
    }
  }
  return out;
}

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
