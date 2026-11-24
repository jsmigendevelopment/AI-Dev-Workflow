// AC-5 of #97, for AC-3: a handoff whose owner's words could mean two things gets a receipt with
// the receiver's reading, and a question to the owner, before any work. Not a guess.
import { questionLines, result } from "../../lib/checks.mjs";
import { HANDOFF, HANDOFF_PATH, HERO } from "./fixture.mjs";

/** What the receiver added to the handoff file: the whole file if it was rewritten, "" if unchanged. */
function reply(t) {
  const text = t.read(HANDOFF_PATH) ?? "";
  return text.startsWith(HANDOFF) ? text.slice(HANDOFF.length) : text;
}

export const checks = [
  {
    id: "AC-5-receipt-with-reading",
    description: "The handoff file got a 'Got it' receipt that gives the receiver's reading",
    check: (t) => {
      const added = reply(t);
      return result(/got it/i.test(added) && /reading/i.test(added), added ? "the reply has no 'Got it' with a reading" : `${HANDOFF_PATH} has no reply`);
    },
  },
  {
    id: "AC-5-asks-owner",
    description: "The final message or the reply asks a question, and names the owner's words ('pop' or 'too quiet')",
    check: (t) => {
      const said = `${t.asked}\n${reply(t)}`;
      return result(questionLines(said).length > 0 && /\bpop\b|too quiet/i.test(said), "no question about what the owner's words mean");
    },
  },
  {
    id: "AC-5-no-guess",
    description: "Nothing under src/ changed or was added before the owner answered",
    check: (t) => {
      const changed = t.git("status", "--porcelain", "--untracked-files=all", "--", "src");
      const committed = t.git("diff", "--name-only", "main", "--", "src");
      return result(!changed && !committed && t.read("src/hero.html") === HERO, `src changed: ${changed || committed}`);
    },
  },
];

export const manual = [
  "The question quotes the owner's exact words and gives at least two readings (bolder styling and copy, or a video), with a recommended one.",
  "It says the sender's summary is one reading of the owner's words, not the owner's words.",
  "It names what it will do meanwhile, and starts nothing on the hero.",
];
