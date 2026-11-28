// #457: ask once whether the person types or dictates, read dictated words by sound, and keep a personal glossary of
// confirmed mishearings. The script is .agents/skills/ask/scripts/voice.mjs; the rule is ask's references/voice.md.
// AC-2 (the agent proceeds with TanStack Start) is the opt-in eval voice-reading; these tests pin the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { profileCopy, profileInit } from "../src/profile.mjs";
import { stripPersonal } from "../src/research-library.mjs";
import { exists, fakeAsk, logger, put, read, safeEnv, tmp } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = `${ROOT}.agents/skills/ask/scripts/voice.mjs`;
const text = (p) => readFileSync(`${ROOT}${p}`, "utf8");
const section = (md, heading) => md.split(/^## /m).find((s) => s.startsWith(heading)) ?? "";

/** Runs voice.mjs with a temp home and a temp project folder. */
function voice(args, { home, project = tmp() } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: project, encoding: "utf8", env: safeEnv({ HOME: home, USERPROFILE: home }, { cwd: project }) });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("AC-457-1: WHEN no profile or input exists THEN the script says input is unset and writes nothing", () => {
  const home = tmp(), project = tmp();
  const r = voice([], { home, project });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^input: unset$/m);
  assert.ok(!exists(home, ".onrails"), "reading makes no folder in the home");
  assert.ok(!exists(project, "docs"), "reading makes nothing in the project");
});

test("AC-457-1: WHEN the person answers THEN the script saves [me] input in the personal profile, and the next read says so", () => {
  const home = tmp();
  const saved = voice(["input", "voice"], { home });
  assert.equal(saved.code, 0, saved.err);
  assert.equal(read(home, ".onrails/profile.toml"), '[me]\ninput = "voice"\n');
  assert.match(voice(["status"], { home }).out, /^input: voice$/m);
  assert.equal(voice(["input", "both"], { home }).code, 0);
  assert.equal(read(home, ".onrails/profile.toml"), '[me]\ninput = "both"\n', "a second answer replaces the first");
});

test("AC-457-1: WHEN the profile came from the template THEN only its input line changes, comment kept", () => {
  const home = tmp();
  const template = '# mine\n\n[me]\nname = "Ada"\ninput = ""    # typing | voice | both\n\n[defaults]\ninput = "keep"\n';
  put(home, ".onrails/profile.toml", template);
  assert.match(voice([], { home }).out, /^input: unset$/m, "a blank input is unset");
  assert.equal(voice(["input", "typing"], { home }).code, 0);
  assert.equal(read(home, ".onrails/profile.toml"), template.replace('input = ""', 'input = "typing"'));
});

test("AC-457-1: WHEN [me] has no input line, or there is no [me], THEN the line is added without losing the rest", () => {
  const home = tmp();
  put(home, ".onrails/profile.toml", '[me]\nname = "Ada"\n\n[defaults]\nautomation = "full"\n');
  assert.equal(voice(["input", "voice"], { home }).code, 0);
  assert.equal(read(home, ".onrails/profile.toml"), '[me]\ninput = "voice"\nname = "Ada"\n\n[defaults]\nautomation = "full"\n');
  const bare = tmp();
  put(bare, ".onrails/profile.toml", '[defaults]\nautomation = "full"\n');
  assert.equal(voice(["input", "both"], { home: bare }).code, 0);
  assert.equal(read(bare, ".onrails/profile.toml"), '[defaults]\nautomation = "full"\n\n[me]\ninput = "both"\n');
});

test("AC-457-1: WHEN the answer isn't typing, voice or both THEN nothing is written and it exits 2", () => {
  const home = tmp();
  put(home, ".onrails/profile.toml", '[me]\ninput = "voice"\n');
  for (const bad of [["input", "dictate"], ["input"], ["input", "voice", "extra"]]) {
    const r = voice(bad, { home });
    assert.equal(r.code, 2, bad.join(" "));
    assert.match(r.err, /typing, voice or both/);
  }
  assert.equal(read(home, ".onrails/profile.toml"), '[me]\ninput = "voice"\n');
});

test("AC-457-1: WHEN only the project's docs/profile.toml sets input THEN it is read, and the personal one wins", () => {
  const project = tmp(), home = tmp();
  put(project, "docs/profile.toml", '[me]\ninput = "voice"\n');
  assert.match(voice([], { home, project }).out, /^input: voice$/m);
  put(home, ".onrails/profile.toml", '[me]\ninput = "typing"\n');
  assert.match(voice([], { home, project }).out, /^input: typing$/m);
});

test("AC-457-1: WHEN only the old ~/.ai-dev-workflow folder exists THEN the profile and glossary live there", () => {
  const home = tmp();
  put(home, ".ai-dev-workflow/profile.toml", '[me]\ninput = "both"\n');
  assert.match(voice([], { home }).out, /^input: both$/m);
  assert.equal(voice(["add", "sub thread", "subthread"], { home }).code, 0);
  assert.ok(exists(home, ".ai-dev-workflow/glossary.toml"));
  assert.ok(!exists(home, ".onrails"));
});

test("AC-457-1: WHEN profile init runs THEN it asks once, saves the answer under [me], and Enter keeps both", async () => {
  const home = tmp();
  const ask = fakeAsk(["", "", "", "", "", "", "", "", "", "voice"]);
  assert.equal(await profileInit({ home, ask, log: logger() }), 0);
  assert.match(read(home, ".onrails/profile.toml"), /^input = "voice"/m);
  assert.equal(ask.questions.filter((q) => q.startsWith("Do you mostly type, or use voice to text?")).length, 1);
  const kept = tmp();
  await profileInit({ home: kept, ask: fakeAsk([]), log: logger() });
  assert.match(read(kept, ".onrails/profile.toml"), /^input = "both"/m);
  assert.match(voice([], { home }).out, /^input: voice$/m, "the script reads what init wrote");
});

test("AC-457-1: WHEN the profile is copied into a project THEN input stays personal", async () => {
  const home = tmp(), dir = tmp();
  put(home, ".onrails/profile.toml", '[me]\nname = "Ada"\ninput = "voice"   # note\n\n[other]\ninput = "kept"\n');
  assert.equal(await profileCopy(dir, { home, log: logger() }), 0);
  assert.equal(read(dir, "docs/profile.toml"), '[me]\nname = "Ada"\n# input: set in your personal profile only\n\n[other]\ninput = "kept"\n');
  assert.equal(stripPersonal('[me]\ninput = "typing"\n'), "[me]\n# input: set in your personal profile only\n");
});

test("AC-457-1: WHEN /idea or /join starts THEN each asks once if the profile has no input, saves it, and on Full takes both", () => {
  for (const name of ["idea", "join"]) {
    const step0 = text(`.agents/skills/${name}/SKILL.md`).split("\n").filter((l) => /voice\.mjs/.test(l)).join("\n");
    assert.match(step0, /voice\.mjs/, `${name} runs the script`);
    assert.match(step0, /input: unset/);
    assert.match(step0, /Do you mostly type, or use voice to text\?/);
    assert.match(step0, /voice\.mjs input <typing\|voice\|both>/);
    assert.match(step0, /On Full[^\n]*`both`[^\n]*AI pick, not reviewed/);
  }
  const template = text(".agents/skills/idea/templates/profile.toml");
  const line = template.search(/^input = ""\s+# typing \| voice \| both/m);
  assert.ok(line > template.indexOf("[me]\n") && line < template.indexOf("[me.signature]"), "input = \"\" sits in [me]");
});

test("AC-457-2: WHEN AGENTS.md is read THEN one line under 'Who you're working with' points to the script and the rule", () => {
  const who = section(text("AGENTS.md"), "Who you're working with");
  const line = who.split("\n").find((l) => /voice\.mjs/.test(l)) ?? "";
  assert.match(line, /^- /);
  assert.match(line, /node \.agents\/skills\/ask\/scripts\/voice\.mjs/);
  assert.match(line, /voice or both/);
  assert.match(line, /`ask`'s `references\/voice\.md`/);
  assert.ok(line.length < 260, "one short line");
  assert.equal(who.split("\n").filter((l) => l.startsWith("- ")).length, 3, "the two existing bullets are unchanged");
});

test("AC-457-2: WHEN input is voice or both THEN ask's voice rule reads by sound and never corrects the wording", () => {
  const rule = text(".agents/skills/ask/references/voice.md");
  assert.match(rule, /by sound/);
  for (const kind of [/homophones/, /split or merged words/, /numbers heard as words/, /names heard as common words/]) assert.match(rule, kind);
  assert.match(rule, /Never correct or comment on the wording/);
  assert.match(rule, /10 stack start/);
  assert.match(rule, /TanStack Start/);
  assert.match(text(".agents/skills/ask/SKILL.md"), /\| `references\/voice\.md` \| [^\n]*`input` is `voice` or `both`/);
});

test("AC-457-3: WHEN a likely mishearing would change a money, delete or deploy step THEN the rule confirms in one line, below Full", () => {
  const rule = text(".agents/skills/ask/references/voice.md");
  const confirm = section(rule, "Confirm only in a risky spot");
  assert.match(confirm, /money, deleting, deploying/);
  assert.match(confirm, /one line/i);
  assert.match(confirm, /I read "10 stack start" as TanStack Start, right\?/);
  assert.match(confirm, /Below Full/);
  assert.match(confirm, /On Full[^\n]*likely reading[^\n]*AI pick, not reviewed/);
  assert.match(confirm, /cheap to undo[^\n]*go on/i);
  assert.match(confirm, /glossary[^\n]*no question|no question[^\n]*glossary/i);
});

test("AC-457-3: WHEN a handoff carries dictated words THEN they stay word for word, with the reading beside them", () => {
  assert.match(text(".agents/skills/ask/references/voice.md"), /Owner: "…10 stack start…" \(read as: TanStack Start\)/);
  assert.match(text(".agents/skills/ask/references/handoffs.md"), /\(read as: [^)]*\)/);
});

test("AC-457-4: WHEN the person confirms a mishearing THEN add writes it to glossary.toml, and the next session reads it", () => {
  const home = tmp();
  const added = voice(["add", "sign in the issue", "assign the issue"], { home });
  assert.equal(added.code, 0, added.err);
  assert.match(read(home, ".onrails/glossary.toml"), /^"sign in the issue" = "assign the issue"$/m);
  assert.match(read(home, ".onrails/glossary.toml"), /^# /m, "the file says what it is");
  const next = voice([], { home });
  assert.match(next.out, /^"sign in the issue" -> "assign the issue"$/m);
});

test("AC-457-4: WHEN the glossary is read THEN the kit's own names are already in it, with no file written", () => {
  const home = tmp();
  const out = voice([], { home }).out;
  for (const [heard, meant] of [["10 stack", "TanStack"], ["on rails", "onRails"], ["chad cn", "shadcn"], ["clark", "Clerk"], ["rangler", "Wrangler"], ["drizzly", "Drizzle"]]) {
    assert.ok(out.includes(`"${heard}" -> "${meant}"`), `${heard} -> ${meant}`);
  }
  assert.ok(!exists(home, ".onrails/glossary.toml"));
});

test("AC-457-4: WHEN the same words are confirmed again THEN the line is replaced, never doubled, and a seed can be overridden", () => {
  const home = tmp();
  voice(["add", "sub thread", "subthread"], { home });
  voice(["add", "Sub Thread", "sub-thread"], { home });
  const file = read(home, ".onrails/glossary.toml");
  assert.equal(file.split("\n").filter((l) => /sub thread/i.test(l) && l.startsWith('"')).length, 1);
  assert.match(file, /^"sub thread" = "sub-thread"$/m, "the first spelling is kept, the meaning updated");
  voice(["add", "10 stack", "TanStack Router"], { home });
  const out = voice([], { home }).out;
  assert.match(out, /^"10 stack" -> "TanStack Router"$/m);
  assert.doesNotMatch(out, /^"10 stack" -> "TanStack"$/m);
});

test("AC-457-4: WHEN a mishearing has quotes, backslashes, a newline or nothing in it THEN the file stays one clean line each", () => {
  const home = tmp();
  assert.equal(voice(["add", 'say "hi"', "C:\\Users"], { home }).code, 0);
  assert.match(read(home, ".onrails/glossary.toml"), /^"say \\"hi\\"" = "C:\\\\Users"$/m);
  assert.match(voice([], { home }).out, /^"say \\"hi\\"" -> "C:\\\\Users"$/m, "read back as it was written");
  const before = read(home, ".onrails/glossary.toml");
  for (const bad of [["add", "", "x"], ["add", "x", ""], ["add", "a\nb", "c"], ["add", "a", "b\nc"], ["add", "a"], ["add", "x".repeat(81), "y"], ["add", "a", "b", "c"]]) {
    assert.equal(voice(bad, { home }).code, 2, JSON.stringify(bad));
  }
  assert.equal(read(home, ".onrails/glossary.toml"), before);
});

test("AC-457-4: WHEN a session starts with voice or both THEN the rule says to run the script and read the glossary", () => {
  const rule = text(".agents/skills/ask/references/voice.md");
  const glossary = section(rule, "The glossary");
  assert.match(glossary, /~\/\.onrails\/glossary\.toml/);
  assert.match(glossary, /voice\.mjs/);
  assert.match(glossary, /once per session/);
  assert.match(glossary, /voice\.mjs add "<heard>" "<meant>"/);
  assert.match(glossary, /only after the person confirms/i);
  assert.match(glossary, /never in a repo/i);
});
