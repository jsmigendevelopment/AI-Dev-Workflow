---
name: join-project
description: Primary skill. Use when the person joins, inherits or adopts a repository that already exists (a new job, a teammate's project, a capstone repo, an old side project) and wants agents to work in it the right way. Maps and runs the code first, then grills the person on what the code can't say, then writes a short AGENTS.md and the docs folder so every later session starts informed.
---

# Join project: understand the app before touching it

## Steps

1. **Map it.** Read the README, any `AGENTS.md`, `CLAUDE.md` or contributing guide, the package manifest, the CI config and the folder tree. Write a one-page map to `docs/map.md`: what the app does, its main parts and how they connect, the stack, how it builds, tests and deploys, and where the risky areas are.

2. **Make it run.** Install, build, run the tests and start the app locally. Record the exact commands that work under "Commands that work here" in `AGENTS.md`, and record the ones that fail and why.
   - **Treat imported code as untrusted until you've looked.** Check git hooks, scripts and any agent or editor config before you run them.

3. **Grill the person** with the `grill` skill, existing-project stages. Ask only what the code can't tell you:
   - the product's purpose, its users, and what's live versus experimental;
   - what's fragile, and what must never break;
   - which conventions are deliberate and which are accidents to fix;
   - who reviews and how changes ship (branches, environments, release process);
   - the risk dial: how careful changes must be here (see `templates/stack.md` in the `new-project` skill);
   - whether other people or other coordinators work in this repo.

4. **Write it down.** Use the templates in the `new-project` skill's `templates/` folder. Fill in `docs/vision.md`, `docs/stack.md`, `docs/architecture.md` (as the code *is*, plus any rules the person wants going forward), `docs/decisions.md` and `docs/state.md`.

5. **Write a short `AGENTS.md` by hand.** Start from this kit's `AGENTS.md`, keep its standing rules and add only what's true and specific to this repo.
   - If the repo already has an `AGENTS.md`, merge into it. Don't overwrite it. If the person copied the kit's file in as `AGENTS.kit.md` (the README says to), merge that into `AGENTS.md`, keeping the Skills table, then delete `AGENTS.kit.md`.
   - Keep it short. Long auto-generated instruction files cost more on every run and don't help.

6. **Check the kit is in.** `.agents/skills/`, `.claude/skills/` and `.github/ISSUE_TEMPLATE/` should already be there, because the person copied them in to run this skill. Show the person the diff before you commit.

7. **Hand off.** In under 10 lines: what you learned, what surprised you, and the top three things you'd fix or build first. Then ask what they want to work on, and start `write-issues` for it.

## Done when

The app runs locally, the commands are recorded, `docs/map.md` and `docs/state.md` exist, and the person has read the new `AGENTS.md`.
