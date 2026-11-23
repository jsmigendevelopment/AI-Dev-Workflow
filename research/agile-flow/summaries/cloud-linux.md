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
