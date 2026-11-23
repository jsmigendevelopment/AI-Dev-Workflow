---
name: routing
description: Use when choosing which model, provider and effort level runs a job ("which model should do this", "what effort", "route this issue") - planning, grilling, research, design, writing issues, building, reviewing, security review, coordinating, browser checks and art. One table maps each job to a tier and an effort, starts low, and escalates one step only after a verified failure.
---

# Routing: the right brain for each job

Picking the model, provider and effort is a skill of its own. The strongest model at high effort for everything is slow and burns your limits. The cheapest model for everything ships junk.

**This table is the routing.** The coordinator reads it for every job. Issues don't repeat it; they only note an override when one is truly needed.

## Tiers

Fill in this column with what *you* have. The example column shows one working setup (checked 2026-11).

| Tier | For | Example |
|---|---|---|
| **Strongest** | the CTO jobs: deep research, planning, design | Claude Fable 5.2 |
| **Everyday** | talking, writing issues, building, reviewing | Claude Opus 5.5 |
| **Creative** | art, visuals, names, very creative ideas | ChatGPT, top model |
| **Second opinion** | a second reviewer on risky changes | Another vendor's model |

Effort is a second dial on every model: **low**, **medium** or **high**.

## Jobs

| Job | Tier · effort |
|---|---|
| The live thread you talk to all day (coordinator) | Everyday · **low**. Medium once the app is in good shape. Speed matters more than depth here. |
| Grill and planning chat | Everyday · medium |
| Competitor scan (background, during the grill) | Everyday · medium. Broad searching, not design, so it doesn't ask first. |
| **CTO:** research, the pyramid and milestones, schema, API design, wireframes (`wireframes`, in the background during naming) | **Strongest · high** |
| Writing issues from the CTO's plan | Everyday · medium |
| Art and visual concepts | Creative |
| Building an issue | Everyday. Effort from its `Complexity:` line: 1–4 **low**, 5–7 medium. Pass 2+ starts at medium. Never the strongest tier without asking. |
| Code review (`pr-review`) | Everyday · **never below the builder's effort** |
| Security review (`pr-security`), risky lane only | Everyday, one step above the code reviewer. Add a second-opinion reviewer when the change touches personal data or money. |
| Acceptance and browser checks (`qa`) | Everyday · low |

## Rules

- **Ask before using the strongest tier.** It's the most expensive and the most limited. Say which job you'd send to it and why, and start only on a yes. Skip the question only if `docs/profile.toml` sets `ask_before_strongest = false`, or the person already said yes to that job in this session.
- **Start low. Escalate one step only after a verified failure:** a failed check or a rejected review, not a hunch.
- **Spend the strongest model on thinking, not typing.** It designs. Cheaper models write the issues and the code from its design.
- **Change what reviewers see before you change how hard they think.** Hide the PR description, and give them a written policy and the check results. Extra effort found no more bugs in testing.
- **Buy what you'd rather not review.** Use an auth provider instead of reviewing hand-made auth.
- **More than one account? Give each its own job,** for example builders on one and your live thread on the other. **Don't move work to another account because one hit its limit.** Providers can treat that as account rotation, and losing the account you build with stops everything. Read your plan's terms before running unattended agents.
- **Re-check this table when models change.** Routing that was right last month may not be right now.
