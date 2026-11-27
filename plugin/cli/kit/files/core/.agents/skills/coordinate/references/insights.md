# Insights records

One small JSON file per event, in `docs/insights/<UTC yyyy-mm-dd>/`, committed with the work (#281). Only the writer makes them:

```
node .agents/skills/coordinate/scripts/insights.mjs write <kind> key=value ...   # writes the file, prints its path
node .agents/skills/coordinate/scripts/insights.mjs line <kind> key=value ...    # prints the comment form
```

Exit 2 names the bad field and writes nothing. Exit 1 is any other failed write. Never make up a value: leave it out.

## Where each lands

- **A builder** writes its own records on its branch and commits them with the work.
- **A reviewer** commits nothing: it runs `line` and puts the printed `<!-- onrails-insights {...} -->` at the end of its verdict comment.
- **The coordinator** writes the rest in its own checkout of main. After each merge, `insights.mjs harvest --pr <n> --repo <owner>/<repo>` saves the reviewers' lines there: only from its own login or one under `[insights] writers = ["<login>"]` in `docs/profile.toml`. At the end of each sweep, `insights.mjs land` opens one records-only pull request, and `land --verify <pr>` is its review (`coordinate` step 10, decision 332-1).

## The file name

`<hhmm>-<kind>-<n>-<id>.json`: `n` is the PR, else the issue, else 0; `id` is 6 random hex characters, so two branches never write the same name (decision 329-1).

## The envelope (every kind)

`v` (1), `kind`, `at` (UTC ISO; `ONRAILS_NOW` sets it in tests), `issue`, `pr`, `sha` (40 hex or null), `job`, `tool`, `model`, `effort`. Pass `model=` and `effort=` from your own session, the way preflight's `--model`/`--effort` take them. Left out, they are `unknown`. Never write the one the routing table asked for.

Optional `source=board`: a record from `board.mjs` (#346) needs only the envelope.

Text is capped at 200 characters. A list is comma-separated or a JSON list.

## The kinds

| Kind | Fields (required in bold) |
|---|---|
| `job` | **outcome** (`started`, `pr-opened`, `finished`, `handed-off`, `stopped`, `failed`, `swept`, `paused`, `ended`, `pass`, `fail`), started, ended |
| `check` | **commands** (JSON list of `{name, result: pass\|fail\|skipped, seconds}`), failed_step (null on a pass), flaky_rerun, state (`success`, `failure`), fence. The local gate's `mark-check.mjs --record <file>` writes it (#331) |
| `review` | **round**, **verdict** (`pass`, `changes`), **must**, **nice**, categories |
| `fix-round` | **round**, **fixed** |
| `ask` | **rule** (`<path>:<line>`, `hook:<event>` or `missing`), **level** (`blocker`, `decision`, `fyi`), waited_minutes, full_should_prevent, rule_ok, title |
| `touch` | **what** (`sign-in`, `merge`, `yes`, `paste`, `answer`, `other`), **minutes** |
| `merge` | **conflicted** (files) |
| `rollback` | **why**, **place** (`test`, `production`) |
| `block` | **check**, **rung** |
| `usage` | **limit**, **waited_minutes** |
| `gate` | **pass**, **issues_done**, **hours_to_ready** |
| `note` | **kind_of** (`went-right`, `went-wrong`, `look-again`), **belongs** (`project`, `kit`, `tool`), **text**, links (record file names; required unless `went-right`) |

## One example per kind

```
insights.mjs write job job=build issue=12 sha=<40 hex> outcome=started model=opus effort=low
insights.mjs write check pr=40 'commands=[{"name":"lint","result":"pass","seconds":4}]'
insights.mjs line review pr=40 round=1 verdict=pass must=0 nice=2 categories=naming,tests
insights.mjs write fix-round pr=40 round=2 fixed=3
insights.mjs write ask issue=12 rule=.agents/skills/build/SKILL.md:88 level=decision waited_minutes=30 full_should_prevent=true
insights.mjs write touch pr=40 what=sign-in minutes=5
insights.mjs write merge pr=40 conflicted=CHANGELOG.md,docs/state.md
insights.mjs write rollback pr=40 why="health check failed" place=test
insights.mjs write block issue=12 check=install rung=3
insights.mjs write usage limit=weekly waited_minutes=90
insights.mjs write gate pass=Works issues_done=9 hours_to_ready=14.5
insights.mjs write note issue=12 kind_of=went-wrong belongs=kit text="the preview URL was stale" links=1432-job-12-a1b2c3.json
```

The master of the format is `scripts/insights-record.mjs` (`validate`, `fileName`, `parseLine`); `sync-skills.mjs` copies it next to the writer and into `cli/src/`.
