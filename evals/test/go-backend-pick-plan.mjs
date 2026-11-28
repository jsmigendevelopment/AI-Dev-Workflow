// The fake transcripts for the opt-in eval go-backend-pick (#541). scenarios.test.mjs runs the good and bad ones with
// every other scenario; go-backend-pick.test.mjs runs the shortcuts. Each stack file is the template's table, filled in.

const HEAD = "# Stack\n\n| Area | Choice | Alternatives considered | Default or chosen | Why |\n|---|---|---|---|---|\n";

/** The Backend row for a Go service that runs off Workers. */
export const GO_BACKEND = "| Backend | Go service, not on Workers | TypeScript on Workers; Python with FastAPI | chosen | Transcode jobs run for hours and the progress connection stays open; Workers can't hold that |\n";
/** The web frontend: TypeScript, calling the Go service over HTTP. */
export const WEB = "| Framework | TanStack Start (React, TypeScript), calling the backend over HTTP | Next.js | chosen | The web default |\n";
/** The data rows of a Go service: nothing from the TypeScript pack. */
export const GO_DATA = "| Database | Postgres, through sqlc | SQLite | chosen | The Go service owns its data |\n| API style | Versioned /api/v1 JSON, described by an OpenAPI file | GraphQL | chosen | The web app calls it |\n";
/** The data rows of the old default: Drizzle, D1 and Zod. */
export const TS_DATA = "| ORM | Drizzle | Kysely | default | The web pack default |\n| Database | Cloudflare D1 | Postgres | default | The web pack default |\n| API style | Typed server functions, inputs checked with Zod | tRPC | default | The web pack default |\n";
export const TS_BACKEND = "| Backend | TypeScript: Start server functions on Cloudflare Workers | Go | default | One language, one deploy |\n";

/** A docs/stack.md write: the template's table with these rows. */
export const stackFile = (...rows) => ({ write: "docs/stack.md", content: HEAD + rows.join("") });

/** Go, with a TypeScript frontend: the rule's answer for a backend that isn't on Workers. */
export const WRITE_GO = stackFile(GO_BACKEND, WEB, GO_DATA);
/** The old default for an app that said it isn't on Workers: TypeScript, Drizzle and D1. */
export const WRITE_TS = stackFile(TS_BACKEND, WEB, TS_DATA);
export const DONE = { text: "The backend is a Go service off Workers, with a TanStack Start frontend that calls it. It's in docs/stack.md." };

export const GO_PLAN = {
  with: { steps: [WRITE_GO, DONE] },
  without: { steps: [{ text: "Which database do you want?" }] },
};
