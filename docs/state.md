# State

Updated 2026-11-28 09:00 UTC by a helper for the coordinator (session_01TbAsgtVhPoLGTcFKYk4Hk1).

- **Automation:** Full (decision 259-1). `docs/stack.md` records it (#360). Workers run on Sonnet 5.5 high. The coordinator runs on Opus 5.5 medium (owner, 2026-11-28). Kit-repo reviews: decision 28, so the one code review writes the `Weakening review:` line.
- **Loop:** runs from this cloud session (session_01TbAsgtVhPoLGTcFKYk4Hk1), with a one-shot send_later fallback timer re-armed about every 45 minutes. A new session runs `node .agents/skills/coordinate/scripts/timer.mjs status`, then `should-arm`, before it arms anything. **Supervisor:** none. **Release:** 0.7.2 is on npm and tagged; the rest is under Unreleased; releases are the owner's.

## /afk (2026-11-28 09:00 UTC)
- **Away:** long, open-ended. **Hard stop:** none. **Pings:** critical only.
- **Main:** 2564aa2c0d9ad18751950d2b1aeefe5569fdaac8.
- **In flight:** PR #495 (#401), approved at a6c005b, head is now 8bef9ce (records stale). Claimed with no open PR: #537, #531. Open, not the loop's: #234 (Electron starter), #119 (draft, cheat sheets).
- **Next ready (46 open: p1 1, p2 8, p3 37):** #457 (p1), then p2: #539, #448, #536, #535, #534, #533, #530. #388 waits for the owner's pick.
- **At the limit:** wait for the reset and carry on. Seven-day usage is at its warning level and shows no percentage. It resets 2026-12-04 14:00 UTC.
- **Merged today:** 75 pull requests, #434 to #573 (merged since 2026-11-28 00:00 UTC).

## Waiting on you
1. PR #495 (#401): the permission check refused the squash merge, so it needs your yes. Its records must be rebuilt first.
2. Turn off GitHub Actions on your marketing-site repo.
3. Merge its AGENTS.md.onrails-new: the 0.7.2 kit update is pushed to a branch there (the coordinator's chat has the name).
4. Stray remote branches the proxy can't delete: `chore/insights-*`, and merged `feat/*` and `fix/*`.
5. #388 needs a pick: an Opus redraw or Fable.

## Gotchas
- /tmp was wiped once on 11-28, at about 05:55 UTC. The commit-signing helper `/tmp/code-sign` came back at 07:30. If it goes missing, pause builds. Never turn signing off without the owner's yes.
- GitHub ignores the CHANGELOG union driver, so update-branch can return 422. Then merge locally, then carry.
- Never pass unknown flags to `insights.mjs land`: it ignores them and opens a PR.
- `mark-check.mjs` is refused by the proxy (403); the `Checks:` comment is the record. `agent-files.mjs gate` passes on the code review's `Weakening review: pass @ <head>` line, with no label.
- Builders' cloud checkouts can be older than main: brief them to branch from fresh `origin/main` (#361).
