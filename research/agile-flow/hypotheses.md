# Hypotheses

Written 2026-11-23, before the first search. One line each: what I expect, then what would prove it wrong. The dossier's "Hypotheses, checked" section says how each one held up.

## Agile at the source

- **H1.** Every source (XP, Scrum, Kanban, Lean, continuous delivery, DORA) asks for small batches and short feedback loops, and they differ only in the number. *Wrong if* one of them argues for big batches, or says batch size doesn't matter.
- **H2.** Iteration length got shorter with each generation: weeks in XP and Scrum, no fixed iteration in Kanban and continuous delivery. *Wrong if* the current Scrum Guide or XP text sets a minimum length, or the Kanban sources require iterations.
- **H3.** The slicing methods (INVEST, SPIDR, the hamburger method, story mapping) all say the same two things: cut vertically through every layer, and each cut must show something a user can check. *Wrong if* one of them recommends cutting by layer or by component.
- **H4.** What assumes a human team: a fixed calendar timebox, velocity in story points, the daily meeting, pairing and a sustainable pace. What carries over to agents: small batches, a work-in-progress limit, a definition of done, trunk-based merging and fast feedback. *Wrong if* a source ties small batches or WIP limits to human limits only (memory, morale), with no queueing or risk argument behind them.

## onRails against agile

- **H5.** The kit already covers stories (slices), the backlog (`features.md`), continuous integration, review and a retro. It lacks a written definition of done, a WIP limit, a cadence, and any flow number (cycle time, lead time, throughput). *Wrong if* reading the skills shows one of these is already there under another name.
- **H6.** The kit's own wording makes plans coarse: "one issue per slice per pass", with a slice defined as "one thing a user can do, end to end", gives about as many issues as the MVP has slices. *Wrong if* the skills already tell the planner to split a slice into several try-able steps.

## Rapid iteration with agents

- **H7.** The longest gap with zero changes is the pass gate, because the loop stops and waits for the person, and only then plans and writes the next pass. *Wrong if* the skills let the loop keep working at a gate, or if evidence shows CI time or review rounds cost more wall-clock than the wait for the person. I can't measure a real project here, so this one may stay inferred.
- **H8.** In a Scrum team, the review does not block the next sprint, and refinement runs during the sprint. So a gate that stops all work is stricter than standard agile. *Wrong if* the Scrum Guide says work stops until stakeholders have reviewed.
- **H9.** With agents doing the building, the scarce thing is the person's attention, not builder time. A good design limits work that waits on the person (merged but not tried, questions not answered), not the number of builders. *Wrong if* evidence shows builders or CI are the real limit at the kit's scale.

## Thinner plans

- **H10.** Models plan big for three reasons: plans in their training data are phase lists, they are tuned to finish a task in one go, and nothing in the prompt gives a number. *Wrong if* there is measured evidence that models split too finely by default, or that the cause is something else.
- **H11.** Agent success drops as a task gets longer, so a thinner step is more likely to pass its checks first time. *Wrong if* the published measurements show no link between task length and success.
- **H12.** A number works better than a wish: a hard size limit, a minimum count and a test ("what can the person try after this?") change the plan more than "keep slices thin". The kit's own evidence says a number moved a small model from 7 of 24 to 19 of 24 on a different rule. *Wrong if* a with-and-without run shows the numbers make no difference to the plan a model writes. I can run this one.
- **H13.** A script can tell a thin plan from a coarse one well enough to gate on: count the steps, read each step's size, and look for a "try it" line and for layer words. *Wrong if* the script passes a plan that is plainly cut by layer, or fails one that is fine, on hand-made examples.

## CI/CD

- **H14.** The sources set a rough ceiling of about ten minutes for the checks that gate a merge, and say branches should live under a day. *Wrong if* the sources give no number, or a much looser one.
- **H15.** Feature flags and preview deploys are the two standard ways to merge unfinished work and to demo a change before it merges. The kit already has both in its default stack pack, so the gap is in how the skills use them, not in the tooling. *Wrong if* the pack lacks one of them, or the sources name a third way the kit should take.
- **H16.** Smaller changes make each review cheaper and better, so thin steps speed the lanes up, they don't slow them down, even though there are more reviews. *Wrong if* evidence shows review cost per change is flat, so more changes just means more total review cost.
