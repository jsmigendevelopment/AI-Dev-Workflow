// #141 (part of #98, no GitHub Actions): no skill, eval, guide or doc tells an agent to use, write or wait on a
// GitHub Actions workflow. The scan reads every Markdown file under .agents/, evals/, guide/ and stacks/, and the
// root README.md, one sentence (or table cell) at a time.
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
// Cloudflare's and Expo's own Workflows products, and the Claude Code Workflow tool.
const NOT_ACTIONS = /Lighthouse CI|\bnpm ci\b|--ci\b|\[workflow\]|\b(?:this|the onRails|the kit's) workflow\b|ai-dev-workflow|Cloudflare Workflows|Expo Workflows|\bor Workflows\b|Workflow tool/gi;
// The hit is about not using Actions: a negation in the same sentence.
const NEGATED = /\b(?:no|never|not|without|nothing|neither|nor|ignored?|ignores|instead|off|removes?|removed|drops?|dropped|replaces?|swaps?)\b|n['’]t\b/i;
// The hit names the local replacement.
const LOCAL = /ci = "local"|onrails\/check|\b(?:from|in) (?:the|your|its own|the agent's|this) session\b|\blocal gate\b|\blocally\b|`(?:pnpm|npm run) (?:check|check:merge|pr:rules|deploy:\w+|test:e2e)\b|\bci local\b|Checks: (?:pass|fail)/i;
// The person's own opt-in: a line only for repos whose docs/stack.md says ci = "actions".
const OPT_IN = /ci = "actions"/;

// A link is a cited source; the sentence around it is what's judged.
const URL_TEXT = /https?:\/\/\S+/g;

/** Each sentence of a line, and each cell of a table row. */
const sentences = (line) => line.split(/\s\|\s|(?<=[.!?:])\s+(?=[A-Z`*"(])/);

/**
 * Each line with what its section says about it: `never` under a heading that says Never (a list of what not to do),
 * `optIn` when the heading or the paragraph right under it says the section is only for `ci = "actions"`. A section runs
 * to the next heading of its level or higher, so a file whose title's lead paragraph says so is opt-in throughout.
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
      stack.push({ level, never: /\bNever\b/.test(heading[2]), optIn: OPT_IN.test(heading[2]) || /^(?:\*\*[^*]*\*\*\s*)?Only\b[^\n]*ci = "actions"/m.test(lead) });
    }
    out.push({ line: lines[i], never: stack.some((s) => s.never), optIn: stack.some((s) => s.optIn) });
  }
  return out;
}

/** The sentences in text that mention Actions or CI and are neither about not using them nor name the local replacement. */
export function badMentions(text) {
  const out = [];
  for (const { line, never, optIn } of withSections(text)) {
    if (never || optIn) continue;
    for (const s of sentences(line.replace(URL_TEXT, ""))) {
      if (!HIT.test(s.replace(NOT_ACTIONS, ""))) continue;
      if (NEGATED.test(s) || LOCAL.test(s) || OPT_IN.test(s)) continue;
      out.push(s.trim());
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
    "Never add, enable or depend on a GitHub Actions workflow.",
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
