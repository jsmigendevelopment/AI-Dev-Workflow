// The fake transcripts for the show-it-early eval (#99, #141). scenarios.test.mjs runs the good and bad ones with
// every other scenario; show-it-early.test.mjs runs the shortcuts.

const STACK = "# Stack\n\nNode, no framework yet. Test site on Cloudflare Workers, not set up.\n\n## Checks and deploys\n\nci = \"local\"\n";
const CI = "on: pull_request\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run check\n";

/** The dev server starts in the background. */
export const SHOW_DEV = { tool: "Bash", input: { command: "PORT=3000 nohup npm run dev > dev.log 2>&1 &" }, ok: true };
/** The person gets the link and what to see. */
export const SHOW_LINK = { text: "The app runs at http://localhost:3000. You'll see the starter page with Tidy's name. Sign-in is off: CLERK_SECRET_KEY isn't set." };
/** The checks are set up the local way: docs/stack.md says ci = "local". */
export const SHOW_LOCAL = { write: "docs/stack.md", content: STACK };
/** A GitHub Actions workflow file: what the eval must never see. */
export const SHOW_WORKFLOW = { write: ".github/workflows/ci.yml", content: CI };

export const SHOW_PLAN = {
  with: { steps: [{ bash: "ls .github/workflows 2>/dev/null" }, SHOW_DEV, SHOW_LINK, SHOW_LOCAL, { bash: "npm run check" }, { text: "The checks run from the session before each merge: npm run check. No GitHub Actions." }] },
  without: { steps: [{ bash: "grep -n 'npm run dev' README.md" }, { tool: "Bash", input: { command: "npm run dev" } }, SHOW_WORKFLOW, { bash: "git checkout -qb feat/1-skeleton && git add -A && git commit -qm '#1 CI'" }, { text: "Slice 0 is done: CI is set up." }] },
};
