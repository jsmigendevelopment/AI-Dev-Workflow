// signature [--theme ..] [--style ..] [--markdown] [--write <file>]: the owner's README signature,
// built from [me.signature] in the profile. It's public and lands in Markdown, so every value is
// type-checked, emails, control characters, bare URLs in text and non-https links are refused,
// and every value is escaped. --write keeps exactly one block, between the markers.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { writeFile } from "./files.mjs";
import { profilePath } from "./profile.mjs";
import { parseSignature } from "./signature-toml.mjs";

const URL_KEYS = ["name_url", "mark_light", "mark_dark"];
const TEXT_KEYS = ["name", "display", "tagline", "signoff", "compact_signoff", "mark_alt"];
const SIZE_KEYS = ["mark_size", "compact_mark_size"];
const MAX_SIZE = 512;
const CHOICES = { theme: ["professional", "personal"], style: ["full", "compact"] };
const DEFAULTS = { theme: "professional", style: "full", mark_size: 64, compact_mark_size: 20, links: [] };
const START = "<!-- onrails:signature start -->";
const END = "<!-- onrails:signature end -->";
const NO_SIGNATURE = 3; // its own code, so name and join skip quietly on it and report every other failure
const EMAIL = /mailto:|[^\s@<>"'()/]+@[^\s@<>"'()/]+\.[^\s@<>"'()/]+/i;
// In text, any @ that isn't before a space could be an email GitHub autolinks, whatever the TLD.
const TEXT_AT = /@(?!\s)/;
// A newline ends an HTML block in Markdown, so the rest of a value would render as Markdown.
const CONTROL = /[\u0000-\u001f\u007f]/;
// GitHub autolinks these in text, escaped or not, which would add links the guards never saw.
// A colon before a space or the end ("Builder: web apps", "Note:") is ordinary text.
const BARE_URL = /[a-z][a-z0-9+.-]*:(?!\s|$)|www\.|\/\//i;

// The checks for one string value, by what the value is for.
function valueProblems(name, text, kind) {
  const found = [];
  if (EMAIL.test(text) || (kind === "text" && TEXT_AT.test(text))) {
    found.push(`${name} holds an email address, an @ or a mailto: link. The signature is public: take it out.`);
  }
  if (CONTROL.test(text)) found.push(`${name} holds a control character (a newline, tab or similar). Keep it on one line.`);
  if (kind === "url" && /\s/.test(text)) found.push(`${name} holds a space. URLs have none.`);
  else if (kind === "url" && text && !EMAIL.test(text) && !isHttps(text)) found.push(`${name} must be an absolute https:// URL, not "${text}".`);
  if (kind === "text" && BARE_URL.test(text)) found.push(`${name} holds a URL or a "scheme:" (${BARE_URL.exec(text)[0]}). Put links in links, not in text.`);
  return found;
}

const isPlainTable = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// links must be a list of { label = "..", url = ".." } tables, each a pair of strings.
function linkProblems(where, links) {
  if (!Array.isArray(links)) return [`${where} must be a list: [{ label = "..", url = ".." }, ...].`];
  return links.flatMap((link, n) => {
    const at = `${where}[${n}]`;
    if (!isPlainTable(link)) return [`${at} must be a { label = "..", url = ".." } table.`];
    const extra = Object.keys(link).filter((k) => k !== "label" && k !== "url");
    if (extra.length) return [`${at} has ${extra.join(", ")}: a link has only label and url.`];
    const found = [];
    for (const key of ["label", "url"]) {
      if (typeof link[key] !== "string") found.push(`${at}.${key} must be a "string".`);
      else if (!link[key]) found.push(`${at}.${key} is empty.`);
      else found.push(...valueProblems(`${at}.${key}`, link[key], key === "url" ? "url" : "text"));
    }
    return found;
  });
}

// One key's type and value. Nothing reaches the output unchecked.
function keyProblems(where, key, value) {
  if (key === "links") return linkProblems(where, value);
  if (SIZE_KEYS.includes(key)) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_SIZE ? [] : [`${where} must be a whole number from 1 to ${MAX_SIZE}, not ${JSON.stringify(value)}.`];
  }
  if (typeof value !== "string") return [`${where} must be a "string", not ${JSON.stringify(value)}.`];
  if (key in CHOICES) return value === "" || CHOICES[key].includes(value) ? [] : [`${where} is ${CHOICES[key].join(" or ")}, not "${value}".`];
  return valueProblems(where, value, URL_KEYS.includes(key) ? "url" : "text");
}

// Every problem in both tables, so a bad value is caught whichever theme is asked for.
function problems({ base, personal }) {
  const found = [];
  for (const [prefix, table] of [["", base], ["personal.", personal]]) {
    for (const [key, value] of Object.entries(table)) found.push(...keyProblems(`${prefix}${key}`, key, value));
  }
  return found;
}

function isHttps(url) {
  try {
    return url.startsWith("https://") && Boolean(new URL(url).host);
  } catch {
    return false; // a parse failure is the answer
  }
}

// The project's docs/profile.toml first, then the home profile (the order accounts reads).
function readSignature(dir, home) {
  for (const path of [join(resolve(dir), "docs", "profile.toml"), profilePath(home)]) {
    if (!existsSync(path)) continue;
    let parsed;
    try {
      parsed = parseSignature(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(`${path}: ${error.message}`);
    }
    if (parsed?.base.name) return { path, parsed };
  }
  return null;
}

// The base table, with the personal table's non-blank keys on top when the theme is personal.
// Runs after problems(), so every value already has its type.
function settle({ base, personal }, theme) {
  const want = theme ?? (base.theme || DEFAULTS.theme);
  const blank = (v) => v === "" || (Array.isArray(v) && !v.length);
  const over = want === "personal" ? Object.fromEntries(Object.entries(personal).filter(([, v]) => !blank(v))) : {};
  const v = { ...DEFAULTS, ...Object.fromEntries(Object.entries(base).filter(([, x]) => !blank(x))), ...over, theme: want };
  const found = [];
  if (!v.name_url) found.push("name_url is empty: the name links to it.");
  if (v.mark_light && !v.mark_alt) found.push("mark_alt is empty: every image needs alt text.");
  return { v, found };
}

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const a = (url, html) => `<a href="${esc(url)}">${html}</a>`;
const img = (v, size) => `<img src="${esc(v.mark_light)}" width="${size}" height="${size}" alt="${esc(v.mark_alt)}">`;
// Markdown text with every character that could open a link, image, emphasis or HTML escaped.
const mdText = (text) => text.replace(/&/g, "&amp;").replace(/[\\[\]()*_`<!]/g, "\\$&");
// Text that starts a Markdown line: a heading, quote, list, table or setext line would break the layout.
const mdLine = (text) => mdText(text).replace(/^([#>\-+=|])/, "\\$1").replace(/^(\d+)([.)])/, "$1\\$2");
// A URL that can't end the link early: brackets, quotes and backslashes percent-encoded (spaces are refused).
const mdUrl = (url) => url.replace(/[()<>"'\\`]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const md = (url, text) => `[${mdText(text)}](${mdUrl(url)})`;
const subline = (v, escape = esc) => [v.display, v.tagline].filter(Boolean).map(escape).join(" · ");

function full(v) {
  const lines = ['<p align="center">'];
  if (v.mark_light) lines.push(`  <a href="${esc(v.name_url)}">`, `    ${img(v, v.mark_size)}`, "  </a><br>");
  const body = [`Built by ${a(v.name_url, `<b>${esc(v.name)}</b>`)}`];
  const endLast = (suffix) => {
    body[body.length - 1] += suffix;
  };
  if (subline(v)) {
    endLast("<br>");
    body.push(`<sub>${subline(v)}</sub>`);
  }
  if (v.links.length) {
    endLast("<br><br>");
    body.push(...v.links.map((l, n) => `${a(l.url, esc(l.label))}${n < v.links.length - 1 ? " ·" : ""}`));
  }
  if (v.signoff) {
    if (v.links.length) body.push("<br><br>");
    else endLast("<br><br>");
    body.push(`<sub>${esc(v.signoff)}</sub>`);
  }
  return [...lines, ...body.map((line) => `  ${line}`), "</p>"].join("\n");
}

function compact(v) {
  const signoff = v.compact_signoff || v.signoff;
  const mark = v.mark_light ? `${a(v.name_url, img(v, v.compact_mark_size))} ` : "";
  const parts = [`By ${a(v.name_url, `<b>${esc(v.name)}</b>`)}`, ...v.links.map((l) => a(l.url, esc(l.label)))];
  if (signoff) parts.push(`<sub>${esc(signoff)}</sub>`);
  return `<p align="center">${mark}${parts.join(" · ")}</p>`;
}

function markdown(v, style) {
  const mark = v.mark_light ? `[![${mdText(v.mark_alt)}](${mdUrl(v.mark_light)})](${mdUrl(v.name_url)})` : "";
  const name = `**${md(v.name_url, v.name)}**`;
  const links = v.links.map((l) => md(l.url, l.label)).join(" · ");
  if (style === "compact") {
    const signoff = v.compact_signoff || v.signoff;
    return [mark, [`By ${name}`, links, signoff && mdText(signoff)].filter(Boolean).join(" · ")].filter(Boolean).join(" ");
  }
  // The display line and the signoff each start a line, so their first character is escaped too.
  const sub = [v.display && mdLine(v.display), v.tagline && (v.display ? mdText(v.tagline) : mdLine(v.tagline))].filter(Boolean).join(" · ");
  const blocks = [mark, `Built by ${name}${sub ? `  \n${sub}` : ""}`, links, v.signoff && mdLine(v.signoff)];
  return blocks.filter(Boolean).join("\n\n");
}

// Line numbers of the markers, outside fenced code blocks. A marker counts only as the whole
// line, at column 0, the way this command writes it: an indented one is in code or a list.
function markerLines(lines) {
  const starts = [], ends = [];
  let fence = null;
  lines.forEach((raw, n) => {
    const line = raw.replace(/\r$/, "");
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) fence = null;
      return;
    }
    // A backtick fence's info string can't hold a backtick (CommonMark), so "``` a`b" isn't one.
    const open = /^ {0,3}(`{3,})[^`]*$/.exec(line)?.[1] ?? /^ {0,3}(~{3,})/.exec(line)?.[1];
    if (open) fence = open;
    else if (line === START) starts.push(n);
    else if (line === END) ends.push(n);
  });
  return { starts, ends };
}

// The text with the block between the markers, or with `---` and the block added at the end, in
// the file's own line ending. A lone marker, two pairs or a reversed pair throws: guessing there
// could delete the person's text.
function placeSignature(text, block) {
  const lines = text.split("\n");
  const { starts, ends } = markerLines(lines);
  const blockLines = [START, ...block.split("\n"), END];
  if (!starts.length && !ends.length) {
    const eol = lines.length > 1 && lines[0].endsWith("\r") ? "\r\n" : "\n";
    const body = text.trimEnd();
    const wrapped = blockLines.join(eol);
    return body ? `${body}${eol}${eol}---${eol}${eol}${wrapped}${eol}` : `${wrapped}${eol}`;
  }
  const fix = "Fix the markers by hand, then run this again.";
  if (starts.length > 1 || ends.length > 1) throw new Error(`it has more than one signature start or end marker. Keep one pair. ${fix}`);
  if (!ends.length) throw new Error(`it has a signature start marker but no end marker (${END}). ${fix}`);
  if (!starts.length) throw new Error(`it has a signature end marker but no start marker (${START}). ${fix}`);
  if (ends[0] < starts[0]) throw new Error(`its signature end marker comes before the start marker. ${fix}`);
  const cr = lines[starts[0]].endsWith("\r") ? "\r" : "";
  const endCr = lines[ends[0]].endsWith("\r") ? "\r" : "";
  const placed = blockLines.map((line, n) => line + (n === blockLines.length - 1 ? endCr : cr));
  return [...lines.slice(0, starts[0]), ...placed, ...lines.slice(ends[0] + 1)].join("\n");
}

// { theme, style, markdown, write } from the flags, or the reason they're wrong.
function parseArgs(argv) {
  const opts = { markdown: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--markdown") {
      opts.markdown = true;
      continue;
    }
    if (!["--theme", "--style", "--write"].includes(arg)) return `Unknown option for signature: ${arg}`;
    const value = argv[++i];
    if (!value || value.startsWith("-")) return `${arg} needs a value`;
    opts[arg.slice(2)] = value;
  }
  for (const key of ["theme", "style"]) {
    if (opts[key] && !CHOICES[key].includes(opts[key])) return `--${key} is ${CHOICES[key].join(" or ")}, not "${opts[key]}"`;
  }
  return opts;
}

// Puts the block in the file. Returns the exit code.
function writeSignature(file, block, { dir, log, error, from }) {
  const path = resolve(dir, file);
  let before, after;
  try {
    before = existsSync(path) ? readFileSync(path, "utf8") : "";
    after = placeSignature(before, block);
  } catch (e) {
    error(`${file}: ${e.message}\nNothing was written.`);
    return 1;
  }
  if (after === before) {
    log(`${file}: the signature is already up to date.`);
    return 0;
  }
  writeFile(path, after);
  log(`${file}: wrote the signature from ${from}.`);
  return 0;
}

/** The signature command. Exit codes: 0 done, 1 a refused value or file, 2 bad flags, 3 no signature in the profile. */
export function signature(argv, { dir = ".", home = homedir(), log = console.log, error = console.error } = {}) {
  const opts = parseArgs(argv);
  if (typeof opts === "string") {
    error(`${opts}\nRun: npx onrails --help`);
    return 2;
  }
  let found;
  try {
    found = readSignature(dir, home);
  } catch (e) {
    error(e.message);
    return 1;
  }
  if (!found) {
    error(`No [me.signature] in docs/profile.toml or ${profilePath(home)}, or its name is blank.\n`
      + "Add one: copy the [me.signature] table from the profile template (npx onrails profile init makes a profile),\n"
      + "fill in name, name_url, the mark and links, then run: npx onrails signature");
    return NO_SIGNATURE;
  }
  const typeProblems = problems(found.parsed);
  const { v, found: settleProblems } = typeProblems.length ? { found: [] } : settle(found.parsed, opts.theme);
  const all = [...typeProblems, ...settleProblems];
  if (all.length) {
    error(`${found.path} [me.signature]:\n${all.map((p) => `  ${p}`).join("\n")}\nNothing was written.`);
    return 1;
  }
  const style = opts.style ?? v.style;
  const block = opts.markdown ? markdown(v, style) : style === "compact" ? compact(v) : full(v);
  if (opts.write) return writeSignature(opts.write, block, { dir, log, error, from: found.path });
  log(block);
  return 0;
}
