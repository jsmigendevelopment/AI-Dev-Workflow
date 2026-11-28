// #541: the stack skill's backend rule (#344, decision 344-1). A pitch whose answers say it needs a backend and won't
// run on Cloudflare Workers gets a Go backend with a TypeScript web frontend. The checks read the table in
// docs/stack.md, never the chat. The two other answers of the rule (a backend on Workers keeps TypeScript, a static site
// gets no backend) are on the "check by hand" list: this scenario has one fixture.
import { result } from "../../lib/checks.mjs";
import { STACK } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 16, timeoutSec: 240 };

// Capitalised on purpose: "go with your picks" is not a language.
const GO = /\bGo(?:lang)?\b/;
// The TypeScript data stack that the web pack defaults to.
const TS_DATA = /\bDrizzle\b|\bD1\b|\bZod\b/i;
// A row for the web frontend, and a framework that is TypeScript.
const FRONTEND_AREA = /^(?:framework|front-?end|web(?:\s|$))/i;
const TS_FRONTEND = /TypeScript|TanStack|Next\.js|React|SvelteKit|Svelte|Vue|Nuxt|Remix|Astro|Solid/i;
// The rows that hold a backend's data and API: the choice cell must not default to Drizzle, D1 or Zod.
const DATA_AREA = /^(?:orm|database|data|quer|api|openapi|persistence|migration|schema|validation)/i;

/** The table rows of docs/stack.md as { area, choice }: the first two cells, so "Alternatives" never counts. */
function rows(text) {
  return (text ?? "").split("\n").flatMap((line) => {
    if (!line.trim().startsWith("|")) return [];
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 2 || /^:?-{2,}/.test(cells[0])) return [];
    return [{ area: cells[0].replaceAll("*", ""), choice: cells[1] }];
  });
}

const stackRows = (t) => rows(t.read("docs/stack.md"));
const unchanged = (t) => (t.read("docs/stack.md") ?? STACK) === STACK;

export const checks = [
  {
    id: "AC-541-2-backend-go",
    description: "docs/stack.md has a Backend row whose choice is Go, with no Drizzle, D1 or Zod in it",
    check: (t) => {
      const row = stackRows(t).find((r) => /^backend/i.test(r.area));
      if (!row) return result(false, "docs/stack.md has no Backend row");
      return result(GO.test(row.choice) && !TS_DATA.test(row.choice), `Backend: "${row.choice}"`);
    },
  },
  {
    id: "AC-541-2-typescript-frontend",
    description: "docs/stack.md names a TypeScript web frontend in its Framework (or Frontend) row",
    check: (t) => {
      const row = stackRows(t).find((r) => FRONTEND_AREA.test(r.area));
      if (!row) return result(false, "docs/stack.md has no Framework or Frontend row");
      return result(TS_FRONTEND.test(row.choice), `${row.area}: "${row.choice}"`);
    },
  },
  {
    id: "AC-541-2-no-ts-data-default",
    description: "No data or API row defaults to Drizzle, D1 or Zod: those are the TypeScript on Workers stack",
    check: (t) => {
      if (unchanged(t)) return result(false, "docs/stack.md is unchanged");
      const bad = stackRows(t).filter((r) => DATA_AREA.test(r.area) && TS_DATA.test(r.choice));
      return result(!bad.length, `still the TypeScript default: ${bad.map((r) => `${r.area}: ${r.choice}`).join(" / ")}`);
    },
  },
];

export const manual = [
  "The Why on the Backend row gives this app's own reasons (jobs of up to two hours, a progress connection that stays open, a server it rents), not just \"Go is fast\". File checks can't judge the quality of the reasons.",
  "The alternatives name the other two answers honestly: TypeScript on Workers if the person moves to Workers, and Python with FastAPI only if the work needs Python libraries.",
  "The frontend is said to call the Go service over HTTP (a versioned /api/v1 or an OpenAPI file), not to share server code with it.",
  "It says there is no Go pack yet (#356) and sets slice 0 up by hand, instead of claiming a pack that isn't there.",
  "It didn't ask the person a question it could answer from the pitch (the answers are in the prompt and docs/vision.md).",
  "The rule's other two answers aren't run here, because this scenario has one fixture: with \"on Workers\" the grill keeps TypeScript, and a static or content site gets TanStack Start alone with no backend row. Try each by hand with a pitch that says so.",
];
