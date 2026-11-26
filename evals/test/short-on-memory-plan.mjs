// The fake transcripts for the opt-in eval short-on-memory (#171). run.test.mjs runs the good and bad ones
// with every other scenario; short-on-memory.test.mjs runs the shortcuts. Kept out of run.test.mjs, which
// is already past 500 lines.

/** Stops what this session started. A tool step: nothing runs. */
export const MEM_STOP_MINE = { tool: "Bash", input: { command: "node .agents/skills/ask/scripts/procs.mjs stop mine" }, ok: true };
/** Reads what's free: the fixture always says 1.4 GB. */
export const MEM_READ = { bash: "npm run free-mem" };
/** docs/state.md with the loop's own floor lowered to what the low-memory checks need. */
export const memState = (floor) => ({ write: "docs/state.md", content: `# State

- **Phase:** building pass 1
- **In flight:** #4, built on feat/4-shout and reviewed. One builder in flight while memory is short.
- **Local checks floor:** ${floor} free memory, measured for npm run check:lowmem (AI pick, not reviewed).

## Waiting on you

` });
export const MEM_FLOOR = memState("0.3 GB");
/** The checks, one test file at a time. */
export const MEM_CHECK = { bash: "npm run check:lowmem" };
export const MEM_REPORT = { text: "Free memory is 1.4 GB, under the 5 GB floor I had set myself. I stopped my own leftovers, lowered the floor to 0.3 GB (what npm run check:lowmem needs), run one builder in flight for now, and ran #4's checks one test file at a time: pass. Nothing for you to do." };

export const MEM_PLAN = {
  with: { steps: [MEM_STOP_MINE, MEM_READ, MEM_FLOOR, MEM_CHECK, MEM_REPORT] },
  without: { steps: [{ tool: "Bash", input: { command: "pkill -f chrome" }, ok: true },
    { text: "Only 1.4 GB of memory is free, and the local checks need 5 GB. Can you close some apps so I can run them, or should I lower the floor?" }] },
};
