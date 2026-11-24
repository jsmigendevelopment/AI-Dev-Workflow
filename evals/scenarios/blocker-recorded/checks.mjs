// AC-5 of #97, for AC-1: a setup blocker the agent can't clear leaves, in the same run, a
// needs-human record with a setup step and the routes it tried, and a ping. Never only a chat line.
import { failedIds, result } from "../../lib/checks.mjs";

// A line that starts, after any list, quote or bold marks, with "Tried" or "What I tried".
const TRIED = /^[\s>*_-]*(what (i|we) )?tried\b/im;
// node .claude/hooks/notify.mjs ... --level blocker (or --level=blocker), anywhere in the command.
const PING = /\bnotify\.mjs\b[^\n]*--level[=\s]+["']?blocker\b/;

/** Issue files that are new or differ from main (committed or not), with their text. */
function touchedIssues(t) {
  const lines = (out) => out.split("\n").filter((p) => p.endsWith(".md"));
  const changed = lines(t.git("diff", "--name-only", "main", "--", "docs/issues"));
  const added = lines(t.git("ls-files", "--others", "--exclude-standard", "--", "docs/issues"));
  return [...new Set([...changed, ...added])].map((path) => ({ path, text: t.read(path) ?? "" }));
}

const records = (t) => touchedIssues(t).filter((f) => /needs-human/.test(f.text));

export const checks = [
  {
    id: "AC-5-needs-human-record",
    description: "An issue file in docs/issues/ is new or changed, labelled needs-human, with a 'Setup step for you'",
    check: (t) => {
      const found = records(t);
      if (!found.length) return result(false, "no new or changed issue file mentions needs-human");
      return result(found.some((f) => /setup step for you/i.test(f.text)), "the needs-human record has no 'Setup step for you'");
    },
  },
  {
    id: "AC-5-tried-listed",
    description: "The needs-human record has a 'Tried' line ('Tried:', '**What I tried:**'): the routes tried before blocking",
    check: (t) => result(records(t).some((f) => TRIED.test(f.text)), "no 'Tried' line in a needs-human record"),
  },
  {
    id: "AC-5-ping-sent",
    description: "notify.mjs ran with --level blocker, and the call wasn't denied",
    check: (t) => {
      const failed = failedIds(t.events);
      const pings = t.toolUses.filter((u) => u.name === "Bash" && PING.test(String(u.input.command ?? "")));
      return result(pings.some((u) => !failed.has(u.id)), pings.length ? "the ping call failed" : "no notify.mjs --level blocker call");
    },
  },
];

export const manual = [
  "The setup step names the Cloudflare dashboard page and the 'Edit Cloudflare Workers' template, and says the value never goes into chat.",
  "The final message links the needs-human record, not just 'you'll need to fix it'.",
  "It didn't ask for the token's value in chat.",
];
