// build and pyramid: slice 0 shows the running app, with its link, before the checks are set up (#99, AC-5),
// and the checks are set up the local way, with no GitHub Actions workflow (#141, AC-2).
import { failedIds, result } from "../../lib/checks.mjs";

// A command that runs a dev server: at the start of the command, or after ; && || | or (, with any
// `nohup`, `timeout N` or VAR=value in front, the package manager then `dev` or `run dev` (npm start and
// node server.mjs too). A trailing & is fine. `grep "npm run dev" README.md` doesn't count.
const DEV = /(^|[;&|(])\s*(nohup\s+|timeout\s+\S+\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*((pnpm|yarn)\s+((-C|--filter|--dir)\s+\S+\s+)?(run\s+)?dev\b|npm\s+(run\s+dev|start)\b|node\s+(\.\/)?server\.mjs\b)/m;
const LINK = /(localhost|127\.0\.0\.1):3000/;
// A file written into .github/workflows: a redirect, tee or cp aimed there. Reads (`ls ... 2>/dev/null`) and mkdir don't count.
const WORKFLOW_WRITE = />>?\s*["']?\S*\.github\/workflows\/|\btee\s+(-a\s+)?["']?\S*\.github\/workflows\/|\bcp\b[^\n;&|]*\s["']?\S*\.github\/workflows\/?\S*(?=\s*($|[;&|]))/;
// The local checks set up: `ci = "local"` written to docs/stack.md, by a Write, an Edit or a shell command.
const LOCAL_LINE = /ci = "local"/;
const STACK = /(^|\/)docs\/stack\.md$/;

/** What happened, in order: "dev" (the server started), "link" (said to the person), "local" (ci = "local" written), "workflow" (a workflow file written). Errored calls don't count. */
function timeline(events) {
  const failed = failedIds(events);
  const out = [];
  for (const e of events) {
    if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content) {
      if (b.type === "text" && LINK.test(b.text)) out.push("link");
      if (b.type !== "tool_use" || failed.has(b.id)) continue;
      const command = String(b.input?.command ?? "");
      const path = String(b.input?.file_path ?? "");
      const written = String(b.input?.content ?? b.input?.new_string ?? "") + (b.input?.edits ?? []).map((x) => x.new_string ?? "").join("\n");
      if (b.name === "Bash" && DEV.test(command)) out.push("dev");
      if (b.name === "Bash" && WORKFLOW_WRITE.test(command)) out.push("workflow");
      if (b.name === "Bash" && LOCAL_LINE.test(command) && /docs\/stack\.md/.test(command)) out.push("local");
      if (["Write", "Edit", "MultiEdit"].includes(b.name) && path.includes(".github/workflows/")) out.push("workflow");
      if (["Write", "Edit", "MultiEdit"].includes(b.name) && STACK.test(path) && LOCAL_LINE.test(written)) out.push("local");
    }
  }
  return out;
}

export const checks = [
  {
    id: "AC-5-dev-server-started",
    description: "The agent started the dev server (npm run dev, pnpm dev, yarn dev, npm start or node server.mjs)",
    check: (t) => result(timeline(t.events).includes("dev"), "no dev server command"),
  },
  {
    id: "AC-5-link-given",
    description: "The person got the local link, http://localhost:3000",
    check: (t) => result(LINK.test(t.allText), "no localhost:3000 link in what the agent said"),
  },
  {
    id: "AC-5-seen-before-checks",
    description: "The checks were set up the local way (ci = \"local\" in docs/stack.md), and the dev server and the link both came before it",
    check: (t) => {
      const line = timeline(t.events);
      const local = line.indexOf("local");
      if (local < 0) return result(false, "ci = \"local\" was never written to docs/stack.md");
      const missing = ["dev", "link"].filter((x) => !line.slice(0, local).includes(x));
      return result(missing.length === 0, `before the checks, no ${missing.join(" or ")}`);
    },
  },
  {
    id: "AC-141-2-no-workflow",
    description: "No file was written in .github/workflows/, and none is there at the end",
    check: (t) => {
      if (timeline(t.events).includes("workflow")) return result(false, "a file was written in .github/workflows/");
      return result(!t.exists(".github/workflows"), ".github/workflows/ exists at the end");
    },
  },
];

export const manual = [
  "It says sign-in is off because CLERK_SECRET_KEY isn't set, and the app still runs.",
  "The look names the page and what to see on it (the app's name), not only the link.",
  "The dev server ran in the background, and the agent said it's running.",
];
