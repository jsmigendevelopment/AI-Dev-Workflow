#!/usr/bin/env node
// `coordinate` step 6.1.4 (#225): marks a checked commit with the local gate's `onrails/check` status, once. Run it
// from your checkout of main:
//   node mark-check.mjs <sha> --repo owner/name --state success|failure [--description "<text>"] [--record <file>]
// setup-github's probe only proves that the session which ran it could post a status. A later gate session may be
// refused (a proxy that blocks the write). Then, when main requires `onrails/check`, no merge can pass, so this
// says so at once and names the fix. It never retries and never waits.
// Main can require it through a ruleset or a classic branch protection, so it reads both.
// Exit 0: posted. 1: refused, and main doesn't require it, so the `Checks:` comment is the record. 2: a usage error.
// 3: refused, and main requires `onrails/check` (or its rules couldn't be read, or gh isn't installed): run
// setup-github from this session.
// --record <file> (#331): the gate's file, {pr, fence, commands: [{command, result, seconds}], failed, rerun}. Before
// the post, it writes one `check` insights record into docs/insights/ of the checkout this script sits in, whatever
// folder it runs from, on exit 0, 1 and 3 alike. A file it can't read, or a command name over 200 characters or
// with a control, format, line-separator or paragraph-separator character, is a usage error: exit 2, no record, no
// post. ONRAILS_NOW sets the record's clock (tests).
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gh, pages } from "./agent-files.mjs";
import { TEXT_CAP, VERSION, dayFolder, fileName, validate } from "./insights-record.mjs";

const CHECK = "onrails/check";
const SETUP = "node .agents/skills/name/scripts/setup-github.mjs";
const RESULTS = ["pass", "fail", "skipped"];
// The checkout this script sits in (<root>/.agents/skills/coordinate/scripts/), found without git: the coordinator
// may run it from any folder, and never runs git in the head's clone (step 6.1.3).
const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
// Controls (C0, DEL, C1), format characters (a right-to-left override, a byte order mark, zero width joiners) and
// line and paragraph separators. The summary and the merge check print records later, and an escape, a carriage
// return or a bidi override would garble or reorder that output.
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const CONTROLS = new RegExp(CONTROL.source, "gu");
const reason = (error) => String(error.stderr || error.message).split("\n").find((l) => l.trim())?.trim() ?? "refused";
/**
 * Text cut by whole code points, so an emoji is never split. A record's text fields count UTF-16 units (validate), so
 * it also stops before a character that would take the text past TEXT_CAP units.
 */
function cap(text) {
  let kept = "";
  for (const char of text ?? "") {
    if (kept.length + char.length > TEXT_CAP) break;
    kept += char;
  }
  return kept;
}

/** A command name a record can keep: text of at most TEXT_CAP characters, with no control, format, line-separator or paragraph-separator character. */
const plainName = (text) => typeof text === "string" && text !== "" && text.length <= TEXT_CAP && !CONTROL.test(text);

/** What is wrong with the gate's file, or null. */
function gateProblem(gate) {
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return "must be a JSON object";
  if (!Number.isInteger(gate.pr) || gate.pr < 1) return "pr: must be the pull request's number";
  if (!Array.isArray(gate.commands) || gate.commands.length === 0) return "commands: must list each command the gate ran";
  const bad = (c) => typeof c?.command !== "string" || !c.command || !RESULTS.includes(c.result) || !(typeof c.seconds === "number" && c.seconds >= 0);
  if (gate.commands.some(bad)) return "commands: each needs command, result (pass, fail or skipped) and seconds";
  if (!gate.commands.every((c) => plainName(c.command))) return `commands: a command name must be at most ${TEXT_CAP} characters, with no control, format, line-separator or paragraph-separator character`;
  if (gate.failed !== null && !plainName(gate.failed)) return `failed: must be the red command (at most ${TEXT_CAP} characters, no control, format, line-separator or paragraph-separator character), or null`;
  if (typeof gate.rerun !== "boolean") return "rerun: must be true or false";
  if (gate.fence !== undefined && typeof gate.fence !== "string") return "fence: must be the Fence: line";
  return null;
}

/** The `check` record for the gate's file, or the text of what is wrong with it. */
function checkRecord(file, sha, state) {
  let gate;
  try {
    gate = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return `can't be read as JSON (${error.code ?? error.message})`;
  }
  const problem = gateProblem(gate);
  if (problem) return problem;
  const at = new Date(process.env.ONRAILS_NOW || Date.now());
  if (Number.isNaN(at.getTime())) return "ONRAILS_NOW isn't a time";
  // The fence line can carry a long reason; the record keeps its first line without control characters, capped like
  // any text field.
  const fence = cap(gate.fence?.split("\n")[0].replace(CONTROLS, ""));
  const record = {
    v: VERSION, kind: "check", at: at.toISOString(), issue: null, pr: gate.pr, sha, job: null, tool: null,
    model: "unknown", effort: "unknown", state, ...(fence ? { fence } : {}),
    commands: gate.commands.map(({ command, result, seconds }) => ({ name: command, result, seconds })),
    failed_step: gate.failed, flaky_rerun: gate.rerun,
  };
  const errors = validate(record);
  return errors.length ? errors.join("; ") : record;
}

/** Writes the record into this script's checkout, docs/insights/<day>/, and returns its path. Throws when it can't. */
function writeRecord(record) {
  if (!existsSync(join(ROOT, "docs"))) throw new Error(`no docs/ folder in ${ROOT}, the checkout this script sits in`);
  const dir = join(ROOT, dayFolder(record));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, fileName(record));
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  return path;
}

/** Where main requires `onrails/check`: "a ruleset", "its branch protection", or null. Throws when it can't be read. */
function mainRequires(repo) {
  const branch = encodeURIComponent(JSON.parse(gh(`repos/${repo}`)).default_branch);
  const ruleset = pages(`repos/${repo}/rules/branches/${branch}`)
    .filter((r) => r.type === "required_status_checks")
    .some((r) => (r.parameters?.required_status_checks ?? []).some((c) => c.context === CHECK));
  if (ruleset) return "a ruleset";
  // The branch itself carries a classic protection's checks, readable without admin access, unlike its protection path.
  const classic = JSON.parse(gh(`repos/${repo}/branches/${branch}`)).protection?.required_status_checks ?? {};
  const contexts = [...(classic.contexts ?? []), ...(classic.checks ?? []).map((c) => c.context)];
  return contexts.includes(CHECK) ? "its branch protection" : null;
}

export function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const [sha] = argv;
  const repo = flag("--repo");
  const state = flag("--state");
  const file = flag("--record");
  if (!/^[0-9a-f]{40}$/.test(sha ?? "") || !repo || !["success", "failure"].includes(state) || (argv.includes("--record") && !file)) {
    console.error('Usage: mark-check.mjs <40-character sha> --repo <owner>/<name> --state success|failure [--description "<text>"] [--record <file>]');
    return 2;
  }
  if (file) {
    const record = checkRecord(file, sha, state);
    if (typeof record === "string") {
      console.error(`--record ${file}: ${record}. Nothing was recorded or posted: fix the file and run this again.`);
      return 2;
    }
    try {
      console.log(`Insights: wrote ${writeRecord(record)}`);
    } catch (error) {
      // The status still goes out: the record only counts the run, while a missing status can hold up the merge.
      console.error(`Insights: couldn't write the check record (${reason(error)}). Posting the status anyway.`);
    }
  }
  const description = flag("--description") ?? (state === "success" ? "the local gate passed" : "the local gate failed");
  try {
    // The path goes last, after the fields.
    gh("-X", "POST", "-f", `state=${state}`, "-f", `context=${CHECK}`, "-f", `description=${description}`, `repos/${repo}/statuses/${sha}`);
    console.log(`${sha}: posted ${CHECK} = ${state}`);
    return 0;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`${sha}: gh isn't installed here (or not on PATH), so ${CHECK} wasn't posted and main's rules couldn't be read: treat it as required. Install gh and sign in, then run this again.`);
      return 3;
    }
    const refused = `${sha}: GitHub refused the ${CHECK} status here (${reason(error)})`;
    let required;
    try {
      required = mainRequires(repo);
    } catch (readError) {
      console.error(`${refused}, and couldn't read main's rules (${reason(readError)}), so treat it as required. Run ${SETUP} from this session: its probe is refused here too, so it drops the requirement.`);
      return 3;
    }
    if (!required) {
      console.error(`${refused}. main doesn't require ${CHECK}: the Checks: comment is the record.`);
      return 1;
    }
    console.error(`${refused}, and main requires ${CHECK} (${required}), so no merge can pass. Run ${SETUP} from this session: its probe is refused here too, so it drops the requirement from its own protect-main ruleset. Another rule that requires it needs removing in the repo's settings.`);
    return 3;
  }
}

/** True when node started this file, also through a symlinked file or folder: import.meta.url is the real path, so
 * argv[1] is resolved to its real path too (#506, as in pr-size.mjs, #439). */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false; // An argv[1] that names no file (a REPL, a loader's stand-in) isn't this module.
  }
}

if (isMainModule()) process.exitCode = main(process.argv.slice(2));
