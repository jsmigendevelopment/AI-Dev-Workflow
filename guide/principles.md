# Principles

The *why* behind the steps.

## 1. AI is a program. It does what you tell it.

It won't grill you, plan in slices, follow your architecture or test its own work unless something tells it to. This kit is that something: `AGENTS.md` loads every session, and skills load when they're named.

## 2. Words are switches.

Certain phrases switch on certain behaviours. Use them on purpose.

| Say | Get |
|---|---|
| **"Grill me. Three questions at a time, each with your recommended answer."** | A real interview instead of silent guesses |
| **"Tracer bullets" / "vertical slices"** | Thin, end-to-end features you can try right away |
| **"Give me three options with trade-offs and a recommendation."** | Choices instead of the first idea it had |
| **"Modular monolith"** | Decoupled feature modules you can split out later |
| **"Controller → service → repository"** | An API that's easy to test and swap parts in |
| **"Red/green TDD"** | A failing test first, then the code |
| **"Review in a fresh context"** | A reviewer that judges the diff, not the author's story |
| **"The code wins over the docs"** | It trusts what's real when the two disagree |
| **"What's out of scope?"** | A fence, so it doesn't wander |

**"Ask me if you don't understand" barely works.** In one test, telling the AI it *may* ask got questions in only 4 of 24 conversations. Telling it to **ask three** surfaced 39 of 48 hidden decisions. Don't *allow* it to ask. *Make* it ask, and give it a number.

**Skills need to be named.** In one test, a skill that was installed but never mentioned loaded in 0 of 50 runs. One line naming it got 50 of 50. That's why `AGENTS.md` lists every skill, and every issue has a `Skills:` line.

## 3. AI finds *a* solution, not *the* solution.

It picks the first thing that works and runs with it. That's why the grill exists, why every real decision gets three options, and why the crucial ones get deep research before anyone writes code.

## 4. Constrain it before it builds.

Without a chosen UI kit, it invents its own components. Without a folder structure and an architecture, you end up with a 4,000-line React component. Decide the stack, the structure and the patterns in the tech grill, write them down, and make every agent follow them.

## 5. Readable for people means readable for AI.

Small files, clear names, one job per function, and features that don't reach into each other. Code a new teammate would understand quickly is code an AI can safely change.

## 6. Decide the product before the tech.

You can't pick a stack before you know whether it's a website, a phone app or a desktop tool. The product grill comes first and takes most of the time. The tech grill is short, and it comes last.

## 7. See it working early.

Tracer bullets give you something to try after the first slice, so you can steer while it's cheap. The pyramid stacks passes so the core gets the most love.

## 8. Remove yourself from everything except intent and taste.

You decide *what* gets built and whether it's *right*. Agents plan the details, build, review, security-check, merge and test in a browser. You look at the result once an agent has already used it.

## 9. Your speed depends on where you work.

At a startup with no real users yet, you can let agents merge after automated review. At a bank, you can't. Pick your **risk dial** (move fast, careful or strict) and gate merges to match. Schema changes are the one thing that's hard to undo, so most people should read them.

## 10. Decisions live in files.

Chats end, and context gets compacted. Everything that matters goes into `docs/`: the vision, the decisions, the state. A fresh session should be able to take over from the repo alone.
