# Guides: what to load, and when

Load a guide only when its row fits the job. Most runs need none: the skills carry the short version.

| Guide | Load when |
|---|---|
| [code-style.md](code-style.md) | A code rule is unclear, or you want the reason before you bend one. Ships as `build/references/code-style.md`. |
| [testing.md](testing.md) | A test is hard to write, or you're unsure what to mock, how to name it or whether a snapshot fits. Ships as `build/references/testing.md`. |
| [app-conventions.md](app-conventions.md) | Deciding or reviewing how an app handles state, errors, loading, the API, money, time, the database, logs, events, env or access. Ships as `build/references/app-conventions.md`. |
| [environments.md](environments.md) | Adding, rotating or onboarding a key or variable, or setting up local, test, preview or production. |
| [staying-in-the-loop.md](staying-in-the-loop.md) | Explaining pings, the board or the automation levels to the person. |
| [add-to-existing-app.md](add-to-existing-app.md) | Adding the kit to an app that already has code. |
| [principles.md](principles.md) | Changing how onRails works, and you need the why. |
| [evidence.md](evidence.md) | Someone asks what a rule is based on, or a change would undo a tested rule. |
| [cheat-sheet.md](cheat-sheet.md) | The person asks which command to type. |

A skill with a `references/` folder has its own **References** table with the same "load when" rule. Edit the guide here, never its copy in `build/references/`: `node scripts/sync-skills.mjs` copies it.
