// signature [--theme ..] [--style ..] [--markdown] [--write <file>]: the owner's README signature,
// built from [me.signature] in the profile. It's public, so emails and non-https URLs are refused
// and every value is HTML-escaped. --write keeps exactly one block, between the markers.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { writeFile } from "./files.mjs";
import { profilePath } from "./profile.mjs";

const KEYS = ["theme", "style", "name", "name_url", "display", "tagline", "mark_light", "mark_dark", "mark_alt",
  "mark_size", "compact_mark_size", "signoff", "compact_signoff", "links"];
const URL_KEYS = ["name_url", "mark_light", "mark_dark"];
const THEMES = ["professional", "personal"];
const STYLES = ["full", "compact"];
const DEFAULTS = { theme: "professional", style: "full", mark_size: 64, compact_mark_size: 20, links: [] };
const START = "<!-- onrails:signature start -->";
const END = "<!-- onrails:signature end -->";
const NO_SIGNATURE = 3; // its own code, so name and join skip quietly on it and report a refused value
const EMAIL = /mailto:|[^\s@<>"'()/]+@[^\s@<>"'()/]+\.[a-z]{2,}/i;

const ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };

// Index just past the string that opens at s[i], and its value, with TOML's escapes decoded.
function readString(s, i) {
  let out = "";
  for (i++; i < s.length && s[i] !== '"'; i++) {
    if (s[i] !== "\\") { out += s[i]; continue; }
    const c = s[++i];
    if (c in ESCAPES) { out += ESCAPES[c]; continue; }
    const width = { u: 4, U: 8 }[c];
    if (!width) throw new Error(`unknown escape \\${c ?? ""}`);
    const hex = s.slice(i + 1, i + 1 + width);
    const code = /^[0-9a-fA-F]+$/.test(hex) && hex.length === width ? parseInt(hex, 16) : NaN;
    if (!(code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) throw new Error(`\\${c} needs ${width} hex digits of a valid character`);
    out += String.fromCodePoint(code);
    i += width;
  }
  if (s[i] !== '"') throw new Error("a string is missing its closing quote");
  return [out, i + 1];
}

const skip = (s, i) => { while (/[\s,]/.test(s[i] ?? "")) i++; return i; };

// The value shapes [me.signature] uses: "strings", integers, booleans, [arrays] and { inline = "tables" }.
function readValue(s, i) {
  i = skip(s, i);
  if (s[i] === '"') return readString(s, i);
  if (s[i] === "[" || s[i] === "{") {
    const table = s[i] === "{", close = table ? "}" : "]", out = table ? {} : [];
    for (i = skip(s, i + 1); s[i] !== close; i = skip(s, i)) {
      if (i >= s.length) throw new Error(`missing a closing ${close}`);
      if (!table) { const [v, next] = readValue(s, i); out.push(v); i = next; continue; }
      const key = /^([A-Za-z0-9_-]+)\s*=/.exec(s.slice(i));
      if (!key) throw new Error(`expected key = value at "${s.slice(i, i + 20)}"`);
      const [v, next] = readValue(s, i + key[0].length);
      out[key[1]] = v;
      i = next;
    }
    return [out, i + 1];
  }
  const bare = /^[^\s,\]}]+/.exec(s.slice(i))?.[0] ?? "";
  if (/^-?\d+$/.test(bare)) return [Number(bare), i + bare.length];
  if (bare === "true" || bare === "false") return [bare === "true", i + bare.length];
  throw new Error(`can't read the value "${bare || s.slice(i, i + 20)}"`);
}

// The line without its # comment, and how many brackets it leaves open, skipping strings.
function scan(line) {
  let depth = 0, inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === "#") return { text: line.slice(0, i), depth };
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
  }
  return { text: line, depth };
}

/** { base, personal } from [me.signature] and [me.signature.personal], or null without [me.signature]. */
export function parseSignature(toml) {
  const tables = {};
  let current = null, pending = null;
  const finish = () => {
    try { tables[pending.table][pending.key] = readValue(pending.text, 0)[0]; } catch (error) {
      throw new Error(`${pending.table === "personal" ? "[me.signature.personal]" : "[me.signature]"} ${pending.key}: ${error.message}`);
    }
    pending = null;
  };
  for (const raw of toml.split(/\r?\n/)) {
    const { text, depth } = scan(raw);
    const line = text.trim();
    if (pending) {
      pending.text += `\n${line}`;
      pending.depth += depth;
      if (pending.depth <= 0) finish();
      continue;
    }
    if (!line) continue;
    const table = /^\[\s*([A-Za-z0-9_.-]+)\s*\]$/.exec(line)?.[1];
    if (line.startsWith("[")) {
      current = table === "me.signature" ? "base" : table === "me.signature.personal" ? "personal" : null;
      if (current) tables[current] ??= {};
      continue;
    }
    const pair = current && /^([a-z_]+)\s*=\s*(.*)$/.exec(line);
    if (!pair || !KEYS.includes(pair[1])) continue;
    pending = { table: current, key: pair[1], text: pair[2], depth };
    if (depth <= 0) finish();
  }
  if (pending) throw new Error(`[me.signature] ${pending.key}: missing a closing bracket`);
  return tables.base ? { base: tables.base, personal: tables.personal ?? {} } : null;
}

// The project's docs/profile.toml first, then the home profile (the order accounts reads).
function readSignature(dir, home) {
  for (const path of [join(resolve(dir), "docs", "profile.toml"), profilePath(home)]) {
    if (!existsSync(path)) continue;
    let parsed;
    try { parsed = parseSignature(readFileSync(path, "utf8")); } catch (error) { throw new Error(`${path}: ${error.message}`); }
    if (parsed?.base.name) return { path, parsed };
  }
  return null;
}

// Every problem in both tables, so a bad value is caught whichever theme is asked for.
function problems({ base, personal }) {
  const found = [];
  for (const [prefix, table] of [["", base], ["personal.", personal]]) {
    for (const [key, value] of Object.entries(table)) {
      const where = `${prefix}${key}`;
      const links = key === "links" ? (Array.isArray(value) ? value : [value]) : null;
      const strings = links ? links.flatMap((l, n) => [[`${where}[${n}].label`, l?.label], [`${where}[${n}].url`, l?.url]])
        : [[where, value]];
      for (const [name, text] of strings) {
        if (typeof text === "string" && EMAIL.test(text)) found.push(`${name} holds an email address or a mailto: link. The signature is public: take it out.`);
      }
      const urls = links ? strings.filter(([name]) => name.endsWith(".url")) : URL_KEYS.includes(key) ? strings : [];
      for (const [name, url] of urls) {
        if (url && !EMAIL.test(url) && !isHttps(url)) found.push(`${name} must be an absolute https:// URL, not "${url}".`);
        if (links && !url) found.push(`${name} is empty.`);
      }
    }
  }
  return found;
}

function isHttps(url) {
  try { return typeof url === "string" && url.startsWith("https://") && Boolean(new URL(url).host); } catch { return false; } // a parse failure is the answer
}

// The base table, with the personal table's non-blank keys on top when the theme is personal.
function settle({ base, personal }, theme) {
  const want = theme ?? (base.theme || DEFAULTS.theme);
  const blank = (v) => v === "" || (Array.isArray(v) && !v.length);
  const over = want === "personal" ? Object.fromEntries(Object.entries(personal).filter(([, v]) => !blank(v))) : {};
  const v = { ...DEFAULTS, ...Object.fromEntries(Object.entries(base).filter(([, x]) => !blank(x))), ...over, theme: want };
  const found = [];
  if (!THEMES.includes(v.theme)) found.push(`theme is professional or personal, not "${v.theme}".`);
  if (!STYLES.includes(v.style)) found.push(`style is full or compact, not "${v.style}".`);
  if (!v.name_url) found.push("name_url is empty: the name links to it.");
  if (v.mark_light && !v.mark_alt) found.push("mark_alt is empty: every image needs alt text.");
  for (const key of ["mark_size", "compact_mark_size"]) {
    if (!Number.isInteger(v[key]) || v[key] < 1) found.push(`${key} must be a whole number of pixels, not "${v[key]}".`);
  }
  if (!Array.isArray(v.links)) found.push("links must be a list of { label, url }.");
  return { v, found };
}

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const a = (url, html) => `<a href="${esc(url)}">${html}</a>`;
const img = (v, size) => `<img src="${esc(v.mark_light)}" width="${size}" height="${size}" alt="${esc(v.mark_alt)}">`;
// Markdown text with every character that could open a link, image, emphasis or HTML escaped.
const mdText = (text) => String(text).replace(/&/g, "&amp;").replace(/[\\[\]()*_`<!]/g, "\\$&");
// A URL that can't end the link early: spaces, brackets and quotes percent-encoded.
const mdUrl = (url) => String(url).replace(/[\s()<>"'\\`]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
const md = (url, text) => `[${mdText(text)}](${mdUrl(url)})`;
const subline = (v, escape = esc) => [v.display, v.tagline].filter(Boolean).map(escape).join(" · ");

function full(v) {
  const lines = ['<p align="center">'];
  if (v.mark_light) lines.push(`  <a href="${esc(v.name_url)}">`, `    ${img(v, v.mark_size)}`, "  </a><br>");
  const body = [`Built by ${a(v.name_url, `<b>${esc(v.name)}</b>`)}`];
  const last = (suffix) => { body[body.length - 1] += suffix; };
  if (subline(v)) last("<br>"), body.push(`<sub>${subline(v)}</sub>`);
  if (v.links.length) last("<br><br>"), body.push(...v.links.map((l, n) => `${a(l.url, esc(l.label))}${n < v.links.length - 1 ? " ·" : ""}`));
  if (v.signoff) (v.links.length ? body.push("<br><br>") : last("<br><br>")), body.push(`<sub>${esc(v.signoff)}</sub>`);
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
  const sub = subline(v, mdText);
  const blocks = [mark, `Built by ${name}${sub ? `  \n${sub}` : ""}`, links, v.signoff && mdText(v.signoff)];
  return blocks.filter(Boolean).join("\n\n");
}

/**
 * The text with the block between the markers, or with `---` and the block added at the end.
 * A marker counts only alone on its line, so one quoted in the text is left alone. A lone
 * marker, two pairs or a reversed pair throws: guessing there could delete the person's text.
 */
export function placeSignature(text, block) {
  const wrapped = `${START}\n${block}\n${END}`;
  const lines = text.split("\n");
  const at = (marker) => lines.flatMap((line, n) => (line.trim() === marker ? [n] : []));
  const starts = at(START), ends = at(END);
  if (!starts.length && !ends.length) {
    const body = text.trimEnd();
    return body ? `${body}\n\n---\n\n${wrapped}\n` : `${wrapped}\n`;
  }
  const fix = "Fix the markers by hand, then run this again.";
  if (starts.length > 1 || ends.length > 1) throw new Error(`it has more than one signature start or end marker. Keep one pair. ${fix}`);
  if (!ends.length) throw new Error(`it has a signature start marker but no end marker (${END}). ${fix}`);
  if (!starts.length) throw new Error(`it has a signature end marker but no start marker (${START}). ${fix}`);
  if (ends[0] < starts[0]) throw new Error(`its signature end marker comes before the start marker. ${fix}`);
  return [...lines.slice(0, starts[0]), wrapped, ...lines.slice(ends[0] + 1)].join("\n");
}

// { theme, style, markdown, write } from the flags, or the reason they're wrong.
function parseArgs(argv) {
  const opts = { markdown: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--markdown") { opts.markdown = true; continue; }
    if (!["--theme", "--style", "--write"].includes(arg)) return `Unknown option for signature: ${arg}`;
    const value = argv[++i];
    if (!value || value.startsWith("-")) return `${arg} needs a value`;
    opts[arg.slice(2)] = value;
  }
  if (opts.theme && !THEMES.includes(opts.theme)) return `--theme is professional or personal, not "${opts.theme}"`;
  if (opts.style && !STYLES.includes(opts.style)) return `--style is full or compact, not "${opts.style}"`;
  return opts;
}

/** The signature command. Exit codes: 0 done, 1 a refused value or file, 2 bad flags, 3 no signature in the profile. */
export function signature(argv, { dir = ".", home = homedir(), log = console.log, error = console.error } = {}) {
  const opts = parseArgs(argv);
  if (typeof opts === "string") return error(`${opts}\nRun: npx onrails --help`), 2;
  let found;
  try { found = readSignature(dir, home); } catch (e) { return error(e.message), 1; }
  if (!found) {
    error(`No [me.signature] in docs/profile.toml or ${profilePath(home)}, or its name is blank.\n`
      + "Add one: copy the [me.signature] table from the profile template (npx onrails profile init makes a profile),\n"
      + "fill in name, name_url, the mark and links, then run: npx onrails signature");
    return NO_SIGNATURE;
  }
  const { v, found: settleProblems } = settle(found.parsed, opts.theme);
  const all = [...problems(found.parsed), ...settleProblems];
  if (all.length) return error(`${found.path} [me.signature]:\n${all.map((p) => `  ${p}`).join("\n")}\nNothing was written.`), 1;
  const style = opts.style ?? v.style;
  const block = opts.markdown ? markdown(v, style) : style === "compact" ? compact(v) : full(v);
  if (!opts.write) return log(block), 0;
  const path = resolve(dir, opts.write);
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  let after;
  try { after = placeSignature(before, block); } catch (e) { return error(`${opts.write}: ${e.message}\nNothing was written.`), 1; }
  if (after === before) return log(`${opts.write}: the signature is already up to date.`), 0;
  writeFile(path, after);
  log(`${opts.write}: wrote the ${v.theme} ${style} signature from ${found.path}.`);
  return 0;
}
