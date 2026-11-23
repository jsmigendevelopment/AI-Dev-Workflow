# Competitor scan: kits that steer AI coding agents

> **2026-11-23.** One pass, no fact-check. Method: the `research` skill, "Competitor scan". Sources are each project's own repo, read at the commits below, plus `npm view`. Websites and the GitHub API were blocked here, so **star counts are missing** and nothing on a product site was checked.

**Claim labels:** **[src]** read in source, templates or prompts · **[readme]** read in the project's README or docs folder · **[vendor]** a claim the vendor makes that I couldn't test · **[inf]** my inference · **[unverified]** from prior knowledge, no primary source reachable.

## What onRails is, for the comparison

An MIT kit for Claude Code and Codex. `AGENTS.md` (13 rules, a stop-and-ask list), 28 skills, and guardrails that don't depend on a prompt: lint, CI, blocked git commands. Four commands take an idea to a deployed test site: pitch, grill, MVP, stack, tracer-bullet plan, GitHub issues, then a build loop where one fresh agent builds each issue and other fresh agents review, QA and security-check it. Lanes and a risk dial decide who merges.

## The competitors

### GitHub Spec Kit
- **What:** a Python CLI (`specify`) that installs spec-driven commands into a coding agent. [readme]
- **How:** `/speckit-constitution` once, then per feature `specify` → `plan` → `tasks` → `implement` → `converge`, repeated until converge reports "Converged". Extras: `clarify`, `checklist`, `analyze`. [readme] Artifacts: `constitution.md` (versioned principles with ratified/amended dates), `spec.md` (user stories in Given/When/Then, `FR-001` requirements, inline `[NEEDS CLARIFICATION: …]` markers), `plan.md`, `tasks.md` with `[P]` for parallel-safe tasks. [src] `converge` reads the code against spec, plan and tasks and appends unbuilt work as new tasks. [src] `analyze` is a read-only cross-artifact consistency pass. [src]
- **Agents:** 43 integration keys in the catalog, Claude, Codex, Copilot, Cursor, Gemini, Kiro CLI and many more. [src] Extensions with `before_*`/`after_*` hooks, presets, workflows, bundles, catalogs, an experimental `specify mcp` server. [src]
- **Strengths:** breadth of agents; a real spec-to-code loop (`converge`); the clarification markers. Backed by GitHub, very active (24 changelog entries in v1.4.3 alone). [src]
- **Weaknesses:** stops at code. No review by a fresh agent, no CI, no deploy, no security lane. [inf] The extension system is getting heavy: every command prompt opens with ~40 lines of hook-parsing boilerplate. [src]
- **Licence, version, activity:** MIT. `specify-cli` 1.4.3 released 2026-11-19; main at 1.4.4.dev0. Last commit 2026-11-20. [src]

### Superpowers (obra/superpowers)
- **What:** a skills library that makes the agent brainstorm, plan, TDD and review. [readme]
- **How:** brainstorming → git worktree → writing-plans (2–5-minute tasks with exact paths and code) → subagent-driven-development (a fresh subagent per task, a review after each) → finishing a branch. A SessionStart hook loads `using-superpowers` so skills fire on their own. [readme][src]
- **Skill testing:** `writing-skills` says writing a skill *is* TDD: run a pressure scenario on a subagent without the skill, watch it fail, write the skill, watch it pass, close loopholes. [src] The repo has headless `claude -p` tests, trigger tests for explicit skill requests, pressure scenarios (e.g. "production is down, $15k a minute, skip the process?"), and a skill-size test. [src]
- **Brainstorming:** one question at a time, read the project before asking, lay out approaches, get a design doc approved before any plan. Optional browser "visual companion" for mockups, which has telemetry. [src][readme]
- **Agents:** 15 harnesses, including Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode. Listed in Anthropic's and OpenAI's official plugin marketplaces. [readme]
- **Strengths:** the best evidence that its skills change behaviour; strong review discipline; a skill that diagnoses a bad session from its transcript. [src]
- **Weaknesses:** a developer tool. No product grill, no stack, no GitHub issues, no CI or deploy, no security review. [inf]
- **Licence, version, activity:** MIT. Plugin 7.0.2. Last commit 2026-11-03. [src]

### BMAD Method
- **What:** "Agile AI-driven development": agent personas and workflows from idea to code. [readme]
- **How:** v6.12 stable installs with `npx bmad-method install`; v7 alpha on main installs modules with `npx skills add`. [readme] Personas are skills: Mary (analyst), John (PM), Winston (architect), Sally (UX), Amelia (dev). [src] `bmad-build` routes a change to "oneshot" or "full" and picks a review depth. [src] `party-mode` runs a roundtable between personas; `advanced-elicitation` pushes a draft with methods like pre-mortem and red team, each run as an independent reader. [src] Every skill reads a three-layer TOML override: defaults, team, user. [src] `bmad-eval` measures a skill four ways: against the bare model, against a stripped variant, against a rubric, and trigger accuracy. [src]
- **Agents:** any tool that supports skills. [readme]
- **Strengths:** the richest planning and critique toolkit; a real eval runner; right-sizes process to the change. [src]
- **Weaknesses:** needs `uv` and Python for every skill (each activation shells out to a resolver script). [src] v7 is alpha with breaking changes. [readme] Personas add flavour, not independence: one context plays all of them in party mode. [inf] Unattended building lives in a separate module, BMad Loop, which I didn't read. [readme]
- **Licence, version, activity:** MIT, names trademarked. npm 6.12.4 (2026-10-14); main at 6.13.0-next. Last commit 2026-11-12. [src]

### OpenSpec (Fission-AI)
- **What:** a lightweight spec CLI built for brownfield change. [readme]
- **How:** `openspec/specs/` holds how the system works today. Each change is a folder in `openspec/changes/<name>/` with `proposal.md`, `design.md`, `tasks.md` and **delta specs** under `## ADDED`, `## MODIFIED`, `## REMOVED` and `RENAMED` requirements. Archiving a change merges the deltas into the specs in code (`specs-apply.ts`), and `openspec validate --strict` checks structure. [src][readme] Requirements use "SHALL" plus `WHEN`/`THEN` scenarios. [readme] Commands: `explore`, `propose`, `apply`, `archive`. "Stores" share specs across repos (beta). [readme]
- **Agents:** about 25 tools, Claude, Codex (skills only), Cursor, Copilot, Kiro, Cline and more. [src]
- **Strengths:** the only one that keeps a living spec current, change by change, with code doing the merge. Many changes in flight without conflicts. Dogfooded in its own repo. [src]
- **Weaknesses:** nothing after implementation: no review, QA, CI or deploy. [inf] Installer is `curl | sh` by default. [readme]
- **Licence, version, activity:** MIT. 2.1.1 (2026-11-19). Last commit 2026-11-19. [src]

### Task Master (eyaltoledano/claude-task-master)
- **What:** an MCP server and CLI that parses a PRD into a task graph. [readme]
- **How:** `parse-prd` → `tasks.json` with ids and `dependencies`; `analyze-complexity` scores each task 1–10 with a recommended subtask count and an expansion prompt; tasks above a threshold (default 5) get `expand`ed; `next-task` picks the next unblocked task; `validate-dependencies`, `fix-dependencies`, tags for workstreams. [src] 38 MCP tools, with a `TASK_MASTER_TOOLS=core` mode to save context. [src][readme]
- **Agents:** any MCP client: Cursor, Windsurf, VS Code, Claude Code, Q CLI. [readme]
- **Strengths:** explicit dependency graph and complexity scores. [src]
- **Weaknesses:** needs model API keys unless you route through Claude Code or Codex CLI. [readme] **MIT with Commons Clause**, so not open source and no reselling. [src] Activity has stalled. [src]
- **Licence, version, activity:** MIT + Commons Clause. 0.43.1 (2026-03-31); 1.0.0-rc.1 (2026-02-18) never shipped. Last commit on main 2026-04-23. [src]

### Agent OS (buildermethods)
- **What:** standards for agents: find them, index them, inject them. [readme]
- **How:** v3 commands: `discover-standards` (pull conventions out of your code), `index-standards` (an `index.yml` with a one-line description per standard), `inject-standards` (suggest the relevant ones for the task, or name them), `shape-spec`, `plan-product`. Profiles can inherit from each other. [src] v3 dropped its own spec, task and orchestration steps because Claude Code's plan mode and todos now do them. [src]
- **Agents:** Claude Code, Cursor, Antigravity, "other AI tools". [readme]
- **Strengths:** small. Standards are loaded on demand, not all the time. [src]
- **Weaknesses:** narrow by design. Bash installer. Docs and support sit on a paid site. [src][readme]
- **Licence, version, activity:** MIT. 3.0 (2026-01-20). Last commit 2026-10-07. [src]

### Kiro (AWS)
- **What:** a closed-source agentic IDE, plus CLI, web, mobile and "Crew". [readme]
- **How:** specs as `requirements.md`, `design.md`, `tasks.md` under `.kiro/specs/<name>/`. [src, from the kiro-powers repo] Steering files in `.kiro/steering/` (e.g. `product.md`, `tech.md`, `structure.md`) with frontmatter `inclusion: always | auto | manual`. [src] Vendor claims: requirements analysis for contradictions and gaps, **property-based tests generated from requirements**, hooks on agent events, "Powers" (bundles of steering + MCP), permissions, `.kiroignore`, checkpoints, cloud sessions. [vendor]
- **EARS notation** (`WHEN … THE SYSTEM SHALL …`) for requirements: [unverified]. I found no EARS text in any public Kiro repo.
- **Strengths:** the most polished spec UX; requirements-to-property-tests is a real step past example tests. [vendor]
- **Weaknesses:** closed, tied to one vendor, paid tiers. Pricing not checked. [inf]
- **Activity:** public tracker repo last commit 2026-11-05; kiro-powers 2026-11-20. [src]

### Conductor: three things with one name
1. **Conductor, the Gemini CLI / Antigravity plugin** (gemini-cli-extensions/conductor). **Relevant.** Writes `conductor/product.md`, `product-guidelines.md`, `tech-stack.md`, `workflow.md`, code style guides, and per-feature "tracks" with a spec and a phased plan. `workflow.md` asks for TDD, >80 % coverage, phase checkpoints and `git notes` on each task commit. `conductor-revert` reverts a track, phase or task by finding its commits. Also installs in Claude Code. Apache-2.0, v0.3.0, last commit 2026-09-01. [src]
2. **Conductor, the Mac app** (Melty Labs, conductor.build). **Relevant.** Runs several Claude Code and Codex agents in parallel, each in its own git worktree, with a UI to review and merge their diffs. Closed source; no public repo found. All of this is [unverified].
3. **Netflix / Orkes Conductor:** a microservice workflow engine. Not relevant.

## Ideas worth taking, ranked by value to onRails

| # | Idea | Who | Fit in onRails | Effort | onRails today |
|---|---|---|---|---|---|
| 1 | **Behavioural skill tests.** A pressure scenario per core skill, run headless with and without the skill; trigger tests for each description. | Superpowers `tests/`, BMAD `bmad-eval` | A `scripts/skill-evals/` runner (`claude -p`, `codex exec`); `writing-for-agents` gains "watch it fail first". Start with `build`, `pr-review`, `ask` and the always-stop list. Manual or nightly, not per-PR (cost). | M | No. CI checks sync and plugin shape only. |
| 2 | **A converge step: code vs plan.** After each pass, read `docs/design.md`, `mvp.md` and the issues' checks against the code, and file issues for what's missing or drifted. | Spec Kit `converge` + `analyze`; Kiro (vendor) | New section in `pyramid` ("end of pass") or a mode of `back`; output is issues, never edits. | M | Partly. Rule 3 says the code wins; nobody checks the whole. |
| 3 | **Requirement notation with IDs.** Acceptance checks as `WHEN … THEN …`, each with an id (`AC-12.3`) that the test name carries. Unknowns written inline as `[NEEDS CLARIFICATION: …]` and blocked from `status:ready`. | Spec Kit, OpenSpec, Kiro (EARS, unverified) | `issues` template; `build` names tests by id; `pr-review` checks each id has a test. | S | Partly. Checks are tagged auto/agent but free-form. |
| 4 | **A consistency pass before building.** One read-only check that every MVP feature has an issue, every issue has checks, dependencies form no cycle, and nothing contradicts `decisions.md`. | Spec Kit `analyze`, `clarify` | Last step of `issues` after a pyramid pass. | S | No. |
| 5 | **Complexity score per issue.** Score 1–10 with a reason; above 7, split it; the score feeds `routing` effort. | Task Master `analyze-complexity` | `issues` adds a `Complexity:` line; `routing` maps it to effort; `coordinate` splits before claiming. | S | Partly. The ~400-line PR check and lanes, but no score. |
| 6 | **Living behaviour specs with deltas.** `docs/specs/<capability>.md` holds how it works now; an issue carries ADDED/MODIFIED/REMOVED requirements; merge applies them. | OpenSpec | `issues` (delta section), `build` (apply delta in the same PR), `join` (seed specs from code). Best for brownfield and `/join`. | L | No. `features.md` and `decisions.md` don't track current behaviour. |
| 7 | **Steering loaded by scope.** An index of `guide/` and stack conventions with a "load when" line or file glob, so a builder pulls only what fits. | Kiro `inclusion: auto`, Agent OS `index.yml` + `inject-standards` | A `guide/index.md` the `build` skill reads first; stack packs add entries. | S | Partly. Skill descriptions and the `Recipes:` line do this for recipes only. |
| 8 | **More agent targets.** `onrails init --agent cursor|gemini|copilot|opencode`. `.agents/skills` is already read by Codex, Copilot CLI and Gemini CLI. [readme, Superpowers] | Spec Kit (43), OpenSpec (~25), Superpowers (15) | `cli` installer; per-agent hook and git-block files like `.codex/`. Rules that rely on hooks need a fallback. | M | Claude Code and Codex only. |
| 9 | **Clean baseline before building.** In the new worktree, install and run `check` before touching code; a red baseline is reported, not "fixed". | Superpowers `using-git-worktrees` | One step in `build`. | S | No explicit step. |
| 10 | **Critique pass on plans.** Two or three independent readers (pre-mortem, red team, the user's view) on `pyramid.md` and `design.md`, one merged revision to accept. | BMAD `advanced-elicitation`, `party-mode` | Optional last step of `pyramid`. Take the independent readers, skip the named personas. | S | Partly. Rule 2 (three options) and fresh reviewers for code, not plans. |
| 11 | **Revert by issue.** "Undo issue #N" finds its merge and opens a revert PR. | Conductor plugin `conductor-revert` | A short section in `diagnose` or `back`. One issue, one PR makes it easy. | S | No command, but the shape supports it. |
| 12 | **Diagnose a bad session.** Read the transcript, show where a skill failed to fire or was ignored. | Superpowers `diagnosing-superpowers` | Feeds the `/afk` retro and idea 1. | M | Partly. The `/afk` retro. |

**Don't take:** an MCP server (Task Master, Spec Kit's experimental one). `gh`, files and skills already cover it, and 38 tools cost context; Task Master itself added a "core" mode to cut them. Persona names (BMAD): fun, but they hide that one model plays every role. The visual companion's telemetry. Property-based tests from requirements (Kiro) are worth a spike in the `tanstack-start` pack later, not now.

## Where onRails is already ahead or different

For the README. All [inf] from the comparison above.

- **It ships, not just specs.** Every competitor stops at code on a branch. onRails goes on to CI, independent review, QA in a real browser, a security lane, merge of the exact checked commit, deploy to test and a smoke test.
- **Nobody checks their own work, by structure.** Reviewers read the diff, not the description, and a verdict names a commit. Superpowers comes closest; it reviews inside one session's plan.
- **Guardrails outside the prompt.** Lint, migration lint, PR size and issue-link checks, an agent-file guard, blocked force-pushes. The others are prompts only.
- **A stop-and-ask list no setting turns off,** plus a risk dial and lanes. Kiro has permissions; nobody else has a merge policy.
- **Built for the product owner, not the developer.** Plain words, a product grill, an MVP pick, naming, and a stack chosen with you. BMAD's analyst and PM are the nearest match.
- **Working stack packs.** A runnable app with CI and a test deploy at slice 0. Nobody else ships code.
- **GitHub issues are the task graph.** Dependencies, lanes and priorities live where the team already works, not in a `tasks.json` or `tasks.md`.
- **Runs on subscriptions.** No model API keys, unlike Task Master.
- **Away mode.** `/afk` and `/back`, presence-aware pings with quiet hours, a hard stop. Only Kiro's cloud sessions and the Conductor Mac app touch this.
- **Plain MIT, no trademark or Commons Clause.**

**Where onRails is behind:** agent breadth (2 vs 15–43); no evidence its skills change behaviour (Superpowers and BMAD have it); no living spec for brownfield work (OpenSpec); no official-marketplace listing (Superpowers is in Anthropic's and OpenAI's).

## Couldn't verify

- GitHub stars and forks for all eight: the GitHub API was blocked for this session.
- Kiro: EARS notation, requirements analysis, property-based testing, hooks and pricing. Product source and kiro.dev are out of reach.
- The Conductor Mac app: everything. No public repo, site blocked.
- BMad Loop and BMad v7 release date: separate repo, not read.
- User complaints: forums and reviews were out of reach, so the skill's step 3 was skipped.

## Sources

| Project | Repo | Commit | Date |
|---|---|---|---|
| Spec Kit | github/spec-kit | `a4d571229e164e440f8950cac034607bae7b7518` | 2026-11-20 |
| Superpowers | obra/superpowers | `22f0b463e7a5e579904dd6211a520321035526f7` | 2026-11-03 |
| BMAD Method | bmad-code-org/BMAD-METHOD | `e435a22574fe55722841086e5566420178b98df3` | 2026-11-12 |
| OpenSpec | Fission-AI/OpenSpec | `0c737dc1b543249b38b0f4716816fcf493d894dd` | 2026-11-19 |
| Task Master | eyaltoledano/claude-task-master (main) | `c0c98d367c55296bfe69e65680625b6db437af02` | 2026-04-23 |
| Task Master | same, branch `next` | `487c3d30a53e63e3139a8e5cc82a87a64e492d64` | 2026-03-31 |
| Agent OS | buildermethods/agent-os | `e892e61d322759165e7d9173e92c1010406c9f4d` | 2026-10-07 |
| Kiro tracker | kirodotdev/Kiro | `efac9e3a1e15f48b347d83bf6e8d1488e6808520` | 2026-11-05 |
| Kiro powers | kirodotdev/kiro-powers | `b8362381f52c58ec7634ca14f52556f6cf1ea322` | 2026-11-20 |
| Kiro example | kirodotdev/spirit-of-kiro | `ff0c8c22cb4026f83df5aa9155e9b7f410809f30` | 2026-07-15 |
| Conductor plugin | gemini-cli-extensions/conductor | `6e8f9a860bcdd6a2c423473c12e745200688c633` | 2026-09-01 |

npm, checked 2026-11-23: `bmad-method` 6.12.4 (MIT), `@fission-ai/openspec` 2.1.1 (MIT), `task-master-ai` 0.43.1 ("MIT WITH Commons-Clause"). Spec Kit isn't on npm; version from its `pyproject.toml` and `CHANGELOG.md`.

## Provenance

Written by `claude-opus-5-5` (Opus 5.5), running as a subagent in Claude Code. Effort level: unknown (not exposed to the agent). One research pass, no independent fact-check.
