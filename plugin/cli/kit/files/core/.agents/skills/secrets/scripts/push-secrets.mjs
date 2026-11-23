#!/usr/bin/env node
// Push environment variables to GitHub environments (and Cloudflare with --wrangler)
// without ever printing a value. Reads:
//   .env.example            names and metadata (scope, secret)
//   .env.test.local         values for the "test" environment
//   .env.production.local   values for the "production" environment
// Usage: node push-secrets.mjs [--dry-run] [--wrangler] [--env test|production]
// GitHub Free has no environments on a private repo. There setup-github sets the repository
// variable SECRETS_MODE to "repository", and this pushes repository secrets and variables named
// TEST_<name> and PRODUCTION_<name> instead: the names the pack's workflows read in that mode.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const WRANGLER = args.includes("--wrangler");
const only = args.includes("--env") ? args[args.indexOf("--env") + 1] : null;

// "repository" only when the repository variable says so. A read that fails keeps environments.
function secretsMode() {
  try {
    const out = execFileSync("gh", ["variable", "get", "SECRETS_MODE"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim() === "repository" ? "repository" : "environment";
  } catch {
    return "environment";
  }
}

/** The GitHub name and where it goes: an environment, or a prefixed repository name. */
function githubTarget(name, env, mode) {
  if (mode !== "repository") return { name, where: ["--env", env], label: `env ${env}` };
  const prefixed = `${env === "production" ? "PRODUCTION" : "TEST"}_${name}`;
  return { name: prefixed, where: [], label: `repository as ${prefixed}` };
}

function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function parseMeta(file) {
  const meta = {};
  if (!existsSync(file)) return meta;
  let comment = "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) { comment = line; continue; }
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/i);
    if (m) {
      const scope = (comment.match(/scope:\s*([a-z,\s]+)/i)?.[1] || "local,test,production").split(",").map((s) => s.trim());
      const secret = !/secret:\s*no/i.test(comment);
      meta[m[1]] = { scope, secret };
    }
    comment = "";
  }
  return meta;
}

const meta = parseMeta(".env.example");
if (!Object.keys(meta).length) {
  console.error("No variables found in .env.example. Add them there first (see the secrets skill).");
  process.exit(1);
}

const envs = ["test", "production"].filter((e) => !only || e === only);
const mode = secretsMode();
if (mode === "repository") console.log("SECRETS_MODE is \"repository\" (GitHub Free, private repo): GitHub values go to TEST_ and PRODUCTION_ repository names.");
let failed = 0;
for (const env of envs) {
  const file = `.env.${env}.local`;
  if (!existsSync(file)) { console.log(`${env}: no ${file}, skipped`); continue; }
  const values = parseEnv(file);
  for (const [name, m] of Object.entries(meta)) {
    if (!m.scope.includes(env)) continue;
    const value = values[name];
    if (!value) { console.log(`${env}: ${name} is empty in ${file}, skipped`); continue; }
    const gh = githubTarget(name, env, mode);
    const targets = m.secret
      ? [["gh", ["secret", "set", gh.name, ...gh.where]], ...(WRANGLER ? [["npx", ["wrangler", "secret", "put", name, "--env", env]]] : [])]
      : [["gh", ["variable", "set", gh.name, ...gh.where, "--body", value]]];
    for (const [cmd, cmdArgs] of targets) {
      const where = cmd === "gh" ? `${m.secret ? "GitHub secret" : "GitHub variable"} (${gh.label})` : "Cloudflare secret";
      if (DRY) { console.log(`${env}: would set ${name} as a ${where}`); continue; }
      try {
        execFileSync(cmd, cmdArgs, { input: m.secret ? value : undefined, stdio: ["pipe", "ignore", "pipe"] });
        console.log(`${env}: set ${name} as a ${where}`);
      } catch (e) {
        failed++;
        console.log(`${env}: FAILED ${name} as a ${where}: ${String(e.stderr || "").split("\n")[0]}`);
      }
    }
  }
}
process.exit(failed ? 1 : 0);
