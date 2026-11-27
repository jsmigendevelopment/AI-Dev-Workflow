# State

Updated 2026-11-27 18:00 UTC by the coordinator (session_01QHnB3KjQfR34yczJypyfi1).

- **Automation level:** Full (decision 259-1, the owner's words). No `docs/stack.md` yet (#360). Kit-repo reviews: decision 28.
- **Main's checks:** Checks: pass @ 24ba647ec2893c60e7ca1658485700a67ab19c26 (sync-skills, npm-readme, bundle, cli `npm test` 980 tests 0 fail, `test:evals` 65/65, evals dry run).
- **Sweep timer:** none · **Supervisor:** none (the loop runs as a sub-thread of the live thread). **Release:** 0.7.1 on npm; the rest is under Unreleased; releases are the owner's.

## In flight
Nothing. No claims, no open loop pull requests. Open but not the loop's: #234 (Electron starter, review queued as #230), #119 (cheat sheets draft, later pass).

## Pass just done (2026-11-27)
38 pull requests merged, from #270 (#229) to #328 (#263). Every `status:ready` issue from the start of the run closed.

## Next pass: the `status:ready` queue (pass gate, decision 259-2, AI picks)
- p1: #329-#333 (insights, split from #281), #321-#322 (kit lessons, from #253), #340, #342, #344 (Go backend, from #279), #112.
- p2: #269, #129, #227, #334, #347, #348, #360, #361, #319, #320.
- p3: #260, #230 (review PR #234), #362, #363.
- Start with #361 and #269: both make parallel builds safer.

## Later passes
#278, #272 (need the tranquiliti contracts on its main), #264, #134 (with the owner's next hand release), #115/#119 (art on the owner's other account), #128, #124, #114, #111, #135, #95, #92, #86-#88, #136, and the non-ready children of #253, #279 and #281. Closed at the gate: #89, #121.

## Waiting on you
Nothing blocks. FYI only: add the commons review token when you want its Claude review (#89); tag v0.7.1 if not yet done.

## Gotchas
`mark-check.mjs` is refused by the proxy (403); the `Checks:` comment is the record. `agent-files.mjs gate` asks for `human-approved` on agent files until #360; decision 28 covers it. Builders' cloud checkouts can be older than main: brief them to branch from fresh `origin/main` (#361). Run the gate with `TMPDIR` set or unset; both pass since #282.
