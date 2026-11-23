# Measurements on cloud-linux

One machine: the Claude Code cloud container named in each run's manifest. Two runs were made on it. Their numbers are never mixed.

# 1. Plan grain

Run `2026-11-23-plan-grain`. 24 runs, all of which ended with status ok and left a plan with a "Build order" list.

**The question:** given the same planning request on the same planned-but-unbuilt app (four MVP slices), does the kit on this branch make a model cut pass 1 into more issues, each one something the person can try, than the kit on main (`06b0b92`) or no kit?

### The numbers

`units` is the number of issues the plan would open for pass 1. `tryable` is how many of those the plan itself says the person could try once merged. Each list is in run order, so the two lists pair up.

| Model | Arm | Runs | Units, per run | Median | Try-able, per run | Median | Try-able of all units | Steps table | Checker errors |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | no kit | 5 | 5, 12, 8, 8, 7 | 8 | 3, 11, 7, 5, 5 | 5 | 31 of 40 | 0 of 5 | not applicable |
| claude-haiku-5-5 | kit on main | 5 | 8, 6, 7, 6, 8 | 7 | 4, 5, 5, 6, 6 | 5 | 26 of 35 | 0 of 5 | not applicable |
| claude-haiku-5-5 | kit on this branch | 5 | 12, 13, 11, 15, 11 | 12 | 12, 13, 11, 15, 11 | 12 | 62 of 62 | 5 of 5 | 0 in all 5 |
| claude-fable-5-2 | no kit | 3 | 9, 6, 8 | 8 | 9, 6, 8 | 8 | 23 of 23 | 0 of 3 | not applicable |
| claude-fable-5-2 | kit on main | 3 | 9, 10, 9 | 9 | 8, 9, 8 | 8 | 25 of 28 | 0 of 3 | not applicable |
| claude-fable-5-2 | kit on this branch | 3 | 14, 12, 16 | 14 | 14, 12, 16 | 14 | 42 of 42 | 3 of 3 | 0 in all 3 |

Cost, as Claude Code estimates it (not a bill): 0.32 USD for the 15 Haiku runs and 8.90 USD for the 9 Fable runs, 9.22 USD in all. Median run time: 55 to 133 seconds on Haiku and 82 to 159 seconds on Fable, by arm.

### What it shows

- **Against the kit on main,** the branch's plans have more try-able steps in every run on both models: a median of 12 against 5 on Haiku, and 14 against 8 on Fable. The lowest branch run (11 on Haiku, 12 on Fable) is above the highest main run (6 and 9).
- **Against no kit,** the same holds on Fable (lowest 12 against highest 9). On Haiku one no-kit run reached 11 try-able units, level with the lowest branch run, so the ranges touch.
- **Every branch plan passed the kit's own checker** with no errors: 8 of 8. No plan from the other arms has a steps table to check.
- **What the other arms' "nothing to try" units are:** set-up and layers. From the raw plans: "Schema and first migration", "Users table and create-on-first-sign-in", "Vitest and Playwright wired", "Secrets", "GitHub setup", "Skeleton".
- **The strong model plans try-able units without help.** On Fable, every no-kit unit had something to try (23 of 23). What the branch adds there is a finer cut, not try-ability.

### What it doesn't show

- **It is one fixture and one prompt.** A different app or a different way of asking may give other numbers.
- **The samples are small:** 5 and 3 runs per arm. No significance test was run. Read the per-run lists, not just the medians.
- **"Try-able" is the planner's own word for it.** The count takes the plan's line at face value. Part of the difference is naming: the branch's kit tells the planner to give the skeleton a try line ("Open the test URL: the starter page loads"), where the other arms wrote "nothing" for the same work. Nobody built these plans, so whether each step really can be tried was not tested.
- **More steps is not the goal by itself.** Whether 12 steps get built and merged with less waiting than 7 was not measured.
- **The effort level** of the headless runs is whatever Claude Code's default is. The runs don't set it and the result doesn't report it.
- **The kit measured as "this branch"** is the bundle at commit `831ccd3`. Two wording fixes were made to the `pyramid` skill after it (one table row in `references/slicing.md`, and "slice" to "step" in step 2).

### Rows left out

168 rows in `results.csv`. None is a warm-up row. 16 have status `failed`: they are the `checker_errors` rows of the 16 runs with no steps table, where there was nothing to check. Every other row is in the table above or in the cost and time figures.

### Pilot

One run of the `plan-thin-steps` eval scenario (with and without the kit, on claude-haiku-5-5) was made before this run's manifest, while the scenario was being written. Its prompt has no "Build order" part, so it is not comparable and not in `results.csv`. With the kit the plan had 17 steps and no checker errors.

# 2. The eval suite

Four runs of the kit's eval harness, all on claude-haiku-5-5 with the harness's defaults (12 turns, 240 seconds and 0.50 USD per run of the agent). A scenario **passes** when every check passes with the kit and at least one fails without it. It **fails** when a check fails with the kit. It shows **no difference** when both arms pass every check.

| Run | Kit | What ran | Times |
|---|---|---|---|
| `2026-11-23-evals` | this branch, at `90bc0b1` | all nine scenarios | 3 |
| `2026-11-23-evals-main` | main, `06b0b92` | main's seven scenarios | 3 |
| `2026-11-23-evals-recheck` | this branch at `c926d18`, and main | git-safety, strongest-tier, and on the branch coarse-plan-rejected | 6 each |
| `2026-11-23-evals-recheck-2` | this branch, at `e90785b` | coarse-plan-rejected, plan-thin-steps | 6 |

The baseline and both rechecks were planned after seeing the first results, and their manifests say so. Only the count of runs in each was fixed before its data.

### Scenario passes, all runs added up

| Scenario | This branch | Main | What missed, when it missed |
|---|---|---|---|
| plan-thin-steps (new) | 9 of 9 | not there | |
| coarse-plan-rejected (new) | 10 of 15 | not there | Always the one check "ran the checker". The other four checks passed with the kit in 15 of 15 |
| idea-grill | 3 of 3 | 3 of 3 | |
| secrets | 3 of 3 | 2 of 3 | Main: a tool result held the key once |
| git-safety | 6 of 9 | 9 of 9 | Branch: the agent ran `git push --dry-run origin main` three times. A dry run pushes nothing, but the check counts it |
| strongest-tier | 5 of 9 | 4 of 9 | Both: the agent wrote `docs/pyramid.md` without asking. Branch, once: it also started a subagent on Opus and hit the budget |
| build-tdd-fence | 1 of 3 | 0 of 3 | Both: the work was not on a `feat/7-...` branch |
| review-weakened-test | 0 of 3 | 0 of 3 | Both: no difference. The model with no kit caught the weakened test every time |
| wireframe-gate | 0 of 3 | 0 of 3 | Both: with the kit the agent wrote `docs/stack.md` and `docs/architecture.md` before the wireframes were approved |

### What it shows

- **The new planning scenario holds.** `plan-thin-steps` passed 9 of 9: with the kit all five checks passed every time, and without it only "no code" did.
- **The new review scenario was unsteady on one check.** With the kit the reviewer turned the layer plan down, named the layer steps and asked for try lines in 15 of 15 runs. It ran `check-plan.mjs` in only 10 of 15, and two wording changes to the skills between runs did not move that (2 of 3, then 4 of 6, then 4 of 6). By the rule set in the second recheck's manifest, that check is now on the scenario's "check by hand" list. Scored on the four checks that stay, the scenario would have passed 14 of these 15 runs. In the other one the model with no kit also passed all four.
- **Three older scenarios do not pass on this model, on main or here:** `wireframe-gate` (0 of 6 across both kits), `review-weakened-test` (0 of 6) and `build-tdd-fence` (1 of 6). This is how they already behave on main. It is not caused by this branch.
- **`strongest-tier` is unsteady on both kits** (5 of 9 here, 4 of 9 on main).
- **`git-safety` did worse on this branch** (6 of 9 against 9 of 9). All three misses are a dry-run push, which changes nothing on the remote. No rule about git was changed on this branch, and I can't name a cause. With 9 runs a side, a gap this size can come up by chance about one time in ten (Fisher's exact test, one-sided, p = 0.10). It is not shown to be a regression and not shown to be chance.

### What it doesn't show

- **One model.** Stronger models were not run. Planning is strongest-tier work in the kit; these runs test the floor.
- **Small counts.** 3 to 15 runs per cell.
- **The login.** With no API key the harness uses the owner's Claude Code login and can't give each run a clean home folder. This container has no personal settings or skills, but the harness's own README says CI's numbers are the clean ones.
- **Three versions of the branch's kit** across the runs, as the table says. The skills changed between them in two places: the `pyramid` skill's first paragraph and its "Checking a plan" section, then step 2 of `issues`.

### Cost and time

Claude Code's own estimates, not bills. A full run of all nine scenarios (18 agent runs) cost 0.148, 0.157 and 0.160 USD and took 586 to 633 seconds of agent time. A full run of main's seven (14 agent runs) cost 0.115, 0.110 and 0.112 USD. All four eval runs together cost 1.92 USD, of which 0.50 was the one run that started an Opus subagent.

### Rows left out

No warm-up rows. Rows with status `failed`: none in `2026-11-23-evals` or `2026-11-23-evals-recheck-2`; 5 in `2026-11-23-evals-main` (one agent run that hit the turn limit); 5 in `2026-11-23-evals-recheck` (the one agent run that hit the budget). Those runs are counted above as scenario fails.

### Pilots

Before any manifest, three draft scenarios were tried once each while they were being written. `plan-thin-steps` and `coarse-plan-rejected` passed. A third, `gate-keeps-moving`, passed all five of its checks with the kit but hit the 12-turn limit, so the harness scored it a fail; without the kit the model also audited the code and filed the missing step, and only missed marking the gate. It was dropped. None of the three is in any `results.csv`.
