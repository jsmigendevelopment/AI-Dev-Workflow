# Brief: author

The owner's request, verbatim, 2026-11-23. Committed before the first search.

---

You're a senior engineering researcher. Run a deep research project, then turn it into concrete, tested changes to a public MIT kit called onRails. Run this on the strongest model at high effort, and record that in the provenance file (see the last section).

The repo
jsmigendevelopment/onRails (public). Clone it and read it before researching:

README.md, AGENTS.md, guide/README.md, research/README.md and every dossier in research/, especially competitors.md.
The skills in .agents/skills/, in full for idea, grill, wireframes, pyramid (and references/pass-gate.md), issues (and references/consistency.md), coordinate, build, pr-review, qa, back, afk, routing and research (and its references).
evals/ (the behaviour tests).
What the owner built, and why
Tracer bullets (Hunt and Thomas) became a tracer-bullet pyramid for the MVP: pass 1 Works (thin, every slice), pass 2 Real, pass 3 Ready. Each pass is an improvement; a pass is not rework.
After "MVP complete" the shape turns upside down into an hourglass: each layer adds new features, each in thin, plus a pass on what's already there (the core every layer).
A pass gate between passes and layers: the person tries it on the test site, a read-only audit, cleanup up to about 20%, and a re-plan of only the next pass.
"MVP complete" doesn't mean complete, and it isn't launch. Launch is always the person's call.
The goal: keep changes coming fast, so the person always has something new to test and give feedback on, with as few gaps of zero changes as possible. It's standard agile, done by AI agents with a human product owner.

Research questions
Cite primary sources with dates. Label every claim as measured, read in source, vendor claim, anecdote or inferred.

Agile, at the source: XP, Scrum, Kanban, Lean and continuous delivery, and Accelerate and the DORA metrics.
What do they say about iteration length, work in progress, flow, story slicing (for example SPIDR, the INVEST criteria, the hamburger method, story mapping), feedback loops, small batches and trunk-based development?
Which of these assume human teams, and which carry over to AI agents?
How onRails maps to agile today, and where it doesn't:
slices as stories, passes and layers as iterations, the gate as review plus retro plus refinement, features.md as the backlog;
what's missing, for example a definition of done, WIP limits, a cadence, demos, velocity, cycle time and lead time.
Rapid iteration with agents:
how to keep a steady stream of small, testable changes reaching the test site, with minimal idle gaps;
what limits throughput today: CI time, review rounds, the gate, usage limits, and the person's response time;
designs such as a continuous pass (the next slice always ready while the person tests), a rolling gate (feedback folded in without stopping the loop), feature flags and dark launches so unfinished work can merge, preview-per-PR as the demo, and batching the person's feedback.
Coaxing the CTO and planning agent into more, thinner pyramid steps:
why models plan big and coarse by default;
prompting and structural techniques that reliably produce thin vertical slices: hard size limits, a "smallest thing the person can try" test, slicing heuristics, examples, a complexity cap, a minimum number of slices per pass, and a reviewer that rejects coarse plans;
how to measure whether a plan is thin enough.
CI/CD that supports this: how fast CI, preview deploys, trunk-based merges and flags fit the kit's lanes, risk dial and security reviews without slowing them down.
Then build it
On a new branch research/agile-flow, in one pull request to onRails. Don't merge it.

A dossier: research/agile-flow.md, following the kit's own research standard exactly (see the research skill and its references). It needs a provenance.json and an index row in research/README.md, and it must pass node scripts/check-research.mjs research/.
Concrete changes to the skills, templates and docs listed above, so planning produces thinner slices and the loop keeps changes flowing. Edit skills in .agents/skills/, then run node scripts/sync-skills.mjs and cd cli && npm run bundle && npm test and npm run bundle:check.
Where it fits, evals in evals/ that prove the change in behaviour: for example, a planning scenario where the plan must have at least N slices, each one try-able. Run them locally if you can; say plainly if you couldn't.
The voice: blunt, short sentences, 8th-grade words, no hype, plain words first and the term second.
Rules
Don't merge. Never force-push, and never push to main.
Ask me three questions at a time, each with your recommended answer, only if you're truly blocked. Otherwise finish without stopping.
If you're rate-limited, say so with the reset time, keep doing what doesn't need that service, and resume after.
Be plain about what you couldn't verify.
Provenance
In provenance.json, record your exact model ID and effort as your session reports them, and those of any helper or fact-check agents you start. Write unknown for anything that wasn't recorded. Run a fact-check in a fresh session on a different model before marking the dossier current.

Finish
End with a summary of no more than 300 words:

the key findings;
the changes made, and why;
the eval results;
the pull request link.

---

## What "good" means for this dossier

Added by the author before the first search, so the options can't be judged by a bar set afterwards.

- **The question:** how should onRails plan and run a build so that small, try-able changes keep reaching the test site, with few gaps, while the person stays the product owner?
- **Constraints, from the kit as it is on main (`06b0b92`):** the tracer-bullet pyramid, the hourglass and the pass gate stay. Launch stays the person's call. The always-stop list, the lanes, the risk dial and the automation level stay. Nobody checks their own work. Guardrails that a tool can enforce beat a new line of prose. Skills stay short.
- **A good answer:**
  1. rests on primary sources, each with a date, and says which claims are only inferred;
  2. names at least three designs and compares them on idle time, rework risk, cost in the person's attention, and how much of the kit changes;
  3. turns into rules a planning agent follows on a small model, checked by a script or an eval, not by hope;
  4. gives numbers a project can measure itself against: how many steps, how big, how long between merges;
  5. says what would change the answer.
