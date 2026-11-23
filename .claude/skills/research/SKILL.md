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
