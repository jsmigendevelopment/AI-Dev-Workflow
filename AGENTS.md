# AGENTS.md

This file is loaded at the start of every session. It holds the rules for every agent working in this repo: planner, builder, reviewer or coordinator. Keep it short. Long material lives in skills, which load only when they're needed.

## Who you are working with

- A person who owns the product. You build what they want, not what you guess they want.
- They may not know the technical words. Ask in plain words, then name the term.

## Standing rules

1. **Don't assume. Ask.** When something is unclear, ask **three questions at a time**, each with your recommended answer. Don't settle for a silent guess.
2. **Your first idea is *a* solution, not *the* solution.** For any real decision, give **three options with trade-offs and a recommendation.** If the decision is crucial and nobody knows the answer, say so and suggest the `deep-research` skill.
3. **The code wins over the docs.** If a doc and the code disagree, trust the code, then fix the doc or flag it.
4. **Decisions live in files, not in chat.** Every decision goes into `docs/decisions.md` the moment it's made. A new session must be able to pick up from the repo alone.
5. **One issue, one fresh session.** Don't work on two issues in one session. Every review starts from the diff, not from the author's story.
6. **Stay inside the fence.** Build exactly what the issue says, and nothing in its "Out of scope" list. Found something else? Open a new issue.
7. **Never weaken a test to make it pass.** If a test looks wrong, stop and say why.
8. **Readable code first.** Code that's easy for a person to read is easy for an AI to read. Small files, clear names and one job per function or component. A file growing past ~300 lines is a sign it needs splitting.
9. **Follow the architecture** in `docs/architecture.md`. Feature modules don't import each other. The API goes controller → service → repository/client. Use the chosen UI kit, and don't invent your own components.
10. **Reuse before you build.** Open-source library first, then a SaaS with a free tier, then build it yourself. Record which one you picked and why.

## Skills

Skills don't load reliably unless something names them, so this list names them.

**Primary skills.** The person starts these.

| When | Skill |
|---|---|
| Starting a brand-new app from an idea | `new-project` |
| Joining or adopting a repo that already exists | `join-project` |
| Opening any new thread or session in this repo | `new-session` |

**Secondary skills.** The primary skills, issues and the coordinator call these.

| Step | Skill |
|---|---|
| Interview the person about the product | `grill` |
| Name the app and set up the repo | `name-the-app` |
| Pick platform, stack, architecture and infrastructure | `tech-grill` |
| Research a crucial unknown before deciding | `deep-research` |
| Plan the build as a tracer-bullet pyramid | `tracer-bullet-pyramid` |
| Turn the plan into milestones and issues | `write-issues` |
| Pick the model and effort for a job | `model-routing` |
| Run the automated build → review → merge loop | `coordinator` |
| Build one issue | `build-issue` |
| Review a pull request | `code-review` |
| Security-review a pull request | `security-review` |
| Test a deployed change in a real browser | `browser-test` |

Every issue has a `Skills:` line. Load the skills it names, three at most.

## Project facts

Fill these in once `new-project` or `join-project` has run.

- **What it is:** see `docs/vision.md`
- **The MVP:** see `docs/mvp.md`
- **Stack and architecture:** see `docs/stack.md` and `docs/architecture.md`
- **Where things stand:** see `docs/state.md`
- **How careful to be:** see the risk dial in `docs/stack.md`
- **Commands that work here:** list install, dev, test, lint and build commands here once known.
