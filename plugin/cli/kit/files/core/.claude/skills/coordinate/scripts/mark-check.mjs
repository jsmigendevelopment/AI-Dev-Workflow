#!/usr/bin/env node
// `coordinate` step 6.1.4 (#225): marks a checked commit with the local gate's `onrails/check` status, once. Run it
// from your checkout of main:
//   node mark-check.mjs <sha> --repo owner/name --state success|failure [--description "<text>"]
// setup-github's probe only proves that the session which ran it could post a status. A later gate session may be
// refused (a proxy that blocks the write). Then, when main requires `onrails/check`, no merge can pass, so this
// says so at once and names the fix. It never retries and never waits.
// Exit 0: posted. 1: refused, and main doesn't require it, so the `Checks:` comment is the record. 2: a usage error.
// 3: refused, and main requires `onrails/check` (or its rules couldn't be read): run setup-github from this session.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gh, pages } from "./agent-files.mjs";

const CHECK = "onrails/check";
const SETUP = "node .agents/skills/name/scripts/setup-github.mjs";
const reason = (error) => String(error.stderr || error.message).split("\n").find((l) => l.trim())?.trim() ?? "refused";

/** Whether main's active rules require `onrails/check`. Throws when they can't be read. */
function mainRequires(repo) {
  const branch = JSON.parse(gh(`repos/${repo}`)).default_branch;
  return pages(`repos/${repo}/rules/branches/${encodeURIComponent(branch)}`)
    .filter((r) => r.type === "required_status_checks")
    .some((r) => (r.parameters?.required_status_checks ?? []).some((c) => c.context === CHECK));
}

export function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const [sha] = argv;
  const repo = flag("--repo");
  const state = flag("--state");
  if (!/^[0-9a-f]{40}$/.test(sha ?? "") || !repo || !["success", "failure"].includes(state)) {
    console.error('Usage: mark-check.mjs <40-character sha> --repo <owner>/<name> --state success|failure [--description "<text>"]');
    return 2;
  }
  const description = flag("--description") ?? (state === "success" ? "the local gate passed" : "the local gate failed");
  try {
    // The path goes last, after the fields.
    gh("-X", "POST", "-f", `state=${state}`, "-f", `context=${CHECK}`, "-f", `description=${description}`, `repos/${repo}/statuses/${sha}`);
    console.log(`${sha}: posted ${CHECK} = ${state}`);
    return 0;
  } catch (error) {
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
    console.error(`${refused}, and main requires ${CHECK}, so no merge can pass. Run ${SETUP} from this session: its probe is refused here too, so it drops the requirement.`);
    return 3;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
