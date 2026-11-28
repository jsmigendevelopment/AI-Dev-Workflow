---
name: routing
description: Use when choosing which model, provider and effort level runs a job ("which model should do this", "what effort", "route this issue", "which account runs this") - planning, grilling, research, design, writing issues, building, reviewing, security review, coordinating, browser checks and art. Three roles (CTO, coordinator, builder) with defaults the profile can override; one table maps each job to a tier and an effort; escalates one step per verified failure, two at most. Another table says where each job runs, cloud first; accounts are a fixed split by job or project, never by usage.
---

# Routing: the right brain for each job

Picking the model, provider and effort is a skill of its own. The strongest model at high effort for everything is slow and burns your limits. The cheapest model for everything ships junk.

**These tables are the routing.** The coordinator reads them for every job. Issues don't repeat it; they only note an override when one is truly needed.

## Tiers

Fill in this column with what *you* have. The example column shows one working setup (checked 2026-11).

| Tier | For | Example |
|---|---|---|
| **Strongest** | the CTO: deep research, planning, design, writing the issues | Claude Fable 5.2 |
| **Everyday** | talking, the loop, reviews, risky and big builds | Claude Opus 5.5 |
| **Fast** | building most issues | Claude Sonnet 5.5 |
| **Creative** | art, visuals, names, very creative ideas | ChatGPT, top model |
| **Second opinion** | a second reviewer on risky changes | Another vendor's model |

Effort is a second dial on every model: **low**, **medium** or **high**. Some models add **extra-high**.

## Roles

Three roles do most of the work. The Jobs table below says which role runs each job.

| Role | Default (Claude side) | Does |
|---|---|---|
| **CTO** | Fable 5.2 (Strongest) · high | Research, architecture, the pyramid, writing the issues (small, sized, with checks) |
| **Coordinator** | Opus 5.5 (Everyday) · medium | Runs the loop, gates, reviews, security reviews and merges |
| **Builder** | Sonnet 5.5 (Fast) · medium | Builds most issues |

**The profile wins.** A role set in `[routing]` in `docs/profile.toml` (else `~/.onrails/profile.toml`) replaces its default: `cto`, `coordinator` or `builder` for the model, `<role>_effort` for the effort. A person who said "no Fable" has `cto = "Claude Opus 5.5"`: the CTO runs on Opus. Before you start a role's job, read it: `node .agents/skills/routing/scripts/roles.mjs <role>` prints the model, the effort and where they came from.

- **The security path and big slices start on Opus:** a builder on the risky lane, or on an issue of `Complexity:` 5 or more, starts on Opus 5.5 · medium.
- **Codex** (ChatGPT, medium or high effort) stays a builder option for non-security work. Never on the risky lane.
- **A role's effort is the base. A job's own rule can raise it:** a code reviewer runs never below the builder, and the security reviewer one step above the code reviewer.
- **The coordinator is the loop.** The live thread keeps its own row (Everyday · low, for speed) in the Jobs table (#280).

## Escalation

- **Start on the role's default.** Escalate only after a verified failure: a failed check or a rejected review, not a hunch.
- **One step per verified failure, two steps at most.** The builder goes Sonnet to Opus, then effort up: Sonnet · medium, Opus · medium, Opus · high. A builder that starts on Opus · medium goes to high, then extra-high where the model has it.
- **Infrastructure errors and process blocks don't count against the model:** a network or rate-limit error, a sandbox block, a missing key, a runner that's down, a merge conflict. Fix the cause, then run the same step again.
- **Still failing after two steps?** Stop climbing. `coordinate`'s review cap says what's next. Escalation never reaches the strongest tier on its own. `coordinate`'s review cap follows this: with a step left, the extra round takes that step, never the next tier; with none left, go straight to the split (#406).
- **The profile's pick is step one.** No step above it in the profile? Don't climb. For example, a profile whose builder is already its `everyday` model at its highest effort has no step left.

## Jobs

| Job | Tier · effort |
|---|---|
| The live thread you talk to all day | Everyday · **low**. Speed matters most here. It answers, records and relays; it never runs the loop (`coordinate`, "Where this runs"). |
| Loop coordinator (a background sub-agent or cloud session the live thread starts) | Everyday · **medium**. The **coordinator** role. It merges and judges reviews. |
| Grill and planning chat | Everyday · medium |
| **Auto grill:** the self-grill and its review | **Strongest · high, or Everyday · high or extra-high.** It makes every early decision. Recommend it plainly, then ask under the first rule below. On Full, don't ask: use the current model. Models: "Auto grill" below. |
| Competitor scan (background, during the grill) | Everyday · medium. Broad searching, not design, so it doesn't ask first. |
| Wireframes stage 1, layout (background, from the grill's main-flow topic) | Everyday · medium. Grey boxes, not design, so it doesn't ask first. |
| Wireframes stage 2, detailed UI and UX (background, from the look-and-feel topic) | **Strongest · high** |
| **CTO:** research, the pyramid and each pass gate's re-plan, schema, API design | **Strongest · high**. The **CTO** role. |
| Capture to the research library | The research's own tier and effort for its provenance record. The copy, index, checks and pull request: Everyday · low. |
| Pass-gate audit (read-only, fresh) | Everyday · medium |
| Writing issues from the CTO's plan | **Strongest · high**. The **CTO** role: small, sized, with checks. |
| Art and visual concepts | Creative |
| Building an issue | Fast · **medium**. The **builder** role. Everyday · medium on the risky lane or at `Complexity:` 5 or more. Never the strongest tier without asking. |
| Code review (`pr-review`) | Everyday · **never below the builder's effort**. The **coordinator** role. |
| Security review (`pr-security`), risky lane only | Everyday, one step above the code reviewer. The **coordinator** role. Add a second-opinion reviewer when the change touches personal data or money. |
| Acceptance and browser checks (`qa`) | Everyday · low |

## Auto grill

Recommend a run from this table when the person picks auto grill. Below Full, ask before the strongest tier, as the rules say. On Full, use the current model and don't ask. The model names are the example setup (checked 2026-11). Map them to your own tiers.

| | Claude | ChatGPT / Codex |
|---|---|---|
| **Fine for most people** | Opus 5.5 at high or extra-high effort | GPT-6.2 Sol at high or extra-high effort |
| **Best result** | Fable 5.2 at high effort | GPT-6.2 Astra at extra-high effort |

Can't switch models in this session? Say so once, carry on with the current model, and write the model and effort used to the grill log's provenance. The yes or no is asked once per session (the first rule below).

## Where a job runs

Cloud first: `[sessions] prefer = "cloud"` in the profile. Unattended work runs in a cloud session. Work that needs this machine runs here. The job names are the ones `[accounts]` uses.

| Job | What it covers | Runs |
|---|---|---|
| `live` | the thread you talk to, the grill | where you are |
| `loop` | the coordinator the live thread starts | a background sub-agent here, or cloud |
| `cto` | the pyramid, re-plans, schema, API, wireframes | cloud |
| `research` | `research`, the competitor scan | cloud |
| `build` | one builder per issue | cloud. Local when it needs a simulator, a device, a signed-in browser, local files or hardware. |
| `review` | `pr-review`, `pr-security`, `qa` before merge | cloud. Local for "my own browser" checks. |
| `evals` | behaviour tests of the skills | cloud or locally |
| `overnight` | the loop under `/afk` | cloud |

`prefer = "local"`, or no cloud sessions in your tool? Everything runs here.

## Rules

- **Ask before using the strongest tier, once per session.** It's the most expensive and the most limited. Say which jobs you'd send to it and why, and start only on a yes.
  - **A yes covers the whole session and every CTO job in it.** Write it down at once: `- **Strongest tier:** yes · <session> · <UTC time>` in `docs/state.md` (`kickoff/decisions.md` before the repo exists). A no is written the same way. Read that line before you'd ask, and never ask again in that session.
  - **Skip the question** when `docs/profile.toml` sets `ask_before_strongest = false`. `/idea` and `npx onrails profile init` ask that once, at setup.
  - **Can't switch models in this session?** Say so once, carry on with the current model, and record the model and effort used in the plan's provenance (`docs/decisions.md`, or the grill log). Never tell the person to start a new session for a model.
  - On Full automation: use the current model, record it, and don't ask.
- **Never stop or restart a strongest-tier run without the person's yes.** It throws away work already paid for. Before any restart, check for reusable output and say what it costs (`ask`, "A running job"). Everyday-tier runs may be restarted.
- **Start on the role's default.** Escalate one step only after a verified failure ("Escalation" above).
- **Spend the strongest model on thinking, not typing.** It designs and writes the issues. Cheaper models write the code from them.
- **Change what reviewers see before you change how hard they think.** Hide the PR description, and give them a written policy and the check results. Extra effort found no more bugs in testing.
- **Buy what you'd rather not review.** Use an auth provider instead of reviewing hand-made auth.
- **Accounts are a fixed plan set by the person. Never move work between Claude accounts because of a limit, and never spread it across them.** Each app has a home account (`[accounts]` in the profile). When it's out, the app waits for the reset, with an ℹ️ FYI and the reset time, or sends Codex-able work to ChatGPT: non-security builds, when the person uses Codex. Providers' terms can treat moving work as account rotation, and losing the account you build with stops everything. A job for another account gets a ready-to-paste prompt, not a run here. See `references/accounts.md`.
- **Re-check this table when models change.** Routing that was right last month may not be right now.

## References

| File | Load when |
|---|---|
| `references/accounts.md` | Onboarding asks about other accounts, a job belongs to another account, or an account hits its limit. |
