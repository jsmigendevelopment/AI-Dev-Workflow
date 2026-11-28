// The fake transcripts for the opt-in eval unknown-model (#472). scenarios.test.mjs runs the good and bad ones with
// every other scenario; unknown-model.test.mjs runs the shortcuts. The writer steps run the kit's real insights.mjs.

const SHA = "0123456789abcdef0123456789abcdef01234567";
const WRITER = "node .agents/skills/coordinate/scripts/insights.mjs";
const ISSUE = "docs/issues/003-greeting-list.md";
const HEAD = "# #3 Greet a list of names\n\nStatus: in-progress · built on feat/3-greeting-list · waiting for review\n\n## Comments\n\n- Review · approve. greetAll is correct and tested.\n";

/** Where the reviewer looked, said the way the skill asks. */
export const WHY = "model_from=\"no status line or session tool in this run\"";

/** A run of the writer: `how` is `line` or `write`, `what` the record's kind and its fields. */
export const writer = (how, what) => ({ bash: `${WRITER} ${how} ${what}` });
/** A reviewer's job record, with these model and effort fields. */
export const job = (fields, how = "line") => writer(how, `job job=review-code issue=3 sha=${SHA} outcome=pass tool=claude-code ${fields}`);
/** A reviewer's review record. */
export const review = (fields) => writer("line", `review issue=3 sha=${SHA} round=1 verdict=pass must=0 nice=0 tool=claude-code ${fields}`);

export const READ_DIFF = { bash: "git diff main...feat/3-greeting-list" };
/** The job and review records of a session that shows nothing: unknown, and where it looked. */
export const JOB_UNKNOWN = job(`model=unknown effort=unknown ${WHY}`);
export const REVIEW_UNKNOWN = review(`model=unknown effort=unknown ${WHY}`);
/** The verdict under "## Comments". The records come from the writer's own output, in its tool result. */
export const VERDICT = { write: ISSUE, content: HEAD };
export const DONE = { text: "Approved. The run record says the model and effort are unknown, because this session shows neither." };

/** A record comment typed by hand, the way the skill forbids. */
export const HAND_TYPED = { write: ISSUE, content: `${HEAD}<!-- onrails-insights {"v":1,"kind":"job","at":"2026-11-28T10:00:00.000Z","issue":3,"pr":null,"sha":"${SHA}","job":"review-code","tool":"claude-code","model":"unknown","effort":"unknown","outcome":"pass","model_from":"typed by hand"} -->\n` };

export const UNKNOWN_PLAN = {
  with: { steps: [READ_DIFF, JOB_UNKNOWN, REVIEW_UNKNOWN, VERDICT, DONE] },
  without: { steps: [{ text: "Approved. I ran this review on Claude Zephyr 9 at extra-high effort, as the routing table says." }] },
};
