// The copies sync-skills.mjs makes from a master elsewhere in the repo. Data only, so the kit's tests can import the
// list without starting the sync (#430). .gitattributes marks every copy `linguist-generated`, and
// cli/test/copies-generated.test.mjs checks that it does.
import { join } from "node:path";

/** The skills' master copy, which sync-skills.mjs mirrors to .claude/skills. */
export const SRC = ".agents/skills";
// The people-facing guides ship inside the build skill, so every project has them. The research checker ships inside
// the research skill, so apps can run it in CI, and in the CLI, so doctor can list stale dossiers.
const CHECKER = join("scripts", "check-research.mjs");
const LIBRARY = join("scripts", "research-library.mjs");
const TEMPLATE = join("templates", "research-library");
// Preflight ships inside the ask skill, so an agent can run it with plain node, and in the CLI (a global onrails preflight).
// preflight-sys.mjs is its system layer (#169), preflight-owner.mjs says who may write a folder (#232, #246),
// preflight-layout.mjs finds the repo's checkouts (#182), and preflight-ci.mjs finds workflow files and Actions left on
// (#133; doctor and ci local use it too); preflight-output.mjs (the ladders, table and record) and preflight-versions.mjs
// (the Node and package manager row) were split out of it (#195): they go wherever preflight.mjs goes. preflight-owner.mjs also imports
// procs-sys.mjs, procs-winacl.mjs and procs-store.mjs (#232, #248): it works only because PROCS below ships to the same
// folders, so a new home for preflight needs those three as well.
const PREFLIGHT = ["preflight.mjs", "preflight-sys.mjs", "preflight-owner.mjs", "preflight-layout.mjs", "preflight-ci.mjs",
  "preflight-output.mjs", "preflight-versions.mjs"];
// The process registry ships the same way: the ask skill for agents and the hooks, the CLI for npx onrails ps.
const PROCS = ["procs.mjs", "procs-sys.mjs", "procs-winacl.mjs", "procs-store.mjs", "procs-path.mjs", "procs-records.mjs", "procs-stop.mjs", "procs-hooks.mjs"];
/** Each copy as [master, copy], both relative to the repo. */
export const COPIES = [
  ...["code-style.md", "testing.md", "app-conventions.md", "app-conventions-go.md"].map((name) => [join("guide", name), join(SRC, "build", "references", name)]),
  [CHECKER, join(SRC, "research", "scripts", "check-research.mjs")],
  [CHECKER, join("cli", "src", "check-research.mjs")],
  // The library helper and the template library's copies of the checker and the schemas.
  [LIBRARY, join(SRC, "research", "scripts", "research-library.mjs")],
  [LIBRARY, join("cli", "src", "research-library.mjs")],
  ...PREFLIGHT.flatMap((name) => [[join("scripts", name), join(SRC, "ask", "scripts", name)], [join("scripts", name), join("cli", "src", name)]]),
  ...PROCS.flatMap((name) => [[join("scripts", name), join(SRC, "ask", "scripts", name)], [join("scripts", name), join("cli", "src", name)]]),
  // The insights record format (#329): next to the coordinate skill's writer, and in the CLI for the readers.
  [join("scripts", "insights-record.mjs"), join(SRC, "coordinate", "scripts", "insights-record.mjs")],
  [join("scripts", "insights-record.mjs"), join("cli", "src", "insights-record.mjs")],
  // The weekly report (#381) reads the records with the format's validate, so it goes wherever that goes.
  [join("scripts", "insights-week.mjs"), join(SRC, "coordinate", "scripts", "insights-week.mjs")],
  [join("scripts", "insights-week.mjs"), join("cli", "src", "insights-week.mjs")],
  // The run log (#129) reads them the same way: a pull request's chain, an issue's or a day's.
  [join("scripts", "insights-runs.mjs"), join(SRC, "coordinate", "scripts", "insights-runs.mjs")],
  [join("scripts", "insights-runs.mjs"), join("cli", "src", "insights-runs.mjs")],
  // push-secrets' rule for starting gh and npx, also for setup-github's gh (#238), copied next to each script that needs it.
  // A skill script imports another skill's script only when both always ship together, as pyramid's check-plan.mjs
  // imports issues' check-issue-size.mjs (#376).
  // Also next to every research-library.mjs copy and agent-files.mjs, which start gh the same way (#274).
  ...[join(SRC, "name", "scripts"), join(SRC, "coordinate", "scripts"), join(SRC, "research", "scripts"), "scripts", join("cli", "src"), join(TEMPLATE, "scripts")]
    .map((dir) => [join(SRC, "secrets", "scripts", "command-for.mjs"), join(dir, "command-for.mjs")]),
  [CHECKER, join(TEMPLATE, "scripts", "check-research.mjs")],
  [LIBRARY, join(TEMPLATE, "scripts", "research-library.mjs")],
  ...["provenance.schema.json", "library.schema.json"].map((name) => [join(SRC, "research", "references", name), join(TEMPLATE, "schemas", name)]),
];
