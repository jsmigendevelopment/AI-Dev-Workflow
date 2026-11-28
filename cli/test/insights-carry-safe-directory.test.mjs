// #544: `insights.mjs carry` and `agent-files.mjs gate` find the coordinator's checkout with an isolated git (no global
// config). A checkout owned by another user (a dev container's mounted folder) is then refused as "dubious ownership"
// unless safe.directory names it, and the operator's own entry sits in the global config the isolation drops. Like
// pr-size.mjs (#432, decision 432-1), they name the script's own checkout safe.directory only when the operator's global
// config lists it (or `*`). A fake git (first on PATH) makes git take the checkout for another user's, so git's own
// ownership check runs without chown or root. The git set-up is insights-carry-fakes.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "./child.mjs";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";
import { findCommand } from "../src/system.mjs";
import { at, mergeMain, reviewed } from "./insights-carry-fakes.mjs";
import { ME, SCRIPTS } from "./insights-land-fakes.mjs";

const P = "repos/acme/app";
const NOW = "2026-11-27T14:32:00Z";
const FULL = "## Automation level\n\n- **Level:** full\n";
const ACCESS = { writer: "write" };

/**
 * `script` ("insights.mjs carry ..." or "agent-files.mjs gate ...") in main's checkout, which git takes for another
 * user's. The operator's global config is a fake home: `.gitconfig` lists the checkout's root unless `safe(root)`
 * returns other entries (`files(root)` replaces the home's files). `env(home)` adds variables, `undefined` removes one.
 * The fake git logs each call as "<folder>\t<arguments>\t<GIT_CONFIG_GLOBAL>".
 */
function otherOwner(fx, to, script, { safe = (root) => [root], files, env: extra = () => ({}), owned = false } = {}) {
  const root = realpathSync(fx.dir);
  const fakes = tmp("onrails-owner-");
  const home = join(fakes, "home");
  mkdirSync(join(home, ".config"), { recursive: true });
  const config = files?.(root) ?? { ".gitconfig": `[safe]\n${safe(root).map((entry) => `\tdirectory = ${entry}\n`).join("")}` };
  for (const [path, text] of Object.entries(config)) {
    mkdirSync(dirname(join(home, path)), { recursive: true });
    writeFileSync(join(home, path), text);
  }
  const api = {
    user: { login: ME },
    [`${P}/pulls/40`]: { head: { sha: to }, base: { sha: "e".repeat(40), ref: "main" }, changed_files: 1 },
    [`${P}/pulls/40/files`]: [{ filename: ".agents/skills/build/SKILL.md", status: "modified" }],
    [`${P}/issues/40/comments`]: [{ user: { login: "writer" }, body: `Weakening review: pass @ ${fx.from}` }],
    [`${P}/issues/40/labels`]: [],
    [`${P}/contents/docs/stack.md`]: { type: "file", encoding: "base64", path: "docs/stack.md", content: Buffer.from(FULL).toString("base64") },
    ...Object.fromEntries(Object.entries(ACCESS).map(([login, permission]) => [`${P}/collaborators/${login}/permission`, { permission }])),
  };
  const log = join(fakes, "git.log");
  const fake = fakeGh(fakes, api, {
    ONRAILS_NOW: NOW, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), OTHER_OWNER: owned ? "/nonexistent" : root, FAKE_GIT_LOG: log,
    REAL_GIT: findCommand("git"), GIT_CONFIG_GLOBAL: undefined, GIT_CONFIG_COUNT: undefined, GIT_CONFIG_PARAMETERS: undefined, ...extra(home),
  });
  writeFileSync(join(fakes, "bin", "git"), `#!/bin/sh
printf '%s\\t%s\\t%s\\n' "$PWD" "$*" "\${GIT_CONFIG_GLOBAL-unset}" >> "$FAKE_GIT_LOG"
# The fetch keeps the operator's own config and its remote is a local folder here, which the fake owner would refuse too.
case " $* " in *" fetch "*) ;; *) case "$PWD" in "$OTHER_OWNER"|"$OTHER_OWNER"/*) GIT_TEST_ASSUME_DIFFERENT_OWNER=1; export GIT_TEST_ASSUME_DIFFERENT_OWNER;; esac;; esac
exec "$REAL_GIT" "$@"
`);
  chmodSync(join(fakes, "bin", "git"), 0o755);
  const r = spawnSync(process.execPath, [join(fx.dir, SCRIPTS, script[0]), ...script.slice(1)], { cwd: fx.seed, encoding: "utf8", env: fake.env });
  const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => line.split("\t")) : [];
  return { ...r, root, calls };
}

const carry = (fx, to, options) => otherOwner(fx, to, ["insights.mjs", "carry", "--pr", "40", "--from", fx.from, "--to", to], options);
const gate = (fx, to, options) => otherOwner(fx, to, ["agent-files.mjs", "gate", "40", "--repo", "acme/app", "--head", to], options);
const named = (args) => [...args.matchAll(/safe\.directory=(\S*)/g)].map((m) => m[1]);
const merged = () => {
  const fx = reviewed();
  return { fx, to: mergeMain(fx) };
};
/** carry or gate must go on: the checkout is found, and the merge proved. */
const proved = {
  carry: (r, fx, to, why) => {
    assert.equal(r.status, 0, `${why}: ${r.stdout}${r.stderr}`);
    assert.deepEqual(at(fx.dir, to).map((m) => m.kind).sort(), ["job", "review"], `${why}: the records are in the checkout`);
  },
  gate: (r, fx, to, why) => {
    assert.equal(r.status, 0, `${why}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes(fx.from), `${why}: names the carried sha: ${r.stdout}`);
  },
};
/** The checkout isn't trusted: git's own ownership refusal, and nothing proved. */
const refused = {
  carry: (r, fx, to, why) => {
    assert.equal(r.status, 2, `${why}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /dubious ownership/, why);
    assert.deepEqual(at(fx.dir, to), [], `${why}: writes nothing`);
  },
  gate: (r, fx, to, why) => {
    assert.equal(r.status, 1, `${why}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout + r.stderr, /dubious ownership/, why);
  },
};
const runners = { carry, gate };

for (const [name, run] of Object.entries(runners)) {
  test(`AC-544-1: WHEN the checkout is owned by another user and only the global config lists it THEN ${name} finds the checkout and proves the merge`, unixOnly, () => {
    const { fx, to } = merged();
    proved[name](run(fx, to), fx, to, "listed");
  });

  test(`#544: WHEN the checkout is owned by another user and the global config does not list it THEN ${name} refuses it as before`, unixOnly, () => {
    for (const [why, safe] of Object.entries({ "another folder": () => ["/srv/some/other/checkout"], "no entry": () => [], "a parent and a child": (root) => [dirname(root), `${root}/src`] })) {
      const { fx, to } = merged();
      const r = run(fx, to, { safe });
      refused[name](r, fx, to, why);
      assert.ok(r.calls.every(([, args]) => !/safe\.directory=/.test(args)), `${why}: no call names a trusted folder`);
    }
  });

  test(`#544: a global safe.directory of * is read as git reads it, so ${name} finds the checkout`, unixOnly, () => {
    const { fx, to } = merged();
    const r = run(fx, to, { safe: () => ["*"] });
    proved[name](r, fx, to, "wildcard");
    for (const [, args] of r.calls.filter(([cwd]) => cwd === r.root)) assert.ok(!named(args).includes("*"), `the wildcard is never passed on: git ${args}`);
  });

  test(`#544: an empty safe.directory clears the list before it, as in git, so ${name} refuses the cleared root and finds a later one`, unixOnly, () => {
    const cleared = merged();
    refused[name](run(cleared.fx, cleared.to, { safe: (root) => [root, ""] }), cleared.fx, cleared.to, "cleared after the root");
    const later = merged();
    proved[name](run(later.fx, later.to, { safe: (root) => ["", root] }), later.fx, later.to, "listed after the clear");
  });

  test(`#544: WHEN GIT_CONFIG_GLOBAL is empty, HOME is unset, or the operator's GIT_CONFIG_COUNT clears the list THEN ${name} refuses, as git refuses`, unixOnly, () => {
    const listed = (root) => ({ ".gitconfig": `[safe]\n\tdirectory = ${root}\n`, ".config/git/config": `[safe]\n\tdirectory = ${root}\n` });
    const forms = {
      "GIT_CONFIG_GLOBAL is empty": { GIT_CONFIG_GLOBAL: "" },
      "HOME is unset": { HOME: undefined },
      "GIT_CONFIG_COUNT clears safe.directory": { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: "" },
      "GIT_CONFIG_PARAMETERS is set": { GIT_CONFIG_PARAMETERS: "'safe.directory='" },
    };
    for (const [why, env] of Object.entries(forms)) {
      const { fx, to } = merged();
      refused[name](run(fx, to, { files: listed, env: () => env }), fx, to, why);
    }
  });
}

test("#544: the checkout lookup names only the script's own checkout as safe.directory and keeps the global config out", unixOnly, () => {
  const { fx, to } = merged();
  const r = carry(fx, to);
  assert.equal(r.status, 0, r.stderr);
  // The operator's list is read by git itself, from a scratch folder: no repo, no trusted folder, the global config dropped.
  const reads = r.calls.filter(([, args]) => / config --file /.test(args));
  assert.ok(reads.length > 0, "the list is read");
  for (const [cwd, args, global] of reads) {
    assert.ok(cwd !== r.root && !cwd.startsWith(`${r.root}/`), `a config read runs outside the checkout: ${cwd}`);
    assert.equal(global, "/dev/null", `git ${args}`);
    assert.deepEqual(named(args), [], `git ${args}`);
  }
  // The lookup itself runs in the script's folder and trusts exactly the checkout, with the global config still off.
  const lookup = r.calls.find(([, args]) => /rev-parse --show-toplevel$/.test(args));
  assert.deepEqual(named(lookup[1]), [r.root]);
  assert.equal(lookup[2], "/dev/null");
  assert.match(lookup[1], /core\.hooksPath=\/dev\/null/);
  assert.match(lookup[1], /core\.fsmonitor=false/);
});

test("#544: GIT_DIR and CLAUDE_PROJECT_DIR pointing at another checkout still change nothing about the lookup", unixOnly, () => {
  const { fx, to } = merged();
  const r = carry(fx, to, { env: () => ({ CLAUDE_PROJECT_DIR: fx.seed, GIT_DIR: join(fx.seed, ".git") }) });
  proved.carry(r, fx, to, "listed, with GIT_DIR and CLAUDE_PROJECT_DIR set elsewhere");
  assert.deepEqual(at(fx.seed, to), [], "nothing is written in the other checkout");
});

test("#544: WHEN the checkout is owned by this user THEN carry works with no safe.directory entry and never trusts a wildcard", unixOnly, () => {
  const { fx, to } = merged();
  const r = carry(fx, to, { safe: () => [], owned: true });
  proved.carry(r, fx, to, "owned, nothing listed");
  assert.ok(r.calls.every(([, args]) => !/safe\.directory=\*/.test(args)), "never a wildcard");
});
