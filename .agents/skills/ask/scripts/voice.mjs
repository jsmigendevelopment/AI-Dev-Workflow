#!/usr/bin/env node
// voice.mjs: whether the person types or dictates, and their glossary of voice-to-text mishearings (#457).
// Usage:  node voice.mjs [status]             print `input: typing|voice|both|unset`, then the glossary unless it's typing
//         node voice.mjs input <typing|voice|both>   save [me] input in ~/.onrails/profile.toml
//         node voice.mjs add "<heard>" "<meant>"     add or update a line in ~/.onrails/glossary.toml
// Exit 0 done, 2 bad usage. Reading writes nothing. Both files are personal: never copy them into a repo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHOICES = ["typing", "voice", "both"];
const MAX = 80;
const HEADER = /^\s*\[([^\]]+)\]\s*(#.*)?$/;
const INPUT_LINE = /^(\s*input\s*=\s*)"([^"\n]*)"/;
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

const readText = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");

/** `[me] input` of a TOML text: typing, voice or both, else "". */
function inputOf(toml) {
  let section = "";
  for (const line of toml.split("\n")) {
    const header = HEADER.exec(line);
    if (header) section = header[1].trim();
    else if (section === "me" && INPUT_LINE.test(line)) {
      const value = INPUT_LINE.exec(line)[2];
      return CHOICES.includes(value) ? value : "";
    }
  }
  return "";
}

/** The TOML text with `[me] input` set: its line replaced, or added under [me], or a new [me] at the end. */
function withInput(toml, value) {
  const lines = toml.split("\n");
  let section = "", meAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const header = HEADER.exec(lines[i]);
    if (header) {
      section = header[1].trim();
      if (section === "me" && meAt < 0) meAt = i;
    } else if (section === "me" && INPUT_LINE.test(lines[i])) {
      lines[i] = lines[i].replace(INPUT_LINE, `$1"${value}"`);
      return lines.join("\n");
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

/** The person's lines first, then the kit's names they haven't overridden. A key matches in any case. */
function glossary() {
  const mine = glossaryLines(readText(join(personalDir(), "glossary.toml")));
  const taken = new Set(mine.map((e) => e.heard.toLowerCase()));
  return [...mine, ...SEED.filter(([heard]) => !taken.has(heard)).map(([heard, meant]) => ({ heard, meant }))];
}

const bad = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

function setInput(args) {
  if (args.length !== 1 || !CHOICES.includes(args[0])) bad("Usage: voice.mjs input <typing|voice|both>. The answer is typing, voice or both.");
  const path = join(personalDir(), "profile.toml");
  mkdirSync(personalDir(), { recursive: true });
  writeFileSync(path, withInput(readText(path), args[0]));
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
  mkdirSync(personalDir(), { recursive: true });
  writeFileSync(path, lines.join("\n").replace(/\n*$/, "\n"));
  console.log(`${found ? "Updated" : "Added"} ${JSON.stringify(heard)} -> ${JSON.stringify(meant)} in ${path}`);
}

function status() {
  const input = currentInput();
  console.log(`input: ${input || "unset"}`);
  if (input === "typing") return;
  console.log("glossary, heard -> meant (read by sound; these are confirmed):");
  for (const { heard, meant } of glossary()) console.log(`${JSON.stringify(heard)} -> ${JSON.stringify(meant)}`);
}

const [command = "status", ...args] = process.argv.slice(2);
if (command === "status" && !args.length) status();
else if (command === "input") setInput(args);
else if (command === "add") addLine(args);
else bad('Usage: voice.mjs [status] | input <typing|voice|both> | add "<heard>" "<meant>"');
