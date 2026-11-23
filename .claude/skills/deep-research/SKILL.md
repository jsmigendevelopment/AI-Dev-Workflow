---
name: deep-research
description: Secondary skill. Use when a decision is crucial, uncertain and expensive to undo and nobody in the conversation knows the best answer (which library, which architecture, how others solved it, is this even possible) - runs a focused research thread on the strongest model at high effort, compares options against evidence, and writes a dated dossier with a recommendation into docs/research/.
---

# Deep research: don't guess on the decisions that matter

AI tends to find *a* solution and run with it. For the few decisions that shape the whole app, research the options first.

## When to use it

Use it only when **all three** are true:
- the decision is **crucial**;
- nobody **knows** the best answer;
- it's **expensive to undo**.

Everything else gets three options with trade-offs and a recommendation, decided in the conversation.

## How

1. **Check what's already known.** Look in `docs/research/`, and in the person's research library if they have one. Don't redo research that already exists and is still current.
2. **Run it in its own thread** on the strongest model at high effort (see `model-routing`). Give that thread:
   - the question;
   - the constraints from `docs/vision.md` and `docs/stack.md`;
   - what "good" means for this app.
3. **The dossier**, written to `docs/research/<topic>.md`:
   - **Question** and **date**;
   - **Options**, at least three, with real trade-offs;
   - **Evidence** for each: sources read, any small experiment you ran, and what's only an opinion;
   - **Recommendation** and **confidence** (high, medium or low), with the reason;
   - **What would change the answer.**
4. **Bring back the recommendation, not the whole dossier.** The person decides, and the decision goes into `docs/decisions.md` with a link to the dossier.

## Rules

- Say what you read in full and what you only skimmed.
- Date everything. Tools and models change fast, so advice goes stale.
- If evidence is thin, say so. Don't dress up a guess as a finding.
