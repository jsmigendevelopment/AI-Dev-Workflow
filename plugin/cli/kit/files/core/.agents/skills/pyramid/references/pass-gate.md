# The pass gate: between one pass and the next

A pass is done when every issue in its milestone is merged. The loop doesn't stop there. Steps 1 and 2 need no person, so they start at once, and the loop builds what they find. That is **gate work.** New scope waits for steps 3 and 4, with the person.

## Steps

1. **A fresh audit.** Start a fresh agent, everyday tier, medium effort: *"Read `.agents/skills/pyramid/references/pass-gate.md` and audit pass <N>."* You, the auditor, read only: `docs/pyramid.md`, `docs/design.md`, `docs/wireframes/index.html`, `docs/decisions.md` and the code on main. Edit nothing. Check the code against the plan for this pass and the approved wireframes:
   - **Gaps:** a planned step, screen, state or acceptance check the code doesn't have.
   - **Drift:** a screen, schema or API that differs from the design or the wireframe.
   - **Shortcuts:** a stub, a hard-coded value, a skipped error or empty state, a missing test.

   Report one line per finding, under 40 lines: `[gap|drift|shortcut] <what> · <file or screen> → <fix>`. The issue writer turns each finding into an issue labelled `gate`. **Done when** every finding is an issue, or the report says clean.
2. **Cleanup.** Collect the debt: every "nice to have" finding in the pass's merged code reviews, the audit's drift and shortcuts, and the refactors builders noted. Pick the worst first. A gap is unfinished work, so every gap is picked. Cap the rest at about 20% of the pass that just ended, by issue count: one cleanup issue for every five. The rest stays listed under "Debt" in `docs/pyramid.md`. **Done when** the picked items are issues labelled `gate`, in the next pass's milestone.
3. **The person tries it.** Any time, and it doesn't hold up steps 1 and 2. Give them the test URL and the "To try" list from `docs/state.md`: one line per step, what to do and what they'll see. Ask: *"What feels wrong, missing or slow?"* Sort each point:
   - **Wrong or slow, in what's built:** gate work. It becomes an issue through `issues` ("From feedback or bugs"), labelled `gate`, and the loop builds it now.
   - **Missing:** a new idea, so it's new scope. Add a row to `docs/features.md`. It waits for the re-plan in step 4. Never make it a `gate` issue.

   **Done when** they say they've tried enough and every point is a `gate` issue or a `features.md` row.
4. **Re-plan.** This is the CTO step: strongest tier, high effort. Ask first (see `routing`). It needs the person's go, not the end of the gate work. Open `pyramid`. Update the outline with what steps 1 to 3 taught, and cut the next pass into steps. Read the flow numbers first: `gh pr list --state merged --limit 200 --json number,createdAt,mergedAt,additions,deletions,headRefName > <tmp>/merged.json`, then `node .agents/skills/coordinate/scripts/flow.mjs --github <tmp>/merged.json`. A median pull request over about 200 changed lines, or most steps needing a second review round, means the last cut was too thick: cut thinner this time. Then `issues` writes the pass's issues and runs the consistency check. **Done when** the check is clean, or every gap is an issue or a question.

Then finish the pass's Gate record row in `docs/pyramid.md`: date, feedback issues, audit result, cleanup issues, the flow numbers, re-plan done. Mark the next pass `building`. The loop takes its steps along with any gate work still open.

## Who does what

- **The coordinator** starts step 1 and step 2 the moment the pass is done, sends the person the try list, and keeps building gate work (`coordinate`, "End of a pass"). It sends the ask once, and starts the audit once per gate.
- **Under `/afk`,** the same. When the gate work runs out, it stops: steps 3 and 4 wait for the person.
- **Hands-on** automation has no loop: the person starts each step.

## After the MVP's last pass

The MVP is complete on the test site. It is not launched. Run steps 1 to 3 the same way. In step 4, ask the person what's next: the first layer of the hourglass, more cleanup, or nothing yet. Then say: *"MVP complete; launch is your call."* Launch follows the always-stop list. Never start it because the pyramid ended.
