// #191, #197, #229: the safe-PATH scan. inherits() reads a test file's text and names each way it could start a
// child with the shell's PATH; safe-path.test.mjs runs it on every CLI test file and on planted samples. The scan
// reads this file too, so each pattern is written so it can't match its own source.

// The forms that give a child the shell's PATH.
const READS_PATH = /process\.env\s*(?:\??\.\s*path\b|\[\s*["'`]path["'`]\s*\])(?!\s*=[^=])/i;
const WHOLE_ENV = /process\.env\b(?!\s*(?:\??\.|\[))/;
const PATH_KEY = /\bPath\s*:|["'`][Pp]ath["'`]\s*:/;
// helpers.mjs strips every PATH key from the shell's env on the same line; a lookup (findCommand, commandFor) starts
// nothing, so its Path key is a test of Windows casing.
const STRIPS = "PATH_KEY.test(";
const LOOKUP = /\b(?:findCommand|commandFor)\(/;
const CHILD_PROCESS = /["'](?:node:)?child_process["']|["']\.\/child\.mjs["']/;
const STARTS = /^(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)$/;
// A claude or codex named by its path in node's own folder, which no PATH reaches (#197).
const TOOL_FILE = String.raw`[/\\"'\x60](?:claude|codex)(?:\.cmd|\.exe)?["'\x60]`;
const NEXT_TO_NODE = new RegExp(String.raw`\bexecPath\b.*${TOOL_FILE}|${TOOL_FILE}.*\bexecPath\b`, "i");

// The text from just after an opening paren to its closing one.
function args(text, start) {
  let depth = 1, i = start;
  for (; i < text.length && depth > 0; i++) depth += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
  return text.slice(start, i - 1);
}

// Every static import: a default binding, then named ones in braces or a namespace (#229 review).
const IMPORT = /\bimport(?:\s+([\w$]+)\s*(?:,\s*|(?=from\b)))?\s*(\{[^}]*\}|\*\s*as\s+[\w$]+)?\s*from\s*(["'][^"']+["'])/g;
// child_process named anywhere but a static import: loaded at run time, by require, import() or createRequire (#229 review).
const NAMES_CHILD_PROCESS = /["'`](?:node:)?child_process["'`]/;

/** The imports from child_process or child.mjs: [default binding, names in braces or namespace, source]. */
function childImports(text) {
  return [...text.matchAll(IMPORT)].filter((m) => (m[1] || m[2]) && CHILD_PROCESS.test(m[3])).map((m) => [m[1], m[2] ?? "", m[3]]);
}

/**
 * Each use of child_process's default binding that could start a child (#229 review). It may only be assigned to
 * (`cp.spawnSync = stub`) or saved to restore in a key of the same name (`{ spawnSync: cp.spawnSync }`): a call, a
 * read into a variable, or the binding itself passed on or taken apart is flagged.
 */
function defaultUses(text, name) {
  const found = [];
  const body = text.replace(IMPORT, "");
  const member = new RegExp(String.raw`(?<![.\w$])${name}\s*(?:\??\.\s*([\w$]+)|\[\s*["'\x60]([\w$]+)["'\x60]\s*\])`, "g");
  for (const m of body.matchAll(member)) {
    const prop = m[1] ?? m[2];
    if (!STARTS.test(prop)) continue;
    const after = body.slice(m.index + m[0].length);
    const saved = new RegExp(String.raw`(?<![.\w$])${prop}\s*:\s*$`).test(body.slice(0, m.index));
    if (!/^\s*=(?!=)/.test(after) && !saved) found.push(`${name}.${prop} from child_process is used, not child.mjs's`);
  }
  const bare = new RegExp(String.raw`(?<![.\w$])${name}\b(?!\s*(?:\??\.|\[))`, "g");
  if (body.match(bare)) found.push(`${name} from child_process is passed on or taken apart, so its calls can't be checked`);
  return found;
}

/** Each way the file's text could start a child with the shell's PATH, one line each. */
export function inherits(text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    if (READS_PATH.test(line)) found.push(`line ${i + 1}: reads the shell's PATH`);
    if (WHOLE_ENV.test(line) && !line.includes(STRIPS)) found.push(`line ${i + 1}: passes the shell's whole env`);
    if (PATH_KEY.test(line) && !LOOKUP.test(line)) found.push(`line ${i + 1}: sets a Path key`);
    if (NEXT_TO_NODE.test(line)) found.push(`line ${i + 1}: names a claude or codex next to node`);
  });
  const imports = childImports(text);
  // #229: a child starts through child.mjs, which checks its env in the spawn's own working folder.
  const direct = imports.filter(([, , source]) => !source.includes("child.mjs"));
  const starts = direct.filter(([, named]) => named.startsWith("{")).flatMap(([, named]) => named.slice(1, -1).split(",")).map((n) => n.trim().split(/\s+as\s+/)[0]);
  for (const name of starts.filter((n) => STARTS.test(n))) found.push(`${name} comes from child_process, not child.mjs`);
  for (const [name] of direct.filter(([binding]) => binding)) found.push(...defaultUses(text, name));
  if (imports.some(([, named]) => named.startsWith("*")) || NAMES_CHILD_PROCESS.test(text.replace(IMPORT, ""))) {
    found.push("child_process isn't imported by name, so its calls can't be checked");
  }
  const names = imports.filter(([, named]) => named.startsWith("{")).flatMap(([, named]) => named.slice(1, -1).split(",")).map((n) => n.trim().split(/\s+as\s+/).at(-1)).filter((n) => /^[\w$]+$/.test(n));
  for (const name of names) {
    for (const m of text.matchAll(new RegExp(`(?<![.\\w$])${name}\\(`, "g"))) {
      if (!/(?<![.\w$])env\s*[:,}]/.test(args(text, m.index + m[0].length))) found.push(`${name}() with no env inherits the shell's PATH`);
    }
  }
  return found;
}
