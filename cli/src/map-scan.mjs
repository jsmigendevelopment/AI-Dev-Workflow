// The import scan behind `onrails map` (#709): which paths a JS or TS file imports, read from its text.
// One pass, so a hostile file (an unterminated comment, a long run of quotes) costs time in proportion to its size.

// Where a comment, a string or a template literal can start.
const START = /\/\*|\/\/|['"`]/g;
const FROM = /\b(?:import|export)\b(?:[^";]{0,2000}?\bfrom)?\s*"(\d+)"/g;
const CALL = /\b(?:require|import)\s*\(\s*"(\d+)"\s*\)/g;

/** The index just past the closing `quote` of a string that starts at `start`, or -1 when it has none. */
function stringEnd(text, start, quote) {
  const multiLine = quote === "`";
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === quote) return i + 1;
    else if (c === "\n" && !multiLine) return -1;
  }
  return -1;
}

/**
 * The text with each comment and template literal blanked and each quoted string swapped for its number, plus the
 * strings. An import inside a comment or a string is then never read as one, and an import() of a template literal
 * has no fixed path to follow. An unterminated comment ends at the end of the file.
 */
function blank(text) {
  const strings = [];
  const parts = [];
  // Where the last string of each kind failed to close. Another start before it cannot close either, so the scan never
  // reads the same stretch twice.
  const deadUntil = {};
  let last = 0;
  START.lastIndex = 0;
  for (let m = START.exec(text); m; m = START.exec(text)) {
    const at = m.index;
    const open = m[0];
    let end;
    let replacement = " ";
    if (open === "/*") {
      const close = text.indexOf("*/", at + 2);
      end = close === -1 ? text.length : close + 2;
    } else if (open === "//") {
      const eol = text.indexOf("\n", at);
      end = eol === -1 ? text.length : eol;
    } else {
      if (at < (deadUntil[open] ?? 0)) continue;
      end = stringEnd(text, at, open);
      if (end === -1) {
        const eol = text.indexOf("\n", at);
        deadUntil[open] = open === "`" || eol === -1 ? text.length : eol;
        continue;
      }
      if (open !== "`") {
        strings.push(text.slice(at + 1, end - 1));
        replacement = `"${strings.length - 1}"`;
      }
    }
    parts.push(text.slice(last, at), replacement);
    last = end;
    START.lastIndex = end;
  }
  parts.push(text.slice(last));
  return { code: parts.join(""), strings };
}

/** The paths a file imports: `import`, `export ... from`, `require()` and `import()` with a plain string. */
export function specifiers(text) {
  const { code, strings } = blank(text);
  const found = new Set();
  for (const pattern of [FROM, CALL]) for (const m of code.matchAll(pattern)) found.add(strings[Number(m[1])]);
  return [...found];
}
