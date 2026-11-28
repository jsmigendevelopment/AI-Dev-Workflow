// The no-Actions scan (#141, #227, #387, part of #98): text that tells an agent to use, write or wait on a GitHub
// Actions workflow. no-actions-mentions.test.mjs runs it over Markdown, no-actions-code-strings.test.mjs over code.

/**
 * The issue's grep, `grep -ri "workflow\|github actions\|\bCI\b"`, and the Actions words it misses: `gh run`, a
 * required status check and the Actions tab (#227).
 */
const HIT = /workflow|github actions|\bCI\b|\bgh run\b|required status checks?|Actions tab/i;
// Names that hold the word but aren't GitHub Actions: Lighthouse CI (`pnpm lhci`, run locally), npm's clean install, a
// tool's `--ci` flag, the profile's `[workflow]` table, this kit ("a repo that uses this workflow", its old name),
// Cloudflare's and Expo's own Workflows products, the Claude Code Workflow tool, the TanStack pack's Access service
// token (named `<worker> CI`, built in code as `${worker} CI`, and its policy `CI service token`), the title of the
// GitHub page `dependencies` cites, and an existing repo's own CI config in `join`'s two forms only, read as data for
// the commands it runs locally (the text AC-173-3 pins). Removed from the whole line before it is split, so a form can
// name what follows its comma or bracket.
const NOT_ACTIONS = /Lighthouse CI|\bnpm ci\b|--ci\b|\[workflow\]|\b(?:this|the onRails|the kit's) workflow\b|ai-dev-workflow|Cloudflare Workflows|Expo Workflows|\bor Workflows\b|Workflow tool|`<worker> CI`|^… CI$|\bCI service token\b|"About Dependabot on GitHub Actions runners"|\bwhat its CI config(?= runs, run locally\b)|\bany CI config(?= \(data: )/gi;
// A negation word. "Instead" counts only as "instead of", which starts its own clause: a bare "instead" at the end
// means "use this one".
const NEGATION = /\b(?:no|never|not|nothing|neither|nor|ignored?|ignores|instead of|off|removes?|removed|drops?|dropped|replaces?|swaps?)\b|n['’]t\b/i;
// A negation that governs merging, not CI: "Do not merge if CI is red" waits on CI (#227). "No merge waits on a
// workflow" rules the workflow out, so "no" isn't one.
const MERGE_BAN = /\b(?:never|not|nothing)\s+merges?\b|n['’]t\s+merge\b/gi;
/**
 * The hit is about not using Actions: a negation in the same clause, other than one that bans a merge. "Without" after
 * another negation, or in a sentence that bans a merge ("Without CI, never merge"), is a double negative.
 */
function negated(text, mergeBan = false) {
  const other = NEGATION.test(text.replace(MERGE_BAN, ""));
  return /\bwithout\b/i.test(text) ? !(other || mergeBan) : other;
}
// The hit names the local replacement in the same clause. A pack's command name alone isn't one: "CI runs
// `pnpm test:e2e`" names a command, not who runs it.
const LOCAL = /ci = "local"|onrails\/check|\b(?:from|in) (?:the|your|its own|the agent's|this) session\b|\blocal gate\b|\blocally\b|\bci local\b|Checks: (?:pass|fail)/i;
// The person's own opt-in: a clause only for repos whose docs/stack.md says ci = "actions".
export const OPT_IN = /ci = "actions"/;
/** A real opt-in names `ci = "actions"` with no negation before it, so "Not on ci = "actions"" isn't one. */
function optsIn(text) {
  const at = text.search(OPT_IN);
  return at >= 0 && !negated(text.slice(0, at));
}

// A link is a cited source; the sentence around it is what's judged.
const URL_TEXT = /https?:\/\/\S+/g;

/** Each sentence of a line, and each cell of a table row. */
export const sentences = (line) => line.split(/\s\|\s|(?<=[.!?:])\s+(?=[A-Z`*"(])/);
/**
 * Each clause of a sentence: split at a comma, a semicolon, a colon, an opening bracket or a dash (a spaced hyphen too),
 * and before and, then, until, till, unless, while, so, because, or, rather than, before, after or instead of. "Instead
 * of" stays with what follows it, since that is what it rules out.
 */
const clauses = (sentence) =>
  sentence.split(/[,;:(\u2014\u2013]|\s-\s|\s(?=(?:and|then|until|till|unless|while|so|because|or|rather than|before|after|instead of)\b)/i);

/**
 * Each line with what its section says about it: `never` under a heading that is exactly Never (a list of what not to
 * do), `optIn` when the heading opts in to `ci = "actions"`, or the first sentence of the paragraph right under it starts
 * "Only" and does. A section runs to the next heading of its level or higher, so a file whose title's lead paragraph
 * says so is opt-in throughout.
 */
function withSections(text) {
  const lines = text.split("\n");
  const out = [];
  let stack = [];
  // The mark that opened the code block. As in CommonMark, only a bare mark of the same character, at least as long,
  // closes it (#387).
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const mark = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (mark && !fence) fence = mark[1];
    else if (mark && mark[1][0] === fence?.[0] && mark[1].length >= fence.length && !mark[2].trim()) fence = null;
    const fenced = fence !== null;
    // A `# comment` in a code block isn't a heading.
    const heading = fenced ? null : /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (heading) {
      const level = heading[1].length;
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      let lead = "";
      for (; j < lines.length && lines[j].trim() && !/^#{1,6}\s/.test(lines[j]); j++) lead += `${lines[j]}\n`;
      stack = stack.filter((s) => s.level < level);
      const first = clauses(sentences(lead.replace(/^\*\*[^*]*\*\*\s*/, ""))[0])[0];
      // "Only on ci = actions" sets a condition. "Only the person turns on ci = actions" states a fact (#227), and so
      // does a first clause without the name ("Only for the person: they turn on ..."); "Only if ci = actions is off"
      // sets the opposite condition (#387).
      const optIn = optsIn(heading[2]) || (/^Only (?:on|for|when|with|in|if)\b/.test(first) && OPT_IN.test(first) && !negated(first));
      stack.push({ level, never: heading[2].trim() === "Never", optIn });
    }
    out.push({ line: lines[i], never: stack.some((s) => s.never), optIn: stack.some((s) => s.optIn) });
  }
  return out;
}

/** The clauses in text that mention Actions or CI and are neither about not using them nor name the local replacement. */
export function badMentions(text) {
  const out = [];
  for (const { line, never, optIn } of withSections(text)) {
    if (never || optIn) continue;
    // A merge ban carries past a colon into the sentence it opens: "Don't merge: CI hasn't finished." (#451).
    let afterColon = false;
    for (const sentence of sentences(line.replace(URL_TEXT, "").replace(NOT_ACTIONS, ""))) {
      const mergeBan = afterColon || sentence.search(MERGE_BAN) >= 0;
      afterColon = mergeBan && sentence.endsWith(":");
      for (const c of clauses(sentence)) {
        const hit = HIT.exec(c);
        if (!hit) continue;
        // In a sentence that bans a merge, a negation after the hit says what CI's state is ("Never merge if CI hasn't
        // passed"), so only the clause up to the hit is judged (#387).
        const judged = mergeBan ? c.slice(0, hit.index + hit[0].length) : c;
        if (negated(judged, mergeBan) || LOCAL.test(c) || optsIn(c)) continue;
        out.push(c.trim());
      }
    }
  }
  return out;
}

// A `/` after one of these words starts a regex literal, as it does after any token that isn't a value.
const BEFORE_REGEX = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
const WORD = /[\w$]+/y;
const ESCAPES = { n: "\n", t: " ", r: "" };

/**
 * A comment's lines as Markdown reads them: a wrapped line joins the one before it, and a blank line, a list item or an
 * indented line starts a new one. So a sentence wrapped over two lines is judged whole.
 */
const unwrap = (lines) =>
  lines.reduce((out, l) => {
    if (!l.trim()) out.push("");
    else if (/^\s{2,}\S|^\s*(?:[-*]|\d+\.)\s/.test(l) || !out.length || !out.at(-1)) out.push(l.trim());
    else out[out.length - 1] += ` ${l.trim()}`;
    return out;
  }, []).join("\n");

/**
 * The comments and string literals of JavaScript, TypeScript, JSX or JSONC source, one piece each. A run of `//` lines
 * is one piece, and a template literal is one piece with `…` where each `${}` was. Code, regex literals and JSX text
 * are left out.
 */
function scriptText(src) {
  const pieces = [];
  let run = null;
  const flush = () => {
    if (run) pieces.push(unwrap(run));
    run = null;
  };
  // Each open `${`: its brace depth, and the template's text before it.
  const open = [];
  // The last token was a value, so a `/` after it divides.
  let value = false;
  let prev = "";
  let i = 0;
  const escaped = () => {
    const c = src[i + 1] ?? "";
    i += 2;
    return ESCAPES[c] ?? c;
  };
  // A quote that isn't closed on its line (an apostrophe in JSX text) ends there.
  const quoted = (end) => {
    let text = "";
    for (i++; i < src.length && src[i] !== end && src[i] !== "\n"; ) text += src[i] === "\\" ? escaped() : src[i++];
    i++;
    pieces.push(text);
    value = true;
  };
  const template = (text) => {
    while (i < src.length && src[i] !== "`") {
      if (src.startsWith("${", i)) {
        open.push({ depth: 0, text: `${text}…` });
        i += 2;
        value = false;
        return;
      }
      text += src[i] === "\\" ? escaped() : src[i++];
    }
    i++;
    pieces.push(text);
    value = true;
  };
  const regex = () => {
    let inClass = false;
    for (i++; i < src.length && src[i] !== "\n"; i++) {
      if (src[i] === "\\") i++;
      else if (src[i] === "[") inClass = true;
      else if (src[i] === "]") inClass = false;
      else if (src[i] === "/" && !inClass) break;
    }
    WORD.lastIndex = ++i;
    i += WORD.exec(src)?.[0].length ?? 0;
    value = true;
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (src.startsWith("//", i)) {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      // A comment after code on its line stands alone: it never joins the comment lines below it.
      const trailing = src.slice(src.lastIndexOf("\n", i) + 1, i).trim() !== "";
      if (trailing) flush();
      (run ??= []).push(src.slice(i + 2, stop));
      if (trailing) flush();
      i = stop;
    } else {
      flush();
      if (src.startsWith("/*", i)) {
        const end = src.indexOf("*/", i + 2);
        const stop = end < 0 ? src.length : end;
        pieces.push(unwrap(src.slice(i + 2, stop).split("\n").map((l) => l.replace(/^\s*\*?/, ""))));
        i = stop + 2;
      } else if (c === '"' || c === "'") quoted(c);
      else if (c === "`") {
        i++;
        template("");
      } else if (c === "/" && !value && prev !== "<") regex();
      else if (/[\w$]/.test(c)) {
        WORD.lastIndex = i;
        prev = WORD.exec(src)[0];
        i += prev.length;
        value = !BEFORE_REGEX.test(prev);
      } else if (c === "}" && open.at(-1)?.depth === 0) {
        i++;
        template(open.pop().text);
      } else {
        if (open.length && (c === "{" || c === "}")) open.at(-1).depth += c === "{" ? 1 : -1;
        value = c === ")" || c === "]" || c === "}";
        prev = c;
        i++;
      }
    }
  }
  flush();
  return pieces;
}

const indentOf = (line) => /^\s*/.exec(line)[0].length;
// What a YAML line holds after its `- ` marks and its `key:`. The value is `[\s\S]*`, not `.*`: a stray `\r` or U+2028
// in a line (the split is on `\n`) must still match, or `exec` returns null.
const YAML_VALUE = /^\s*(?:-\s+)*(?:(?:"[^"]*"|'[^']*'|[^\s#'"[{][^#]*?):(?:\s+|$))?([\s\S]*)$/;
const BLOCK_HEADER = /^[|>][+-]?\d?[+-]?$/;

/**
 * The plain or block value a YAML line holds: `{ text }` for a plain one, `{ block }` (`|` or `>`) for a block scalar,
 * and null for none. A quoted or flow value is read by the quote scan instead.
 */
function yamlValue(line) {
  const value = YAML_VALUE.exec(line)[1].replace(/(?:^|\s)#.*$/, "").trim();
  if (BLOCK_HEADER.test(value)) return { block: value[0] };
  return !value || /^["'[{&*!%@`]/.test(value) ? null : { text: value };
}

/**
 * Reads the value on lines[n] and the lines under it (#451): a block scalar runs over every deeper line, a plain one
 * over the deeper non-blank lines that continue it. A `|` block keeps its lines apart, since they are a script's; a `>`
 * block and a plain value join a wrapped line. Returns the last line used.
 */
function readYamlValue(lines, n, pieces) {
  const value = yamlValue(lines[n]);
  if (!value) return n;
  const lead = indentOf(lines[n]);
  const deeper = (l) => indentOf(l) > lead && (value.block ? true : !/^\s*#/.test(l));
  const body = [];
  let end = n;
  while (end + 1 < lines.length && (lines[end + 1].trim() ? deeper(lines[end + 1]) : value.block)) body.push(lines[++end].trim());
  if (value.block === "|") pieces.push(body.join("\n"));
  else pieces.push(unwrap(value.block ? body : [value.text, ...body]));
  return end;
}

/**
 * The `#` comments and quoted strings of YAML or TOML, one piece each, and for YAML its plain and block values. A run
 * of comment lines is one piece.
 */
function hashText(src, yaml) {
  const pieces = [];
  let run = [];
  // A CRLF file reads like its LF twin.
  const lines = src.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (/^\s*#/.test(line)) {
      run.push(line.replace(/^\s*#/, ""));
      continue;
    }
    if (run.length) pieces.push(unwrap(run));
    run = [];
    let quote = null;
    let text = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === "\\" && quote === '"') text += line[++i] ?? "";
        else if (c === quote) {
          pieces.push(text);
          quote = null;
          text = "";
        } else text += c;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        pieces.push(line.slice(i + 1));
        break;
      } else if ((c === '"' || c === "'") && (i === 0 || /[\s:[{,=]/.test(line[i - 1]))) quote = c;
    }
    if (yaml) n = readYamlValue(lines, n, pieces);
  }
  if (run.length) pieces.push(unwrap(run));
  return pieces;
}

/**
 * The comments and string literals of a code file at path, never its code (#387), and the plain and block values of a
 * YAML file (#451). A string with no space in it is a name, a key, a path or a flag, so it isn't read either: `ci`,
 * `CI_ACTIONS` and `.github/workflows/` are code.
 */
function codeText(source, path) {
  const pieces = /\.(?:ya?ml|toml)$/.test(path) ? hashText(source, /\.ya?ml$/.test(path)) : scriptText(source);
  return pieces.filter((p) => /\S\s+\S/.test(p));
}

// In code text, a lowercase `ci` is the docs/stack.md key or part of a file name, never the service: a backticked `ci`,
// a hyphenated name (`ci-mode.ts`, `preflight-ci.mjs`) or a quoted value of the key (`ci = "…"`, `ci = "actions-later"`).
// Any other lowercase `ci` ("// wait for ci", "// wait for ci = done") is read. `ci = "actions"` and `ci = "local"`
// stay, since they say which mode a line runs on (#451).
const CI_KEY = /(?:(?<=[`-])ci\b|\bci(?=-)|\bci(?= = "))(?! = "(?:actions|local)")/g;
// A message's plural mark, as in `file(s)`, opens no clause.
const PLURAL = /\(s\)/g;

/** badMentions over each comment and string literal of a code file. */
export const codeMentions = (source, path) =>
  codeText(source, path).flatMap((p) => badMentions(p.replace(CI_KEY, "key").replace(PLURAL, "s")));
