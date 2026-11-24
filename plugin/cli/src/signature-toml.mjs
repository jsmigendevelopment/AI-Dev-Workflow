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

/** { base, personal } from [me.signature] and [me.signature.personal], or null without [me.signature]. */
export function parseSignature(toml) {
  const tables = {};
  let current = null, pending = null;
  const finish = () => {
    try {
      tables[pending.table][pending.key] = readWhole(pending.text);
    } catch (error) {
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
