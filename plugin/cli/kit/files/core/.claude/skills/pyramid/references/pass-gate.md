# The pass gate: between one pass and the next

A pass is done when every issue in its milestone is merged. The loop stops there. The next pass starts only after these four steps. Run them in order, with the person here.

## Steps

1. **The person tries it.** Give them the test URL and the pass's slices, one line each: what they can do now. Ask: *"What feels wrong, missing or slow?"* Each point becomes an issue through `issues` ("From feedback or bugs"), tagged with the next pass. **Done when** they say they're done trying and every point is an issue.
2. **A fresh audit.** Start a fresh agent, everyday tier, medium effort: *"Read `.agents/skills/pyramid/references/pass-gate.md` and audit pass <N>."* You, the auditor, read only: `docs/pyramid.md`, `docs/design.md`, `docs/wireframes/index.html`, `docs/decisions.md` and the code on main. Edit nothing. Check the code against the plan for this pass and the approved wireframes:
   - **Gaps:** a planned slice, screen, state or acceptance check the code doesn't have.
   - **Drift:** a screen, schema or API that differs from the design or the wireframe.
   - **Shortcuts:** a stub, a hard-coded value, a skipped error or empty state, a missing test.

   Report one line per finding, under 40 lines: `[gap|drift|shortcut] <what> · <file or screen> → <fix>`. The issue writer turns each finding into an issue. **Done when** every finding is an issue, or the report says clean.
3. **Cleanup.** Collect the debt: every "nice to have" finding in the pass's merged code reviews, the audit's findings and the refactors builders noted. Pick the worst first. Cap cleanup at about 20% of the next pass, by issue count. The rest stays listed under "Debt" in `docs/pyramid.md`. **Done when** the picked items are issues in the next pass's milestone.
4. **Re-plan.** This is the CTO step: strongest tier, high effort. Ask first (see `routing`). Open `pyramid`. Update the outline with what steps 1 to 3 taught. Write the detail for the next pass only. Then `issues` writes its issues and runs the consistency check. **Done when** the check is clean, or every gap is an issue or a question.

Then fill the gate row in `docs/pyramid.md`: date, feedback issues, audit result, cleanup issues, re-plan done. Mark the next pass `building`. The loop may start it.

## After the MVP's last pass

The MVP is complete on the test site. It is not launched. Run steps 1 to 3 the same way. In step 4, ask the person what's next: a post-MVP feature's pyramid, more cleanup, or nothing yet. Then say: *"MVP complete; launch is your call."* Launch follows the always-stop list. Never start it because the pyramid ended.
