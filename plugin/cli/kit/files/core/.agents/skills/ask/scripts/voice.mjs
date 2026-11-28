#!/usr/bin/env node
// voice.mjs: whether the person types or dictates, and their glossary of voice-to-text mishearings (#457).
// Usage:  node voice.mjs [status]             print `input: typing|voice|both|unset`, then the glossary unless it's typing
//         node voice.mjs input <typing|voice|both>   save [me] input in ~/.onrails/profile.toml (exit 2, nothing written, if the profile has it in a form this can't edit)
//         node voice.mjs add "<heard>" "<meant>"     add or update a line in ~/.onrails/glossary.toml
// Exit 0 done, 2 bad usage. Reading writes nothing. Both files are personal: never copy them into a repo.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHOICES = ["typing", "voice", "both"];
const MAX = 80;
const HEADER = /^\s*\[([^\]]+)\]\s*(#.*)?$/;
// `input = "x"` or `input = 'x'`, then only a comment. Anything else (a multi-line string, a bare word) is not ours to edit.
const INPUT_LINE = /^(\s*input\s*=\s*)(?:"([^"\n]*)"|'([^'\n]*)')(\s*(?:#.*)?\s*)$/;
// Forms of [me] input that a one-line edit would turn into invalid TOML: `[[me]]`, a root `me.input` or `me = {...}`, a quoted `"input"` key.
const ARRAY_ME = /^\s*\[\[\s*["']?me["']?\s*[.\]]/;
const ROOT_ME = /^\s*["']?me["']?\s*[.=]/;
const OTHER_INPUT = /^\s*["']?input["']?\s*[=.]/;
const GLOSSARY_LINE = /^\s*"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/;
const GLOSSARY_HEAD = `# Words your voice to text gets wrong: "what it wrote" = "what you meant".
# An agent adds a line only after you confirm it, and reads this file at the start of a session.
# Personal: keep it out of every repo.
`;
// The kit's own names, as voice to text tends to write them. They apply with no file, so the kit can add more.
const SEED = [["10 stack", "TanStack"], ["tan stack", "TanStack"], ["on rails", "onRails"], ["on-rails", "onRails"],
  ["chad cn", "shadcn"], ["shad cn", "shadcn"], ["clark", "Clerk"], ["drizzly", "Drizzle"], ["rangler", "Wrangler"]];

/** ~/.onrails, or ~/.ai-dev-workflow while only that folder exists (the folder's name before the rename). */
function personalDir() {
  const now = join(homedir(), ".onrails"), old = join(homedir(), ".ai-dev-workflow");
  return !existsSync(now) && existsSync(old) ? old : now;
}

// A folder or other non-file at the path reads as empty; writing there then fails with a plain line (see save).
const readText = (path) => (existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : "");

/** `[me] input` of a TOML text: typing, voice or both, else "". */
function inputOf(toml) {
  let section = "";
  for (const line of toml.split("\n")) {
    const header = HEADER.exec(line);
    if (header) section = header[1].trim();
    else if (section === "me" && INPUT_LINE.test(line)) {
      const match = INPUT_LINE.exec(line);
      const value = match[2] ?? match[3];
      return CHOICES.includes(value) ? value : "";
    }
  }
  return "";
}

/**
 * The TOML text with `[me] input` set: its line replaced (single quotes become double), or added under [me], or a new [me]
 * at the end. null when the file has `me` in a shape one line can't edit safely.
 */
function withInput(toml, value) {
  const lines = toml.split("\n");
  let section = "", meAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const header = HEADER.exec(lines[i]);
    if (header) {
      section = header[1].trim();
      if (section === "me" && meAt < 0) meAt = i;
    } else if (ARRAY_ME.test(lines[i]) || (section === "" && ROOT_ME.test(lines[i]))) {
      return null;
    } else if (section === "me" && INPUT_LINE.test(lines[i])) {
      lines[i] = lines[i].replace(INPUT_LINE, (_all, key, _dq, _sq, tail) => `${key}"${value}"${tail}`);
      return lines.join("\n");
    } else if (section === "me" && OTHER_INPUT.test(lines[i])) {
      return null;
    }
  }
  if (meAt >= 0) return lines.toSpliced(meAt + 1, 0, `input = "${value}"`).join("\n");
  return `${toml}${toml ? (toml.endsWith("\n") ? "\n" : "\n\n") : ""}[me]\ninput = "${value}"\n`;
}

/** What the person set: their personal profile first, else this project's docs/profile.toml, else "". */
const currentInput = () => inputOf(readText(join(personalDir(), "profile.toml"))) || inputOf(readText(join("docs", "profile.toml")));

const unquote = (raw) => {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return null; // a line we can't read is skipped, never rewritten
  }
};

/** The glossary file's lines as { index, heard, meant }. */
function glossaryLines(text) {
  return text.split("\n").flatMap((line, index) => {
    const m = GLOSSARY_LINE.exec(line);
    const heard = m && unquote(m[1]), meant = m && unquote(m[2]);
    return heard && meant ? [{ index, heard, meant }] : [];
  });
}

/** The person's confirmed lines, and the kit's own names they haven't overridden. A key matches in any case. */
function glossary() {
  const mine = glossaryLines(readText(join(personalDir(), "glossary.toml")));
  const taken = new Set(mine.map((e) => e.heard.toLowerCase()));
  return { mine, kit: SEED.filter(([heard]) => !taken.has(heard)).map(([heard, meant]) => ({ heard, meant })) };
}

const bad = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

/** Writes a personal file, or says in one plain line why it can't (a folder at the path, no permission) and exits 2. */
function save(path, content) {
  try {
    mkdirSync(personalDir(), { recursive: true });
    writeFileSync(path, content);
  } catch (error) {
    bad(`Can't write ${path} (${error.code ?? "unknown error"}). Nothing was changed.`);
  }
}

function setInput(args) {
  if (args.length !== 1 || !CHOICES.includes(args[0])) bad("Usage: voice.mjs input <typing|voice|both>. The answer is typing, voice or both.");
  const path = join(personalDir(), "profile.toml");
  const next = withInput(readText(path), args[0]);
  if (next === null) bad(`Can't edit [me] input in ${path}: it is written in a form this script leaves alone. Set input = "${args[0]}" under [me] by hand. Nothing was changed.`);
  save(path, next);
  console.log(`Saved [me] input = "${args[0]}" in ${path}`);
}

function addLine(args) {
  if (args.length !== 2) bad('Usage: voice.mjs add "<heard>" "<meant>"');
  const [heard, meant] = args.map((s) => s.trim());
  for (const s of [heard, meant]) if (!s || s.length > MAX || /[\u0000-\u001f\u007f]/.test(s)) bad(`Each side is one line of 1 to ${MAX} characters.`);
  const path = join(personalDir(), "glossary.toml");
  const text = readText(path) || GLOSSARY_HEAD;
  const lines = text.split("\n");
  const found = glossaryLines(text).find((e) => e.heard.toLowerCase() === heard.toLowerCase());
  // The first spelling stays, so a repeat confirmation changes the meaning and never doubles the line.
  if (found) lines[found.index] = `${JSON.stringify(found.heard)} = ${JSON.stringify(meant)}`;
  else lines.splice(lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${JSON.stringify(heard)} = ${JSON.stringify(meant)}`);
  save(path, lines.join("\n").replace(/\n*$/, "\n"));
  console.log(`${found ? "Updated" : "Added"} ${JSON.stringify(heard)} -> ${JSON.stringify(meant)} in ${path}`);
}

function status() {
  const input = currentInput();
  console.log(`input: ${input || "unset"}`);
  if (input === "typing") return;
  const { mine, kit } = glossary();
  const show = ({ heard, meant }) => console.log(`${JSON.stringify(heard)} -> ${JSON.stringify(meant)}`);
  console.log("confirmed by the person, heard -> meant (a hint, read by sound):");
  mine.forEach(show);
  if (!mine.length) console.log("(none yet)");
  console.log("kit names, heard -> meant (built in, not confirmed by the person):");
  kit.forEach(show);
}

const [command = "status", ...args] = process.argv.slice(2);
if (command === "status" && !args.length) status();
else if (command === "input") setInput(args);
else if (command === "add") addLine(args);
else bad('Usage: voice.mjs [status] | input <typing|voice|both> | add "<heard>" "<meant>"');
