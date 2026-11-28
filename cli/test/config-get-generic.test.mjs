// `config get` generic second layer (#740): an unknown token-shaped value, a URL password with a `/`, more value starts and more
// name forms are refused. An allowlist of template keys was dropped (it would have changed 13 existing tests); every older
// assertion is unchanged. Fixtures are a temp HOME and a temp project, never the real ~/.onrails/. The values are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { logger, put, tmp } from "./helpers.mjs";
import { configGet } from "../src/config.mjs";
import { valueLooksSecret } from "../src/config-secrets.mjs";

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

// Round 1 of the review of #744. Each test extends the AC with the same number; the older tests above are unchanged.
const named = (n) => get(`x.${n}`, `[x]\n${n} = "plain-value"\n`);

test("AC-740-4: WHEN a number follows the secret word (key1, pass2, pw1, pin1, seed1, otp1) THEN it prints nothing, and numbered plain words still read", () => {
  for (const n of ["key1", "key2", "pass1", "pass2", "pw1", "pin1", "seed1", "otp1", "token3", "db_key2", "apiKey1", "secret10", "key_1", "userpass1"]) {
    assertRefused(named(n), n, "plain-value");
  }
  for (const n of ["passage1", "path1", "oauth2", "step1", "spin1", "monkey2"]) assert.equal(named(n).out, "plain-value (project)", n);
});

test("AC-740-4: WHEN a word glued to pw, pswd or pin is the name (userpw, dbpw, adminpw, dbpswd, userpswd, userpin) THEN it prints nothing, and spin and passing still read", () => {
  for (const n of ["userpw", "dbpw", "adminpw", "dbpswd", "userpswd", "userpin", "db_pw", "adminPw", "mypin", "userpws", "userpin2", "dbpw1"]) assertRefused(named(n), n, "plain-value");
  for (const n of ["spin", "passing", "pinecone", "pineapple", "sapphire"]) assert.equal(named(n).out, "plain-value (project)", n);
});

test("AC-740-3: WHEN Bearer or Basic, then white space and more, is anywhere in a value THEN it is refused, in any case and with a tab", () => {
  const secret = ["Authorization: Bearer abc", "Authorization: Basic dXNlcjpwYXNz", "x bEaReR abc", "see Bearer  abc"];
  for (const v of secret) assertRefused(value(v), v, v);
  // A tab cannot go through the profile fixture, so the value check is called directly.
  for (const v of ["header=BASIC\tdXNlcjpwYXNz", "Authorization:\tBearer\tabc", "Bearer\tabc", "x\tbearer \tabc"]) assert.equal(valueLooksSecret(v), true, v);
  for (const v of ["bearer", "a basic", "basics rule", "bearings and basin", "rebasic x", "Authorization: none"]) {
    assert.equal(value(v).out, `${v} (project)`, v);
  }
});

test("AC-740-2: WHEN a non-web scheme has 1 to 5 digits then / ahead of an @ THEN it is a password and is refused, and the web schemes keep the port exception", () => {
  const secret = ["mysql://u:123/x@h", "postgres://u:8080/p@ss@h", "redis://u:12345/x@h", "amqp://u:1/x@h", "mongodb://u:99/a@b", "ssh://u:22/x@h", "://u:123/x@h"];
  for (const v of secret) assertRefused(value(v), v, v);
  const plain = ["https://example.test:8443/a@b", "http://localhost:3000/user@home", "ws://example.test:80/a@b", "wss://example.test:443/a@b", "ftp://example.test:21/a@b", "HTTPS://example.test:8443/a@b"];
  for (const v of plain) assert.equal(value(v).out, `${v} (project)`, v);
});

test("AC-740-1: WHEN a URL path piece or query value is a 20+ character token, or a query or path key is a secret word THEN it is refused, and plain URLs still read", () => {
  const secret = [
    "https://discord.example.test/api/webhooks/123456789/AbCdEfGhIjKlMnOpQrStUvWx1234", "https://h.example.test/hook?token=AbCdEfGhIjKlMnOpQrSt1234",
    "https://h.example.test/a?x=AbCdEfGhIjKlMnOpQrSt1234", "https://h.example.test/a?ok=1&y=AbCdEfGhIjKlMnOpQrSt1234", "https://h.example.test/a?key=abc",
    "https://h.example.test/a?api_key=", "https://h.example.test/a?x=1&password=x", "https://h.example.test/a#access_token=abc",
    "https://h.example.test/AbCdEfGhIjKlMnOpQrSt1234/x", "https://h.example.test/token/abc", "https://h.example.test/a;key=abc", "see https://h.example.test/x?token=abc now",
    "https://h.example.test/a?x=AbCdEfGhIjKlMnOpQrSt1234==",
  ];
  for (const v of secret) assertRefused(value(v), v, v);
  const plain = [
    "https://example.test/path/to/resource123456", "https://example.test/docs/page?lang=en&ref=home", "https://example.test:8443/a@b",
    "https://example.test/search?q=hello+world&page=2", "https://example.test/a%zz", "https://example.test/", "https://example.test/#top",
  ];
  for (const v of plain) assert.equal(value(v).out, `${v} (project)`, v);
});

test("AC-740-1: WHEN a secret-looking name is followed by = or : and a value inside a value THEN it is refused, and ordinary text still reads", () => {
  const secret = ["password=hunter2", "api_key=abc123", "token: abc", "db.password = x", "user=me;pwd=x", "'secret': 'x'", "x-api-key:abc", "apiKey=1", "PASSWORD=Hunter2", "use pin=1234"];
  for (const v of secret) assertRefused(value(v), v, v);
  const plain = ["password=", "password:", "monkey=1", "mode=fast", "retry=3 timeout=10", "note: write to me@example.test", "key", "set the password later", "git@github.com:org/repo.git", "12:30"];
  for (const v of plain) assert.equal(value(v).out, `${v.trim()} (project)`, v);
});

// Round 2 of the review of #744. Same rule: the tests above are unchanged.
const TOKEN = "aB3dE5fG7hJ9kL1mN3pQ5rStUvWx1234";

test("AC-740-1: WHEN a long token is the user name of a URL THEN it is refused, and a short user name still reads", () => {
  const secret = [
    `https://ghp_${TOKEN}AbCd@github.com/o/r.git`, `https://${TOKEN}@host`, `https://${TOKEN}@host/`, `https://${TOKEN}:x-oauth-basic@host/o/r`,
    `https://${TOKEN}@host:8443/x`, `ssh://${TOKEN}@host/o/r`, `see https://${TOKEN}@host/ now`,
  ];
  for (const v of secret) assertRefused(value(v), v, v);
  const plain = ["git@github.com:o/r.git", "ssh://git@host/o/r", "https://user@host/", "https://user@host:22/x", "https://example.test/a:b@c", "https://deploy-bot@host/o/r"];
  for (const v of plain) assert.equal(value(v).out, `${v} (project)`, v);
});

test("AC-740-1: WHEN a known key start (ghp_, sk-, AKIA, xox...) or token or apikey plus a long token is inside spaced text THEN it is refused, and the plain spaced value still reads", () => {
  const secret = [
    "Authorization: token ghp_abc123", "use ghp_abc123 here", "use sk-abc123 here", "see AKIAABCDEFGHIJKLMNOP now", "x xoxb-123-abc y", "a github_pat_abc b", "paste -----BEGIN PRIVATE KEY----- here",
    `Authorization: Token ${TOKEN}`, `ApiKey ${TOKEN}`, `api_key ${TOKEN}`, `x-api-key ${TOKEN}`, `token ${TOKEN}`, "(ghp_abc)",
  ];
  for (const v of secret) assertRefused(value(v), v, v);
  const plain = ["a1b2c3d4e5f6g7h8i9j0 with spaces", "token please", "my token is short", "apikey abc", "risk-free task-force", "Authorization: none", "mask-1 and flask_2", "tokens are cool"];
  for (const v of plain) assert.equal(value(v).out, `${v} (project)`, v);
});

test("AC-740-1: WHEN a bare query, a fragment or a host label is a long token THEN it is refused, and plain queries, fragments and hosts still read", () => {
  const secret = [
    `https://h.example.test/?${TOKEN}`, `https://h.example.test/#${TOKEN}`, `https://h.example.test/a?x=1#${TOKEN}`, `https://h.example.test/#/route/${TOKEN}`,
    `https://${TOKEN}.example.test/`, `https://app.${TOKEN}.example.test:8443/x`, `https://h.example.test/a?b=1&${TOKEN}`, `https://${TOKEN}`,
  ];
  for (const v of secret) assertRefused(value(v), v, v);
  const plain = [
    "https://example.test/?lang=en", "https://example.test/#top", "https://example.test/#/docs/intro", "https://ec2-12-34-56-78.compute-1.amazonaws.com/", "http://[2001:db8:85a3:0:0:8a2e:370:7334]/x",
    "https://example.test:8443/", "https://example.test/search?q=hello+world&page=2",
  ];
  for (const v of plain) assert.equal(value(v).out, `${v} (project)`, v);
});

test("AC-740-4: WHEN a name is authorization, auth_code, session_id, signature, db_url, redis_url, connstr or a glued key name (masterkey, adminkey, awskey, privkey, keyfile) THEN it prints nothing", () => {
  const names = [
    "authorization", "Authorization", "auth_code", "authCode", "authcode", "session_id", "sessionId", "sessionid", "session_id2", "signature", "signatures", "db_url", "dbUrl", "dburl",
    "redis_url", "redisUrl", "connstr", "db_connstr", "masterkey", "master_key", "adminkey", "awskey", "privkey", "passw0rd", "recovery_code", "recoveryCode", "keyfile", "key_file",
  ];
  for (const name of names) assertRefused(named(name), name, "plain-value");
  for (const name of ["auth", "session", "session_name", "recovery", "db_name", "code", "design", "author", "sign", "monkey", "path", "id"]) {
    assert.equal(named(name).out, "plain-value (project)", name);
  }
});
