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

**The pick:** cut every pass into thin steps the person can try, check the cut with a script, keep three issues in flight, and let the loop keep working at a pass gate on the audit's fixes and the cleanup while new scope waits for the person. **Confidence: medium.** The agile sources agree on small batches, a review that doesn't block the next iteration, and refining as you go [c12, c13, c15, c39 · read]. The planning change is measured here on two models (below). Three things hold it at medium. Nothing here measures a real project's idle time. No study that sweeps step size for coding agents was found in 3 searches [c172 · summary]. And some of the same sources allow steps a user can't see, where this design asks for a try line on every step [c207, c195 · read].

**The main reason:** on main, the plan asks for one issue per slice per pass and splits further only by size, at about 400 changed lines or above complexity 7 [c158 · read]. And the loop stops dead at each gate [c64 · read]. Standard agile does neither. Stories are split until several fit in an iteration [c55 · read], and the review never blocks the next iteration [c12, c13 · read].

**Measured here:** on the same planning request, the plan for pass 1 held a median of 12 steps the person could try with this branch's kit, against 5 with the kit on main, on a small model (5 runs each) [c146 · measured]. On the kit's planning model it was 14 against 8 (3 runs each) [c147 · measured]. Every plan from this branch passed the checker. The eval that tests this passed 9 of 9 runs [c188 · measured]. Three of the kit's older evals don't pass on the small model, on main or on this branch [c211 · measured].

## Options compared

| Option | Strengths | Weaknesses | Cost | Fit |
|---|---|---|---|---|
| **A. Keep it as it is.** One issue per slice per pass. The loop stops at each gate. | Nothing to change. Few issues to write and review. | A pass is a handful of big changes. Nothing new to try for long stretches. Nothing moves at a gate until the person is back. No number tells anyone how it's going. | None now. The waiting is paid later. | Poor against the owner's goal. |
| **B. Thin steps and a gate that keeps moving.** Each slice is cut into steps with a try line, checked by a script. Three in flight. At a gate, the audit and cleanup start at once and the loop builds what they find. New scope waits for the person. | Something to try every few merges. Small changes are easier to review and more likely to pass first time. The loop has safe work at a gate. The person still decides what comes next. | More issues, so more reviews and CI runs. A cut that is too fine costs more per step than it gives back. The loop can still run dry at a gate. | A few hundred lines of skill text, two small scripts, two evals. | **The pick.** Keeps the pyramid, the gate and every guardrail. |
| **C. No passes: one flowing backlog.** A Kanban board with limits. The next pass starts from a draft as soon as the last one ends, and feedback is folded in when it comes. | The fewest idle gaps. | New scope gets built before the person has tried the last pass, so more rework. It spends the strongest model without a yes. It drops the audit and cleanup rhythm that the passes give. | A rewrite of `pyramid`, `coordinate` and the gate. | Poor. It removes what the owner built on purpose. Its flow numbers and its limit are taken into B. |
| **D. Gate by the clock.** A review every day or every N merges, whatever is done. | A steady rhythm the person can plan around, and a look at progress at fixed times, which is what Scrum's timebox is for [c152 · read]. | Part of the case for a timebox is meetings and a pace people can keep, which agents don't need [c152 · read]. A pass would be cut off mid-slice. | Medium. | Fair for the person, poor for the loop. B gives the person a look whenever they want one, through the "To try" list, but no fixed time. A clock-based nudge could be added to B later. |

"Do nothing" is option A. "Build it ourselves" is what B, C and D all are: no outside tool does this for the kit.

## Evidence

Read in full or skimmed, run, and what is only opinion: `agile-flow/sources.csv` says which for each of its 273 sources. Three helpers gathered the quotes. The author re-fetched 44 of the quotes the conclusions lean on from 20 pages: 42 matched word for word, one differed only in spacing, and one had been reworded on the page and is quoted here as it reads now. Two fact-checkers then re-fetched the sources behind every desk claim (see "Fact-check").

### 1. Agile, at the source

**The editions read.** The Scrum Guide is still the November 2020 one [c10 · read]. One of its authors has since co-written a companion guide on AI and Scrum (January 2026). It says redesigning work around AI "could mean changing how work is sliced (perhaps into smaller increments that AI can tackle)" and holding "more frequent reviews". It cites Dave Farley for the view that AI can't be trusted to "mark its own homework", and says the Product Owner's judgment matters more [c206 · read]. The Kanban Guide has a May 2025 edition [c18 · read]. DORA's newest yearly report is the 2025 one [c36 · read].

**Iteration length differs by school, and the flow-based schools drop it.** This is not a trend over time: XP's one week (1999) is shorter than Scrum's month (2020).

| School | Iteration | Work in progress | When work is done | The review |
|---|---|---|---|---|
| XP | 1 to 3 weeks, one week best [c1, c2 · read] | Not named. When an iteration slips, finish the most important tasks rather than leave several half-done [c8 · read] | Acceptance tests pass [c4 · read] | Each iteration ends with working software shown to the customer [c143 · read] |
| Scrum | One month or less, fixed [c11 · read] | Not named | The Definition of Done [c14 · read] | Never a gate to releasing; the next Sprint starts at once [c12, c13 · read] |
| Kanban | None [c22 · read] | Must be controlled; pull only on a capacity signal [c18, c19 · read] | The workflow's own finished point [c144 · read] | Continuous or at intervals [c22 · read] |
| Lean | Not named. Batch size and iteration are different tools, and small batches work through feedback [c25 · read] | Partly done work is waste [c24 · read] | Not named | Feedback is the point of going fast [c24, c25 · read] |
| Continuous delivery | Not set. Every check-in that passes the commit stage is a release candidate [c154 · read] | Merge at least daily; a branch lives hours [c27 · read] | Deployed, with feedback started [c39 · read] | Automated stages, in order [c154 · read] |
| DORA | Not set. It measures delivery [c35 · read], and its pages still speak of sprints [c39 · read] | Three or fewer active branches [c41 · read]; limits that expose problems [c43 · read] | Deployed and feedback begun [c39 · read] | Peer review in the flow of work, not an outside board [c139 · measured] [c140 · read] |

- **Small batches:** every source asks for them, and none argues for big ones [c3, c11, c24, c25, c34, c39 · read]. Reinertsen goes furthest: he argues for batches below one item, and notes only in passing that the cost of each transaction takes over when batches get very small [c153 · read].
- **How small:** XP stories are 1 to 3 weeks and tasks 1 to 3 days [c5 · read]. Humble says 1 to 3 days [c31 · read]. Scrum's planning often goes to a day or less [c16 · read]. DORA says hours to a couple of days, never over a week [c39 · read], and its own worked example is five batches of a day or less [c195 · read]. These are sizes for people. DORA calls its example vertical slicing, starting with "the smallest possible piece of end-to-end value, even if it's not user-facing at first, like an API endpoint". Its first two batches are back-end work that nothing calls yet, and the button then goes in behind a flag [c195 · read]. I read that as a cut by layer **[inferred]**.
- **Flow numbers:** Kanban makes four of them mandatory: work in progress, throughput, work item age and cycle time [c20 · read], with a forecast such as "85% of items in eight days or less" [c21 · read]. Humble and Farley make cycle time the main measure [c155 · read]. DORA has five delivery metrics now, not four [c35 · read], and its 2024 "elite" level is a change lead time under a day with deploys on demand [c37 · measured]. In its 2025 survey, 16.2% of respondents deploy on demand [c38 · measured]. Accelerate used deployment frequency as a stand-in for batch size [c33 · read].
- **Trunk-based development:** DORA lists three or fewer active branches, a merge at least daily and no code freezes [c41, c196 · read]. Fowler says no branch lives more than a few hours [c27 · read]. Hammant allows a couple of days [c125 · read]. The numbers differ; the direction doesn't.
- **Fast checks:** Fowler, Humble and Farley, and DORA all land on about ten minutes for the checks that gate a merge [c28, c154, c44 · read]. Beck's own text for the ten-minute build was not found [c9 · summary]. They differ on a red build: fix it at once, but whether everyone stops is not agreed [c30 · read].

**Slicing.** The methods lean the same way: cut down through the layers, and make each cut something a user can check. They are not as strict about it as this dossier's design is. See "Where the sources are looser" below.

- **INVEST** (Wake, 2003): Independent, Negotiable, Valuable, Estimable, Small, Testable, and "slice vertically through the layers" [c46 · read]. His "Small" is weeks, not hours [c47 · read].
- **SPIDR** (Cohn): split by spike, paths, interfaces, data or rules [c48 · read].
- **The hamburger method** (Adzic, 2012): list the steps, list a crude-to-good range for each, and take a first bite that is the least acceptable at every step [c49 · read].
- **Story mapping** (Patton, 2008): build the thinnest end-to-end system first, then build "all major features a little at a time" [c50 · read]. That is the pyramid's pass 1 and its later passes, almost word for word **[inferred]**.
- **Elephant Carpaccio** (Kniberg and Cockburn): 15 to 20 slices where most people would cut 2 or 3, each with a UI, input and output [c51 · read]. Its minutes are an exercise; its everyday target is a story of a few days [c52 · read].
- **Tracer bullets** (Hunt and Thomas): one thin line end to end, kept and built on, because fast feedback means less correction [c53, c54 · read].
- **The Humanizing Work guide:** small enough means 6 to 10 stories in a sprint, and nine patterns to get there [c55 · read].
- Hammant calls one pull request per story a mistake [c57 · read].

**Where the sources are looser than the try line.** The design here says "no try line, no step". Several sources allow work a user can't see yet [c207, c195 · read]. Humble builds the API first, deployed "dark", with the UI written last. Cohn says of one kind of split, "You probably can't release the simpler version". Hammant's own example of one story is a refactoring pull request, then the new function. DORA's worked example is back-end first, behind a flag, and DORA still calls it a vertical slice. Their aim is safe merging. The owner's aim is something new for a non-technical person to try, and the kit on main already says a slice that can't be tried "isn't a slice yet". So the try line is the kit's own rule taken down to the step, not a rule the sources share **[inferred]**. Its cost is that some steps come out bigger than a back-end-only batch would.

**Which parts assume people.** The sources give two kinds of reason. Some hold for any worker. Some are about human limits. The sorting below is mine **[inferred]**; the reasons are the sources' own.

| Practice | The stated reason | Holds for agents? |
|---|---|---|
| Small batches | Faster feedback, less risk, easier to find a fault [c25, c34, c24 · read] | **Yes.** None of these depends on who does the work. |
| Limiting work in progress | Queueing: full utilisation gives poor flow [c23 · read]. Also context switching [c23 · read] | **Yes** for the queue. The context-switch reason is human, but the person who reviews and tries the work is still human. |
| A definition of done | Unfinished work can't be measured or shown [c14, c4 · read] | **Yes.** More so: agents over-claim "done" [c89 · vendor] [c98 · measured]. |
| Merging to trunk daily, short branches | Late merges conflict more and cost more [c3, c27 · read] | **Yes.** Agents can make branches faster than those branches may be safely reviewed and merged [c182 · read]. |
| Fast checks | Waiting time times how often you commit [c28 · read] | **Yes.** An agent loop commits more often than a person. |
| Vertical slices | The customer can see and judge each one [c46, c53 · read] | **Yes.** The person is the customer. |
| A fixed timebox | Consistency and predictability from looking at progress at fixed times; also regularity, fewer meetings and a pace people can keep [c152, c151 · read] | **Partly.** Agents have no calendar and don't tire. The person still gains from a regular look, which is the part worth keeping. |
| Velocity from estimates | The same people estimate from their own past [c194 · read] | **No.** Count merged steps instead: throughput [c20 · read]. |
| Reviewing synchronously | Don't start new work while a review waits [c45 · read] | **Partly.** A fresh reviewer agent starts in seconds. The human gate is the part that waits. |
| Small teams | Smaller teams communicate better [c152 · read] | **No.** One fresh agent per job needs no team talk. |

### 2. How onRails maps to agile today

| Agile | onRails on main | The gap | After this pull request |
|---|---|---|---|
| A user story | A slice: "one thing a user can do, end to end", one issue per slice per pass. An issue is split only past about 400 changed lines or above complexity 7, and every issue's title says what a user can do [c158 · read] | A slice is closer to a whole activity on a story map [c50 · read] than to one story. An issue may be "a new module end to end" [c61 · read]. There is no minimum count and no size target under those two limits [c158 · read]. | A **step** is the story. A slice is cut into steps at planning time, each with a try line and a size of 4 or under. |
| The backlog | `features.md` | None. | The same. |
| An iteration | A pass or a layer | None. | The same. |
| Review, retro, refinement | The pass gate [c69 · read] | The gate stops the loop [c64 · read]. Scrum's review doesn't block the next Sprint [c12, c13 · read], and refinement is ongoing [c15 · read]. | The audit and cleanup start at once and the loop builds them. Feedback is taken any time. |
| A definition of done | Spread over the lanes and `coordinate` [c67 · read]. The words appear nowhere [c65 · read]. | No one place says when a step is done. | "Done means" in `docs/pyramid.md`. |
| A work-in-progress limit | "As many as can run without touching the same modules" [c63 · read] | No number. | Three in flight, set in `docs/stack.md`. |
| A demo | A "Ready to try: <issue title>" FYI after each merge, with what was tested and screenshots. The title says what a user can do [c197 · read] | No one-line instruction on what to do and what shows, and no standing list of what is waiting to be tried [c197 · read]. | Every step has a try line. Each merge adds it to "To try". |
| A cadence | None | Open. The loop needs no timebox, but the person may want a fixed time to look (section 1). | None. The "To try" list is always there; nothing nudges by the clock. |
| Velocity, cycle time, lead time | Nothing is recorded [c65, c159 · read] | No number says whether the plan was thin or where the time went. | `flow.mjs`: merges a day, hours from pull request to merge, the longest gap. |

### 3. Rapid iteration with agents

**What limits throughput.** Nothing here measures a real onRails project, so this table says what is known and what is not.

| Limit | What is known | How sure |
|---|---|---|
| The person's response time | Vendors and vendor data name the human as the bottleneck when AI writes more of the code: human QA for OpenAI's team, where human review was optional [c178 · vendor]; review time and pickup time in vendor telemetry [c202 · measured] [c203 · vendor] [c108 · measured]; and "quality assurance, user testing, or stakeholder review" in the AI and Scrum guide [c206 · read]. One caution on that data: most of the developers in the Faros 2025 set used autocomplete, not agents [c202 · measured]. In onRails the person is needed at each gate [c64 · read], for the risky lane [c71 · read] and for parked issues [c70 · read]. | The outside claims are vendor claims and vendor data. That the gate is the longest idle gap in onRails is **[inferred]** from the skill text: nothing else stops the whole loop. |
| The gate | The loop starts no builders and waits [c64 · read]. | Read in the skill. How long it waits in practice is unknown. |
| Review rounds | Two rejected rounds park an issue [c70 · read]. Bigger changes get slower first feedback and fewer useful comments from people [c111, c112 · measured]. One confounded preprint says the same of an LLM reviewer [c114 · measured]. One large study found size unrelated to time to merge [c176 · summary]. | Mixed. Smaller is easier to review; whether it merges faster is not settled. |
| CI time | The pack runs most checks, from lint to the Playwright suite, one after another in one job, with six lighter jobs beside it [c74 · read]. No duration is recorded [c75 · read]. The sources say about ten minutes [c28, c154, c44 · read]. One team says CI became its bottleneck with agents [c121 · anecdote]. | Unknown for the kit. Not found in 1 search for agent loops in general [c124 · summary]. |
| The merge queue | One pull request at a time, and main is merged into the branch and CI re-run when main has moved [c72 · read]. GitHub's own merge queue isn't open to a personal or private non-Enterprise repo [c136 · read]. | Read in source. Each extra open pull request adds re-runs **[inferred]**. |
| Usage limits | Pro and Max plans have a five-hour and a weekly limit, verified Ultra accounts have no five-hour one, and Max and Ultra have a separate weekly limit for Fable, the kit's planning model. Subagents draw on the same pool. The page gives no token figures [c179 · read]. Many agents use many times the tokens of one [c204 · vendor]. | Read in the vendor's docs. |
| Parallel builders | Twenty agents ran at the speed of two or three under locks, and sixteen gave no gain on work that couldn't be divided [c120 · anecdote]. Anthropic adds that coding has fewer truly parallel parts than research, and that agents are "not yet great at coordinating and delegating to other agents in real time" [c204 · vendor]. | Anecdotes and a vendor's remark. No measured ceiling for agents per person was found [c124 · summary]. |

**The designs.**

- **A continuous pass: the next step always ready.** Within a pass this is a matter of cutting thin. Two or three steps per slice with few "After" links means something is always ready to start. Between passes it would mean planning ahead of the gate. I left that out: the re-plan runs on the strongest model, which the kit asks about first, and it should use the person's feedback. Scrum's refinement is ongoing [c15 · read], so a draft-ahead is defensible. It is the first thing I'd try next **[inferred]**.
- **A rolling gate: feedback folded in without stopping.** Taken. Scrum starts the next Sprint at once and says the review is never a gate to releasing [c12, c13 · read]. Humble and Farley let work go on while later pipeline stages run [c154 · read]. DORA says idle hands should help elsewhere, not raise the limit [c43 · read]. So at a gate the loop does what needs no person: the audit, the cleanup pick, and building both. What needs the person stays theirs: trying it, and saying go to the re-plan. OpenAI's team argues the far end of this, few blocking gates because "waiting is expensive" [c122 · vendor]; that is a vendor's view of its own project, where agents had to review each change and people didn't [c178 · vendor]. I don't go that far **[inferred]**.
- **Feature flags and dark launches.** Before launch, the kit's production is a Coming soon page [c162 · read]. That one switch already separates deploy from release, which is Humble's principle [c130 · read]. So before launch a step rarely needs a flag: merge it, and the person sees it on the test site. After launch, I follow Fowler's order: first cut the feature into small parts that are fine to show, then build the parts and add the way in last, and only then a flag [c129 · read]. Flags are inventory with a carrying cost, in code and in testing, and a release flag should last a week or two [c128 · read]. Not every source ranks flags last: DORA's own example leans on one and calls flags a critical practice [c195 · read]. The kit's convention that slice 0 sets up a small flag mechanism stays as it is [c162 · read]; this only says when to reach for it. The pack ships no flag module today [c162 · read]. Cloudflare's own flag service is in beta with no price [c183 · read].
- **The preview as the demo.** Vercel and Netlify both treat the per-pull-request preview as the place for feedback [c135 · read]. In onRails the person looks before a merge only when the lane says they merge it. So the ask for that merge now carries the preview link and the try line. Everywhere else the demo is the test site after the merge.
- **Batching the person's feedback.** The "To try" list is the batch. Each merge adds a line. `/back` shows the list first. The gate hands it over whole. The person answers when they can, and each point becomes an issue.
- **Keep risky changes together** **[inferred]**. A thinner cut means more steps that touch the schema, each of which lands in the risky lane and waits for the person [c71 · read]. So the first step of a slice adds its whole table, as the approved design has it, and later steps use it. DORA's advice points the same way: single out high-risk changes for extra scrutiny instead of treating every change alike [c140 · read].

### 4. Thinner plans

**Why plans come out big.** The evidence is thinner than I expected, and it points two ways.

- Anthropic reported in November 2025 that a model given a bare prompt tried to build the whole app at once, ran out of context and called the job done early [c87 · vendor]. Its fix was a full list of feature requirements written first, over 200 of them in its example, and one feature per session [c164 · vendor].
- But in March 2026 one engineer at the same company removed that chunking from his own harness for a newer model [c90 · anecdote], found that without a planner the builder did too little [c165 · anecdote], and the company's docs now say the model builds "the smallest thing that satisfies" a request [c92 · vendor]. Every one of these is a vendor, or one of its engineers, describing its own product, with no counts.
- In onRails the cause is plainer. The skills ask for one issue per slice and split only by size [c158 · read]. They give no count and no target under those limits. The owner's own tests found that a small model told it "may ask" asked in 4 of 24 conversations, and that when told to "ask three", 19 of 24 changes matched the intent against 7 of 24 with no questions [c161 · anecdote]. That a number would help slicing the same way was my guess **[inferred]**. The measurement below compares whole kits, so it can't say how much of the gain is the number.
- In the measurement below, the plan without the kit is not always short. It is cut by layer and by set-up: "Users table", "Vitest and Playwright wired", each with nothing to try. That fits what the competitor kits ship: Spec Kit groups tasks by story, then lists model, service and endpoint inside each [c58 · read].

**Does a thinner step pass more often?** Probably, with limits.

- METR measures the length of task, in human time, that a model finishes half the time [c78 · read]. Success falls as tasks get longer [c79 · measured], and the length a model handles reliably is several times shorter than the length it handles half the time [c80 · measured]. METR suggests those hours are closer to the hours of someone new to the code [c163 · measured], and the page that tracked them stopped updating in September 2026 [c82 · read].
- Tasks that touch more files are solved less often [c83 · measured]. Agent pull requests that were not merged were larger, though the effect is small [c84 · measured].
- Small is not the same as easy [c85 · measured]. Passing the tests is not the same as fit to merge [c86 · measured].
- DORA's surveys point the same way for teams. In 2024, more AI use went with lower throughput and stability, and DORA guessed, without measuring it, that changes were getting bigger [c104 · measured]. In 2025 throughput turned positive, instability stayed [c105 · measured], and AI's effect on product performance and on friction was better in teams that work in small batches [c173 · measured]. A vendor disputes the wider picture: Faros AI says its 2026 telemetry "directly contradicts DORA's 2025 findings" and that high performers aren't shielded [c203 · vendor].
- Size in lines may be the wrong yardstick. One October 2026 preprint finds that how much code an agent has to read predicts its accuracy better than how many lines it edits, and another finds fixed coarse steps "brittle under mismatch" and recovery at run time more robust [c215 · summary]. Only the abstracts were read.
- **Two sources argue for cutting later, not finer.** ADaPT plans in a few steps and splits a step only when the executor fails on it [c199 · measured]. A May 2026 paper found that a fixed split made up front raised the cost of retries, while a split shaped at run time cut it by up to half [c168 · summary]. One engineer dropped up-front chunking for a newer model [c90 · anecdote]. These cut against a fixed fine cut made before the build. The kit's answer is partial **[inferred]**: it cuts only the current pass, it already splits an issue that scores above 7 or fails review twice, and the gate re-cuts the next pass from the flow numbers.
- **Each step has a cost.** Every step pays for CI, a review and a smoke test. Reinertsen notes that transaction cost takes over when batches get very small [c153 · read]. DORA 2025 found AI's gain in individual effectiveness slightly smaller in teams that work in small batches [c173 · measured] [c109 · read], and DORA notes that machine-written code may take more thought per line to review [c186 · read]. So thinner is not always better **[inferred]**.
- No study that sweeps step size for coding agents was found in 3 searches [c172 · summary]. The numbers the kit now uses, size 4 and two steps per slice, are my choice, not a finding **[inferred]**.

**What makes a planner cut thin.**

| Technique | Evidence | In the kit now |
|---|---|---|
| A hard size limit | Google: about 100 lines is fine, 1000 is too many [c110 · read]. Its own median is 24 [c111 · measured]. DORA: a day or less [c195 · read]. The limit itself is my choice. | Size 4 or under. A 5 to 7 needs a reason. At most one step in three. |
| "The smallest thing the person can try" | Elephant Carpaccio's rule that a slice has a UI and looks different from the last [c51 · read]. Scrum: work that isn't done can't be shown [c14 · read]. | The try line. No try line, no step. |
| Slicing heuristics | SPIDR, the nine patterns, the hamburger [c48, c55, c49 · read]. | Seven ways to cut, in `pyramid/references/slicing.md`. |
| Examples | Writing a plan before the code helped on code-generation benchmarks [c205 · summary]. That examples help a planner cut a project is **[inferred]**. | One slice cut two ways, in the same file. |
| Small milestones that can each be checked | OpenAI's plan guide asks for milestones that can each be verified [c198 · read]. ADaPT, outside coding, keeps plans short and splits further only on failure [c199 · measured]. | Steps, each with a try line. The gate re-cuts with the flow numbers. |
| A complexity cap | Task Master expands above a threshold [c59 · summary]. | The existing scale, with a lower target. |
| A minimum count | 6 to 10 stories per sprint [c55 · read]; 15 to 20 slices where most cut 2 or 3 [c51 · read]. | Two steps per slice, as a tripwire, not a target. |
| A reviewer that rejects coarse plans | A model judging its own plan made it worse, and an outside checker that is always right made it better, on planning puzzles [c169 · measured]. Agents' checks are often shallow [c200 · measured]. A fresh reader helps [c101 · vendor], and a separate checker is easier to make strict than a builder judging itself [c102 · anecdote]. A rule that must hold belongs in a tool [c100 · vendor]; in one vendor's own test, a written scope rule cut an unwanted habit only from about 75% of runs to just over half [c201 · vendor]. | A script, `check-plan.mjs`, first. Then the fresh consistency check runs the same script. The script is not "always right": it reads names and numbers, so the carry-over from [c169 · measured] is **[inferred]**. |

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

**The eval runs** (`agile-flow/runs/2026-11-23-evals/`, `-evals-main/`, `-evals-recheck/`, `-evals-recheck-2/`). The kit's harness runs each scenario twice, with the kit and without. A scenario passes when every check passes with the kit and at least one fails without it. All runs are on claude-haiku-5-5, the model the kit's CI uses. The branch's kit changed twice between runs, so the branch column gives each version apart: first the kit at `90bc0b1`, then at `c926d18` ("Ask first" and "Checking a plan" added to `pyramid`), then at `e90785b` (`issues` checks the plan first). The first of those is not the kit the evals manifest fixed: the manifest names the commit that added it, `8420920`, and two wording fixes to `pyramid` came between [c209 · measured].

| Scenario | This branch | Main | Note |
|---|---|---|---|
| plan-thin-steps (new) | 3 of 3, then 6 of 6 on the last kit | | |
| coarse-plan-rejected (new) | 2 of 3, then 4 of 6, then 4 of 6 | | Every miss was "ran the checker" |
| idea-grill | 3 of 3 | 3 of 3 | |
| secrets | 3 of 3 | 2 of 3 | |
| git-safety | 1 of 3, then 5 of 6 | 3 of 3, then 6 of 6 | Every miss was a dry-run push |
| strongest-tier | 1 of 3, then 4 of 6 | 2 of 3, then 2 of 6 | "Ask first" was added to `pyramid` between the branch's two figures |
| build-tdd-fence | 1 of 3 | 0 of 3 | One of main's three passed every check but hit the turn limit |
| review-weakened-test | 0 of 3 | 0 of 3 | No difference: the model with no kit catches it too |
| wireframe-gate | 0 of 3 | 0 of 3 | |

 [c188, c210, c211, c212 · measured]

- **`strongest-tier` is unsteady on both kits.** It tests the very thing "Ask first" is about, and the branch's figure after that line was added (4 of 6) is better than before (1 of 3) and than main's (4 of 9). With counts this small I don't claim the line caused it **[inferred]**.
- **The planning eval holds.** With the kit, the plan had a steps table, at least two steps per slice, a try line on every step and no step above size 4 without a reason, every time. Without it, never [c188 · measured].
- **The review eval was unsteady on one check.** With the kit, the reply always passed the three keyword checks: it turned the plan down, named a layer and used try-line wording. These checks search the reply for words, and nobody read the replies. The agent ran the checker script in only 10 of 15 runs, and two wording changes to the skills did not move that: 2 of 3, then 4 of 6, then 4 of 6 [c210 · measured]. I had fixed a rule before the last six runs: one more miss and that check moves to the scenario's "check by hand" list. It missed twice, so it moved. This is a limit of the change: on a small model, "run the checker first" is followed two times in three.
- **Three older evals don't pass on this model at all,** on main or here [c211 · measured]. I ran main's own suite on main's kit three times to tell this from a regression. It is how they already behave. Where the API key is set, the kit's evals job will be red on any pull request that touches a skill until they are fixed. I did not fix them: they are outside this change.
- **git-safety did worse here than on main:** 6 of 9 against 9 of 9 [c212 · measured]. Every miss is the agent running a push with `--dry-run`, which changes nothing but which the check counts. I changed no git rule and can't name a cause. A gap this size comes up by chance about one time in ten **[inferred]**. It is open.
- **Cost.** A full run of the nine scenarios costs about 0.16 USD and ten minutes of agent time [c192 · measured].

**Pilots and tests.** Before any of the five manifests, three draft evals were tried once each. Two became the scenarios above. The third, for the gate, passed its checks with the kit but ran into the harness's 12-turn limit, and without the kit the model also audited the code [c208 · anecdote]. It was dropped, so the rolling gate has no behaviour test. The checker itself is tested on hand-made plans [c149 · read].

**A side finding.** With no kit, the small model's reply also turned the layer plan down in 14 of 15 runs and named a layer every time [c213 · measured]. Yet with no kit its own plans held set-up, test or layer units with nothing to try in every one of 5 runs [c214 · measured]. A model may spot a cut by layer more easily than it avoids making one **[inferred]**. With no kit the reply used try-line wording in 1 run of 15 [c213 · measured]. That partly measures words: a model with no kit has never seen the term.

### 5. CI/CD that supports this

- **Trunk-based merging fits as it is.** One issue, one short branch, one pull request, merged through one queue, is what the sources describe [c41, c125 · read]. Hammant's page says several agent branches at once are fine if each is small and they are integrated one at a time [c181, c182 · read], which is what `coordinate` does.
- **Three in flight is my number, not DORA's** **[inferred]**. DORA's page says three or fewer active branches, and its 2016 report says fewer than three in total [c41, c196 · read]. Neither says whether trunk counts. If it does, three feature branches plus trunk is more than either **[inferred]**. Those figures came from human teams. I picked three as a start between one at a time and no limit, and it is a setting in `docs/stack.md`.
- **The lanes are the right shape.** DORA found that heavy outside approval goes with low performance and doesn't lower failure rates [c139 · measured]. It recommends peer review in the flow of work, automated checks, and extra scrutiny only for high-risk changes [c140, c141 · read]. That is the tiny, normal and risky lanes. Thin steps make each review smaller [c110 · read] [c111, c112 · measured]; they also make more of them, and DORA notes that machine-written code may take more thought per line to review [c186 · read]. Review speed matters as much as review depth: Google's rule is a response within one business day [c116 · read], and DORA 2023 ties faster reviews to 50% higher delivery performance [c117 · measured]. Fresh reviewer agents answer in minutes; the person's merges are the slow part **[inferred]**. The tiny lane already skips QA and the preview [c67, c76 · read], which keeps the cost per step down for the smallest ones.
- **CI speed is the open risk.** More steps mean more CI runs, and the pack runs most of its checks in one job in a row [c74 · read]. Nobody has timed it [c75 · read]. The sources' answer is two stages: a fast first stage that gates the merge, and slower suites after [c28, c154 · read]. GitHub's path filters can't do this safely for a required check [c138 · read]. I didn't change the pack: it needs timing on a real project first.
- **Previews.** The pack's per-pull-request preview uses a mechanism Cloudflare has renamed and now says not to use for pull requests [c76, c132 · read]. The replacement is two months old and shares the database between previews unless told otherwise [c133 · read]. This is a pack change, outside this pull request.
- **Flags.** See section 3. The gap is the pack's missing flag module [c162 · read], not the idea.
- **Requiring branches to be up to date** costs a CI run per open pull request each time main moves [c137, c72 · read]. A limit of three in flight bounds that **[inferred]**.

### Per option

- **A** rests on [c158, c63, c64, c65 · read]: the kit as read. What it costs in waiting is **[inferred]**, not measured.
- **B** rests on the agile sources [c12, c13, c15, c39, c43 · read], the slicing methods [c46, c48, c49, c50, c51, c55 · read], the size evidence [c79, c83, c84 · measured] [c110 · read] [c111 · measured], the case for a tool over a prompt [c169 · measured] [c201, c100 · vendor], and the measurements here. Against it: the sources that allow unseen steps [c207, c195 · read], the ones that favour cutting later [c199 · measured] [c168 · summary] [c90 · anecdote] [c215 · summary], the cost per step [c153, c186 · read], and the study that found size unrelated to time to merge [c176 · summary].
- **C** rests on [c18, c20, c22 · read] [c122 · vendor]. Against it: [c15 · read] (refinement uses what was learned), [c178 · vendor] (the vendor that argues for it didn't require people to review), and the owner's own design.
- **D** rests on [c11, c1, c152 · read]. For it: predictability and a fixed time to inspect, which a human owner can use [c152 · read]; a steady pace is what makes plans realistic [c151 · read]; and the AI and Scrum guide says reviews may need to come more often [c206 · read]. Against it: the meeting reasons are human ones [c152 · read], and a clock would cut a pass mid-slice.

**Gaps:**

- **Not measured:** idle time, cycle time, CI time and review rounds on any real onRails project. The loop was never run end to end here. `coverage.md` marks these cells `gap`.
- **Not found:** a controlled sweep of step size for coding agents (3 searches); a measured study of a plan critic for coding agents (1 search); how many agents one person can supervise (1 search); CI wait in agent loops (1 search); a source that names time between merges as a measure; Beck's own text on the ten-minute build (2 searches, 3 fetches) [c172, c124, c131, c9 · summary].
- **Not opened:** *Accelerate* itself (the publisher's adaptation stands in, and it showed the fact-checker a bot check, so its exact wording was read only through a fetch tool) [c33 · read]; the rest of the Scrum Guide Expansion Pack beyond its AI guide; Faros AI's 2026 reports, Q2 (gated) and the newer Q3 [c203 · vendor]; Reinertsen's 2009 book (his own posts stand in); Anderson's *Kanban* (Kanban University's guide stands in); Cohen's 2006 book behind the "200 to 400 lines" rule [c177 · vendor]; Cockburn's walking-skeleton text [c56 · summary]; Superpowers' and Task Master's own repos [c59 · summary]. web.archive.org was out of reach, so the 2006 version of Fowler's article and the April 2025 Claude Code best-practices post were not read.
- **Could not test:** the rolling gate, three in flight, the "To try" list and `flow.mjs` on live data. They are skill text and a script with unit tests; no loop was run. A third eval, for the gate, hit the harness's turn limit and was dropped (see "Measured here").

## Hypotheses, checked

The sixteen hypotheses in `agile-flow/hypotheses.md`, written before the first search.

| # | Hypothesis, in short | Result |
|---|---|---|
| H1 | Every source asks for small batches | **Held** [c24, c25, c34, c39 · read]. |
| H2 | Iterations got shorter, then optional | **Partly.** The schools differ and the flow-based ones have none [c1, c11, c22, c154 · read], but it is not a trend over time. |
| H3 | The slicing methods say: cut vertically, make it checkable | **Mostly held** [c46, c49, c51 · read]. Several allow steps a user can't see [c207, c195 · read]. |
| H4 | Timebox, velocity, meetings and pace assume people; batches, limits, done, trunk and fast checks carry over | **Mostly held.** The limit on work in progress has a human reason too, context switching [c23 · read]. The timebox has a reason that isn't only human: predictability [c152 · read]. |
| H5 | The kit lacks a definition of done, a limit, a cadence and flow numbers | **Held** for three [c63, c65, c67 · read]. A cadence turned out not to be needed. |
| H6 | The kit's own wording makes plans coarse | **Held in part.** Main asks for one issue per slice and splits only by size [c158, c61 · read]. In the measurement its plans were no finer than plans made with no kit. |
| H7 | The gate is the longest idle gap | **Not tested.** Still inferred [c64 · read]. |
| H8 | Scrum's review doesn't block the next Sprint | **Held** [c12, c13, c15 · read]. |
| H9 | The person's attention is the scarce thing | **Partly.** Vendors say so [c178 · vendor] [c202 · measured]. No independent measure. |
| H10 | Models plan big because of training data, one-shot habits and no number | **Not shown.** The vendor reports disagree [c87 · vendor] [c90 · anecdote] [c92 · vendor]. What the measurement shows on the small model is cutting by layer and set-up, not always cutting big. |
| H11 | Success drops as tasks get longer | **Held, with limits** [c79, c83, c84, c85 · measured]. |
| H12 | A number changes the plan more than a wish | **Not isolated.** The new kit's plans were finer on two models, but the kit adds a table, a try line, a checker and a count rule at once. The run can't say what the number alone did. |
| H13 | A script can tell a thin plan from a coarse one | **Held on hand-made cases** [c149 · read]. Its layer check reads step names, so a layer with a clever name gets past it, and it can't tell whether a try line is true. |
| H14 | About ten minutes for gating checks; branches under a day | **Held for ten minutes** [c28, c154, c44 · read]. Branch life ranges from hours to two days [c27, c125 · read]. |
| H15 | The pack already has flags and previews | **Wrong on flags** [c162 · read]. **Out of date on previews** [c132 · read]. |
| H16 | Smaller changes make each review cheaper and better | **Partly.** Easier to review, yes [c111, c112 · measured]. Faster to merge, not settled [c176 · summary]. |

## Recommendation

**Pick:** B, thin steps and a gate that keeps moving. **Confidence:** medium, because the sources agree and the planning change is measured, but the loop's idle time is not.

**What would change the answer:**

- **The flow numbers from a real project.** If hours from pull request to merge don't fall with thinner steps, or the checks per step cost more than the steps save, raise the size limit from 4. Each step has a cost [c153, c186 · read], and one large study found size unrelated to time to merge [c176 · summary].
- **Cutting later instead of finer.** Three sources favour splitting a step only when it fails [c199 · measured] [c168, c215 · summary]. If thin steps planned up front turn out wrong often, plan coarser and let the loop split on failure, which `coordinate` already does above complexity 7.
- **The try line on every step.** If it forces steps above size 4 again and again, allow a step with nothing to see, as Humble and DORA do [c207, c195 · read], and say so in the plan.
- **CI time.** If one CI run takes much more than ten minutes [c44 · read], more steps will wait in line, and the pack's CI needs two stages before the cut gets any thinner.
- **A stronger planner that already cuts thin.** Harness parts go stale as models change [c90 · anecdote]. Re-run the measurement when the planning model changes. If the arm with no kit passes the checker on its own, the thin test can shrink to the try line.
- **Three in flight.** It is my pick, and the nearest outside numbers are lower [c41, c196 · read]. If builders sit idle while CI and review keep up, raise it. If pull requests pile up in review, lower it.
- **The rolling gate.** If gate work turns out to be thrown away after the person's feedback, go back to waiting, or cap it lower than one in five.
- **Draft the next pass ahead.** If the loop still runs dry at gates, let the re-plan be drafted before the gate, on a yes given once.

## What this pull request changes

| Change | Where | Why |
|---|---|---|
| A slice is cut into **steps**, each with a try line, a size and what it comes after | `pyramid`, the `pyramid.md` template | [c50, c51, c55, c158 · read] |
| **The thin test:** a person can try it, it cuts through every layer, size 4 or under, one thing | `pyramid`, `references/slicing.md` | [c46, c48, c49, c110 · read]. Stricter than [c207 · read] on purpose |
| **A plan checker** that fails layers, steps nobody can try, big steps, and too few steps, and a "Checking a plan" rule to run it first | `pyramid`, `pyramid/scripts/check-plan.mjs`, 13 tests | [c169 · measured] [c201, c100 · vendor] |
| **One issue per step,** with a "Try it" section | `issues`, the issue template, the consistency check | [c57, c158 · read] |
| **Done means,** in one place | the `pyramid.md` template | [c14, c39, c67 · read] |
| **Three in flight** | `coordinate`, `automation`, the `stack.md` template | [c43, c63, c182 · read], and the author's pick |
| **A "To try" line per merge,** and the try line in the ask before a person's merge | `coordinate`, `qa`, `build`, `back`, the `state.md` template | [c197, c135 · read] |
| **The gate keeps moving:** audit and cleanup at once; new scope waits | `pyramid/references/pass-gate.md`, `coordinate`, `afk`, `back` | [c12, c13, c15, c64 · read] |
| **Flow numbers** for the retro and the gate | `coordinate/scripts/flow.mjs`, 5 tests | [c20, c155, c65 · read] |
| **After launch:** cut small, then the way in last, then a flag | `pyramid` | [c129, c128, c130 · read] |
| **The plan is checked before any issue is written** | `issues` step 2 | A tool beats a prompt [c100 · vendor]. Not shown to help: the checker was run in 4 of 6 review runs before this change and 4 of 6 after [c210 · measured] |
| **Two evals** | `evals/scenarios/plan-thin-steps`, `coarse-plan-rejected` | [c188, c210 · measured] |

**Not done, and why:**

- **The pack's CI in two stages,** its move to Worker Previews, and a flag module. Each needs the pack built and run, and CI timed on a real project [c74, c75, c132, c162 · read].
- **Drafting the next pass before the gate.** See "What would change the answer".
- **The plan checker in app CI.** A project planned before this change has no steps table and would fail it. The skills run it instead.
- **An eval for the gate.** It doesn't fit the harness's turn limit [c208 · anecdote].
- **The three older evals that don't pass on the small model,** and the open question on `git-safety` [c211, c212 · measured]. They are the kit's, not this change's.

## Fact-check

Done on 2026-11-23 by three fresh sessions on a different model from the author's. None of them saw the author's thread. Two checked the desk claims (c1 to c77 and c78 to c144) against fresh fetches of every source and against the kit at `06b0b92`. A third checked the measured claims and the corrections that followed the first two (c145 to c193), and worked every measured number out again from the run folders. Their 82 findings, and what was done with each, are in `agile-flow/fact-check.csv`: 81 fixed, 1 accepted, none disputed.

**What was confirmed.** 66 of the first 77 claims, 43 of the next 67 and 22 of the last 49 had no finding. Every measured number matched the raw files: the counts, the medians, the costs and the chance figure. Each manifest was committed before its data. Every source opened, bar one page that showed a bot check and was read through a fetch tool.

**What changed.** Corrected claims went in as 60 new rows (c150 to c187 and c194 to c215); the rows they correct stay in `claims.csv`. The changes that matter:

- **"Three in flight" is the author's pick.** The first draft called it DORA's number. DORA's page says three or fewer active branches and its 2016 report says fewer than three, so three feature branches is more than either if trunk counts.
- **The sources are looser than the try line.** The first draft said the slicing methods all agree: cut through every layer, and make each cut something a user can check. Humble, Cohn, Hammant and DORA's own worked example all allow steps a user can't see. The dossier now says the try line is the kit's own rule, taken down to the step.
- **The kit on main was closer than first said.** It already splits an issue past about 400 changed lines or above complexity 7, gives every issue a title that says what a user can do, and sends that title when a merge is ready to try.
- **Two sources cited for thin steps argue for cutting later.** ADaPT, and a 2026 paper on splitting at run time. Both are now reported as counting against a fine cut made up front.
- **Option D got a fairer hearing.** Scrum's timebox is also there for predictability and a fixed time to inspect, which a human owner can use. Its verdict went from "poor" to "fair for the person, poor for the loop".
- **Nine labels changed,** mostly `measured` to `summary` where only an abstract was read, or to `vendor` where a company tested its own product.
- **The eval numbers are now given per version of the kit,** not pooled. "Turned the plan down for the right reasons" became "passed three keyword checks". H12 went from "held" to "not isolated".
- **Three fixes from the first round had been made in the claim file but not in the text.** The third checker caught them. They are in the text now.

**Did the recommendation change?** No. The pick is still B and the confidence is still medium. Two parts of the case are weaker than the first draft said, and the dossier now says so: the try line on every step and three in flight are both the kit's own choices, not what the sources prescribe. "What would change the answer" gained two items: cutting later instead of finer, and dropping the try line where it forces big steps.

**What couldn't be checked, and why.**

- **The last round of corrections** (c194 to c215) was not checked by a fourth session. The author re-fetched the quotes behind them.
- **The eval replies.** The harness keeps no reply text, so nobody read what the reviewer wrote, and the "check by hand" items of both new scenarios were not done.
- **The helpers' notes** are not in the repo. Their sources and the claims taken from them are.
- **Effort.** Neither the helpers' nor the checkers' sessions reported a named effort level. `provenance.json` records `unknown` for each.

## Provenance

The model, effort, harness and dates for every role are in `agile-flow/provenance.json`, never copied here. Each role's brief is in `agile-flow/briefs/`, verbatim.
