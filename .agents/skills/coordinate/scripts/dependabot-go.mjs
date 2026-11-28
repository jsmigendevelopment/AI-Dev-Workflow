// The Go half of dependabot-bump.mjs (#531): does a bump of go.mod and go.sum only raise the versions of requirements
// the merge base already had? Strict by design: a line this file can't read, in any shape Go's own parser might read
// differently, is refused, so a bump never passes on a guess. What Go's parser accepts and this one doesn't (quoted
// paths, Windows line endings, tokens stuck to a comment) only costs a person's review.
// - go.mod is read at the merge base and the head as a list of statements. Blocks (`require ( ... )`) and one-line
//   directives give the same statements, and order and blank lines mean nothing to Go, so neither does to this.
// - Every statement but a `require` must be at the head exactly as at the merge base: the module, go and toolchain
//   lines, godebug, tool, ignore, replace, exclude, retract, and every comment. A new one, a changed one or a missing one
//   is named by its line.
// - Each `require` is `<module path> <version>`, with `// indirect` or any comment kept as it was. A path at the head
//   must be a path the merge base had, only its version may differ, and each version is a canonical semantic version.
// - go.sum: every line not at the merge base is `<module> <version> h1:<hash>` or `<module> <version>/go.mod h1:<hash>`.
//   Lines gone from it are fine (`go mod tidy` drops the old versions'). Go checks each hash against the module
//   proxy's checksum database, so a line for a module go.mod doesn't require does nothing.
// Each check returns why the change is more than a version bump, or null, like manifestChange and lockfileChange.

/** go.mod or go.sum, at any depth, the way `go` finds them. */
export const GO_FILE = /(?:^|\/)go\.(?:mod|sum)$/;
const GO_MOD = /(?:^|\/)go\.mod$/;
const DIRECTIVES = new Set(["module", "go", "toolchain", "godebug", "require", "exclude", "replace", "retract", "tool", "ignore"]);
// Characters a statement's words may hold: module paths and versions, `=>`, a retract range's brackets and commas,
// godebug's `key=value`. No quote, backtick, parenthesis, colon, star or space, so no word reads two ways.
const WORD = /^[A-Za-z0-9._~+/=>[\],-]+$/;
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/;
const ELEMENT = /^[A-Za-z0-9_~-](?:[A-Za-z0-9._~-]*[A-Za-z0-9_~-])?$/;
const DOMAIN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const IDS = String.raw`[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*`;
const NR = String.raw`(?:0|[1-9]\d*)`;
// A canonical Go version: vMAJOR.MINOR.PATCH with an optional prerelease and +build, as releases, pseudo-versions and
// +incompatible are written. No branch name, no "latest", no short form.
const VERSION = new RegExp(String.raw`^v${NR}\.${NR}\.${NR}(?:-${IDS})?(?:\+${IDS})?$`);
const HASH = /^h1:[A-Za-z0-9+/]{43}=$/;
const CHANGES = new Set(["module", "go", "toolchain"]);

/** A module path with a domain-like first element and plain elements, as `go` requires of a dependency. */
function modulePath(path) {
  const [first, ...rest] = path.split("/");
  return DOMAIN.test(first) && rest.every((e) => ELEMENT.test(e));
}

const quoted = (row) => JSON.stringify(row.trim());
const text = (s) => (s.kind === "comment" ? s.comment : [s.kind, ...s.args].join(" ") + (s.comment ? ` ${s.comment}` : ""));

/** A go.mod read as statements `{ n, kind, args, comment }`, or `{ error }` for the first line it can't read. */
function parse(source, where) {
  const bad = (n, row, why = "isn't a line this gate reads") => ({ error: `${where}line ${n} ${why}: ${quoted(row)}` });
  const rows = source.split("\n");
  if (rows.at(-1) === "") rows.pop();
  const out = [];
  let open = null;
  for (const [i, row] of rows.entries()) {
    const n = i + 1;
    if (CONTROL.test(row)) return bad(n, row);
    const at = row.indexOf("//");
    // A comment starts a word of its own: a "//" stuck to one is read differently by different parsers.
    if (at > 0 && !/[ \t]/.test(row[at - 1])) return bad(n, row);
    const comment = at >= 0 ? row.slice(at) : "";
    const words = (at >= 0 ? row.slice(0, at) : row).split(/[ \t]+/).filter(Boolean);
    if (!words.length) {
      if (comment) out.push({ n, kind: "comment", args: [], comment });
      continue;
    }
    if (open && words.length === 1 && words[0] === ")") {
      if (comment) return bad(n, row);
      open = null;
      continue;
    }
    const [head, ...rest] = open ? ["", ...words] : words;
    if (!open && !DIRECTIVES.has(head)) return bad(n, row);
    if (!open && rest.length === 1 && rest[0] === "(") {
      if (comment) return bad(n, row);
      open = { kind: head, n };
      continue;
    }
    if (!rest.length || !rest.every((w) => WORD.test(w))) return bad(n, row);
    const statement = { n, kind: open ? open.kind : head, args: rest, comment };
    if (statement.kind === "require" && !(rest.length === 2 && modulePath(rest[0]) && VERSION.test(rest[1]))) return bad(n, row, "isn't a require of a module path and a version");
    out.push(statement);
  }
  if (open) return { error: `${where}line ${open.n} opens a ${open.kind} block that never closes` };
  const seen = new Set();
  for (const s of out.filter((x) => x.kind === "require")) {
    if (seen.has(s.args[0])) return { error: `${where}line ${s.n} requires ${s.args[0]} twice` };
    seen.add(s.args[0]);
  }
  return { statements: out };
}

/** Why a go.mod, read at both ends, changes more than the versions of requirements it had, or null. */
export function goModChange(before, after) {
  const head = parse(after, "");
  if (head.error) return head.error;
  const base = parse(before, "at the merge base, ");
  if (base.error) return base.error;
  const baseRequires = new Map(base.statements.filter((s) => s.kind === "require").map((s) => [s.args[0], s]));
  const left = Map.groupBy(base.statements.filter((s) => s.kind !== "require"), text);
  const kept = new Set();
  for (const s of head.statements) {
    if (s.kind === "require") {
      const old = baseRequires.get(s.args[0]);
      if (!old) return `line ${s.n} adds the module path ${s.args[0]}: ${quoted(text(s))}`;
      if (old.comment !== s.comment) return `line ${s.n} changes the comment of ${s.args[0]}: ${quoted(text(s))}`;
      kept.add(old);
      continue;
    }
    const same = left.get(text(s));
    if (same?.length) {
      kept.add(same.shift());
      continue;
    }
    return CHANGES.has(s.kind) ? `line ${s.n} changes the ${s.kind} line to ${quoted(text(s))}` : `line ${s.n} adds the ${s.kind === "comment" ? "comment" : `${s.kind} line`} ${quoted(text(s))}`;
  }
  const gone = base.statements.find((s) => !kept.has(s));
  return gone ? `removes line ${gone.n} of the merge base, ${quoted(text(gone))}` : null;
}

/** Why a go.sum has a new line that isn't a module proxy hash, or null. Lines already at the merge base aren't judged. */
export function goSumChange(before, after) {
  const old = new Set(before.split("\n").filter(Boolean));
  const rows = after.split("\n");
  if (rows.at(-1) === "") rows.pop();
  for (const [i, row] of rows.entries()) {
    if (old.has(row)) continue;
    const [path, version, hash, ...extra] = row.split(" ");
    const ok = !extra.length && HASH.test(hash ?? "") && modulePath(path) && VERSION.test((version ?? "").replace(/\/go\.mod$/, ""));
    if (!ok) return `line ${i + 1} isn't a go.sum line of the form <module> <version> h1:<hash>: ${quoted(row)}`;
  }
  return null;
}

export const goChange = (path) => (GO_MOD.test(path) ? goModChange : goSumChange);
