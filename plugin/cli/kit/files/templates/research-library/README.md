# Research library

Every deep research you run, in any project, lands here. One pull request per research. You merge it.

This repo must stay **private**. Research can name private projects, prices and plans. `research-library.mjs private` fails the moment the repo turns public, and onRails refuses to capture to a public library.

## What one entry holds

| Part | Where | What |
|---|---|---|
| Report | `research/<slug>.md` | The question, at least three options, every claim labelled, a recommendation with its confidence, what would change the answer, a re-check date. |
| Store | `research/<slug>/` | `hypotheses.md` (written before the first search), `coverage.md`, `sources.csv`, `claims.csv`, `fact-check.csv`, and `runs/` for anything measured. |
| Provenance | `research/<slug>/provenance.json` | Who did each role (author, helper, fact-check, reviewer): the exact model ID and effort as the session reported them, the tool and its version, the dates and the brief. |
| Briefs | `briefs/<slug>/` | The exact prompt that started each role, word for word: `author.md`, `fact-check.md`, `helper-<name>.md`. |
| Index | `research/README.md`, `CHANGELOG.md` | One row in the index table, one entry in the changelog. |

`research-library.json` says all of this in a form agents read. Move things by editing it, and every later capture follows.

## The standard, in plain words

1. **Hypotheses first.** Write what you expect to find before you search. Commit it.
2. **Date every source.** When it was read, and whether it was read in full.
3. **Label every claim:** `measured`, `read-in-source`, `vendor-claim`, `anecdote` or `summary-only`.
4. **Keep the data.** Sources, claims and measurement runs live in files. `sources.csv`, `claims.csv` and run folders only grow: add rows, never edit old ones.
5. **Fact-check in a fresh session,** on another model when you have one. Each finding is fixed, disputed or accepted, with a reason. Until then the status is `draft`.
6. **Record the exact model and effort for every role,** as each session reports them. A value nobody recorded is `unknown`. Never guess.
7. **Keep the brief and the tool's version,** so a run can be repeated and compared.
8. **Re-check by a date.** 6 months at most, 3 when prices, betas or fast-moving tools drive the answer.

## Check it

```sh
node scripts/check-library.mjs                    # the manifest, the index, every dossier
node scripts/check-library.mjs --base origin/main  # also: append-only files didn't change
node scripts/research-library.mjs private <owner>/<repo>   # GitHub says it's private
```

No dependencies. Node 22 or newer. There is no GitHub Actions workflow: run the last two before you merge a pull request, from a checkout of its branch. onRails checks that the repo is private and runs `check-library.mjs` on every capture.

`scripts/check-research.mjs`, `scripts/research-library.mjs` and `schemas/` are copies from onRails. When onRails changes them, copy the new ones over.
