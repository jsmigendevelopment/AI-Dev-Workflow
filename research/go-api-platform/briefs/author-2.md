# Brief: author, second session

Committed with the dossier, 2026-11-27. The first session (`briefs/author.md`) wrote the briefs and the hypotheses, then stopped before any search. Its three helper briefs (`briefs/helper-*.md`) were never sent to a helper: this session did the reading itself and used them as its checklist. The coordinator's brief to this session, verbatim, with the scratchpad path shortened:

> You're a fresh builder in the onRails build loop. **Use the `research` skill** (read `.agents/skills/research/SKILL.md` in your worktree) and the `build` skill for the pull request steps. First read the setup notes at <scratchpad>/setup-notes.md (read only) and follow them all (REST-only GitHub; write nothing outside your own `mktemp -d` TMPDIR; `set -u` in multi-step shells; never run the real `claude` or `codex`; stop every process you start). Owner rules: full automation, never wait on the person; Opus only; no paid services or sign-ups; never cut a release; public repo: name no private projects, people or accounts. Any choice you'd ask about becomes your recommended pick, recorded as "AI pick, not reviewed".
>
> ## The job: issue #340 (desk research, no code)
>
> Read it in full with every comment [...]. An earlier session claimed it and pushed branch `feat/340-research-workers-to-go` (its last commit only merged main); look at what's there [...] and reuse any real work. Then continue on that branch (new commits; no rebase, no force-push) [...].
>
> Answer the issue's open questions with sources (use web search and page fetches; cite each claim; date the dossier and give it a re-check date), compare at least three options with trade-offs and a recommendation, write the files the issue's Modules line names (`research/go-api-platform.md`, `research/go-api-platform/`, `research/README.md` index line, `docs/decisions/340-1.md`). The research skill's fact-check runs in a fresh session: since you can't start one, do a separate fact-check pass yourself at the end (re-open each cited source and confirm the claim), and say so in the PR. Skip the skill's step that captures to the person's private research library (that's another account); say it's skipped. Stay inside the fence.

The bar for "good" is the one in `briefs/author.md`, unchanged.
