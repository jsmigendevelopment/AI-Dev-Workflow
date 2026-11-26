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

/** The issue's grep: `grep -ri "workflow\|github actions\|\bCI\b"`. */
const HIT = /workflow|github actions|\bCI\b/i;
// Names that hold the word but aren't GitHub Actions: Lighthouse CI (`pnpm lhci`, run locally), npm's clean install, a
// tool's `--ci` flag, the profile's `[workflow]` table, this kit ("a repo that uses this workflow", its old name),
// Cloudflare's and Expo's own Workflows products, the Claude Code Workflow tool, the TanStack pack's Access service
// token (named `<worker> CI`), the title of the GitHub page `dependencies` cites, and an existing repo's own CI config,
// which `join` reads as data for the commands it runs locally (the text AC-173-3 pins).
const NOT_ACTIONS = /Lighthouse CI|\bnpm ci\b|--ci\b|\[workflow\]|\b(?:this|the onRails|the kit's) workflow\b|ai-dev-workflow|Cloudflare Workflows|Expo Workflows|\bor Workflows\b|Workflow tool|`<worker> CI`|"About Dependabot on GitHub Actions runners"|\b(?:its|any) CI config\b/gi;
// The hit is about not using Actions: a negation in the same clause.
const NEGATED = /\b(?:no|never|not|without|nothing|neither|nor|ignored?|ignores|instead|off|removes?|removed|drops?|dropped|replaces?|swaps?)\b|n['’]t\b/i;
// The hit names the local replacement in the same clause. A pack's command name alone isn't one: "CI runs
// `pnpm test:e2e`" names a command, not who runs it.
const LOCAL = /ci = "local"|onrails\/check|\b(?:from|in) (?:the|your|its own|the agent's|this) session\b|\blocal gate\b|\blocally\b|\bci local\b|Checks: (?:pass|fail)/i;
// The person's own opt-in: a clause only for repos whose docs/stack.md says ci = "actions".
const OPT_IN = /ci = "actions"/;
/** A real opt-in names `ci = "actions"` with no negation before it, so "Not on ci = "actions"" isn't one. */
function optsIn(text) {
  const at = text.search(OPT_IN);
  return at >= 0 && !NEGATED.test(text.slice(0, at));
}

// A link is a cited source; the sentence around it is what's judged.
const URL_TEXT = /https?:\/\/\S+/g;

/** Each sentence of a line, and each cell of a table row. */
const sentences = (line) => line.split(/\s\|\s|(?<=[.!?:])\s+(?=[A-Z`*"(])/);
/**
 * Each clause of a sentence: split at a comma, a semicolon or an opening bracket, and before and, then, until, before,
 * after or instead of. "Instead of" stays with what follows it, since that is what it rules out.
 */
const clauses = (sentence) => sentence.split(/[,;(]|\s(?=(?:and|then|until|before|after|instead of)\b)/i);

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
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fenced = !fenced;
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
      const optIn = optsIn(heading[2]) || (/^Only\b/.test(first) && optsIn(first));
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
    for (const c of sentences(line.replace(URL_TEXT, "")).flatMap(clauses)) {
      if (!HIT.test(c.replace(NOT_ACTIONS, ""))) continue;
      if (NEGATED.test(c) || LOCAL.test(c) || optsIn(c)) continue;
      out.push(c.trim());
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
  // pr:rules and check:merge reach the local gate with #225; until then no skill says the gate runs them.
  assert.match(read(".agents/skills/issues/SKILL.md"), /The local gate \(`coordinate` step 6\.1\) runs it once #225 lands\./);
  assert.match(read(".agents/skills/dependencies/SKILL.md"), /the local gate, `coordinate` step 6\.1, runs it once #225 lands/);
  assert.match(read(".agents/skills/web-performance/SKILL.md"), /which the local gate runs once #225 lands/);
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
