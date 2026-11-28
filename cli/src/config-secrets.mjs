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
const SECRET_PHRASES = [["auth", "header"], ["database", "url"], ["connection", "string"]];
// These are long enough to refuse inside a word, so a glued name (authtoken, secretkey, dbpass, licensekey) is caught too.
const SECRET_PARTS = [
  "token", "secret", "password", "passwd", "passphrase", "credential", "bearer", "apikey", "privatekey", "accesskey", "signingkey", "sshkey", "authkey", "webhook",
  "dbpass", "smtppass", "passcode", "pwd", "cookie", "hmac", "licensekey", "authheader", "databaseurl", "connectionstring",
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

// A scheme-less login (user:pw@host). A leading mailto: is dropped first, so mailto:me@example.test still reads.
const SCHEMELESS_LOGIN = /^[^\s:@/]+:[^\s@]+@[^\s@]+$/;
// scheme://user:rest@, where `rest` runs to the first @. A password with a raw "/" lands in `rest`, and so does a port ahead of a
// path that holds an @ (https://host:8443/a@b): that one is told apart by a host name, then 1 to 5 digits and a "/".
const URL_LOGIN = /:\/\/([^/\s:@]*):([^\s@]*)@/;

// An unknown key format (SG., shpat_, hf_, pypi-, tskey-): one run of 20 or more characters with no space, mixing letters and
// digits. A value with :// is left to the URL rules.
function hasOpaqueToken(text) {
  return text.length >= 20 && !/\s/.test(text) && !text.includes("://") && /[A-Za-z]/.test(text) && /\d/.test(text);
}

function hasUrlPassword(text) {
  const login = URL_LOGIN.exec(text);
  return login !== null && !(login[1] !== "" && /^\d{1,5}\//.test(login[2]));
}

const singulars = (word) => [word, word.replace(/s$/, ""), word.replace(/es$/, "")];

/** True when a word of the section or key name says it holds a credential: a listed word, its plural, a phrase, or a long one glued into a word. */
export function looksSecret(name) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[._-]+/);
  const forms = words.map(singulars);
  if (forms.some((alts) => alts.some((word) => SECRET_WORDS.has(word)))) return true;
  if (words.some((word) => SECRET_PARTS.some((part) => word.includes(part)))) return true;
  if (forms.some((alts) => alts.some((word) => word.length > 4 && word.endsWith("pass")))) return true; // userpass, adminpass, mypass
  return SECRET_PHRASES.some(([first, second]) => forms.some((alts, i) => alts.includes(first) && (forms[i + 1]?.includes(second) ?? false)));
}

/** True when a value starts the way an API token, key or private key does, or has the shape of a JWT, a Slack hook, a URL or user:pw@host with a password, or is one unknown long key-like token (#740). */
export function valueLooksSecret(value) {
  const text = value.trim();
  const start = text.toLowerCase();
  if (SECRET_VALUE_STARTS.some((prefix) => start.startsWith(prefix)) || SECRET_VALUE_SHAPES.some((shape) => shape.test(text))) return true;
  if (hasOpaqueToken(text) || hasUrlPassword(text)) return true;
  return !text.includes("://") && SCHEMELESS_LOGIN.test(text.replace(/^mailto:/i, ""));
}
