---
name: model-routing
description: Secondary skill. Use whenever picking which model, provider and effort level runs a job - planning, grilling, research, design, writing issues, building, reviewing, security review, coordinating, browser testing, art. Maps each job to a tier (strongest, everyday, creative) and an effort, starts low and escalates one step only after a verified failure.
---

# Model routing: the right brain for each job

Picking the model, the provider and the effort is a skill in itself. The strongest model on high effort for everything is slow and burns your limits. The cheapest model for everything ships junk. Match the model to the job.

## Tiers

Fill in this table with what *you* have. The right-hand column shows one working setup as an example.

| Tier | What it's for | Example |
|---|---|---|
| **Strongest** | deep thinking: research, design, architecture, writing the plan | Claude Fable 5.2 |
| **Everyday** | talking, building, reviewing | Claude Opus 5.5 |
| **Creative** | art, visuals, naming, very creative ideas | ChatGPT, top model |

Effort is a second dial on every model: **low**, **medium** or **high**. Low is fast. Use more effort only where thinking pays off.

## Jobs

| Job | Tier and effort | Why |
|---|---|---|
| Coordinator, the live thread you talk to all day | Everyday · **low** (medium once the app is in good shape) | It mostly relays and dispatches, and speed matters more than depth |
| Grill, planning chat | Everyday · medium | Long back-and-forth, good judgement |
| Deep research | Strongest · high | Crucial decisions |
| The "CTO" jobs: schema, API design, wireframes, writing issues | Strongest · high | The plan shapes everything after it |
| Art, visual concepts | Creative | |
| First build of each slice (pass 1, MVP) | Everyday · **low** | Fast. The plan already did the thinking |
| Upgrade passes (pass 2+, polishing the core) | Everyday · medium | Depth where it counts |
| Code review | Everyday · **low** | Extra effort didn't help find more bugs |
| Security review | **One effort step above the code reviewer.** Strongest when the change touches personal data or money | Be safe where a mistake hurts |
| Browser end-to-end test | Same as the coordinator | |

## Rules

- **Start low. Escalate one step only after a verified failure,** meaning a failed check or a rejected review, not a hunch.
- **Buy instead of reviewing what you'd rather not own.** Use an auth provider instead of reviewing hand-made auth.
- **The planner sets the routing** in each issue's Routing table, and the coordinator follows it.
- **More than one account? Give each its own job,** for example builders on one and your live thread on the other. Don't move work to another account because one hit its limit: providers can treat that as account rotation, and losing the account you build with stops everything. Read your plan's terms before you run unattended agents on it. Prefer cloud sessions to your own machine.
- **Re-check this table when models change.** A routing that was right last month may not be right now.
