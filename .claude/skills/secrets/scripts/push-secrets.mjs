#!/usr/bin/env node
// Push environment variables to GitHub environments (and Cloudflare with --wrangler)
// without ever printing a value. Reads:
//   .env.example            names and metadata (scope, secret)
//   .env.test.local         values for the "test" environment
//   .env.production.local   values for the "production" environment
// Usage: node push-secrets.mjs [--dry-run] [--wrangler] [--env test|production]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const WRANGLER = args.includes("--wrangler");
const only = args.includes("--env") ? args[args.indexOf("--env") + 1] : null;

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
let failed = 0;
for (const env of envs) {
  const file = `.env.${env}.local`;
  if (!existsSync(file)) { console.log(`${env}: no ${file}, skipped`); continue; }
  const values = parseEnv(file);
  for (const [name, m] of Object.entries(meta)) {
    if (!m.scope.includes(env)) continue;
    const value = values[name];
    if (!value) { console.log(`${env}: ${name} is empty in ${file}, skipped`); continue; }
    const targets = m.secret
      ? [["gh", ["secret", "set", name, "--env", env]], ...(WRANGLER ? [["npx", ["wrangler", "secret", "put", name, "--env", env]]] : [])]
      : [["gh", ["variable", "set", name, "--env", env, "--body", value]]];
    for (const [cmd, cmdArgs] of targets) {
      const where = cmd === "gh" ? (m.secret ? "GitHub secret" : "GitHub variable") : "Cloudflare secret";
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
