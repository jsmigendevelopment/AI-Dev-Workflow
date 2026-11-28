// `npx onrails config get <section.key> [dir]` (#708, first step of #124): which value a setting has and which layer it
// came from: the project's docs/profile.toml, then your ~/.onrails/profile.toml, then the kit's profile template.
// Every fixture is a temp HOME and a temp project, so the real ~/.onrails/ is never read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { logger, put, safeEnv, tmp } from "./helpers.mjs";
import { configGet } from "../src/config.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

/** A temp HOME and project; `personal` and `project` are the text of each profile (undefined: no file). */
function setup({ personal, project } = {}) {
  const home = tmp("onrails-config-home-");
  const dir = tmp("onrails-config-app-");
  if (personal !== undefined) put(home, ".onrails/profile.toml", personal);
  if (project !== undefined) put(dir, "docs/profile.toml", project);
  return { home, dir };
}

/** Runs config get in-process: its exit code and the two streams. */
function get(key, { home, dir }) {
  const out = logger();
  const err = logger();
  const code = configGet(key, dir, { home, log: out, error: err });
  return { code, out: out.text(), err: err.text() };
}

/** Runs the real CLI with HOME pointing at the temp folder. */
function cli(args, { home }) {
  const env = safeEnv({ HOME: home, USERPROFILE: home });
  return spawnSync(process.execPath, [CLI, "config", ...args], { encoding: "utf8", env });
}

test("AC-708-1: WHEN a key is set only in the personal profile THEN config get prints the personal value and says personal", () => {
  const s = setup({ personal: '[defaults]\nvisibility = "private"\n', project: '[defaults]\nlicence = "MIT"\n' });
  assert.deepEqual(get("defaults.visibility", s), { code: 0, out: "private (personal)", err: "" });
  const r = cli(["get", "defaults.visibility", s.dir], s);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "private (personal)\n");
  assert.equal(r.stderr, "");
});

test("AC-708-1: a project with no docs/profile.toml at all still gets the personal value", () => {
  const s = setup({ personal: '[defaults]\nvisibility = "private"\n' });
  assert.deepEqual(get("defaults.visibility", s), { code: 0, out: "private (personal)", err: "" });
});

test("AC-708-2: WHEN the project profile sets the same key THEN config get prints the project value and says project", () => {
  const s = setup({ personal: '[defaults]\nvisibility = "private"\n', project: '[defaults]\nvisibility = "public"\n' });
  assert.deepEqual(get("defaults.visibility", s), { code: 0, out: "public (project)", err: "" });
  const r = cli(["get", "defaults.visibility", s.dir], s);
  assert.equal(r.stdout, "public (project)\n");
});

test("AC-708-3: WHEN the key is in neither profile but is in the kit's profile template THEN it prints the template value and says kit default", () => {
  const s = setup({ personal: '[defaults]\nlicence = "MIT"\n', project: "" });
  assert.deepEqual(get("defaults.risk_dial", s), { code: 0, out: "move-fast (kit default)", err: "" });
  assert.deepEqual(get("web.hosting", s), { code: 0, out: "Cloudflare Workers (kit default)", err: "" });
  const r = cli(["get", "defaults.risk_dial", s.dir], s);
  assert.equal(r.stdout, "move-fast (kit default)\n");
});

test("AC-708-4: WHEN no layer has the key THEN it exits 1 with one plain line that names the key, and prints nothing else", () => {
  const s = setup({ personal: '[defaults]\nlicence = "MIT"\n', project: '[defaults]\nlicence = "none"\n' });
  const r = get("defaults.nothing_here", s);
  assert.equal(r.code, 1);
  assert.equal(r.out, "");
  assert.match(r.err, /^defaults\.nothing_here\b[^\n]*$/);
  const c = cli(["get", "defaults.nothing_here", s.dir], s);
  assert.equal(c.status, 1);
  assert.equal(c.stdout, "");
  assert.match(c.stderr, /^defaults\.nothing_here\b[^\n]*\n$/);
});

test("AC-708-4: a blank value in every layer counts as not set, and a missing section is not set", () => {
  const s = setup({ personal: '[me]\nname = ""\n', project: '[me]\nname = ""\n' });
  assert.equal(get("me.name", s).code, 1, "the template's own me.name is blank too");
  assert.equal(get("nosuch.key", s).code, 1);
});

test("AC-708-5: WHEN a layer's file is missing THEN that layer is skipped without an error", () => {
  const none = setup();
  assert.deepEqual(get("defaults.risk_dial", none), { code: 0, out: "move-fast (kit default)", err: "" });
  const onlyProject = setup({ project: '[defaults]\nrisk_dial = "strict"\n' });
  assert.deepEqual(get("defaults.risk_dial", onlyProject), { code: 0, out: "strict (project)", err: "" });
  const r = cli(["get", "defaults.risk_dial", none.dir], none);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
});

test("a blank project value falls through to the next layer, like an absent line", () => {
  const s = setup({ personal: '[defaults]\nlicence = "MIT"\n', project: '[defaults]\nlicence = ""\n' });
  assert.deepEqual(get("defaults.licence", s), { code: 0, out: "MIT (personal)", err: "" });
});

test("it reads strings, true/false and whole numbers, with trailing comments, and only inside the named section", () => {
  const s = setup({
    personal: [
      "[a]", 'name = "x"   # a comment', "[workflow]", "pause_hours = 2   # whole number", "afk = 10",
      "[research]", "offered = true", 'text = "has # inside \\"quotes\\""', "lit = 'single'",
      "[ other ]", 'name = "wrong section"', "",
    ].join("\n"),
  });
  assert.equal(get("workflow.pause_hours", s).out, "2 (personal)");
  assert.equal(get("research.offered", s).out, "true (personal)");
  assert.equal(get("research.text", s).out, 'has # inside "quotes" (personal)');
  assert.equal(get("research.lit", s).out, "single (personal)");
  assert.equal(get("a.name", s).out, "x (personal)");
  assert.equal(get("other.name", s).out, "wrong section (personal)", "spaces inside the brackets are fine");
  assert.equal(get("research.name", s).code, 1, "a key in another section is not this one");
});

test("a key the project sets in a form config get doesn't read is reported, and the lower layers are not used instead", () => {
  const s = setup({ personal: '[web]\ntest_site_logins = "google"\n', project: '[web]\ntest_site_logins = ["google", "otp"]\n' });
  const r = get("web.test_site_logins", s);
  assert.equal(r.code, 1);
  assert.equal(r.out, "");
  assert.match(r.err, /^web\.test_site_logins\b[^\n]*project[^\n]*$/);
});

test("a key whose name looks like a token, key, password or secret prints nothing, even when it is set", () => {
  const s = setup({
    personal: '[notify]\nntfy_token = "tok-abc123"\napiKey = "k-1"\n[stripe]\nsecret_key = "sk-1"\nlogin_password = "pw"\n',
    project: '[x]\nauth = "Clerk"\nmonkey = "banana"\n',
  });
  for (const key of ["notify.ntfy_token", "notify.apiKey", "stripe.secret_key", "stripe.login_password"]) {
    const r = get(key, s);
    assert.equal(r.code, 1, key);
    assert.equal(r.out, "", key);
    assert.match(r.err, /secret/, key);
    assert.doesNotMatch(r.err, /tok-abc123|k-1|sk-1|pw\b/, key);
    assert.equal(r.err.split("\n").length, 1, key);
  }
  // Not secret-looking: "auth" and "monkey" are plain words.
  assert.equal(get("x.auth", s).out, "Clerk (project)");
  assert.equal(get("x.monkey", s).out, "banana (project)");
});

/** Asserts a name is refused: exit 1, nothing on stdout, one stderr line that says secret and never holds the value. */
function assertRefused(key, s, value) {
  const r = get(key, s);
  assert.equal(r.code, 1, key);
  assert.equal(r.out, "", key);
  assert.match(r.err, /secret/, key);
  assert.doesNotMatch(r.err, new RegExp(value), key);
  assert.equal(r.err.split("\n").length, 1, key);
}

test("AC-708-3: a plural name is refused too: [secrets] x, tokens, keys, passwords and [my-secrets]", () => {
  const s = setup({
    personal: '[secrets]\nx = "topsecretvalue"\n[my-secrets]\nx = "topsecretvalue"\n[notify]\ntokens = "topsecretvalue"\nkeys = "topsecretvalue"\npasswords = "topsecretvalue"\nsecrets = "topsecretvalue"\n',
  });
  for (const key of ["secrets.x", "my-secrets.x", "notify.tokens", "notify.keys", "notify.passwords", "notify.secrets"]) assertRefused(key, s, "topsecretvalue");
  const r = cli(["get", "secrets.x", s.dir], s);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.doesNotMatch(r.stderr, /topsecretvalue/);
});

test("AC-708-3: a name with a secret word glued on is refused: authtoken, accesstoken, secretkey, apikey, clientsecret", () => {
  const s = setup({
    personal: '[notify]\nauthtoken = "glued-value"\naccesstoken = "glued-value"\nsecretkey = "glued-value"\napikey = "glued-value"\nclientsecret = "glued-value"\nmypassword = "glued-value"\nprivatekey = "glued-value"\nsshkey = "glued-value"\n[repotokens]\nx = "glued-value"\n',
  });
  for (const key of ["notify.authtoken", "notify.accesstoken", "notify.secretkey", "notify.apikey", "notify.clientsecret", "notify.mypassword", "notify.privatekey", "notify.sshkey", "repotokens.x"]) assertRefused(key, s, "glued-value");
});

test("AC-708-3: pat, dsn, webhook, private and sk are refused as whole words, in a section or a key, in any case", () => {
  const s = setup({
    personal: '[ci]\npat = "word-value"\ndsn = "word-value"\nwebhook = "word-value"\nwebhook_url = "word-value"\nprivate = "word-value"\nsk = "word-value"\nGH_PAT = "word-value"\nsentryDsn = "word-value"\n[webhooks]\nurl = "word-value"\n',
  });
  for (const key of ["ci.pat", "ci.dsn", "ci.webhook", "ci.webhook_url", "ci.private", "ci.sk", "ci.GH_PAT", "ci.sentryDsn", "webhooks.url"]) assertRefused(key, s, "word-value");
  // The plain look-alikes stay readable.
  const plain = setup({ personal: '[web]\nauth = "Clerk"\nmonkey = "banana"\npath = "/x"\npatch = "1"\nskip = "yes"\nprivacy = "high"\n[defaults]\nvisibility = "private"\n' });
  assert.equal(get("web.auth", plain).out, "Clerk (personal)");
  assert.equal(get("web.monkey", plain).out, "banana (personal)");
  assert.equal(get("web.path", plain).out, "/x (personal)");
  assert.equal(get("web.patch", plain).out, "1 (personal)");
  assert.equal(get("web.skip", plain).out, "yes (personal)");
  assert.equal(get("web.privacy", plain).out, "high (personal)");
  assert.equal(get("defaults.visibility", plain).out, "private (personal)");
});

test("AC-708-3: a value that starts like a credential is refused under a harmless name, and never printed", () => {
  const values = ["sk-live-1234567890", "sk_live_abcdef", "ghp_abcdef123456", "gho_abcdef123456", "github_pat_11ABCDEF", "xoxb-1234-5678", "AKIAIOSFODNN7EXAMPLE", "-----BEGIN PRIVATE KEY-----"];
  for (const value of values) {
    const s = setup({ project: `[notify]\nharmless = "${value}"\n` });
    const r = get("notify.harmless", s);
    assert.equal(r.code, 1, value);
    assert.equal(r.out, "", value);
    assert.match(r.err, /secret/, value);
    assert.ok(!r.err.includes(value), value);
    assert.equal(r.err.split("\n").length, 1, value);
    const c = cli(["get", "notify.harmless", s.dir], s);
    assert.equal(c.status, 1, value);
    assert.equal(c.stdout, "", value);
    assert.ok(!c.stderr.includes(value), value);
  }
  const literal = setup({ personal: "[notify]\nharmless = 'ghp_literalform123'\n" });
  assert.equal(get("notify.harmless", literal).code, 1);
  assert.equal(get("notify.harmless", literal).out, "");
  const ok = setup({ personal: '[notify]\nharmless = "skip this"\nother = "sky-blue"\n' });
  assert.equal(get("notify.harmless", ok).out, "skip this (personal)");
  assert.equal(get("notify.other", ok).out, "sky-blue (personal)");
});

test("AC-708-1: a [section] or key line inside a multi-line string is text, not a real line", () => {
  const injected = '[q]\ntext = """\n[web]\nhosting = "INJECTED"\nv = "ML-INJECTED"\n"""\nv = "real"\n';
  const s = setup({ project: injected });
  assert.equal(get("q.v", s).out, "real (project)");
  assert.equal(get("web.hosting", s).out, "Cloudflare Workers (kit default)", "a [web] inside the string opens no section");
  const lit = setup({ project: "[q]\ntext = '''\n[web]\nhosting = \"INJECTED\"\n'''\nv = \"real\"\n" });
  assert.equal(get("web.hosting", lit).out, "Cloudflare Workers (kit default)");
  assert.equal(get("q.v", lit).out, "real (project)");
  const oneLine = setup({ project: '[q]\ntext = """one line"""\nv = "real"\n' });
  assert.equal(get("q.v", oneLine).out, "real (project)", "a multi-line string that opens and closes on one line leaves nothing open");
  // The string itself is not a shape this reads: reported, and the lower layers are not used.
  const own = setup({ personal: '[w]\nt = "personal"\n', project: '[w]\nt = """\nhello\n"""\n' });
  const r = get("w.t", own);
  assert.equal(r.code, 1);
  assert.equal(r.out, "");
  assert.match(r.err, /^w\.t\b[^\n]*project[^\n]*$/);
});

test("AC-708-1: a line like [1, 2], or [3] inside a multi-line array is not a header", () => {
  const s = setup({ personal: '[a]\nk = "personal"\n', project: '[a]\nm = [\n  [1, 2],\n  [3],\n]\nk = "project"\n' });
  assert.equal(get("a.k", s).out, "project (project)");
  const bare = setup({ personal: '[a]\nk = "personal"\n', project: '[a]\nm = [\n[3]\n]\nk = "project"\n' });
  assert.equal(get("a.k", bare).out, "project (project)", "a closed [3] line is not a header either");
  const hidden = setup({ project: '[a]\nm = [\n  "[web]", # a [bracket] in a string\n  "x"\n]\n[web]\nhosting = "real"\n' });
  assert.equal(get("web.hosting", hidden).out, "real (project)", "brackets in strings and comments do not count; the array closes");
  const asked = setup({ personal: '[a]\nm = "personal"\n', project: '[a]\nm = [\n  [1, 2],\n]\n' });
  const r = get("a.m", asked);
  assert.equal(r.code, 1);
  assert.match(r.err, /project/);
});

test("the CLI never prints a secret-looking value, on either stream", () => {
  const s = setup({ personal: '[notify]\nntfy_token = "tok-abc123"\n' });
  const r = cli(["get", "notify.ntfy_token", s.dir], s);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.doesNotMatch(r.stderr, /tok-abc123/);
});

test("a name that isn't section.key, a missing name, or another sub-command exits 2 with a plain line", () => {
  const s = setup();
  for (const args of [["get"], ["get", "justone"], ["get", "a.b.c"], ["get", "a..b"], ["set", "a.b"], []]) {
    const r = cli(args, s);
    assert.equal(r.status, 2, args.join(" "));
    assert.equal(r.stdout, "", args.join(" "));
  }
});

test("a layer that exists but can't be read as a file is an error, not a silent skip", () => {
  const s = setup();
  put(s.dir, "docs/profile.toml/inner.txt", "docs/profile.toml is a folder here\n");
  assert.throws(() => get("defaults.risk_dial", s), /EISDIR/);
});

test("--help lists config get", () => {
  const r = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8", env: safeEnv() });
  assert.match(r.stdout, /onrails config get <section\.key> \[dir\]/);
});
