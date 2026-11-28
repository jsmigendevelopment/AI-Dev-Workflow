// What `config get` refuses to print (#708, widened in #733): names and values that look like a credential. Lists only
// grow: every name and value refused before is still refused. Over-refusing is the safe side; printing a secret is not.

// A name is secret-looking when a word of it (split at . _ - and a lower-to-upper change) is one of these, the plural of one
// (a trailing "s" or "es" dropped) or part of a listed phrase. "auth" and "monkey" are not here: they are plain words, and
// a bare "key" only counts as a whole word, so do the other short ones (pass, otp, salt, cert, pem, jwt, cred).
const SECRET_WORDS = new Set([
  "token", "secret", "password", "passwd", "passphrase", "key", "apikey", "credential", "bearer", "pat", "dsn", "webhook", "private", "sk",
  "cred", "pwd", "pass", "passcode", "jwt", "cookie", "otp", "hmac", "salt", "cert", "pem",
  "pw", "pswd", "pin", "totp", "seed", "mnemonic",
]);
// Two words that say a credential only together: auth_header, database_url, connection_string.
const SECRET_PHRASES = [
  ["auth", "header"], ["database", "url"], ["connection", "string"], ["auth", "code"], ["session", "id"], ["db", "url"], ["redis", "url"], ["recovery", "code"],
];
// These are long enough to refuse inside a word, so a glued name (authtoken, secretkey, dbpass, licensekey) is caught too.
const SECRET_PARTS = [
  "token", "secret", "password", "passwd", "passphrase", "credential", "bearer", "apikey", "privatekey", "accesskey", "signingkey", "sshkey", "authkey", "webhook",
  "dbpass", "smtppass", "passcode", "pwd", "cookie", "hmac", "licensekey", "authheader", "databaseurl", "connectionstring",
  "authorization", "authcode", "sessionid", "signature", "dburl", "redisurl", "connstr", "masterkey", "adminkey", "awskey", "privkey", "passw0rd", "recoverycode", "keyfile",
];

// A value that starts like one of these is a credential whatever its name says. Compared in lower case: over-refusing is the safe side.
const SECRET_VALUE_STARTS = [
  "sk-", "sk_live", "ghp_", "gho_", "github_pat_", "xox", "akia", "-----begin",
  "sk_test_", "pk_live_", "pk_test_", "rk_live_", "rk_test_", "whsec_", "ghu_", "ghs_", "ghr_", "xapp-", "glpat-", "npm_",
  "bearer ", "basic ", "ya29.",
];
// Shapes that count anywhere in a value, and in the case they are written: AWS temporary keys (ASIA), Google API keys (AIza),
// a JWT (three dot-separated base64url parts), a Slack hook URL and a URL with a password (scheme://user:pw@host).
const SECRET_VALUE_SHAPES = [/^ASIA[A-Z0-9]/, /^AIza/, /eyJ[\w-]+\.[\w-]+\.[\w-]*/, /hooks\.slack\.com\/services\//i, /:\/\/[^/\s]*:[^/\s]*@/];

// The secret starts above, found anywhere in a value at a word boundary (use ghp_... here, Authorization: token ghp_...). The
// "bearer " and "basic " starts are left out: AUTH_SCHEME already covers them anywhere.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ANYWHERE_STARTS = SECRET_VALUE_STARTS.filter((start) => !/^(bearer|basic) /.test(start));
const START_ANYWHERE = new RegExp(`(?<![a-z0-9])(?:${ANYWHERE_STARTS.map(escapeRegex).join("|")})`, "i");
// token, apikey (api_key, api-key) or Authorization:, white space, then a long token: Authorization: Token <32 characters>.
const KEYWORD_TOKEN = /(?<![a-z0-9])(?:token|api[-_]?key|authorization:?)(?=\s+(\S+))/gi; // the look-ahead keeps "Authorization: Token <key>" from using up the word Token

// A scheme-less login (user:pw@host). A leading mailto: is dropped first, so mailto:me@example.test still reads.
const SCHEMELESS_LOGIN = /^[^\s:@/]+:[^\s@]+@[^\s@]+$/;
// scheme://user:rest@, where `rest` runs to the first @. A password with a raw "/" lands in `rest`, and so does a port ahead of a
// path that holds an @ (https://host:8443/a@b). Only the web-style schemes in PORT_SCHEMES may have that port; for any other
// scheme (mysql, postgres, redis) digits and a "/" are a password. Found by a scan from each "://" (see hasUrlPassword), not a
// regex: the regex was O(n squared) on a long value (#744, round 3).
const PORT_SCHEMES = new Set(["http", "https", "ws", "wss", "ftp"]);
const SCHEME_CHAR = /[a-z0-9+.-]/i;
const LONGEST_PORT_SCHEME = 5; // "https"; a scheme longer than this can never be one of PORT_SCHEMES
const HOST_END = /[/\s:@]/g;
const REST_END = /[\s@]/g;
// Bearer or Basic, then white space (a tab too) and anything: Authorization: Bearer abc, in any case, anywhere in a value.
const AUTH_SCHEME = /(?<![a-z])(?:bearer|basic)\s+\S/i;
// A secret-looking name, then = or : and a non-empty value: password=hunter2, api_key: abc, "token": "x".
const NAME_VALUE = /(?<![\w.-])([\w.-]+)["']?\s*[=:]\s*["']?[^\s"']/g;
// Anything with :// in it, so a URL inside a longer text is checked too: the white-space-separated pieces that hold one.
const urlTokens = (text) => text.split(/\s+/).filter((piece) => piece.includes("://"));

// Longest value config get looks at. A longer one is refused before any pattern runs, so a huge value in a profile cannot stall
// the command (#744, round 3). No template value is near it.
export const MAX_VALUE_LENGTH = 2000;

// An unknown key format (SG., shpat_, hf_, pypi-, tskey-): one run of 20 or more characters with no space, mixing letters and
// digits. A value with :// is left to the URL rules, which test each path piece and query value the same way.
function isLongToken(text) {
  return text.length >= 20 && !/\s/.test(text) && /[A-Za-z]/.test(text) && /\d/.test(text);
}

/** Index of the next match of a global `pattern` at or after `from`, or -1. */
function indexFrom(pattern, text, from) {
  pattern.lastIndex = from;
  return pattern.exec(text)?.index ?? -1;
}

/** True when a scheme://user:rest@ login has a password: every one but a web scheme with a host and a 1 to 5 digit port before a "/". Visits each "://" once and reuses the end of `rest`, so the cost is linear in the text. */
function hasUrlPassword(text) {
  let from = 0; // a login that matched is used up, so the next one starts after its @
  let restEnd = -2; // the cached end of the last `rest` scan: the first white space or @ at or after restFrom
  let restFrom = 0;
  for (let at = text.indexOf("://"); at !== -1; at = text.indexOf("://", at + 1)) {
    if (at < from) continue;
    const hostStart = at + 3;
    const hostEnd = indexFrom(HOST_END, text, hostStart);
    if (hostEnd === -1 || text[hostEnd] !== ":") continue;
    const rest = hostEnd + 1;
    if (restEnd !== -1 && (restEnd < rest || rest < restFrom)) {
      restEnd = indexFrom(REST_END, text, rest);
      restFrom = rest;
    }
    if (restEnd === -1 || text[restEnd] !== "@") continue;
    let schemeStart = at;
    while (schemeStart > from && at - schemeStart <= LONGEST_PORT_SCHEME && SCHEME_CHAR.test(text[schemeStart - 1])) schemeStart--;
    const scheme = text.slice(schemeStart, at).toLowerCase();
    const port = hostEnd > hostStart && /^\d{1,5}\//.test(text.slice(rest, Math.min(restEnd, rest + 6))) && PORT_SCHEMES.has(scheme);
    if (!port) return true;
    from = restEnd + 1;
  }
  return false;
}

const longToken = (text) => isLongToken(text) || isLongToken(safeDecode(text));

/** The pieces of a URL's authority that can hold a token: the user name (before the last @, any :password dropped) and each host label. A bracketed IPv6 address and the port are hex and digits, so they are left out. */
function authorityParts(authority) {
  const at = authority.lastIndexOf("@");
  const host = authority.slice(at + 1).replace(/:\d*$/, "");
  const labels = host.startsWith("[") ? [] : host.split(".");
  return [...(at < 0 ? [] : [authority.slice(0, at).split(":")[0]]), ...labels];
}

/** True when a URL carries a secret outside the password: a long token as the user name, a host label, a path piece, a bare query or fragment or a query value, a secret-word query key, or a secret word that names a path piece (token=abc, or /token/abc). */
function hasUrlSecret(url) {
  const [before, ...tail] = url.slice(url.indexOf("://") + 3).split(/[?#]/);
  const pieces = before.split("/").slice(1).flatMap((piece) => piece.split(";"));
  const parts = tail.join("&").split("&").filter((part) => part !== "");
  const pairs = parts.map((part) => [part.split("=")[0], part.split("=").slice(1).join("=")]);
  const bare = parts.filter((part) => !part.includes("=")).flatMap((part) => part.split("/")); // /?<token>, #<token>, #/route/<token>
  if ([...authorityParts(before.split("/")[0]), ...pieces, ...bare, ...pairs.map(([, value]) => value)].some(longToken)) return true;
  if (pairs.some(([key]) => looksSecret(safeDecode(key)))) return true;
  return pieces.some((piece, i) => (piece.includes("=") || (pieces[i + 1] ?? "") !== "") && piece !== "" && looksSecret(safeDecode(piece.split("=")[0])));
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text; // a lone % is not an escape; test the text as written
  }
}

function hasKeywordToken(text) {
  return [...text.matchAll(KEYWORD_TOKEN)].some(([, word]) => longToken(word));
}

function hasNameValue(text) {
  // "Authorization: none" has always read (AC-740-3), so the name alone does not count here: its value is tested by KEYWORD_TOKEN and AUTH_SCHEME.
  return [...text.matchAll(NAME_VALUE)].some(([, name]) => looksSecret(name) && name.toLowerCase() !== "authorization");
}

const singulars = (word) => [word, word.replace(/s$/, ""), word.replace(/es$/, "")];
// Short secret words that are refused glued to a longer word (userpass, dbpw, userpswd, userpin), with how long the word must be:
// longer than the secret word itself, and for "pin" longer than 4 so that "spin" still reads.
const GLUED_ENDINGS = [["pass", 4], ["pw", 2], ["pswd", 4], ["pin", 4]];

/** True when a word of the section or key name says it holds a credential: a listed word, its plural, a phrase, or a long one glued into a word. A number after a word (key1, pass2) does not hide it. */
export function looksSecret(name) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[._-]+/);
  const forms = words.map((word) => [...new Set([...singulars(word), ...singulars(word.replace(/\d+$/, ""))])]);
  if (forms.some((alts) => alts.some((word) => SECRET_WORDS.has(word)))) return true;
  if (forms.some((alts) => alts.some((word) => SECRET_PARTS.some((part) => word.includes(part))))) return true;
  if (forms.some((alts) => alts.some((word) => GLUED_ENDINGS.some(([end, min]) => word.length > min && word.endsWith(end))))) return true; // userpass, dbpw, userpin
  // An upper-case word with a digit in it (PASSW0RD) is cut at the digit by the split above, so its glued parts are also looked for in the word as written.
  if (name.split(/[._-]+/).some((word) => !/[a-z]/.test(word) && /\d[A-Z]/.test(word) && SECRET_PARTS.some((part) => word.toLowerCase().includes(part)))) return true;
  return SECRET_PHRASES.some(([first, second]) => forms.some((alts, i) => alts.includes(first) && (forms[i + 1]?.includes(second) ?? false)));
}

/** True when a value starts the way an API token, key or private key does, or has the shape of a JWT, a Slack hook, a URL or user:pw@host with a password, a Bearer or Basic header, a name=value pair for a secret name, a long key-like token (also in a URL path or query) or a secret query key (#740). */
export function valueLooksSecret(value) {
  if (value.length > MAX_VALUE_LENGTH) return true;
  const text = value.trim();
  const start = text.toLowerCase();
  if (SECRET_VALUE_STARTS.some((prefix) => start.startsWith(prefix)) || SECRET_VALUE_SHAPES.some((shape) => shape.test(text))) return true;
  if (AUTH_SCHEME.test(text) || hasUrlPassword(text) || hasNameValue(text) || START_ANYWHERE.test(text) || hasKeywordToken(text)) return true;
  if (urlTokens(text).some(hasUrlSecret)) return true;
  if (!text.includes("://") && isLongToken(text)) return true;
  return !text.includes("://") && SCHEMELESS_LOGIN.test(text.replace(/^mailto:/i, ""));
}
