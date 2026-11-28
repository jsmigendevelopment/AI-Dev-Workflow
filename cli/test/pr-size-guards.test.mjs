// #407: pr-size.mjs follow-ups (#377). A file of no known binary type that holds a NUL, a pull request entry GitHub
// couldn't diff, or a git error never passes; an empty file isn't binary; a reason in a script or style block is hidden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { HEAD, SCRIPTS, checkout, git } from "./pr-rules-fakes.mjs";

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n") + "\n";
const entry = (filename, status = "added") => ({ filename, status, additions: 0, deletions: 0 });
const contents = (path, text) => ({ [`repos/acme/app/contents/${path}?ref=${HEAD}`]: { type: "file", size: Buffer.byteLength(text), encoding: "base64", content: Buffer.from(text).toString("base64") } });

/** Commits `files` ({ path: text }) on a branch off main in `dir`; `remove` lists paths the branch deletes. */
function branch(dir, files, remove = []) {
  git(dir, "branch", "-M", "main");
  git(dir, "switch", "-q", "-c", "fix/5-share");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  if (remove.length) git(dir, "rm", "-q", ...remove);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "branch");
}

/** pr-size.mjs --base main on a branch that commits `files`; `env` is the child's environment. */
function local(files, { dir = checkout(), remove = [], env = safeEnv() } = {}) {
  branch(dir, files, remove);
  return spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "--base", "main"], { cwd: dir, encoding: "utf8", env });
}

/** pr-size.mjs on pull request 9 of acme/app, with GitHub's file `entries`, `body`, `labels` and extra fake `api` answers. */
function pull({ entries, body = "Closes #5", labels = [], api = {} }) {
  const dir = checkout();
  const base = git(dir, "rev-parse", "HEAD").trim();
  const pr = { number: 9, body, labels: labels.map((name) => ({ name })), changed_files: entries.length, base: { ref: "main", sha: base }, head: { sha: HEAD } };
  const fake = fakeGh(tmp("onrails-gh-"), { "repos/acme/app/pulls/9": pr, "repos/acme/app/pulls/9/files": entries, ...api });
  return spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "9", "--repo", "acme/app"], { cwd: dir, encoding: "utf8", env: fake.env });
}

const nul = `\0${lines(1500)}`;

test("AC-407-1: WHEN a .md or extensionless file in the diff holds a NUL THEN the size check exits 2 and names it", unixOnly, () => {
  for (const name of ["docs/notes.md", "scripts/run"]) {
    const r = local({ [name]: nul, "src/b.ts": lines(10) });
    assert.equal(r.status, 2, `${name}: ${r.stdout}`);
    assert.ok(r.stderr.includes(`${name} is a file of no known binary type that shows as binary`), `${name}: ${r.stderr}`);
    const pr = pull({ entries: [entry(name), { filename: "src/b.ts", status: "added", additions: 10, deletions: 0 }], api: contents(name, nul) });
    assert.equal(pr.status, 2, `${name} in a pull request: ${pr.stdout}`);
    assert.ok(pr.stderr.includes(name), pr.stderr);
  }
  // A known binary type still counts 0 and passes, and a deleted file holding a NUL hides nothing.
  const image = local({ "public/logo.png": nul, "public/font.woff2": nul, "src/b.ts": lines(10) });
  assert.equal(image.status, 0, image.stderr);
  assert.match(image.stdout, /Binary files, not counted:\n {2}public\/font\.woff2\n {2}public\/logo\.png/);
  const dir = checkout();
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs", "old.md"), nul);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "an old file");
  const gone = local({ "src/b.ts": lines(10) }, { dir, remove: ["docs/old.md"] });
  assert.equal(gone.status, 0, gone.stderr);
});

test("AC-407-2: WHEN a PR entry for a source file is 0/0 with no patch and non-empty content THEN it exits 2", unixOnly, () => {
  for (const status of ["added", "modified"]) {
    const r = pull({ entries: [entry("src/a.ts", status)], api: contents("src/a.ts", lines(1500)) });
    assert.equal(r.status, 2, `${status}: ${r.stdout}`);
    assert.match(r.stderr, /src\/a\.ts shows 0 lines added and 0 removed with no patch, but isn't empty, so its lines can't be counted/, status);
  }
  // A mode change or a pure rename with no NUL, and an empty file, still pass.
  const mode = pull({ entries: [entry("src/run.sh", "changed")], api: contents("src/run.sh", lines(1500)) });
  assert.equal(mode.status, 0, mode.stderr);
  const moved = pull({ entries: [{ ...entry("src/b.ts", "renamed"), previous_filename: "src/a.ts" }], api: contents("src/b.ts", lines(1500)) });
  assert.equal(moved.status, 0, moved.stderr);
  const empty = pull({ entries: [entry("src/empty.ts")], api: contents("src/empty.ts", "") });
  assert.equal(empty.status, 0, empty.stderr);
});

// A git that fails `cat-file -s` and `cat-file --batch-check` the way a broken object store does, and runs the real
// one for everything else.
const BROKEN_GIT = `#!/bin/sh
case " $* " in *" cat-file -s "*|*" cat-file --batch-check "*) echo "fatal: unable to read object" >&2; exit 128;; esac
exec "$REAL_GIT" "$@"
`;

test("AC-407-3: WHEN git cat-file fails for a reason other than a missing path THEN it exits 2", unixOnly, () => {
  const bin = tmp("onrails-git-");
  writeFileSync(join(bin, "git"), BROKEN_GIT);
  chmodSync(join(bin, "git"), 0o755);
  const realGit = join(git(bin, "--exec-path").trim(), "git");
  const r = local({ "public/logo.png": nul, "src/b.ts": lines(10) }, { env: safeEnv({ REAL_GIT: realGit }, { bins: [bin] }) });
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /Couldn't count the size: git cat-file/);
});

test("#407 item 4: an empty new file of no known type isn't listed as binary in a pull request", unixOnly, () => {
  const r = pull({ entries: [entry("public/.gitkeep"), { filename: "src/b.ts", status: "added", additions: 10, deletions: 0 }], api: contents("public/.gitkeep", "") });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Binary files/);
});

test("#407 item 6: a Size exception line inside a script or style block doesn't count", unixOnly, () => {
  const big = [{ filename: "src/a.ts", status: "added", additions: 1200, deletions: 0 }];
  for (const block of ["<script>\nSize exception: hidden\n</script>", "<style type=\"text/css\">\nSize exception: hidden\n</style>", "<SCRIPT>\nSize exception: hidden"]) {
    const r = pull({ entries: big, labels: ["size-exception"], body: `Closes #5\n\n${block}\n` });
    assert.equal(r.status, 1, `${block}: ${r.stdout}`);
    assert.doesNotMatch(r.stdout, /hidden/, block);
  }
  const shown = pull({ entries: big, labels: ["size-exception"], body: "<style>p {}</style>\nSize exception: generated API types\n" });
  assert.equal(shown.status, 0, shown.stderr);
});
