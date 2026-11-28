// `config get` generic second layer (#740): an unknown token-shaped value, a URL password with a `/`, more value starts and more
// name forms are refused. An allowlist of template keys was dropped (it would have changed 13 existing tests); every older
// assertion is unchanged. Fixtures are a temp HOME and a temp project, never the real ~/.onrails/. The values are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { logger, put, tmp } from "./helpers.mjs";
import { configGet } from "../src/config.mjs";

function get(key, project) {
  const home = tmp("onrails-config-home-");
  const dir = tmp("onrails-config-app-");
  put(dir, "docs/profile.toml", project);
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

const value = (v) => get("notify.harmless", `[notify]\nharmless = "${v}"\n`);

test("AC-740-1: WHEN a value is one 20+ character token that mixes letters and digits THEN it is refused, and ordinary values still read", () => {
  const secret = [
    "SG.aB3dE5fG7hJ9kL1mN3pQ5r", "shpat_0123456789abcdef0123", "hf_AbCdEfGh1234567890IjKl", "pypi-AgEIcHlwaS5vcmc1234567", "tskey-auth-kAbC123CNTRL-x9Y8z7",
    "dckr_pat_AbCdEf123456GhIjKl", "abcdef0123456789abcdef", "AbCd1234AbCd1234AbCd1234",
  ];
  for (const v of secret) assertRefused(value(v), v, v);
  const plain = [
    "Cloudflare Workers", "a1b2c3d4e5f6g7h8i9j0 with spaces", "abcdefghijklmnopqrstuvwxyz", "12345678901234567890123", "short-1a2b",
    "https://example.test/path/to/resource123456", "https://example.test:8443/a@b", "mailto:me@example.test", "move-fast", "Asia Pacific",
  ];
  for (const v of plain) assert.equal(value(v).out, `${v} (project)`, v);
});

test("AC-740-2: WHEN a URL password holds a raw / THEN it is refused, and a port followed by a path with an @ still reads", () => {
  for (const v of ["mysql://root:pa/ss@host/db", "mysql://root:pa/ss@host.example.test:3306/db", "postgres://u:/pw@h/db", "redis://admin:ab/cd/ef@cache.example.test"]) {
    assertRefused(value(v), v, v);
  }
  for (const v of ["https://example.test:8443/a@b", "http://localhost:3000/user@home", "https://example.test/a:b@c"]) {
    assert.equal(value(v).out, `${v} (project)`, v);
  }
});

test("AC-740-3: WHEN a value starts Bearer, Basic or ya29., or is a scheme-less user:pw@host THEN it is refused", () => {
  for (const v of ["Bearer abc", "bearer x", "Basic dXNlcjpwYXNz", "BASIC dXNlcjpwYXNz", "ya29.a0AfH6SMBx", "user:pw@host", "admin:hunter2@db.example.test", "mailto:user:pw@host", "u:p/w@host"]) {
    assertRefused(value(v), v, v);
  }
  for (const v of ["mailto:me@example.test", "git@github.com:org/repo.git", "me@example.test", "basics", "bearings", "ya29", "note: write to me@example.test"]) {
    assert.equal(value(v).out, `${v} (project)`, v);
  }
});

test("AC-740-4: WHEN a name is pw, pswd, pin, totp, seed, mnemonic or a word glued to pass THEN it prints nothing, and passage and passive still read", () => {
  const names = [
    "pw", "pswd", "pin", "totp", "seed", "mnemonic", "PW", "Pin", "pws", "pins", "seeds", "db_pw", "dbPin", "user_pin", "recovery_seed", "login-totp",
    "userpass", "adminpass", "mypass", "dbpass", "userPass", "admin_pass", "userpasses", "my_userpass",
  ];
  for (const name of names) assertRefused(get(`x.${name}`, `[x]\n${name} = "plain-value"\n`), name, "plain-value");
  assertRefused(get("pw.plain", `[pw]\nplain = "plain-value"\n`), "[pw]", "plain-value");
  for (const name of ["passage", "passive", "passing", "pinecone", "seeded", "pineapple", "spin"]) {
    assert.equal(get(`x.${name}`, `[x]\n${name} = "plain-value"\n`).out, "plain-value (project)", name);
  }
});
