#!/usr/bin/env node
// Push environment variables to Cloudflare (--wrangler), to Google Cloud Run (--cloud-run, a Go service's host),
// and to GitHub environments only when docs/stack.md says ci = "actions", without ever printing a value. Reads:
//   .env.example            names and metadata (scope, secret)
//   .env.test.local         values for the "test" environment
//   .env.production.local   values for the "production" environment
// Usage: node push-secrets.mjs [--dry-run] [--wrangler] [--cloud-run [--service BASE] [--region R] [--project P]]
//        [--env test|production]
// A flag's value is the next word: `--service=shop` (the = form) is refused with exit 1 before any call.
// On ci = "local" (every repo, unless the person turned Actions on) nothing reads GitHub's copies,
// so nothing goes to GitHub: secrets go to the Cloudflare Workers with --wrangler, and plain
// variables belong in wrangler.jsonc vars.
// --cloud-run (decision 340-1): each secret goes to Secret Manager as <BASE>-<env>-<NAME> (gcloud secrets create,
// else gcloud secrets versions add, the value on stdin), and each plain variable to the service <BASE>-<env>
// (gcloud run services update, the value in a temp --flags-file, never an argument). BASE is "api" unless --service
// says. Wiring a secret into the service (--update-secrets NAME=<id>:latest) is the deploy's job.
// Its last line names, by name only, every value it stored nowhere ("Stored nowhere: ...") and
// every value a destination failed for ("Not stored everywhere ..."), then "Keep ...". Only when
// nothing failed does it say "Every value is stored somewhere." and exit 0; only then may
// .env.production.local go.
// GitHub Free has no environments on a private repo. There setup-github sets the repository
// variable SECRETS_MODE to "repository", and this pushes repository secrets and variables named
// TEST_<name> and PRODUCTION_<name> instead: the names a workflow reads on ci = "actions".
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { commandFor, repoRoot } from "./command-for.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const WRANGLER = args.includes("--wrangler");
const CLOUD_RUN = args.includes("--cloud-run");
// Every flag takes its value as the next word. An `--name=value` form would be ignored (a push to production could go to
// the wrong service or project), so it stops the run before any call (decision 537-1).
const equalsForm = args.find((a) => /^--[a-z][a-z-]*=/.test(a));
if (equalsForm) {
  console.error(`${equalsForm.split("=")[0]}=... is not understood: write the flag and its value as two words (for example --service shop).`);
  process.exit(1);
}
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = flag("--env");

// "actions" only for a `ci = "actions"` line (a trailing # comment allowed) in the nearest
// docs/stack.md from this folder up to the repository root, or only in this folder before
// `git init`. The same rule and lookup as setup-github.mjs, connect and the TanStack pack's
// ci-mode.ts; cli/test/deploy-keys-followups runs the same fixtures on all four (#160).
const CI_ACTIONS = /^ci[ \t]*=[ \t]*"actions"[ \t]*(?:#.*)?\r?$/m;
function ci() {
  const start = process.cwd();
  const top = repoRoot(start) ?? start;
  for (let dir = start; ; dir = dirname(dir)) {
    const file = join(dir, "docs", "stack.md");
    if (existsSync(file)) return CI_ACTIONS.test(readFileSync(file, "utf8")) ? "actions" : "local";
    if (dir === top || dirname(dir) === dir) return "local";
  }
}

// "repository" only when the repository variable says so. A read that fails keeps environments.
function secretsMode() {
  const how = commandFor("gh", ["variable", "get", "SECRETS_MODE"]);
  if (how.why) return "environment";
  try {
    const out = execFileSync(how.file, how.args, {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: how.env, windowsVerbatimArguments: how.verbatim,
    });
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

/** True when a go.mod sits in this folder or any folder above it, up to the one holding .git (this folder before git init). */
function goModNear(start) {
  const top = repoRoot(start) ?? start;
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "go.mod"))) return true;
    if (dir === top || dirname(dir) === dir) return false;
  }
}

// --cloud-run names. They go to gcloud as plain words: a name that isn't one never starts a command.
const base = flag("--service") ?? "api";
const region = flag("--region");
const project = flag("--project");
for (const [name, value, rule] of [["--service", base, /^[a-z][a-z0-9-]{0,30}$/], ["--region", region, /^[a-z][a-z0-9-]*$/], ["--project", project, /^[a-z][a-z0-9:.-]*$/]]) {
  if (value !== null && !rule.test(value)) {
    console.error(`${name} ${JSON.stringify(value)} is not a plain name (lowercase letters, digits and hyphens).`);
    process.exit(1);
  }
}
// A Go service's repo keeps its keys with the Go host, so its messages name that flag; the web pack's still say --wrangler.
const GO = goModNear(process.cwd());

/** gcloud, with no prompt (a prompt would eat the value on stdin). Returns null, or { line, started }: the one line it failed with, and whether gcloud started at all. */
function gcloud(cmdArgs, input) {
  const how = commandFor("gcloud", [...cmdArgs, "--quiet", ...(region && cmdArgs[0] === "run" ? [`--region=${region}`] : []), ...(project ? [`--project=${project}`] : [])]);
  if (how.why) return { line: how.why, started: false };
  try {
    execFileSync(how.file, how.args, { input, stdio: ["pipe", "ignore", "pipe"], env: how.env, windowsVerbatimArguments: how.verbatim });
    return null;
  } catch (e) {
    const lines = String(e.stderr || "").split("\n").filter(Boolean);
    return { line: lines.find((l) => /ERROR/.test(l)) ?? lines[0] ?? "gcloud failed", started: true };
  }
}

/** The Cloud Run service and Secret Manager id for one value. */
const cloudRunNames = (name, env) => ({ service: `${base}-${env}`, secretId: `${base}-${env}-${name}` });

/** Where a --cloud-run call lands, for the dry run: a secret takes a project, a plain variable a project and a region. */
const cloudRunPlace = (secret) => {
  const inProject = project ? `project ${project}` : "gcloud's active project";
  return secret ? inProject : `${inProject}, ${region ? `region ${region}` : "gcloud's default region"}`;
};

/**
 * One value to Cloud Run: a secret to Secret Manager (create, else a new version; the value on stdin), a plain variable to
 * the service's environment (the value in a temp --flags-file, deleted after, so no argument holds it). Returns null or
 * the reason, which the caller hides values from.
 */
function toCloudRun(name, value, env, secret) {
  const { service, secretId } = cloudRunNames(name, env);
  if (secret) {
    const made = gcloud(["secrets", "create", secretId, "--data-file=-"], value);
    if (!made) return null;
    if (!made.started) return made.line;
    // The secret may exist already (create then fails): the value goes on as its next version.
    const added = gcloud(["secrets", "versions", "add", secretId, "--data-file=-"], value);
    return added && `create: ${made.line}; new version: ${added.line}`;
  }
  // A temp folder that can't be made or written is this name's failure, not a crash: the later names still go (AC-537-3).
  // The errors here hold a path and a code, never a value.
  let dir = null;
  let reason = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "onrails-push-"));
    const file = join(dir, "flags.yaml");
    writeFileSync(file, JSON.stringify({ "--update-env-vars": { [name]: value } }), { mode: 0o600 });
    // Forward slashes: gcloud.cmd takes only plain words on Windows, and gcloud reads C:/... as well as the backslash form
    reason = gcloud(["run", "services", "update", service, `--flags-file=${file.replaceAll("\\", "/")}`])?.line ?? null;
  } catch (e) {
    reason = `could not use a temporary folder for the flags file (${e.code ?? e.message})`;
  }
  if (!dir) return reason;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    reason = `${reason ? `${reason}; ` : ""}could not remove the temporary folder ${dir} (${e.code ?? e.message}): delete it by hand`;
  }
  return reason;
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
const GITHUB = ci() === "actions";
if (!GITHUB) {
  console.log(GO
    ? "ci = \"local\" (docs/stack.md): nothing goes to GitHub. Secrets go to Secret Manager with --cloud-run (or to Cloudflare with --wrangler); plain variables go to the Cloud Run service with --cloud-run."
    : "ci = \"local\" (docs/stack.md): nothing goes to GitHub. Secrets go to Cloudflare with --wrangler; plain variables belong in wrangler.jsonc vars.");
}
const mode = GITHUB ? secretsMode() : "environment";
if (mode === "repository") console.log("SECRETS_MODE is \"repository\" (GitHub Free, private repo): GitHub values go to TEST_ and PRODUCTION_ repository names.");
let failed = 0;
let found = 0;
// Every value no destination took, as `NAME (env)`: its .env.<env>.local is its only copy.
const nowhere = [];
// Every value some destination took and another failed for (GitHub yes, the Worker no, #160).
const partly = [];
for (const env of envs) {
  const file = `.env.${env}.local`;
  if (!existsSync(file)) { console.log(`${env}: no ${file}, skipped`); continue; }
  const values = parseEnv(file);
  // A tool's error can echo what it was given: every value in the file is hidden before a line prints, as connect does (#161).
  // gcloud may echo a value in its JSON-escaped form (a quote or backslash in it), so that form is hidden too, longest first.
  const secretsToHide = [...new Set(Object.values(values).filter(Boolean).flatMap((v) => [v, JSON.stringify(v).slice(1, -1)]))].sort((a, b) => b.length - a.length);
  const hide = (text) => secretsToHide.reduce((t, v) => t.replaceAll(v, "<hidden>"), String(text));
  for (const [name, m] of Object.entries(meta)) {
    if (!m.scope.includes(env)) continue;
    const value = values[name];
    if (!value) { console.log(`${env}: ${name} is empty in ${file}, skipped`); continue; }
    found++;
    const gh = githubTarget(name, env, mode);
    const targets = m.secret
      ? [...(GITHUB ? [["gh", ["secret", "set", gh.name, ...gh.where]]] : []), ...(WRANGLER ? [["npx", ["wrangler", "secret", "put", name, "--env", env]]] : []), ...(CLOUD_RUN ? [["cloud-run"]] : [])]
      : [...(GITHUB ? [["gh", ["variable", "set", gh.name, ...gh.where], value]] : []), ...(CLOUD_RUN ? [["cloud-run"]] : [])];
    if (!targets.length) {
      const plain = GO ? "a plain variable: --cloud-run sets it on the Cloud Run service" : "a plain variable: it goes in wrangler.jsonc vars";
      const why = m.secret ? `a secret, and nothing takes one on ci = "local" without ${GO ? "--cloud-run or --wrangler" : "--wrangler"}` : plain;
      console.log(`${env}: ${name} ${DRY ? "would be" : "is"} stored nowhere (${why})`);
    }
    let stored = false;
    let missed = false;
    // A plain variable's value is a target's third item: it goes on --body, never in the words commandFor checks.
    for (const [cmd, cmdArgs, body] of targets) {
      const cr = cloudRunNames(name, env);
      const where = cmd === "gh" ? `${m.secret ? "GitHub secret" : "GitHub variable"} (${gh.label})`
        : cmd === "cloud-run" ? (m.secret ? `Secret Manager secret (${cr.secretId})` : `Cloud Run variable (service ${cr.service})`)
          : "Cloudflare secret";
      if (DRY) { console.log(`${env}: would set ${name} as a ${where}${cmd === "cloud-run" ? ` in ${cloudRunPlace(m.secret)}` : ""}`); stored = true; continue; }
      if (cmd === "cloud-run") {
        const reason = toCloudRun(name, value, env, m.secret);
        if (!reason) {
          console.log(`${env}: set ${name} as a ${where}`);
          stored = true;
        } else {
          console.log(`${env}: FAILED ${name} as a ${where}: ${hide(reason)}`);
          failed++;
          missed = true;
        }
        continue;
      }
      const how = commandFor(cmd, cmdArgs);
      if (how.why) {
        failed++;
        missed = true;
        console.log(`${env}: FAILED ${name} as a ${where}: ${how.why}`);
        continue;
      }
      // cmd.exe never gets a value: through a gh.cmd, gh variable set reads it from stdin, as with no --body (#238).
      const line = body === undefined || how.verbatim ? how.args : [...how.args, "--body", body];
      try {
        execFileSync(how.file, line, {
          input: m.secret || how.verbatim ? value : undefined, stdio: ["pipe", "ignore", "pipe"], env: how.env, windowsVerbatimArguments: how.verbatim,
        });
        console.log(`${env}: set ${name} as a ${where}`);
        stored = true;
      } catch (e) {
        failed++;
        missed = true;
        console.log(`${env}: FAILED ${name} as a ${where}: ${hide(String(e.stderr || "").split("\n")[0])}`);
      }
    }
    if (!stored) nowhere.push(`${name} (${env})`);
    else if (missed) partly.push(`${name} (${env})`);
  }
}
// The secrets skill offers to delete .env.production.local only after "Every value is stored
// somewhere." and exit 0. A failure anywhere keeps that line from printing.
const unstored = [...nowhere, ...partly];
if (!found) console.log("No values found to store.");
else if (unstored.length) {
  const said = [];
  if (nowhere.length) said.push(`${DRY ? "Would store nowhere" : "Stored nowhere"}: ${nowhere.join(", ")}.`);
  if (partly.length) said.push(`Not stored everywhere (a destination FAILED above): ${partly.join(", ")}.`);
  const keep = envs.filter((env) => unstored.some((n) => n.endsWith(`(${env})`))).map((env) => `.env.${env}.local`);
  console.log(`${said.join(" ")} Keep ${keep.join(" and ")} until each one is stored.`);
} else console.log(DRY ? "Every value would be stored somewhere." : "Every value is stored somewhere.");
process.exit(failed ? 1 : 0);
