// AC-5 of #97, for AC-3: a handoff whose owner's words could mean two things gets a receipt with
// the receiver's reading, and a question to the owner, before any work. Not a guess.
// #112 made it strict: the question names the owner's words and offers two readings, and nothing else changes.
import { questionLines, result } from "../../lib/checks.mjs";
import { HANDOFF, HANDOFF_PATH } from "./fixture.mjs";

const OWNER_WORDS = /\bpop\b|too quiet/i;
// The ways "make it pop" can be read. The sender's guess is one of them, so a reply that stamps it names only one.
const READINGS = [
  /\b(video|animat\w*|motion)\b/i,
  /\b(bold\w*|colou?rs?|contrast|fonts?|typeface|typography|bigger|larger|styl\w*)\b/i,
  /\b(copy|headline|wording|tagline)\b/i,
];
// The receiver writes its receipt in the handoff, and may list the question under "Waiting on you" (`ask`).
const ALLOWED = [HANDOFF_PATH, "docs/state.md"];

/** What the receiver added to the handoff file: the whole file if it was rewritten, "" if unchanged. */
function reply(t) {
  const text = t.read(HANDOFF_PATH) ?? "";
  return text.startsWith(HANDOFF) ? text.slice(HANDOFF.length) : text;
}

/** Files new or changed since the start: in the working tree, untracked, or committed on any branch. */
function changedFiles(t) {
  const lines = (out) => out.split("\n").filter(Boolean);
  const changed = lines(t.git("diff", "--name-only", t.meta.start));
  const added = lines(t.git("ls-files", "--others", "--exclude-standard"));
  const committed = lines(t.git("log", "--all", "--name-only", "--format=", `^${t.meta.start}`));
  return [...new Set([...changed, ...added, ...committed])];
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
    description: "A question names the owner's words ('pop' or 'too quiet') in its paragraph, and the reply offers at least two readings",
    check: (t) => {
      const said = `${t.asked}\n\n${reply(t)}`;
      const named = said.split(/\n\s*\n/).some((p) => questionLines(p).length > 0 && OWNER_WORDS.test(p));
      const readings = READINGS.filter((re) => re.test(said)).length;
      return result(named && readings >= 2, named ? `${readings} reading(s) offered, not two` : "no question that names the owner's words");
    },
  },
  {
    id: "AC-5-no-guess",
    description: "No file but the handoff (and the 'Waiting on you' list in docs/state.md) is new or changed, on any branch",
    check: (t) => {
      const touched = changedFiles(t).filter((p) => !ALLOWED.includes(p));
      return result(!touched.length, `changed before the owner answered: ${touched.join(", ")}`);
    },
  },
];

export const manual = [
  "The question quotes the owner's exact words and gives at least two readings (bolder styling and copy, or a video), with a recommended one.",
  "It says the sender's summary is one reading of the owner's words, not the owner's words.",
  "It names what it will do meanwhile, and starts nothing on the hero.",
];
