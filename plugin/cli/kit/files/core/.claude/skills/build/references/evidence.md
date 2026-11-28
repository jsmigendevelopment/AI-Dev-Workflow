# Evidence

Some of this workflow comes from experiments I ran on AI coding agents in November 2026, and from an independent audit of this kit. Most of those runs used small models (Haiku 5.5 and Sonnet 5.5 at low effort) in Claude Code, on one small test project, with 5 to 30 runs per setting. One result flipped between two models. The rest comes from published studies and the AI vendors' own guidance.

Treat it as strong hints, not laws, and **re-test anything you rely on when your model changes.**

| Finding | Result | Source |
|---|---|---|
| Stating decisions up front | With two decisions left unsaid, a builder matched what was intended on 7 of 24 changes. With them stated, 24 of 24. | My test |
| "You may ask" vs. "ask three" | With no questions, 7 of 24 changes matched the intent. Told it *may* ask, it asked in only 4 of 24 conversations. Told to **ask three**, 19 of 24 matched. Asking five was no better. | My test, matching published results |
| Naming a skill in the request | Four installed skills that nobody mentioned loaded 0 of 40 times on a small model. One sentence naming the skill: 20 of 20. An earlier test of a different skill: 0 of 50, then 50 of 50. | Audit + my test |
| A list of skills in `AGENTS.md` | Helped one skill in four on a small model, and changed nothing on a large one. Naming the skill in the request is what works. | Audit |
| It depends on the model | The same request loaded the security skill 0 of 10 times on Haiku 5.5 and 10 of 10 on Opus 5.5. | Audit |
| Reviewer effort | A low-effort reviewer flagged 16 of 17 planted one-token bugs the tests missed. The same model at high effort flagged 15, took 2.3× as long and raised more false alarms. | My test, small models |
| What the reviewer sees | With a pull request description written to persuade, AI reviewers accepted 32 of 33 reintroduced known vulnerabilities. With neutral text, 4 of 33. | Published |
| "Done" is a claim | In one benchmark, 52% of failed steps had been reported complete. | Published |
| Acceptance tests written first, run by someone else | Added 34–48 points on one benchmark and 7.6 on a second, against no tests. | Published |
| Several reviewers on risky changes | Three vendors' reviewers together found about 9 in 10 vulnerabilities. The best single one found 74–78%. | Published |
| Big reading lists are expensive | One "read these before you start" list added about 105k tokens to a run that started at about 45k. This kit adds about 3k. | My measurement (by subtraction) + audit |
| Generated instruction files | Auto-generated `AGENTS.md`-style files cost about 20% more and didn't help. Hand-written ones helped a little (not a significant gain), so keep yours short and specific. | Published |
| Long interviews | Rebuilding whole repos, 16 questions beat 8, and 24 didn't beat 16. | Published, one model, simulated users |
| AI-built apps in production | 91% of 200 deployed apps with mostly AI-written commits had a validated vulnerability, broken access control in 64%. | Published |
| Per-action approval prompts | People approve 93–97% of them, so they mostly add clicks. Approve the intent and the result instead. | Vendor data |
| Shouting at the model | Vendors now advise dropping "think hard", capitalised "IMPORTANT" and "keep going". | Vendor guidance |
| Thin steps in the plan | Asked to plan the same app, a small model listed a median of 12 steps the person could try for pass 1 with the thin test and the plan checker, against 5 with the kit as it was. The planning model: 14 against 8. One app, 5 and 3 runs per arm. | My test (`research/agile-flow.md`) |
| Small changes are easier to review | At Google the median change is 24 lines, and first feedback comes in under an hour for small changes against about 5 hours for very large ones. At Microsoft, the more files in a change, the smaller the share of useful review comments. | Published |
| A model checking its own plan | With one model as planner and checker, self-checking made plans worse. A sound outside checker made them better. Measured on planning puzzles, not code. | Published |
