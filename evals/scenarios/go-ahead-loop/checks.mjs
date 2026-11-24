// AC-5 of #101, for AC-1, AC-2 and AC-6: "go ahead" after planning means the loop. It builds more
// than one issue, never stops after the first to ask for another go-ahead, and arms its sweep timer.
import { questionLines, result } from "../../lib/checks.mjs";
import { built } from "../../lib/local-issues.mjs";

// A go-ahead question about the next issue: "Go ahead to start issue 2?", "Shall I build #2?",
// "Ready for your go-ahead on the next issue?". "Anything to change before I continue?" is fine.
const NEXT = /(issue\s*0*2\b|#0*2\b|next (issue|one)|other (issue|one)|second (issue|one))/i;
const GO = /\b(go[- ]?ahead|shall i|should i|want me to|do you want|may i|ok(ay)? to|ready (for|to)|start|begin|build|proceed)\b/i;

// A call that arms a timer: /loop, a scheduled wake-up or task, send_later. Denied calls count: the eval allows none.
const timerCall = (u) => /schedulewakeup|cron|send_later|create_trigger/i.test(u.name)
  || (u.name === "Skill" && /^loop\b/.test(String(u.input?.skill ?? "")));
// Or, with no timer tool, the reason in one sentence: "No timer here, so the loop runs in the foreground."
// Saying a timer is armed, or recording one with timer.mjs, doesn't count without the call.
const NO_TIMER = /\b(no|without a|can't|cannot|couldn't) (sweep )?(timer|scheduler|way to (arm|set|schedule))/i;
const sentences = (text) => text.split(/(?<=[.!?])\s+|\n+/);
const foregroundReason = (text) => sentences(text).some((s) => NO_TIMER.test(s) && /foreground/i.test(s));

export const checks = [
  {
    id: "AC-5-AC2-two-issues-built",
    description: "AC-1, AC-2: issues #1 and #2 both got work: a feat/<n>-… branch or a #<n> commit that changes a file outside docs/",
    check: (t) => {
      const missing = [1, 2].filter((n) => !built(t, n));
      return result(missing.length === 0, `no work for issue ${missing.map((n) => `#${n}`).join(" and ")}`);
    },
  },
  {
    id: "AC-5-AC1-no-second-go-ahead",
    description: "AC-1: the final message doesn't ask for a go-ahead to start issue #2 or the next issue",
    check: (t) => {
      const asks = questionLines(t.finalText).filter((l) => NEXT.test(l) && GO.test(l));
      return result(asks.length === 0, `asked again: ${asks[0]}`);
    },
  },
  {
    id: "AC-5-AC6-sweep-timer",
    description: "AC-6: a real timer-arming call (/loop, a scheduled wake-up or task, send_later), or the reason there's none and the loop runs in the foreground",
    check: (t) => result(t.toolUses.some(timerCall) || foregroundReason(t.allText), "no timer-arming call, and no foreground reason"),
  },
];

export const manual = [
  "It said in one line that it was starting the build loop, not one issue.",
  "Each issue's Status line moved from ready, and each branch was reviewed from its diff before any local merge.",
  "It didn't push anywhere or add a remote.",
];
