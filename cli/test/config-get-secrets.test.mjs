// `config get` secret lists, widened after #708 (#733): more names, more value shapes, and a reader that keeps a `\"""`
// inside a multi-line string. Every fixture is a temp HOME and a temp project, so the real ~/.onrails/ is never read.
// The values are made up: none is a real token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { fileURLToPath } from "node:url";
import { logger, put, safeEnv, tmp } from "./helpers.mjs";
import { configGet } from "../src/config.mjs";
import { loadKit } from "../src/kit.mjs";
import { TEMPLATE } from "../src/profile.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

function setup({ personal, project } = {}) {
  const home = tmp("onrails-config-home-");
  const dir = tmp("onrails-config-app-");
  if (personal !== undefined) put(home, ".onrails/profile.toml", personal);
  if (project !== undefined) put(dir, "docs/profile.toml", project);
  return { home, dir };
}

function get(key, { home, dir }) {
  const out = logger();
  const err = logger();
  const code = configGet(key, dir, { home, log: out, error: err });
  return { code, out: out.text(), err: err.text() };
}

/** Exit 1, nothing on stdout, one stderr line that says secret and never holds the value. */
function assertRefused(r, label, value) {
  assert.equal(r.code, 1, label);
  assert.equal(r.out, "", label);
  assert.match(r.err, /secret/, label);
  assert.ok(!r.err.includes(value), label);
  assert.equal(r.err.split("\n").length, 1, label);
}

const NAMES = [
  "cred", "creds", "pwd", "pass", "passcode", "dbpass", "smtp_pass", "jwt", "cookie", "otp", "hmac", "salt", "cert", "pem",
  "licensekey", "auth_header", "database_url", "connection_string",
];

test("AC-733-1: WHEN config get is asked for a name from the list, in any case or as a plural THEN it prints nothing, never shows the value and exits 1", () => {
  const plural = (name) => (/ss$/.test(name) ? `${name}es` : /s$/.test(name) ? name : `${name}s`);
  const forms = (name) => [name, name.toUpperCase(), name.replace(/_(.)/g, (_, c) => c.toUpperCase()), plural(name), plural(name).toUpperCase()];
  const keys = NAMES.flatMap(forms);
  const body = keys.map((k) => `${k} = "name-value-733"`).join("\n");
  const s = setup({ personal: `[x]\n${body}\n` });
  for (const key of keys) assertRefused(get(`x.${key}`, s), key, "name-value-733");
  for (const name of NAMES) assertRefused(get(`${name}.plain`, setup({ personal: `[${name}]\nplain = "name-value-733"\n` })), `[${name}]`, "name-value-733");
  const c = spawnSync(process.execPath, [CLI, "config", "get", "x.dbpass", s.dir], { encoding: "utf8", env: safeEnv({ HOME: s.home, USERPROFILE: s.home }) });
  assert.equal(c.status, 1);
  assert.equal(c.stdout, "");
  assert.ok(!c.stderr.includes("name-value-733"));
});

const VALUES = [
  "sk_test_abcdef123456", "ghu_abcdef123456", "ghs_abcdef123456", "ghr_abcdef123456", "xapp-1-A0B1C2-123456", "ASIAIOSFODNN7EXAMPLE",
  "AIzaSyA-0123456789abcdefghijklmnopqrstu", "glpat-abcdef123456", "npm_abcdef123456", "pk_live_abcdef123456", "rk_live_abcdef123456",
  "whsec_abcdef123456", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl", "https://hooks.slack.com/services/T000/B000/abcdef",
  "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln",
];

test("AC-733-2: WHEN a value shape from the list sits under a harmless name THEN config get prints nothing and exits 1", () => {
  for (const value of VALUES) {
    for (const quote of ['"', "'"]) {
      const s = setup({ project: `[notify]\nharmless = ${quote}${value}${quote}\n` });
      assertRefused(get("notify.harmless", s), value, value);
    }
  }
  const c = setup({ project: `[notify]\nharmless = "${VALUES[7]}"\n` });
  const r = spawnSync(process.execPath, [CLI, "config", "get", "notify.harmless", c.dir], { encoding: "utf8", env: safeEnv({ HOME: c.home, USERPROFILE: c.home }) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.ok(!r.stderr.includes(VALUES[7]));
});

test("AC-733-3: WHEN a value is a URL with user:password@ THEN it is refused, and a URL with no password is not", () => {
  for (const value of ["postgres://admin:hunter2@db.example.test/app", "https://user:p%40ss@example.test:8443/x", "redis://:onlypw@cache.example.test", "see ftp://u:pw@host.example.test now"]) {
    assertRefused(get("notify.harmless", setup({ project: `[notify]\nharmless = "${value}"\n` })), value, value);
  }
  for (const value of ["https://example.test/path", "https://example.test:8443/a@b", "https://user@example.test", "mailto:me@example.test"]) {
    assert.equal(get("notify.harmless", setup({ project: `[notify]\nharmless = "${value}"\n` })).out, `${value} (project)`, value);
  }
});

test("AC-733-4: WHEN a multi-line basic string holds \\\"\"\" THEN the reader does not close the string there", () => {
  const s = setup({ project: '[q]\ntext = """\nsaid \\"""\nharmless = "ML-LEAK"\n[web]\nhosting = "INJECTED"\n"""\nv = "real"\n' });
  assert.equal(get("q.harmless", s).code, 1, "the key after the escaped quotes is text, not a real line");
  assert.equal(get("web.hosting", s).out, "Cloudflare Workers (kit default)", "a [web] inside the string opens no section");
  assert.equal(get("q.v", s).out, "real (project)", "the string closes at its real end");
  const escapedBackslash = setup({ project: '[q]\ntext = """\nend \\\\"""\nv = "real"\n' });
  assert.equal(get("q.v", escapedBackslash).out, "real (project)", "an escaped backslash before the quotes still lets them close");
  const sameLine = setup({ project: '[q]\ntext = """a \\""" b\nv = "ML-LEAK"\n"""\nw = "real"\n' });
  assert.equal(get("q.v", sameLine).code, 1, "a \\\"\"\" on the opening line does not close it");
  assert.equal(get("q.w", sameLine).out, "real (project)");
  const literal = setup({ project: "[q]\ntext = '''\nit\\'''\nv = \"real\"\n" });
  assert.equal(get("q.v", literal).out, "real (project)", "a literal string has no escapes, so \\''' closes it");
});

/** Each `section.key` the kit's profile template sets under a plain [section] (a section of one name, not [me.signature]). */
function templateKeys() {
  const keys = [];
  let section = null;
  for (const line of loadKit().readCore(TEMPLATE).toString("utf8").split(/\r?\n/)) {
    const header = /^\[([A-Za-z0-9_-]+)\]/.exec(line);
    if (header) section = header[1];
    else if (/^\s*\[/.test(line)) section = null;
    const pair = section && /^([A-Za-z0-9_-]+)\s*=/.exec(line);
    if (pair) keys.push(`${section}.${pair[1]}`);
  }
  return keys;
}

test("AC-733-5: WHEN a key is harmless THEN it still reads, including every key in the kit's profile template", () => {
  const keys = templateKeys();
  assert.ok(keys.length > 40, `found ${keys.length} template keys`);
  const s = setup({ personal: "", project: "" });
  for (const key of keys) assert.doesNotMatch(get(key, s).err, /secret/, `${key} must not be refused as a secret`);
  assert.equal(get("defaults.risk_dial", s).out, "move-fast (kit default)");
  assert.equal(get("web.hosting", s).out, "Cloudflare Workers (kit default)");
  const plain = setup({
    personal: '[web]\npassage = "a"\npassive = "b"\nsaltire = "c"\ncertain = "d"\ncookbook = "e"\nopt = "f"\nurl = "https://example.test/x"\nheader = "h"\nstring = "i"\ndatabase = "D1"\nconnection = "j"\nlicense = "MIT"\ncredit = "k"\n[defaults]\nregion = "Asia Pacific"\nnote = "skip eyJ here"\ncity = "Aizawa"\n',
  });
  for (const key of ["web.passage", "web.passive", "web.saltire", "web.certain", "web.cookbook", "web.opt", "web.url", "web.header", "web.string", "web.database", "web.connection", "web.license", "web.credit", "defaults.region", "defaults.note", "defaults.city"]) {
    assert.equal(get(key, plain).code, 0, key);
  }
});
