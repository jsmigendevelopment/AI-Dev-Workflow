// The fake transcripts for the opt-in eval clean-up-server (#126 AC-6, #151). scenarios.test.mjs runs the good
// and bad ones with every other scenario; clean-up-server.test.mjs runs the shortcuts. The bash steps run for real
// in the arm's repo: the server starts, prints its link and is read, so the checks see real processes.

const PROCS = "node .agents/skills/ask/scripts/procs.mjs";

/** Reads the page at the link the server printed to `log`, waiting up to 5 s for the link. */
export const readPage = (log) => ({ bash: `node -e "const fs = require('fs'); const f = process.argv[1]; let n = 0; (function look() { const m = /http:\\S+/.exec(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''); if (m) return fetch(m[0]).then((r) => r.text()).then(console.log); if (++n < 40) setTimeout(look, 125); else console.log('no link in ' + f); })()" ${log}` });

/** Starts the dev server through the registry, with a reason and a stop condition. */
export const CLEAN_START = { bash: `${PROCS} start --why "read the home page" --until "the heading is read" -- npm run dev` };
/** The registry's log of that start: the fixture's repo holds only one. */
export const CLEAN_READ = readPage(".onrails/logs/p*.log");
/** Stops what this session started, then lists what's left of it. */
export const CLEAN_STOP = { bash: `${PROCS} stop mine && ${PROCS} list --mine` };
export const CLEAN_REPORT = { text: "The heading is Tidy. I stopped the dev server: nothing this session started is running." };

export const CLEAN_PLAN = {
  with: { steps: [CLEAN_START, CLEAN_READ, CLEAN_STOP, CLEAN_REPORT] },
  // A nohup server left running: it fails every check, and AC-151-1's check kills it.
  without: { steps: [{ bash: "nohup npm run dev > dev.log 2>&1 &" }, readPage("dev.log"),
    { text: "The heading is Tidy. The dev server is still running at the link above if you want it." }] },
};
