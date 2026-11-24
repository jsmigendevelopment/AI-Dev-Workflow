// build and pyramid: slice 0 shows the running app, with its link, before any CI work (#99).
import { result } from "../../lib/checks.mjs";

// The fixture is npm, but a run may reach for another package manager's dev command.
const DEV = /\b(pnpm|yarn)\s+((-C|--filter)\s+\S+\s+)?(run\s+)?dev\b|\bnpm\s+(run\s+dev|start)\b|\bnode\s+(\.\/)?server\.mjs\b/;
const LINK = /(localhost|127\.0\.0\.1):3000/;
// A file written into .github/workflows: a redirect, tee or cp aimed there. Reads (`ls ... 2>/dev/null`) and mkdir don't count.
const CI_WRITE = />>?\s*["']?\S*\.github\/workflows\/|\btee\s+(-a\s+)?["']?\S*\.github\/workflows\/|\bcp\b[^\n;&|]*\s["']?\S*\.github\/workflows\/?\S*(?=\s*($|[;&|]))/;

/** What happened, in order: "dev" (the server started), "link" (said to the person), "ci" (a CI file written). */
function timeline(events) {
  const out = [];
  for (const e of events) {
    if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content) {
      if (b.type === "text" && LINK.test(b.text)) out.push("link");
      if (b.type !== "tool_use") continue;
      const command = String(b.input?.command ?? "");
      const path = String(b.input?.file_path ?? "");
      if (b.name === "Bash" && DEV.test(command)) out.push("dev");
      if (b.name === "Bash" && CI_WRITE.test(command)) out.push("ci");
      if (["Write", "Edit", "MultiEdit"].includes(b.name) && path.includes(".github/workflows/")) out.push("ci");
    }
  }
  return out;
}

export const checks = [
  {
    id: "dev-server-started",
    description: "The agent started the dev server (npm run dev, pnpm dev, yarn dev, npm start or node server.mjs)",
    check: (t) => result(timeline(t.events).includes("dev"), "no dev server command"),
  },
  {
    id: "link-given",
    description: "The person got the local link, http://localhost:3000",
    check: (t) => result(LINK.test(t.allText), "no localhost:3000 link in what the agent said"),
  },
  {
    id: "seen-before-ci",
    description: "A CI file was written, and the dev server and the link both came before it",
    check: (t) => {
      const line = timeline(t.events);
      const ci = line.indexOf("ci");
      if (ci < 0) return result(false, "no CI file was written");
      const missing = ["dev", "link"].filter((x) => !line.slice(0, ci).includes(x));
      return result(missing.length === 0, `before CI, no ${missing.join(" or ")}`);
    },
  },
];

export const manual = [
  "It says sign-in is off because CLERK_SECRET_KEY isn't set, and the app still runs.",
  "The look names the page and what to see on it (the app's name), not only the link.",
  "The dev server ran in the background, and the agent said it's running.",
];
