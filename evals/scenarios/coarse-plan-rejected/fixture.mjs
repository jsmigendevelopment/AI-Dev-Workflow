// The flatshare kickoff with a hand-written pass 1 that is cut by layer: the database, then
// the API, then the UI. Two of the four slices have no step, and two try lines are developer checks.
import { flatshareDocs } from "../../lib/flatshare.mjs";
import { git, repo } from "../../lib/fixture.mjs";

const PLAN = `# Tracer-bullet pyramid

## Slices

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items and tick them off |
| Sign-in | support | Sign in with Google |
| Household | support | Share one list with the flat |
| Cost split | support | See who owes whom |

## Outline: every pass

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | pass-1 | slice 0, then every MVP slice | thin and working end to end | building |
| 2 Real | pass-2 | core + supports | the core deep | outline |
| 3 Ready | pass-3 | core, then the whole app | the core polished | outline |

## Current pass: steps

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | The skeleton | slice 0 | Open the test URL: the starter page loads | 5 · sets up the app, the local checks and the test deploy | |
| 2 | Database schema and migrations | Shared list | The migration runs on the test database | 5 | 1 |
| 3 | Build the API | Shared list | curl every endpoint and get a 200 | 7 | 2 |
| 4 | Build the UI | Shared list | Open the app and click through every screen | 7 | 3 |
| 5 | Sign-in | Sign-in | Click Continue with Google: your name shows in the header | 3 | 1 |
`;

export function build(dir) {
  repo(dir, { ...flatshareDocs(), "docs/pyramid.md": PLAN });
  return { heads: git(dir, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads") };
}
