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
// - A bump of a path that a `replace` or `exclude` line of the merge base names on its left is refused (#581): the line
//   may pin one version, and the new version can switch it on, or the old version's pin off, with no line changing.
// - go.sum: every line not at the merge base is `<module> <version> h1:<hash>` or `<module> <version>/go.mod h1:<hash>`,
//   and its `<module> <version>[/go.mod]` isn't one the merge base has with another hash (#581). Lines gone from it are
//   fine (`go mod tidy` drops the old versions'). Go compares the downloaded bytes with every go.sum line for that
//   version and asks the checksum database only when a line is missing, so a line for a module go.mod doesn't require
//   does nothing, and a second hash for a version can only fail a build.
// - Only the go.mod and go.sum of a module count: one under a `vendor/` or `testdata/` folder, which Go ignores, is
//   refused as any other file is (#581).
// - A refusal quotes at most 200 characters of a line, so a huge line can't fill a comment (#581).
// Each check returns why the change is more than a version bump, or null, like manifestChange and lockfileChange.

const GO_NAME = /(?:^|\/)go\.(?:mod|sum)$/;
// Folders `go` skips: what is in one is a copy or a fixture, never the module being bumped. Any letter case, since a
// case-insensitive file system reads Vendor/ as vendor/.
const SKIPPED = /(?:^|\/)(?:vendor|testdata)\//i;
const CAP = 200;

/** go.mod or go.sum, at any depth, the way `go` finds them: not one under vendor/ or testdata/ (#581). */
export const isGoFile = (path) => GO_NAME.test(path) && !SKIPPED.test(path);
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

/** At most 200 characters of a line, so a reason stays short however long the line is. */
const clip = (row) => (row.length > CAP ? `${row.slice(0, CAP)}...` : row);
const quoted = (row) => JSON.stringify(clip(row.trim()));
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
    if (seen.has(s.args[0])) return { error: `${where}line ${s.n} requires ${clip(s.args[0])} twice` };
    seen.add(s.args[0]);
  }
  return { statements: out };
}

/**
 * Why a bump changes what a replace or exclude of the merge base applies to, or null: a path on the left of one, whose
 * version the bump changes. A line that pins one version is switched on by the new version and off by the old one's
 * going, and one with no version covers every version, so a person looks at each (#581).
 */
function switchedOn(baseStatements, baseRequires, headStatements) {
  const named = new Map();
  for (const s of baseStatements) if ((s.kind === "replace" || s.kind === "exclude") && !named.has(s.args[0])) named.set(s.args[0], s);
  for (const s of headStatements.filter((x) => x.kind === "require")) {
    const line = named.get(s.args[0]);
    const old = baseRequires.get(s.args[0]);
    if (line && old.args[1] !== s.args[1]) {
      return `bumps ${clip(s.args[0])} from ${clip(old.args[1])} to ${clip(s.args[1])}, a path line ${line.n} of the merge base names in a ${line.kind}: ${quoted(text(line))}`;
    }
  }
  return null;
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
      if (!old) return `line ${s.n} adds the module path ${clip(s.args[0])}: ${quoted(text(s))}`;
      if (old.comment !== s.comment) return `line ${s.n} changes the comment of ${clip(s.args[0])}: ${quoted(text(s))}`;
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
  return gone ? `removes line ${gone.n} of the merge base, ${quoted(text(gone))}` : switchedOn(base.statements, baseRequires, head.statements);
}

/** Why a go.sum has a new line that isn't a module proxy hash, or rehashes a version the merge base has, or null. Lines already at the merge base aren't judged. */
export function goSumChange(before, after) {
  const oldRows = before.split("\n").filter(Boolean);
  const old = new Set(oldRows);
  // `<module> <version>[/go.mod]` to the merge base's first line for it: Go writes one hash for it, never two.
  const pinned = new Map();
  for (const [i, row] of oldRows.entries()) {
    const key = row.split(" ").slice(0, 2).join(" ");
    if (!pinned.has(key)) pinned.set(key, i + 1);
  }
  const rows = after.split("\n");
  if (rows.at(-1) === "") rows.pop();
  for (const [i, row] of rows.entries()) {
    if (old.has(row)) continue;
    const [path, version, hash, ...extra] = row.split(" ");
    const ok = !extra.length && HASH.test(hash ?? "") && modulePath(path) && VERSION.test((version ?? "").replace(/\/go\.mod$/, ""));
    if (!ok) return `line ${i + 1} isn't a go.sum line of the form <module> <version> h1:<hash>: ${quoted(row)}`;
    const at = pinned.get(`${path} ${version}`);
    if (at) return `line ${i + 1} has another hash than line ${at} of the merge base for the same module version: ${quoted(row)}`;
  }
  return null;
}

export const goChange = (path) => (GO_MOD.test(path) ? goModChange : goSumChange);
