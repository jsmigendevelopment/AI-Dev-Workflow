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
- **The coordinator** writes the rest in its own checkout of main. After each merge, `insights.mjs harvest --pr <n> --repo <owner>/<repo>` saves the reviewers' lines there: only from its own account or one listed as `"<login>:<id>"` under `[insights] writers = ["<login>:<id>"]` in `docs/profile.toml` (the list may span lines; `gh api users/<login> --jq .id` gives the ID). It trusts the numeric user ID, never the login alone: a comment whose login matches but whose ID doesn't is skipped and named, and an entry with no ID isn't trusted (#408). A `check` line is kept only from a comment that reports the run (#441): its first line is `Checks: pass|fail @ <sha>`, or `Code review: approve|request changes @ <sha>` (the reviewer's verdict comment) with exactly one `Checks: pass|fail @ <sha>` at the start of a later line. That sha is the record's `sha`, and `pass` fits `state: success`, `fail` fits `state: failure`. Any other `check` line is skipped and named, and the other kinds are kept as before. At the end of each sweep, `insights.mjs land` opens one records-only pull request, or adds to the one already open, and `land --verify <pr>` is its review (`coordinate` step 10, decisions 332-1 and 332-2). A record file is the writer's exact bytes, at most 16 KB.
- **The merge step** (`coordinate` step 7, #333) merges a pull request only when `insights.mjs has-records --pr <n> --sha <sha>` finds its job, check and review records at the exact head, after a harvest. After a clean merge of main into a reviewed branch, `insights.mjs carry --pr <n> --from <reviewed sha> --to <merge sha>` writes the merge commit's job (`job=carry-review`) and review records (decision 333-2). Never write a missing record by hand: re-run the job that makes it.

## The file name

`<hhmm>-<kind>-<n>-<id>.json`: `n` is the PR, else the issue, else 0; `id` is 6 random hex characters, so two branches never write the same name (decision 329-1).

## The envelope (every kind)

`v` (1), `kind`, `at` (UTC ISO; `ONRAILS_NOW` sets it in tests), `issue`, `pr`, `sha` (40 hex or null), `job`, `tool`, `model`, `effort`, and optional `model_from`. Pass `model=` and `effort=` from your own session, the way preflight's `--model`/`--effort` take them. Left out, they are `unknown`. Never write the one the routing table asked for. Either one `unknown`? Add `model_from=<why>`: where you looked (#129).

Optional `source=board`: a record from `board.mjs` (#346) needs only the envelope.

Text is capped at 200 characters. A list is comma-separated or a JSON list, and holds text items (check's `commands` holds objects).

## The kinds

| Kind | Fields (required in bold) |
|---|---|
| `job` | **outcome** (`started`, `pr-opened`, `finished`, `handed-off`, `stopped`, `failed`, `swept`, `paused`, `ended`, `pass`, `fail`), started, ended, usage_before, usage_after, usage_from (required with either usage field), send_back (`size`, `review-must`, `checks`, `infra`, `process`; only with outcome `fail`, `failed`, `stopped` or `handed-off`). See "What a run cost" |
| `check` | **commands** (JSON list of `{name, result: pass\|fail\|skipped, seconds}`), failed_step (null on a pass), flaky_rerun, state (`success`, `failure`), fence. The local gate's `mark-check.mjs --record <file>` writes it (#331). A reviewer that runs the checks itself ends its verdict comment with a `line check` instead (#417); harvest keeps it only under the rule above (#441). That record's `fence` holds only the fence's name (`bubblewrap`, `sandbox-exec`, `none`); the gate's own record keeps the whole first `Fence:` line |
| `review` | **round**, **verdict** (`pass`, `changes`), **must**, **nice**, categories |
| `fix-round` | **round**, **fixed** |
| `ask` | **rule** (`<path>:<line>`, `hook:<event>` or `missing`), **level** (`blocker`, `decision`, `fyi`), waited_minutes, full_should_prevent, rule_ok, title (no control characters), answered (the first ask's file name; needs waited_minutes). See "Stops, waits and asks" |
| `touch` | **what** (`sign-in`, `merge`, `yes`, `paste`, `answer`, `other`), **minutes** |
| `merge` | **conflicted** (files) |
| `rollback` | **why**, **place** (`test`, `production`) |
| `block` | **check**, **rung** |
| `usage` | **limit**, **waited_minutes** |
| `gate` | **pass**, **issues_done**, **hours_to_ready** |
| `note` | **kind_of** (`went-right`, `went-wrong`, `look-again`), **belongs** (`project`, `kit`, `tool`), **text**, links (record file names; required unless `went-right`) |

## Stops, waits and asks (#334)

- **The ask.** `notify.mjs` writes the first record after it decides the ping, from both ways in. `--rule <path>:<line>` names what made the agent stop, and `rule_ok` says whether that line is in a file inside the repo. No `--rule`: `rule: "missing"`. A hook writes `hook:<event>` (`hook:Notification` for a permission prompt). `full_should_prevent` is true on Full unless `--always-stop` was passed. No writer in the repo, or a failed write: the ping is unchanged, and the JSON says why under `record`.
- **The answer.** The agent that acts on the answer runs `insights.mjs write ask answered=<the first record's file name>`. The writer counts `waited_minutes` from the first record's `at` and copies its rule, level, issue, pr and title. It refuses a passed `waited_minutes`, a name it can't find, an answer to an answer, and a time before the ask.

## Which model did which job (#129)

- **The run line.** `line job` prints the comment, then one line people read on GitHub: `Run: <job> · <model> · <effort> · <time> · #<pr> @ <sha>`. Pass `started=<UTC time>` (`date -u +%Y-%m-%dT%H:%M:%SZ` when the run starts) for the time; with none, or one that isn't a UTC time, it says `unknown`. The builder's pull request body ends with one (`outcome=pr-opened`), and so does every reviewer's and QA's verdict.
- **Commit trailers.** A builder's commits end with `Agent-Model: <model>` and `Agent-Effort: <effort>`.
- **The log.** `node .agents/skills/coordinate/scripts/insights-runs.mjs --pr <n>` (or `npx onrails runs --pr <n>`) prints a pull request's chain, oldest first, with each run's model, effort and time; `--issue <n>` the same from the issue, `--day <yyyy-mm-dd>` one day, and `--pr <n> --brief` the one line `/back` gives. A build's time runs from its start record.
- **No account.** A record has no account field, so the writer refuses one: no record names an account (decision 129-1).

## What a run cost (#380)

A builder's finish record and each reviewer's job line carry the run's cost:

- `model` and `effort`: what the session shows, else `unknown`.
- `usage_before` and `usage_after`: the provider's usage reading as the tool shows it, at the start and at the end (for example the plan's `41%`). No reading you can see? `unknown`. Never estimate a number the tool didn't report.
- `usage_from`: where you read it, or where you looked (for example `get_session: no usage percentage`; quote it on the command line when it has spaces).
- `send_back`: why the work went back, on a run that sent it back:

| Reason | Who writes it |
|---|---|
| `size` | `coordinate` 6.1.1, a `job=size-check` record when `pr-size.mjs` exits 1 |
| `review-must` | `pr-review` and `pr-security`, on request changes |
| `checks` | `qa`, when an acceptance check failed. The local gate's own red run is its `check` record with `state: failure` |
| `infra` | `qa` when the preview or browser wouldn't run; `build` when it stopped on the machine, a tool or a service |
| `process` | `build`, when a rule or a gate stopped it |

Records from before #380 have none of these fields and stay valid.

## One example per kind

```
insights.mjs write job job=build issue=12 sha=<40 hex> outcome=started model=opus effort=low
insights.mjs line job job=review-code pr=40 sha=<40 hex> outcome=fail send_back=review-must usage_before=unknown usage_after=unknown usage_from="get_session: no usage percentage"
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
