# Consistency check: read-only, before anything is built

You check one pass's issues against the plan. You didn't write them. **Read only.** Edit no file, no issue, no label. Your output is the report.

## Read

- `docs/mvp.md`, `docs/features.md`, `docs/pyramid.md`, `docs/design.md`, `docs/decisions.md`;
- every open issue in the pass's milestone, with its body: `gh issue list --milestone "<name>" --state open --json number,title,body,labels`. No GitHub yet? `docs/issues/`.

## Check

1. **Every `must` feature** in `features.md` that belongs in this pass has an issue.
2. **Every issue is in the MVP** or the pass's plan. Name the ones that aren't.
3. **Dependencies work:** each `Depends on #N` exists, says `Blocks` back, sits in this pass or an earlier one, and no chain loops back on itself.
4. **Every screen** in `design.md` for this pass has a slice that builds it.
5. **Every floor item** in `features.md` with a decision has an issue or a check that covers it (sign-in, who can see what, deleting personal data, and so on).
6. **Acceptance checks:** every issue has them, in the form `AC-<issue>-<n>: WHEN … THEN …` with no repeated ID. No two checks, in one issue or across issues, ask for opposite results. None contradicts `decisions.md`.
7. **No `[NEEDS CLARIFICATION]`** is left on an issue labelled `status:ready`. List every open marker either way.
8. **Every issue has** a `Complexity:` line of 7 or under, a fence, a lane, a priority and a `Skills:` line.

**Done when** every item above has a result for every issue in the pass.

## Report

Reply with this, and nothing else. Under 40 lines.

```text
Consistency check · pass <N> · <date> · <k> issues read
Clean: <yes | no>

1. [<check number>] <what's wrong, with issue numbers and the doc line> → <new issue | fix #<n> | ask the person>
2. ...
```

Suggest where each gap goes. The issue writer decides and does it.
