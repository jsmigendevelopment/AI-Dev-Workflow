// The opt-in eval go-backend-pick (#541): the stack file's Backend row, the TypeScript frontend and the data rows.
// AC-541-1 is the dry run, AC-541-2 a good transcript, AC-541-3 the bad ones. scenarios.test.mjs also runs the good
// and the bad transcript with every other scenario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { failedChecks } from "./failed-checks.mjs";
import { RUN, skipWin } from "./harness.mjs";
import { DONE, GO_BACKEND, GO_DATA, GO_PLAN, TS_BACKEND, TS_DATA, WEB, WRITE_TS, stackFile } from "./go-backend-pick-plan.mjs";

const BACKEND = "AC-541-2-backend-go";
const FRONTEND = "AC-541-2-typescript-frontend";
const DATA = "AC-541-2-no-ts-data-default";
const failedWith = (t, steps) => failedChecks(t, "go-backend-pick", { with: { steps }, without: GO_PLAN.without });
const dryRun = (...args) => spawnSync(process.execPath, [RUN, "--dry-run", ...args], { encoding: "utf8", env: { ...process.env, PATH: "" } });

test("AC-541-1: WHEN the dry run lists the scenarios THEN go-backend-pick is opted out and the default count is 40", () => {
  const all = dryRun();
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /Dry run: 40 run\(s\)/);
  assert.match(all.stdout, /^Opt-in, not in this run: .*\bgo-backend-pick\b.*\. Name them with --scenario\.$/m);
  assert.doesNotMatch(all.stdout, /go-backend-pick \[with\]/);
  const named = dryRun("--scenario", "go-backend-pick");
  assert.equal(named.status, 0, named.stderr);
  assert.match(named.stdout, /Dry run: 2 run\(s\)/);
  assert.match(named.stdout, /go-backend-pick \[with\]/);
  assert.match(named.stdout, /go-backend-pick: its own limits, 16 turns, 240 s, \$0\.5 budget/);
});

test("AC-541-2: WHEN docs/stack.md says Go with a TypeScript frontend THEN every check passes", { skip: skipWin }, (t) => {
  assert.deepEqual(failedWith(t, GO_PLAN.with.steps), []);
  // The plainest Go row, and another TypeScript frontend.
  const next = stackFile("| Backend | Go | TypeScript on Workers | chosen | Long jobs |\n", "| Framework | Next.js | TanStack Start | chosen | Familiar |\n", GO_DATA);
  assert.deepEqual(failedWith(t, [next, DONE]), []);
});

test("AC-541-3: WHEN docs/stack.md says Drizzle on D1 for the off-Workers answer THEN the Backend check fails", { skip: skipWin }, (t) => {
  assert.ok(failedWith(t, [WRITE_TS, DONE]).includes(BACKEND));
  assert.ok(failedWith(t, [stackFile("| Backend | TypeScript on Workers, with Drizzle on D1 | Go | default | One deploy |\n", WEB), DONE]).includes(BACKEND));
});

const SHORTCUTS = {
  "the stack file was never written": [[{ text: "Go, with a TypeScript frontend." }], [BACKEND, FRONTEND, DATA]],
  "the old default: TypeScript, Drizzle, D1 and Zod": [[WRITE_TS, DONE], [BACKEND, DATA]],
  "Go in the Backend row, with Drizzle and D1 left as the data default": [[stackFile(GO_BACKEND, WEB, TS_DATA), DONE], [DATA]],
  "Go in the Backend row, with Zod as the API default": [[stackFile(GO_BACKEND, WEB, "| API style | Zod schemas at the edge | OpenAPI | default | The web pack default |\n"), DONE], [DATA]],
  "Go in the Backend row, with a Zod OpenAPI generator": [[stackFile(GO_BACKEND, WEB, "| OpenAPI generator | zod-openapi | A spec file | default | The web pack default |\n"), DONE], [DATA]],
  "Go in the Backend row, but Drizzle on D1 in the same cell": [[stackFile("| Backend | Go service, with Drizzle on D1 | TypeScript on Workers | chosen | Long jobs |\n", WEB, GO_DATA), DONE], [BACKEND]],
  "Go named only as an alternative": [[stackFile(TS_BACKEND, WEB, GO_DATA), DONE], [BACKEND]],
  "Go in a sentence, with no Backend row": [[{ write: "docs/stack.md", content: "# Stack\n\nWe use Go for the backend.\n\n| Area | Choice |\n|---|---|\n| Framework | TanStack Start (React, TypeScript) |\n| Database | Postgres, through sqlc |\n" }, DONE], [BACKEND]],
  "no frontend named": [[stackFile(GO_BACKEND, GO_DATA), DONE], [FRONTEND]],
  "a frontend that isn't TypeScript": [[stackFile(GO_BACKEND, "| Framework | Server-rendered Go templates | TanStack Start | chosen | No JS build |\n", GO_DATA), DONE], [FRONTEND]],
  "Drizzle on D1 only in the alternatives column": [[stackFile(GO_BACKEND, WEB, "| Database | Postgres, through sqlc | Drizzle on D1 | chosen | The Go service owns its data |\n"), DONE], []],
  "Zod for the web forms isn't the backend's default": [[stackFile(GO_BACKEND, WEB, GO_DATA, "| Forms (when needed) | TanStack Form, with Zod for the inputs | React Hook Form | default | The web default |\n"), DONE], []],
  "the good one": [GO_PLAN.with.steps, []],
};

test("AC-541-3: go-backend-pick: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});
