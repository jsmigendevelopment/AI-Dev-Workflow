# Evidence

Some of this workflow comes from experiments I ran on AI coding agents in November 2026. The rest comes from published studies and from the AI vendors' own guidance. Most of my runs were single runs on one or two models, so treat them as strong hints, not laws, and **re-test anything you rely on when your model changes.**

| Finding | Result | Source |
|---|---|---|
| Stating the decisions up front | With two decisions left unsaid, a builder matched what was intended on 7 of 24 changes. With them stated, 24 of 24. | My test |
| "You may ask" vs. "ask three" | "You may ask" got questions in 4 of 24 conversations. "Ask three" surfaced 39 of 48 hidden decisions. Asking five was no better than three. | My test, matching published results |
| Skills must be named | An installed but unnamed skill loaded in 0 of 50 runs. One line naming it got 50 of 50. | My test, two models |
| Reviewer effort | A low-effort reviewer flagged 16 of 17 planted bugs the tests missed. The same model at high effort flagged 15, and a stronger model at low effort flagged 16. | My test |
| Big reading lists are expensive | One "read these before you start" list added about 105k tokens to a run that started at about 45k. | My measurement |
| Acceptance tests written first, run by someone else | Added 34–48 points on one benchmark against no tests. | Published |
| Several reviewers on risky changes | Three vendors' reviewers together found about 9 in 10 vulnerabilities. | Published |
| Generated instruction files | Auto-generated `AGENTS.md`-style files cost more and didn't help. Short hand-written ones are better. | Published |
| Long interviews for whole products | When rebuilding whole repos, 16 questions beat 8, and 24 didn't beat 16. | Published, simulated users |
| Per-action approval prompts | People approve 93–97% of them, so they mostly add clicks. Approve the intent and the result instead. | Vendor data |
| Shouting at the model | Vendors now advise dropping "think hard", ALL-CAPS "IMPORTANT" and "keep going". | Vendor guidance |
