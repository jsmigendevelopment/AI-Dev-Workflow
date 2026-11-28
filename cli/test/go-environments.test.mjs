// Secrets and environments for a Go service (#536): the docs that say `pnpm connect`, `wrangler` and
// `lib/env.ts` give the Go form beside them. The host and the database are the ones decision 340-1 picked
// (Google Cloud Run and Neon); the Go config struct itself is section 16 of guide/app-conventions-go.md (#348).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv } from "./helpers.mjs";
import { parseProviders } from "../../stacks/tanstack-start/scripts/connect/providers.ts";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const lines = (p) => read(p).replace(/\n$/, "").split("\n");

const SKILLS = ".agents/skills/";
const PROVIDERS = `${SKILLS}secrets/providers/`;
// What a Go form is made of: the host's CLI, its secret store, or the words that name the Go service.
const GO_FORM = /gcloud|Cloud Run|Secret Manager|Go service|Go backend/;

/** The lines that sit outside a fenced code block, with their index. */
function prose(path) {
  let fenced = false;
  const out = [];
  for (const [i, text] of lines(path).entries()) {
    if (text.trim().startsWith("```")) fenced = !fenced;
    else if (!fenced) out.push([i, text]);
  }
  return out;
}

test("AC-536-1: WHEN the test reads guide/environments.md THEN each example that names wrangler, pnpm deploy:test or a Zod schema has a Go form beside it, and the file stays under 200 lines", () => {
  const TS = /wrangler|pnpm deploy:|Zod|lib\/env\.ts|Worker's `env`/;
  const all = lines("guide/environments.md");
  assert.ok(all.length < 200, `guide/environments.md has ${all.length} lines`);
  const named = prose("guide/environments.md").filter(([, text]) => TS.test(text));
  assert.ok(named.length >= 7, `expected the seven lines that name them, found ${named.length}`);
  for (const [i, text] of named) {
    // The Go form is on the same line or within the next two (a table row, a bullet and its sub-line).
    const near = all.slice(Math.max(0, i - 1), i + 3).join("\n");
    assert.match(near, GO_FORM, `line ${i + 1} names a Workers tool with no Go form beside it: ${text.slice(0, 80)}`);
  }
});

test("AC-536-1 support: the Go forms say what the host's CLI and secret store do, and link section 16 instead of repeating it", () => {
  const text = read("guide/environments.md");
  assert.match(text, /gcloud run deploy/, "the deploy command decision 340-1 picked");
  assert.match(text, /Secret Manager/, "a secret goes in the host's secret store");
  assert.match(text, /every (variable|value)[^.\n]* on every deploy|on every deploy[^.\n]*every (variable|value)/i, "each deploy sets every variable");
  assert.match(text, /\]\(app-conventions-go\.md#16-environment-variables\)/, "links section 16 of the Go guide");
  assert.doesNotMatch(text, /func Load|logger\.Secret\(/, "section 16's code is linked, not copied");
  assert.doesNotMatch(text, /gcloud [^\n]*--(update|set)-env-vars/, "no value on a command line");
});

test("AC-536-2: WHEN the test reads the secrets skill THEN the pack-without-the-script lines name the host's CLI, and no line shows or asks for a value in chat", () => {
  const all = lines(`${SKILLS}secrets/SKILL.md`);
  const without = all.filter((l) => /pack without the script/i.test(l));
  assert.ok(without.length >= 3, `expected the three pack-without-the-script lines, found ${without.length}`);
  for (const l of without) assert.match(l, /gcloud|--cloud-run/, `no host CLI on: ${l.slice(0, 90)}`);
  assert.ok(all.some((l) => /--wrangler/.test(l) && /--cloud-run/.test(l)), "the --wrangler line names --cloud-run");
  for (const l of all) {
    // A value on a command line, or piped in from the agent's own shell, is a value the agent saw.
    assert.doesNotMatch(l, /gcloud [^\n`]*--(update|set)-env-vars[= ]/, `a value in an argument: ${l.slice(0, 90)}`);
    assert.doesNotMatch(l, /(echo|printf)\b[^|\n]*\|\s*(gcloud|npx wrangler)/, `a value piped by the agent: ${l.slice(0, 90)}`);
    // Any line that says a value or key and chat must say never, not or don't.
    if (/\bchat\b/i.test(l) && /\b(value|key)s?\b/i.test(l))
      assert.match(l, /never|not |no |n't|only|without/i, `a line about chat and a value with no refusal: ${l.slice(0, 90)}`);
  }
});

test("AC-536-2 support: the Go forms in the other skills name the host's login and the deploy's variables by name only", () => {
  const coordinate = read(`${SKILLS}coordinate/SKILL.md`);
  const reach = coordinate.split("\n").find((l) => l.includes("Can the next merge reach the test site?"));
  assert.match(reach, /gcloud/, "coordinate's test-site check names the host login for a Go service");
  assert.match(reach, /--cloud-run/, "and the dry run that names each empty variable");
  assert.match(reach, /never a value|by name/, "and keeps the by-name rule");
  const idea = read(`${SKILLS}idea/SKILL.md`);
  assert.match(idea, /Go service[^\n]*(login|sign)/i, "idea's keys step has a clause for a Go service");
  assert.match(idea, /Neon/, "and names the database's token");
  const join = read(`${SKILLS}join/SKILL.md`);
  assert.match(join, /Go service|go\.mod/, "join's keys step has a clause for a Go service");
  const stack = read(`${SKILLS}idea/templates/stack.md`);
  assert.match(stack, /Go service|Config struct/, "the stack template's env line has a Go form");
  assert.match(stack, /Secret Manager|gcloud/, "and so does its production-keys line");
  const setup = read(`${SKILLS}secrets/setup/README.md`);
  assert.match(setup, /Go service|go\.mod|Go module/, "the setup recipes' rules 2 and 7 have a Go form");
});

test("AC-536-2 support: the Clerk file has a Go backend paragraph and the host and database have walkthroughs", () => {
  const clerk = read(`${PROVIDERS}clerk.md`);
  assert.match(clerk, /^\*\*Go backend\.\*\*/m, "clerk.md has a Go backend paragraph");
  const go = clerk.slice(clerk.search(/^\*\*Go backend\.\*\*/m)).split(/^\*\*For `pnpm connect`/m)[0];
  assert.match(go, /CLERK_SECRET_KEY/, "the paragraph names the variable the Go service reads");
  assert.match(go, /--cloud-run/, "and says where it goes");
  assert.doesNotMatch(go, /^- `VITE_/m, "and not the web app's publishable key");
  for (const file of ["cloud-run.md", "neon.md"]) {
    const text = read(PROVIDERS + file);
    assert.match(text, /^Last checked: \d{4}-\d{2}-\d{2}/m, `${file} says when it was checked`);
    assert.match(text, /^## Make each key/m, `${file} has the agent's table`);
    assert.match(text, /^## .*Walkthrough|^## 1\./m, `${file} has numbered steps`);
    assert.match(text, /\[U\]/, `${file} marks what was not run`);
  }
  assert.match(read(`${PROVIDERS}cloud-run.md`), /gcloud auth login/);
  assert.match(read(`${PROVIDERS}neon.md`), /Neon CLI|neon branches create/);
  assert.match(read(`${SKILLS}secrets/SKILL.md`), /cloud-run\.md[\s\S]*neon\.md|neon\.md[\s\S]*cloud-run\.md/, "the skill's provider table lists both files");
});

// What each TanStack pack and add-on lists in its .env.example, by name: a Go provider that fills one of
// these would make `pnpm connect` in a web app walk the Go provider.
function webNames() {
  const names = new Set();
  for (const dir of readdirSync(new URL("stacks/", root))) {
    for (const file of [`stacks/${dir}/.env.example`]) {
      let text = "";
      try {
        text = read(file);
      } catch {
        continue; // this pack has no .env.example
      }
      for (const m of text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) names.add(m[1]);
    }
    // An add-on's notes list the names it adds to the app's .env.example.
    let adds = [];
    try {
      adds = readdirSync(new URL(`stacks/${dir}/`, root), { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }
    for (const e of adds) {
      try {
        for (const m of read(`stacks/${dir}/${e.name}/ADDON.md`).matchAll(/^\s*([A-Z][A-Z0-9_]*)=\s*$/gm)) names.add(m[1]);
      } catch {
        continue; // not an add-on folder
      }
    }
  }
  return names;
}

test("AC-536-3: WHEN pnpm connect's reader runs over providers/ THEN every file still parses with its json connect block and the TanStack pack's walk order is unchanged", () => {
  const dir = fileURLToPath(new URL(PROVIDERS, root));
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => ({ id: f.slice(0, -3), markdown: readFileSync(dir + f, "utf8") }));
  const providers = parseProviders(files);
  // Supabase has no block, on purpose (its file says why); every other file, the two Go ones included, has one.
  assert.deepEqual(files.map((f) => f.id).filter((id) => !providers.some((p) => p.id === id)), ["supabase"]);
  const go = ["cloud-run", "neon"];
  for (const id of go) assert.ok(providers.some((p) => p.id === id), `${id}.md has a connect block`);
  // The walk order on main, with the Go providers taken out: same files, same order numbers.
  const web = providers.filter((p) => !go.includes(p.id)).map((p) => `${p.id}:${p.order}`);
  assert.equal(
    web.join(" "),
    "cloudflare:10 github:20 clerk:30 resend:40 sentry:40 stripe:40 expo:45 posthog:50 entra:60 facebook:60 github-oauth:60 google-oauth:60 linkedin:60 yandex:60",
  );
  // A web app's .env.example never lists a Go provider's names, so `pnpm connect` there never walks them.
  const listed = webNames();
  for (const p of providers.filter((q) => go.includes(q.id)))
    for (const name of Object.keys(p.vars)) assert.ok(!listed.has(name), `${p.id} fills ${name}, which a web pack or add-on already lists`);
  // The Go providers sit after the web ones that share a TanStack app, so a mixed repo never reorders them.
  for (const p of providers.filter((q) => go.includes(q.id))) assert.ok(p.order >= 70, `${p.id} walks after the web providers`);
});

test("AC-536-4: WHEN scripts/sync-skills.mjs --check runs THEN the synced copies match the masters", () => {
  const r = spawnSync(process.execPath, ["scripts/sync-skills.mjs", "--check"], { cwd: fileURLToPath(root), encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});

// AC-536-5 is an `agent` check: a reviewer follows the secrets skill for a Go service and sees that the person
// only signs in and pastes. This guards the words it leans on.
test("AC-536-5 support: the host and database walkthroughs leave each value to the person's own terminal and file", () => {
  for (const file of ["cloud-run.md", "neon.md"]) {
    const text = read(PROVIDERS + file);
    assert.match(text, /own terminal/, `${file} sends sign-in and the value to the person's terminal`);
    assert.match(text, /push-secrets\.mjs/, `${file} sends the value through the push script`);
    assert.doesNotMatch(text, /gcloud [^\n]*--(update|set)-env-vars/, `${file}: no value in an argument`);
    assert.doesNotMatch(text, /--data-file=-[^\n]*(<|\$)\w*(value|string|url)/i, `${file}: no value beside a stdin flag`);
  }
});
