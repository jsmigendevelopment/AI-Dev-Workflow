---
name: research
description: Use when a decision is crucial, uncertain and expensive to undo and nobody knows the best answer ("we need to research this", "what's the best way to do X", "which library should we use", "is this even possible") - runs a focused research thread on the strongest model, compares at least three options against evidence, fact-checks the result, and writes a dated dossier with a recommendation into docs/research/.
---

# Research: don't guess on the decisions that matter

AI tends to find *a* solution and run with it. For the few decisions that shape the whole app, research the options first.

## When

Use it only when **all three** are true:
- the decision is **crucial**;
- nobody **knows** the best answer;
- it's **expensive to undo**.

Everything else gets three options with trade-offs and a recommendation, decided in the conversation.

## How

1. **Check what's known.** Look in `docs/research/`, and in the person's research library if they have one. Don't redo current research.
2. **Run it in its own thread** on the strongest model at high effort (see `routing`). Give that thread the question, the constraints from `docs/vision.md` and `docs/stack.md`, and what "good" means for this app.
3. **Write the dossier** to `docs/research/<topic>.md`:
   - the **question** and the **date**;
   - **options:** at least three, with real trade-offs;
   - **evidence** for each: sources read in full, sources skimmed, any small experiment run, and what's only opinion;
   - a **recommendation** and **confidence** (high, medium or low), with the reason;
   - **what would change the answer.**
4. **Fact-check before anyone acts on it.** A fresh agent checks every number and claim against its source and lists what's wrong, overstated or unsupported. Fix those first.
5. **Bring back the recommendation, not the whole dossier.** The person decides, and the decision goes into `docs/decisions.md` with a link to the dossier.

## Rules

- Write "not found in N searches", never "doesn't exist."
- Date everything. Tools and models change fast.
- If the evidence is thin, say so. Don't dress up a guess as a finding.

## Competitor scan

A lighter kind of research, started by `grill` in the background once "who and why" and "the main flow" are done. Everyday model, medium effort (see `routing`). It doesn't stop the grill.

1. **Find 3 to 8 competitors,** plus what people use today instead: a spreadsheet, a general tool, or nothing.
2. **For each:** what it does well, what it does badly, its pricing and free tier, and who it's for. Check its own site and docs, and say when you couldn't.
3. **What users complain about:** reviews, forums, app-store comments. Quote short and link.
4. **The gaps:** what nobody does well, and where this app could stand out.
5. **Write it** to `docs/research/competitors.md` (`kickoff/research/competitors.md` before the repo exists), with the date, sources, a label on every claim (read on their site, user review, guess), and the model and effort that ran it. Keep it under 2 pages.
6. **Bring back five lines** for the MVP topic: what exists, the top complaints, and the gaps.

In `/join`, offer it once as an optional step. Re-run it before a big new feature or a pricing decision.
