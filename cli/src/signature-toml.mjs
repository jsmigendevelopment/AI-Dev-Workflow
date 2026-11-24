// The small TOML reader behind signature: [me.signature] and [me.signature.personal] only.
// It reads the shapes those tables use and refuses the rest with a clear message, never a guess.

export const KEYS = ["theme", "style", "name", "name_url", "display", "tagline", "mark_light", "mark_dark", "mark_alt",
  "mark_size", "compact_mark_size", "signoff", "compact_signoff", "links"];

const ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };

// Index just past the string that opens at s[i], and its value, with TOML's escapes decoded.
function readString(s, i) {
  if (s.startsWith('"""', i)) throw new Error('multi-line strings (""") aren\'t supported: put the value on one line, in "quotes"');
  let out = "";
  for (i++; i < s.length && s[i] !== '"'; i++) {
    if (s[i] !== "\\") {
      out += s[i];
      continue;
    }
    const c = s[++i];
    if (c in ESCAPES) {
      out += ESCAPES[c];
      continue;
    }
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

function skip(s, i) {
  while (/[\s,]/.test(s[i] ?? "")) i++;
  return i;
}

// The value shapes [me.signature] uses: "strings", integers, booleans, [arrays] and { inline = "tables" }.
function readValue(s, i) {
  i = skip(s, i);
  if (s[i] === '"') return readString(s, i);
  if (s[i] === "[" || s[i] === "{") {
    const table = s[i] === "{", close = table ? "}" : "]", out = table ? {} : [];
    for (i = skip(s, i + 1); s[i] !== close; i = skip(s, i)) {
      if (i >= s.length) throw new Error(`missing a closing ${close}`);
      if (!table) {
        const [v, next] = readValue(s, i);
        out.push(v);
        i = next;
        continue;
      }
      const key = /^([A-Za-z0-9_-]+)\s*=/.exec(s.slice(i));
      if (!key) throw new Error(`expected key = value at "${s.slice(i, i + 20)}"`);
      if (Object.hasOwn(out, key[1])) throw new Error(`${key[1]} is set twice in one { } table. Keep one.`);
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

// One whole value: anything after it but a comment (already stripped) is refused.
function readWhole(text) {
  const [value, next] = readValue(text, 0);
  const rest = text.slice(next).trim();
  if (rest) throw new Error(`unexpected text after the value: "${rest.slice(0, 20)}"`);
  return value;
}

// The line without its # comment, and how many brackets it leaves open, skipping strings.
function scan(line) {
  let depth = 0, inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "#") return { text: line.slice(0, i), depth };
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
  }
  return { text: line, depth };
}

const TABLES = { "me.signature": "base", "me.signature.personal": "personal" };
const label = (table) => (table === "personal" ? "[me.signature.personal]" : "[me.signature]");

// How many single-letter edits turn a into b.
function distance(a, b) {
  let row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

function unknownKey(table, key) {
  const [best] = KEYS.map((k) => [distance(key.replace(/"/g, ""), k), k]).sort((x, y) => x[0] - y[0]);
  const hint = best[0] <= 3 ? ` Did you mean ${best[1]}?` : "";
  return new Error(`${label(table)} ${key}: not a signature key.${hint} The keys are: ${KEYS.join(", ")}.`);
}

// A table header: which signature table it opens (null for any other), or an error for a shape we don't read.
function header(line, seen) {
  const [, open, spaced = ""] = /^(\[\[?)\s*([^\]]*?)\s*\]\]?$/.exec(line) ?? [];
  const name = spaced.replace(/\s*\.\s*/g, "."); // [ me . signature ] is the same table in TOML
  if (name !== "me.signature" && !name.startsWith("me.signature.")) return { table: null, name };
  if (open === "[[") throw new Error(`[[${name}]] isn't supported: write links = [{ label = "..", url = ".." }, ...] in [me.signature].`);
  const table = TABLES[name];
  if (!table) throw new Error(`[${name}] isn't a signature table: use [me.signature] or [me.signature.personal].`);
  if (seen.has(table)) throw new Error(`${label(table)} appears twice. Keep one.`);
  seen.add(table);
  return { table, name };
}

/** { base, personal } from [me.signature] and [me.signature.personal], or null without [me.signature]. */
export function parseSignature(toml) {
  const tables = {}, seen = new Set();
  let current = null, tableName = "", pending = null;
  const finish = () => {
    try {
      tables[pending.table][pending.key] = readWhole(pending.text);
    } catch (error) {
      throw new Error(`${label(pending.table)} ${pending.key}: ${error.message}`);
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
    if (line.startsWith("[")) {
      ({ table: current, name: tableName } = header(line, seen));
      if (current) tables[current] = {};
      continue;
    }
    const pair = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
    const key = pair?.[1] ?? "";
    if (!current) {
      // [me] signature.name = .. or me.signature.name = .. at the top: valid TOML we'd silently miss.
      const path = `${tableName ? `${tableName}.` : ""}${key}`.replace(/"/g, "");
      if (/^me\s*\.\s*signature\s*(\.|$)/.test(path)) {
        throw new Error(`${key}: dotted signature keys aren't supported. Put them under a [me.signature] table.`);
      }
      if (/^me$/.test(path.trim()) && /\bsignature\b/.test(pair[2])) {
        throw new Error("me = { signature = .. }: inline tables aren't supported here. Use a [me.signature] table.");
      }
      continue;
    }
    if (!pair) throw new Error(`${label(current)}: can't read "${line.slice(0, 30)}". Each line is key = value.`);
    if (/[.\s]/.test(key)) throw new Error(`${label(current)} ${key}: dotted keys aren't supported. Use one plain key per line.`);
    if (!KEYS.includes(key)) throw unknownKey(current, key);
    if (key in tables[current]) throw new Error(`${label(current)} ${key}: set twice. Keep one.`);
    pending = { table: current, key, text: pair[2], depth };
    if (depth <= 0) finish();
  }
  if (pending) throw new Error(`${label(pending.table)} ${pending.key}: missing a closing bracket`);
  return tables.base ? { base: tables.base, personal: tables.personal ?? {} } : null;
}
