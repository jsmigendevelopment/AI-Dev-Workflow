# Agile flow: research dossier

<!-- From the research skill. The store lives in research/agile-flow/ (references/desk-research.md).
     Each claim carries its ID from claims.csv and its label. Opinion says "I think". -->

**Date:** 2026-11-23. The status and the re-check date live in the index, `README.md`.

## The question

How should onRails plan and run a build so that small changes the person can try keep reaching the test site, with few gaps, while the person stays the product owner?

**Why it matters:** the owner's goal is a steady stream of changes to test and give feedback on. A plan cut too thick gives a few big changes and long waits. A loop that stops at every gate gives nothing while the person is away. Both waste the one thing the kit can't buy more of: the person's attention.

**Constraints:** the kit as it is on main (`06b0b92`). The tracer-bullet pyramid, the hourglass and the pass gate stay. Launch stays the person's call. The always-stop list, the lanes, the risk dial and the automation level stay. Nobody checks their own work. A rule a tool can check beats a new line of prose. Skills stay short.

**What good looks like:** primary sources with dates; at least three designs compared on idle time, rework risk, the person's attention and how much of the kit changes; rules a small model follows, checked by a script or an eval; numbers a project can measure itself against; and what would change the answer. The full bar is in `agile-flow/briefs/author.md`, written before the first search.

**How to read the labels.** Each claim has an ID and a label, like `[c12 · read]`. The ID is its row in `agile-flow/claims.csv`, which names its sources.

| Label | Means |
|---|---|
| `measured` | The source ran it and reports the number. For numbers measured here, the run folder is named. |
| `read` | Read in the source itself: the guide, the paper, the docs, the code. |
| `vendor` | The vendor says so about its own product, and nobody independent tested it. |
| `anecdote` | One person's or one team's report. |
| `summary` | Only a summary or a secondhand page was read, or a search found nothing. |
| `[inferred]` | My own reasoning from the claims next to it. Not a finding. |

`read`, `vendor` and `summary` are the kit's `read-in-source`, `vendor-claim` and `summary-only`. The kit's standard has no label for an inference, so inferences are marked in the text and are not in `claims.csv`.

## Summary

**The pick:** cut every pass into thin steps the person can try, check the cut with a script, keep three issues in flight, and let the loop keep working at a pass gate on the audit's fixes and the cleanup while new scope waits for the person. **Confidence: medium.** The agile sources agree with each other and with this design [c12, c13, c15, c39, c41 · read], and the planning change is measured here on two models (below). But nothing here measures a real project's idle time, and no outside study sweeps step size for coding agents [c103 · summary].

**The main reason:** on main, a pass has about as many issues as the MVP has slices [c60 · read], and the loop stops dead at each gate [c64 · read]. Standard agile does neither. Stories are split until several fit in an iteration [c55 · read], and the review never blocks the next iteration [c12, c13 · read].

**Measured here:** on the same planning request, the plan for pass 1 held a median of 12 steps the person could try with this branch's kit, against 5 with the kit on main, on a small model (5 runs each) [c146 · measured]. On the kit's planning model it was 14 against 8 (3 runs each) [c147 · measured]. Every plan from this branch passed the checker. (The eval runs were still going when this copy was checked.)

## Options compared

| Option | Strengths | Weaknesses | Cost | Fit |
|---|---|---|---|---|
| **A. Keep it as it is.** One issue per slice per pass. The loop stops at each gate. | Nothing to change. Few issues to write and review. | A pass is a handful of big changes. Nothing new to try for long stretches. Nothing moves at a gate until the person is back. No number tells anyone how it's going. | None now. The waiting is paid later. | Poor against the owner's goal. |
| **B. Thin steps and a gate that keeps moving.** Each slice is cut into steps with a try line, checked by a script. Three in flight. At a gate, the audit and cleanup start at once and the loop builds what they find. New scope waits for the person. | Something to try every few merges. Small changes are easier to review and more likely to pass first time. The loop has safe work at a gate. The person still decides what comes next. | More issues, so more reviews and CI runs. A cut that is too fine costs more per step than it gives back. The loop can still run dry at a gate. | A few hundred lines of skill text, two small scripts, two evals. | **The pick.** Keeps the pyramid, the gate and every guardrail. |
| **C. No passes: one flowing backlog.** A Kanban board with limits. The next pass starts from a draft as soon as the last one ends, and feedback is folded in when it comes. | The fewest idle gaps. | New scope gets built before the person has tried the last pass, so more rework. It spends the strongest model without a yes. It drops the audit and cleanup rhythm that the passes give. | A rewrite of `pyramid`, `coordinate` and the gate. | Poor. It removes what the owner built on purpose. Its flow numbers and its limit are taken into B. |
| **D. Gate by the clock.** A review every day or every N merges, whatever is done. | A steady rhythm the person can plan around. | A fixed timebox is there for people's calendars and pace. Agents don't have either. A pass would be cut off mid-slice. | Medium. | Poor. B's "To try" list gives the person the same daily look without a timebox. |

"Do nothing" is option A. "Build it ourselves" is what B, C and D all are: no outside tool does this for the kit.

## Evidence

Read in full or skimmed, run, and what is only opinion: `agile-flow/sources.csv` says which for each of its 264 sources. Three helpers gathered the quotes. The author re-fetched 44 of the quotes the conclusions lean on from 20 pages: 42 matched word for word, one differed only in spacing, and one had been reworded on the page and is quoted here as it reads now.

### 1. Agile, at the source

**The editions read.** The Scrum Guide is still the November 2020 one [c10 · read]. The Kanban Guide has a May 2025 edition [c18 · read]. DORA's newest yearly report is the 2025 one [c36 · read].

**Iteration length got shorter, then went away.**

| School | Iteration | Work in progress | When work is done | The review |
|---|---|---|---|---|
| XP | 1 to 3 weeks, one week best [c1, c2 · read] | Finish the most important tasks before starting more [c8 · read] | Acceptance tests pass [c4 · read] | Each iteration ends with working software shown to the customer [c143 · read] |
| Scrum | One month or less, fixed [c11 · read] | Not named | The Definition of Done [c14 · read] | Never a gate to releasing; the next Sprint starts at once [c12, c13 · read] |
| Kanban | None [c22 · read] | Must be controlled; pull only on a capacity signal [c18, c19 · read] | The workflow's own finished point [c144 · read] | Continuous or at intervals [c22 · read] |
| Lean | Batch size, not iteration, is what matters [c25 · read] | Partly done work is waste [c24 · read] | Delivered to the customer [c24 · read] | Feedback is the point of going fast [c24, c25 · read] |
| Continuous delivery | None. Every check-in is a release candidate [c29 · read] | Merge at least daily; a branch lives hours [c27 · read] | Deployed, with feedback started [c39 · read] | Automated stages, in order [c29 · read] |
| DORA | None. It measures flow [c35 · read] | Three or fewer active branches [c41 · read]; limits that expose problems [c43 · read] | Deployed and feedback begun [c39 · read] | Peer review in the flow of work, not an outside board [c139 · measured] [c140 · read] |

- **Small batches:** every source asks for them, and none argues for big ones [c3, c11, c24, c25, c34, c39 · read]. Reinertsen adds the one caution: the smallest batch is not always the best, because each hand-over has a cost [c26 · read].
- **How small:** XP stories are 1 to 3 weeks and tasks 1 to 3 days [c5 · read]. Humble says 1 to 3 days [c31 · read]. Scrum's planning often goes to a day or less [c16 · read]. DORA says hours to a couple of days, never over a week [c39 · read], and its own worked example is five batches of a day or less [c40 · read]. These are sizes for people.
- **Flow numbers:** Kanban makes four of them mandatory: work in progress, throughput, work item age and cycle time [c20 · read], with a forecast such as "85% of items in eight days or less" [c21 · read]. Humble and Farley make cycle time the main measure [c32 · read]. DORA has five delivery metrics now, not four [c35 · read], and its 2024 "elite" level is a change lead time under a day with deploys on demand [c37 · measured]. In its 2025 survey, 16.2% of respondents deploy on demand [c38 · measured]. Accelerate used deployment frequency as a stand-in for batch size [c33 · read].
- **Trunk-based development:** DORA lists three or fewer active branches, a merge at least daily and no code freezes [c41 · read] [c42 · measured]. Fowler says no branch lives more than a few hours [c27 · read]. Hammant allows a couple of days [c125 · read]. The numbers differ; the direction doesn't.
- **Fast checks:** Fowler, Humble and Farley, and DORA all land on about ten minutes for the checks that gate a merge [c28, c29, c44 · read]. Beck's own text for the ten-minute build was not found [c9 · summary]. They differ on a red build: fix it at once, but whether everyone stops is not agreed [c30 · read].

**Slicing.** The methods agree on two things: cut down through every layer, and make each cut something a user can check.

- **INVEST** (Wake, 2003): Independent, Negotiable, Valuable, Estimable, Small, Testable, and "slice vertically through the layers" [c46 · read]. His "Small" is weeks, not hours [c47 · read].
- **SPIDR** (Cohn): split by spike, paths, interfaces, data or rules [c48 · read].
- **The hamburger method** (Adzic, 2012): list the steps, list a crude-to-good range for each, and take a first bite that is the least acceptable at every step [c49 · read].
- **Story mapping** (Patton, 2008): build the thinnest end-to-end system first, then build "all major features a little at a time" [c50 · read]. That is the pyramid's pass 1 and its later passes, almost word for word **[inferred]**.
- **Elephant Carpaccio** (Kniberg and Cockburn): 15 to 20 slices where most people would cut 2 or 3, each with a UI, input and output [c51 · read]. Its minutes are an exercise; its everyday target is a story of a few days [c52 · read].
- **Tracer bullets** (Hunt and Thomas): one thin line end to end, kept and built on, because fast feedback means less correction [c53, c54 · read].
- **The Humanizing Work guide:** small enough means 6 to 10 stories in a sprint, and nine patterns to get there [c55 · read].
- Hammant calls one pull request per story a mistake [c57 · read].

**Which parts assume people.** The sources give two kinds of reason. Some hold for any worker. Some are about human limits. The sorting below is mine **[inferred]**; the reasons are the sources' own.

| Practice | The stated reason | Holds for agents? |
|---|---|---|
| Small batches | Faster feedback, less risk, easier to find a fault [c25, c34, c24 · read] | **Yes.** None of these depends on who does the work. |
| Limiting work in progress | Queueing: full utilisation gives poor flow [c23 · read]. Also context switching [c23 · read] | **Yes** for the queue. The context-switch reason is human, but the person who reviews and tries the work is still human. |
| A definition of done | Unfinished work can't be measured or shown [c14, c4 · read] | **Yes.** More so: agents over-claim "done" [c89 · vendor] [c98 · measured]. |
| Merging to trunk daily, short branches | Late merges conflict more and cost more [c3, c27 · read] | **Yes.** Agents make branches faster than they can be merged [c127 · read]. |
| Fast checks | Waiting time times how often you commit [c28 · read] | **Yes.** An agent loop commits more often than a person. |
| Vertical slices | The customer can see and judge each one [c46, c53 · read] | **Yes.** The person is the customer. |
| A fixed timebox | Regularity, fewer meetings, a sustainable pace [c17, c7 · read] | **No.** Agents have no calendar and don't tire. |
| Velocity in story points | The same people estimate from their own past [c6 · read] | **No.** Count merged steps instead: throughput [c20 · read]. |
| Reviewing synchronously | Don't start new work while a review waits [c45 · read] | **Partly.** A fresh reviewer agent starts in seconds. The human gate is the part that waits. |
| Team size, daily meeting, pairing | Communication between people [c17 · read] | **No**, except that one fresh agent per job stands in for a second pair of eyes. |

### 2. How onRails maps to agile today

| Agile | onRails on main | The gap | After this pull request |
|---|---|---|---|
| A user story | A slice: "one thing a user can do, end to end", one issue per slice per pass [c60 · read] | A slice is closer to a whole activity on a story map [c50 · read] than to one story. An issue may be "a new module end to end" [c61 · read]. Nothing asks for a thinner cut [c62 · read]. | A **step** is the story. A slice is cut into steps, each with a try line. |
| The backlog | `features.md` | None. | The same. |
| An iteration | A pass or a layer | None. | The same. |
| Review, retro, refinement | The pass gate [c69 · read] | The gate stops the loop [c64 · read]. Scrum's review doesn't block the next Sprint [c12, c13 · read], and refinement is ongoing [c15 · read]. | The audit and cleanup start at once and the loop builds them. Feedback is taken any time. |
| A definition of done | Spread over the lanes and `coordinate` [c67 · read]. The words appear nowhere [c65 · read]. | No one place says when a step is done. | "Done means" in `docs/pyramid.md`. |
| A work-in-progress limit | "As many as can run without touching the same modules" [c63 · read] | No number. | Three in flight, set in `docs/stack.md`. |
| A demo | A "ready to try" FYI after each merge [c68 · read] | It says what was tested, not what to do. | Every step has a try line. Each merge adds it to "To try". |
| A cadence | None | Not needed: a fixed timebox is for people (section 1). | None, on purpose. |
| Velocity, cycle time, lead time | Nothing is recorded [c65, c66 · read] | No number says whether the plan was thin or where the time went. | `flow.mjs`: merges a day, hours from pull request to merge, the longest gap. |

### 3. Rapid iteration with agents

**What limits throughput.** Nothing here measures a real onRails project, so this table says what is known and what is not.

| Limit | What is known | How sure |
|---|---|---|
| The person's response time | Vendors and vendor data name human review as the bottleneck once agents write the code [c118 · vendor] [c107, c108 · measured]. In onRails the person is needed at each gate [c64 · read], for the risky lane [c71 · read] and for parked issues [c70 · read]. | The outside claims are vendor claims and vendor data. That the gate is the longest idle gap in onRails is **[inferred]** from the skill text: nothing else stops the whole loop. |
| The gate | The loop starts no builders and waits [c64 · read]. | Read in the skill. How long it waits in practice is unknown. |
| Review rounds | Two rejected rounds park an issue [c70 · read]. Bigger changes get slower first feedback and fewer useful comments from people [c111, c112 · measured]. One confounded preprint says the same of an LLM reviewer [c114 · measured]. One large study found size unrelated to time to merge [c113 · measured]. | Mixed. Smaller is easier to review; whether it merges faster is not settled. |
| CI time | The pack runs every check in one job, one after another [c74 · read]. No duration is recorded [c75 · read]. The sources say about ten minutes [c28, c29, c44 · read]. One team says CI became its bottleneck with agents [c121 · anecdote]. | Unknown for the kit. Not found in 1 search for agent loops in general [c124 · summary]. |
| The merge queue | One pull request at a time, and main is merged into the branch and CI re-run when main has moved [c72 · read]. GitHub's own merge queue isn't open to a personal or private non-Enterprise repo [c136 · read]. | Read in source. Each extra open pull request adds re-runs **[inferred]**. |
| Usage limits | Plans have a five-hour and a weekly limit, and subagents draw on the same pool [c119 · read]. Many agents use many times the tokens of one [c123 · measured]. | Read in the vendor's docs. No token figures are published. |
| Parallel builders | Twenty agents ran at the speed of two or three under locks, and sixteen gave no gain on work that couldn't be divided [c120 · anecdote]. | Anecdotes. No measured ceiling for agents per person was found [c124 · summary]. |

**The designs.**

- **A continuous pass: the next step always ready.** Within a pass this is a matter of cutting thin. Two or three steps per slice with few "After" links means something is always ready to start. Between passes it would mean planning ahead of the gate. I left that out: the re-plan runs on the strongest model, which the kit asks about first, and it should use the person's feedback. Scrum's refinement is ongoing [c15 · read], so a draft-ahead is defensible. It is the first thing I'd try next **[inferred]**.
- **A rolling gate: feedback folded in without stopping.** Taken. Scrum starts the next Sprint at once and says the review is never a gate to releasing [c12, c13 · read]. Humble and Farley let work go on while later pipeline stages run [c29 · read]. DORA says idle hands should help elsewhere, not raise the limit [c43 · read]. So at a gate the loop does what needs no person: the audit, the cleanup pick, and building both. What needs the person stays theirs: trying it, and saying go to the re-plan. OpenAI's team argues the far end of this, few blocking gates because "waiting is expensive" [c122 · vendor]; that is a vendor's view of its own project, and their reviews weren't required [c118 · vendor]. I don't go that far **[inferred]**.
- **Feature flags and dark launches.** Before launch, the kit's production is a Coming soon page [c77 · read]. That one switch already separates deploy from release, which is Humble's principle [c130 · read]. So before launch nothing needs a flag: merge it, and the person sees it on the test site. After launch, Fowler's order is the right one: first cut the feature into small parts that are fine to show, then build the parts and add the way in last, and only then a flag [c129 · read]. Flags are stock that costs money to hold, and a release flag should last a week or two [c128 · read]. The pack ships no flag module today [c77 · read]. Cloudflare's own flag service is in beta with no price [c134 · read].
- **The preview as the demo.** Vercel and Netlify both treat the per-pull-request preview as the place for feedback [c135 · read]. In onRails the person looks before a merge only when the lane says they merge it. So the ask for that merge now carries the preview link and the try line. Everywhere else the demo is the test site after the merge.
- **Batching the person's feedback.** The "To try" list is the batch. Each merge adds a line. `/back` shows the list first. The gate hands it over whole. The person answers when they can, and each point becomes an issue.
- **Keep risky changes together** **[inferred]**. A thinner cut means more steps that touch the schema, each of which lands in the risky lane and waits for the person [c71 · read]. So the first step of a slice adds its whole table, as the approved design has it, and later steps use it. DORA's advice points the same way: single out high-risk changes for extra scrutiny instead of treating every change alike [c140 · read].

### 4. Thinner plans

**Why plans come out big.** The evidence is thinner than I expected, and it points two ways.

- Anthropic reported in November 2025 that a model given a bare prompt tried to build the whole app at once, ran out of context and called the job done early [c87 · vendor]. Its fix was a list of over 200 features and one feature per session [c88 · vendor].
- But by March 2026 the same company dropped that chunking for a newer model [c90 · anecdote], found that without a planner the builder did too little [c91 · vendor], and its docs now say the model builds "the smallest thing that satisfies" a request [c92 · vendor]. Every one of these is a vendor describing its own product, with no counts.
- In onRails the cause is plainer. The skills ask for one issue per slice [c60 · read] and give no number for how thin. The kit's own tests say a model does what it is given a number for [c73 · read].
- In the measurement below, the plan without the kit is not always short. It is cut by layer and by set-up: "Users table", "Vitest and Playwright wired", each with nothing to try. That fits what the competitor kits ship: Spec Kit groups tasks by story, then lists model, service and endpoint inside each [c58 · read].

**Does a thinner step pass more often?** Probably, with limits.

- METR measures the length of task, in human time, that a model finishes half the time [c78 · read]. Success falls as tasks get longer [c79 · measured], and the length a model handles reliably is several times shorter than the length it handles half the time [c80 · measured]. Those hours are for someone new to the code [c81 · measured], and the page that tracked them stopped updating in September 2026 [c82 · read].
- Tasks that touch more files are solved less often [c83 · measured]. Agent pull requests that were not merged were larger, though the effect is small [c84 · measured].
- Small is not the same as easy [c85 · measured]. Passing the tests is not the same as fit to merge [c86 · measured].
- DORA's surveys point the same way for teams. In 2024, more AI use went with lower throughput and stability, and DORA guessed, without measuring it, that changes were getting bigger [c104 · measured]. In 2025 throughput turned positive, instability stayed [c105 · measured], and the benefits of AI depended on small batches [c106 · measured].
- A paper from May 2026 found that cutting two workloads into fixed parts raised the cost of retries [c95 · measured]. So there is a floor **[inferred]**. Reinertsen says the same for any work [c26 · read], and DORA 2025 found a small cost to individual effectiveness from small batches with AI [c106 · measured] [c109 · read].
- No study sweeps step size for coding agents [c103 · summary]. The numbers the kit now uses, size 4 and two steps per slice, are my choice, not a finding **[inferred]**.

**What makes a planner cut thin.**

| Technique | Evidence | In the kit now |
|---|---|---|
| A hard size limit | Google: about 100 lines is fine, 1000 is too many [c110 · read]. Its own median is 24 [c111 · measured]. DORA: a day or less [c40 · read]. The limit itself is my choice. | Size 4 or under. A 5 to 7 needs a reason. At most one step in three. |
| "The smallest thing the person can try" | Elephant Carpaccio's rule that a slice has a UI and looks different from the last [c51 · read]. Scrum: work that isn't done can't be shown [c14 · read]. | The try line. No try line, no step. |
| Slicing heuristics | SPIDR, the nine patterns, the hamburger [c48, c55, c49 · read]. | Seven ways to cut, in `pyramid/references/slicing.md`. |
| Examples | Writing a short plan from a few examples first helped on small coding tasks [c142 · measured]. | One slice cut two ways, in the same file. |
| Small milestones that can each be checked | OpenAI's plan guide asks for milestones that can each be verified, and its Codex guide bans one-step plans [c93 · vendor]. ADaPT keeps plans to 3 to 5 steps and splits further only on failure [c94 · measured]. | Steps, each with a try line. The gate re-cuts with the flow numbers. |
| A complexity cap | Task Master expands above a threshold [c59 · summary]. | The existing scale, with a lower target. |
| A minimum count | 6 to 10 stories per sprint [c55 · read]; 15 to 20 slices where most cut 2 or 3 [c51 · read]. | Two steps per slice, as a tripwire, not a target. |
| A reviewer that rejects coarse plans | A model judging its own plan makes it worse; a sound outside checker makes it better [c96 · measured]. Agents' checks are often shallow [c97 · measured]. A fresh reader helps [c101 · vendor], and a separate checker is easier to make strict than a builder judging itself [c102 · anecdote]. A rule that must hold belongs in a tool [c100 · vendor] [c99 · measured]. | A script, `check-plan.mjs`, first. Then the fresh consistency check runs the same script. |

**How to tell whether a plan is thin enough.** Before the build, from the plan: steps per slice, the median size, how many steps are above 4, whether every step has a try line, whether any is a layer, and how many can start at once. `check-plan.mjs` prints these. After the build, from GitHub: changed lines per pull request, hours from pull request to merge, and the longest gap between merges. `flow.mjs` prints these, and the gate reads them before the re-plan. These are Kanban's cycle time and throughput [c20 · read] and DORA's batch size [c33 · read], counted for steps. I found no source that names "time between merges" as a measure [c131 · summary]. It is the owner's goal turned into a number **[inferred]**.

**Measured here.**

**The plan-grain run** (`agile-flow/runs/2026-11-23-plan-grain/`). One planning request, on one planned-but-unbuilt app with four MVP slices, run three ways: with no kit, with the kit on main, and with the kit on this branch. The prompt asks for the plan and a "Build order" list: one line per issue for pass 1, each saying what the person could try once it's merged, or "nothing".

| Model | Arm | Runs | Issues in pass 1, median | Of those, try-able, median | Try-able of all | Passed the plan checker |
|---|---|---|---|---|---|---|
| claude-haiku-5-5 | no kit | 5 | 8 | 5 | 31 of 40 | no steps table |
| claude-haiku-5-5 | kit on main | 5 | 7 | 5 | 26 of 35 | no steps table |
| claude-haiku-5-5 | **this branch** | 5 | **12** | **12** | 62 of 62 | 5 of 5 |
| claude-fable-5-2 | no kit | 3 | 8 | 8 | 23 of 23 | no steps table |
| claude-fable-5-2 | kit on main | 3 | 9 | 8 | 25 of 28 | no steps table |
| claude-fable-5-2 | **this branch** | 3 | **14** | **14** | 42 of 42 | 3 of 3 |

 [c145, c146, c147 · measured]

- **The change shows on both models.** Against the kit on main, every branch run has more try-able steps than every main run.
- **The kit on main did not beat no kit** on this count. On the small model it planned a median of 7 issues against 8 with no kit [c145 · measured]. That fits H6: its wording asks for one issue per slice.
- **What the other plans' "nothing to try" lines are:** set-up and layers, such as "Schema and first migration", "Users table" and "Vitest and Playwright wired". That is in the run's raw plans.
- **The strong model needs less help.** With no kit, every unit it planned had something to try [c147 · measured]. The kit's gain there is a finer cut.
- **Limits.** One app and one prompt. 5 and 3 runs per arm, with no significance test. "Try-able" is the planner's own claim: nobody built these plans. Part of the gap is naming, because the new kit tells the planner to give the skeleton a try line where the other arms wrote "nothing". And more steps is only a means: whether they merge with less waiting was not measured.

**The eval run.** (Still going when this copy was checked. Filled in when it ends.)

**Pilots and tests.** Before either manifest, three draft evals were tried once each. Two became the scenarios above. The third, for the gate, passed its checks with the kit but ran into the harness's 12-turn limit, and without the kit the model also audited the code. It was dropped, so the rolling gate has no behaviour test. In the second pilot the model with no kit also turned the layer plan down: models seem to spot a cut by layer more easily than they avoid making one **[inferred]**, from one run [c148 · anecdote]. The checker itself is tested on hand-made plans [c149 · read].

### 5. CI/CD that supports this

- **Trunk-based merging fits as it is.** One issue, one short branch, one pull request, merged through one queue, is what the sources describe [c41, c125, c126 · read]. Hammant's page now says of agents what `coordinate` already does: small changes, integrated one at a time [c127 · read]. Three in flight is DORA's "three or fewer active branches" [c41 · read]. That number came from human teams in 2016 and 2017 [c42 · measured]; I use it as a start, not a law **[inferred]**.
- **The lanes are the right shape.** DORA found that heavy outside approval goes with low performance and doesn't lower failure rates [c139 · measured]. It recommends peer review in the flow of work, automated checks, and extra scrutiny only for high-risk changes [c140, c141 · read]. That is the tiny, normal and risky lanes. Thin steps make each review smaller [c110 · read] [c111, c112 · measured]; they also make more of them. Review speed matters as much as review depth: Google's rule is a response within one business day [c116 · read], and DORA 2023 ties faster reviews to 50% higher delivery performance [c117 · measured]. Fresh reviewer agents answer in minutes; the person's merges are the slow part **[inferred]**. The tiny lane already skips QA and the preview [c67, c76 · read], which keeps the cost per step down for the smallest ones.
- **CI speed is the open risk.** More steps mean more CI runs, and the pack runs everything in one job in a row [c74 · read]. Nobody has timed it [c75 · read]. The sources' answer is two stages: a fast first stage that gates the merge, and slower suites after [c28, c29 · read]. GitHub's path filters can't do this safely for a required check [c138 · read]. I didn't change the pack: it needs timing on a real project first.
- **Previews.** The pack's per-pull-request preview uses a mechanism Cloudflare renamed in 2026 and now says not to use for pull requests [c76, c132 · read]. The replacement is two months old and shares the database between previews unless told otherwise [c133 · read]. This is a pack change, outside this pull request.
- **Flags.** See section 3. The gap is the pack's missing flag module [c77 · read], not the idea.
- **Requiring branches to be up to date** costs a CI run per open pull request each time main moves [c137, c72 · read]. A limit of three in flight bounds that **[inferred]**.

### Per option

- **A** rests on [c60, c63, c64, c65 · read]: the kit as read. What it costs in waiting is **[inferred]**, not measured.
- **B** rests on the agile sources [c12, c13, c15, c39, c41, c43 · read], the slicing methods [c46, c48, c49, c50, c51, c55 · read], the size evidence [c79, c83, c84 · measured] [c110 · read] [c111 · measured], the case for a tool over a prompt [c96, c99 · measured] [c100 · vendor], and the two measurements here.
- **C** rests on [c18, c20, c22 · read] [c122 · vendor]. Against it: [c15 · read] (refinement uses what was learned), [c118 · vendor] (the vendor that argues for it didn't require review), and the owner's own design.
- **D** rests on [c11, c1 · read]. Against it: the reasons given for a timebox are human ones [c17, c7 · read].

**Gaps:**

- **Not measured:** idle time, cycle time, CI time and review rounds on any real onRails project. The loop was never run end to end here. `coverage.md` marks these cells `gap`.
- **Not found:** a controlled sweep of step size for coding agents (1 search); a measured study of a plan critic for coding agents (1 search); how many agents one person can supervise (1 search); CI wait in agent loops (1 search); a source that names time between merges as a measure; Beck's own text on the ten-minute build (2 searches, 3 fetches) [c103, c124, c131, c9 · summary].
- **Not opened:** *Accelerate* itself (the publisher's adaptation stands in) [c33 · read]; Reinertsen's 2009 book (his own posts stand in); Anderson's *Kanban* (Kanban University's guide stands in); Cohen's 2006 book behind the "200 to 400 lines" rule [c115 · vendor]; Cockburn's walking-skeleton text [c56 · summary]; Superpowers' and Task Master's own repos [c59 · summary]. web.archive.org was out of reach, so the 2006 version of Fowler's article and the April 2025 Claude Code best-practices post were not read.
- **Could not test:** the rolling gate as behaviour. A third eval for it hit the harness's turn limit and was dropped (see "Measured here").

## Hypotheses, checked

The sixteen hypotheses in `agile-flow/hypotheses.md`, written before the first search.

| # | Hypothesis, in short | Result |
|---|---|---|
| H1 | Every source asks for small batches | **Held** [c24, c25, c34, c39 · read], with Reinertsen's floor [c26 · read]. |
| H2 | Iterations got shorter, then optional | **Held** [c1, c11, c22, c29 · read]. |
| H3 | The slicing methods say: cut vertically, make it checkable | **Held** [c46, c49, c51 · read]. |
| H4 | Timebox, velocity, meetings and pace assume people; batches, limits, done, trunk and fast checks carry over | **Mostly held.** The limit on work in progress has a human reason too, context switching [c23 · read]. |
| H5 | The kit lacks a definition of done, a limit, a cadence and flow numbers | **Held** for three [c63, c65, c67 · read]. A cadence turned out not to be needed. |
| H6 | The kit's own wording makes plans coarse | **Held** as read [c60, c61, c62 · read], and in the measurement. |
| H7 | The gate is the longest idle gap | **Not tested.** Still inferred [c64 · read]. |
| H8 | Scrum's review doesn't block the next Sprint | **Held** [c12, c13, c15 · read]. |
| H9 | The person's attention is the scarce thing | **Partly.** Vendors say so [c118 · vendor] [c107 · measured]. No independent measure. |
| H10 | Models plan big because of training data, one-shot habits and no number | **Not shown.** The vendor reports disagree [c87 · vendor] [c90 · anecdote] [c92 · vendor]. What the measurement shows is cutting by layer, not always cutting big. |
| H11 | Success drops as tasks get longer | **Held, with limits** [c79, c83, c84, c85 · measured]. |
| H12 | A number changes the plan more than a wish | **Held here**, on two models (the measurement). |
| H13 | A script can tell a thin plan from a coarse one | **Held on hand-made cases** and on the plans the models wrote. Its layer check reads step names, so a layer with a clever name gets past it. |
| H14 | About ten minutes for gating checks; branches under a day | **Held for ten minutes** [c28, c29, c44 · read]. Branch life ranges from hours to two days [c27, c125 · read]. |
| H15 | The pack already has flags and previews | **Wrong on flags** [c77 · read]. **Out of date on previews** [c132 · read]. |
| H16 | Smaller changes make each review cheaper and better | **Partly.** Easier to review, yes [c111, c112 · measured]. Faster to merge, not settled [c113 · measured]. |

## Recommendation

**Pick:** B, thin steps and a gate that keeps moving. **Confidence:** medium, because the sources agree and the planning change is measured, but the loop's idle time is not.

**What would change the answer:**

- **The flow numbers from a real project.** If hours from pull request to merge don't fall with thinner steps, or the checks per step cost more than the steps save, raise the size limit from 4. Reinertsen's floor is real [c26 · read] [c95 · measured].
- **CI time.** If one CI run takes much more than ten minutes [c44 · read], more steps will wait in line, and the pack's CI needs two stages before the cut gets any thinner.
- **A stronger planner that already cuts thin.** Harness parts go stale as models change [c90 · anecdote]. Re-run the measurement when the planning model changes. If the arm with no kit passes the checker on its own, the thin test can shrink to the try line.
- **Three in flight.** It comes from human teams [c42 · measured]. If builders sit idle while CI and review keep up, raise it. If pull requests pile up in review, lower it.
- **The rolling gate.** If gate work turns out to be thrown away after the person's feedback, go back to waiting, or cap it lower than one in five.
- **Draft the next pass ahead.** If the loop still runs dry at gates, let the re-plan be drafted before the gate, on a yes given once.

## What this pull request changes

| Change | Where | Why |
|---|---|---|
| A slice is cut into **steps**, each with a try line, a size and what it comes after | `pyramid`, the `pyramid.md` template | [c50, c51, c55, c60 · read] |
| **The thin test:** a person can try it, it cuts through every layer, size 4 or under, one thing | `pyramid`, `references/slicing.md` | [c46, c48, c49, c110 · read] |
| **A plan checker** that fails layers, steps nobody can try, big steps, and too few steps | `pyramid/scripts/check-plan.mjs`, 13 tests | [c96, c99 · measured] [c100 · vendor] |
| **One issue per step,** with a "Try it" section | `issues`, the issue template, the consistency check | [c57, c60 · read] |
| **Done means,** in one place | the `pyramid.md` template | [c14, c39, c67 · read] |
| **Three in flight** | `coordinate`, `automation`, the `stack.md` template | [c41, c43, c63, c127 · read] |
| **A "To try" line per merge,** and the try line in the ask before a person's merge | `coordinate`, `qa`, `build`, `back`, the `state.md` template | [c68, c135 · read] |
| **The gate keeps moving:** audit and cleanup at once; new scope waits | `pyramid/references/pass-gate.md`, `coordinate`, `afk`, `back` | [c12, c13, c15, c64 · read] |
| **Flow numbers** for the retro and the gate | `coordinate/scripts/flow.mjs`, 5 tests | [c20, c32, c65 · read] |
| **After launch:** cut small, then the way in last, then a flag | `pyramid` | [c129, c128, c130 · read] |
| **Two evals** | `evals/scenarios/plan-thin-steps`, `coarse-plan-rejected` | "Measured here" |

**Not done, and why:**

- **The pack's CI in two stages,** its move to Worker Previews, and a flag module. Each needs the pack built and run, and CI timed on a real project [c74, c75, c132, c77 · read].
- **Drafting the next pass before the gate.** See "What would change the answer".
- **The plan checker in app CI.** A project planned before this change has no steps table and would fail it. The skills run it instead.
- **An eval for the gate.** It doesn't fit the harness's turn limit.

## Fact-check

(Not done yet.)

## Provenance

The model, effort, harness and dates for every role are in `agile-flow/provenance.json`, never copied here. Each role's brief is in `agile-flow/briefs/`, verbatim.
