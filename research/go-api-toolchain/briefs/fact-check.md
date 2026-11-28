# Brief: fact-check

Committed before the fact-check started. The fact-checker is a fresh session that never saw the author's thread. It gets the dossier, its store and the fact-check section of `desk-research.md`, and nothing else from the author. It reports its findings in its final message; the author writes them into `fact-check.csv` and fills in each disposition.

## What the fact-checker was asked

> You are a fact-checker for a research dossier. Work in a fresh clone of the repository at the branch named below. Read only these files:
>
> - `research/go-api-toolchain.md` (the dossier)
> - everything under `research/go-api-toolchain/` except `fact-check.csv` and `provenance.json`
> - the "The fact-check" section of `.agents/skills/research/references/desk-research.md`
> - issue #342 (the question the dossier answers): `gh api repos/jsmigendevelopment/onRails/issues/342`
>
> Do not read the pull request text, issue comments, or anything the author wrote outside those files.
>
> 1. Check every row of `claims.csv` against its sources in `sources.csv`. For a web source, open the page or the registry yourself (WebFetch or curl; the Go module proxy at https://proxy.golang.org and the npm registry answer through the session's proxy). For a `measured` claim, read the experiment file it cites and check that the output shown supports the claim as worded; re-run a script only if it is cheap and the tools are installed.
> 2. Check the dossier's prose: every number, version, date and quotation has a claim ID or is marked `[inferred]`, and says what its claim says. A claim whose wording is stronger than its source is a finding.
> 3. Look for the strongest counter-source for each of the four picks (lint and boundary, check contract, contract and client, router) and say what you found.
> 4. Check the pinned versions and the re-check commands in "Pinned versions": each must give the version shown, today.
> 5. Check the dossier against the issue's acceptance checks AC-342-1 to AC-342-3 as worded in the issue.
>
> Write nothing to the repository. Reply with one CSV block, header `finding,claim,disposition,reason`, one row per finding. `claim` is the claim ID or empty. Leave `disposition` and `reason` for the author: put the word `open` in `disposition` and a one-sentence explanation of what is wrong, and what the fix should be, in `reason`. Then a short paragraph: what you could not open, and which picks held. No emojis. Plain words.

## What was asked of the fact-check session

A fresh session, never shown the author's thread, started by the author with `create_session`. The model and effort requested are in `provenance.json`.
