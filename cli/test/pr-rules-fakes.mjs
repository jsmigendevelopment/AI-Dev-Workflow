// The fixture for pr-rules.mjs (#225): main's checkout as a temp git repo whose one commit holds copies of the
// coordinate scripts and `attributes` as its .gitattributes, and a fake gh that answers for pull request 9 of acme/app.
// The script reads main's attributes from the checkout that holds it, so each run copies it into one.
import { execFileSync, spawnSync } from "./child.mjs";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeGh, safeEnv, tmp } from "./helpers.mjs";

export const HEAD = "d".repeat(40);
export const SCRIPTS = ".agents/skills/coordinate/scripts";
const source = (name) => fileURLToPath(new URL(`../../${SCRIPTS}/${name}`, import.meta.url));

/** git in `dir`, with no global or system config, for setting up a fixture. Its output as text. */
export const git = (dir, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8", env: safeEnv({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }) });

/** Main's checkout: one commit with the scripts and `attributes` as its .gitattributes. Returns its folder. */
export function checkout(attributes = "") {
  const dir = tmp("onrails-rules-");
  git(dir, "init", "-q");
  mkdirSync(join(dir, SCRIPTS), { recursive: true });
  for (const name of ["pr-rules.mjs", "agent-files.mjs"]) copyFileSync(source(name), join(dir, SCRIPTS, name));
  writeFileSync(join(dir, ".gitattributes"), attributes);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "main");
  return dir;
}

// A fake git that logs its config variables, the names of the token variables it got and its arguments, then runs
// the real one. A shell script, so it starts nothing but git. With FAKE_GIT_IGNORECASE set, a `git init` also sets
// core.ignorecase=true in the new repo, as git does on a case-insensitive disk (the macOS default).
const FAKE_GIT = `#!/bin/sh
tokens=$(env | sed -n 's/^\\([A-Za-z0-9_]*[Tt][Oo][Kk][Ee][Nn][A-Za-z0-9_]*\\)=.*/\\1/p' | tr '\\n' ' ')
printf '%s\\t%s\\t%s\\t%s\\t%s\\n' "\${GIT_CONFIG_GLOBAL-}" "\${GIT_CONFIG_NOSYSTEM-}" "\${GIT_ATTR_NOSYSTEM-}" "$tokens" "$*" >> "$FAKE_GIT_LOG"
if [ -n "\${FAKE_GIT_IGNORECASE-}" ]; then
  for last; do :; done
  case " $* " in *" init "*) "$REAL_GIT" "$@" || exit $?; exec "$REAL_GIT" -C "$last" config core.ignorecase true;; esac
fi
exec "$REAL_GIT" "$@"
`;

const listed = (files) => files.map(([filename, additions, deletions, previous_filename]) => ({ filename, additions, deletions, ...(previous_filename ? { status: "renamed", previous_filename } : {}) }));
const total = (files, i) => files.reduce((sum, f) => sum + f[i], 0);

/** Runs main's pr-rules.mjs on pull request 9: from `branch`, with `body`, `labels` and the files changed ([name,
 * additions, deletions, old name of a rename]). `changed`, `additions` and `deletions` are GitHub's totals, from the
 * list by default. `again` changes the answers from the second read on ({ pull, files }). `env` adds variables, and
 * `logGit` puts the fake git first on PATH; `gitCalls()` reads its log. `ignorecase` puts it there too, and makes its
 * `init` set core.ignorecase=true. */
export function rules({ body = "Adds sharing.\n\nCloses #5", branch = "feat/5-share", labels = [], author = "builder", files = [["src/a.ts", 10, 5]], changed, additions, deletions, sha = HEAD, attributes = "", args = ["9", "--repo", "acme/app", "--head", HEAD], again, dir = checkout(attributes), cwd = dir, env = {}, logGit = false, ignorecase = false } = {}) {
  const pull = {
    number: 9, body, user: { login: author }, labels: labels.map((name) => ({ name })), head: { ref: branch, sha },
    changed_files: changed === undefined ? files.length : changed,
    additions: additions === undefined ? total(files, 1) : additions,
    deletions: deletions === undefined ? total(files, 2) : deletions,
  };
  const fakes = tmp("onrails-gh-");
  const gitLog = join(fakes, "git.log");
  const fakeGit = logGit || ignorecase;
  const fake = fakeGh(fakes, {
    "repos/acme/app/pulls/9": again?.pull ? { sequence: [pull, { ...pull, ...again.pull }] } : pull,
    "repos/acme/app/pulls/9/files": again?.files ? { sequence: [listed(files), listed(again.files)] } : listed(files),
  }, { ...env, ...(fakeGit ? { FAKE_GIT_LOG: gitLog, REAL_GIT: join(git(fakes, "--exec-path").trim(), "git") } : {}), ...(ignorecase ? { FAKE_GIT_IGNORECASE: "1" } : {}) });
  if (fakeGit) {
    writeFileSync(join(fakes, "bin", "git"), FAKE_GIT);
    chmodSync(join(fakes, "bin", "git"), 0o755);
  }
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-rules.mjs"), ...args], { cwd, encoding: "utf8", env: fake.env });
  const gitCalls = () => (existsSync(gitLog) ? readFileSync(gitLog, "utf8").split("\n").filter(Boolean) : []).map((line) => {
    const [global, nosystem, attrNosystem, tokens, args] = line.split("\t");
    return { global, nosystem, attrNosystem, tokens: tokens.trim().split(" ").filter(Boolean), argv: args.split(" ") };
  });
  return { ...r, calls: fake.calls(), gitCalls, dir };
}
