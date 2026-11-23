---
name: dependencies
description: Use when adding, choosing, upgrading or replacing a library, package or self-hosted tool ("add a library for this", "which package should we use", "is this licence ok", "upgrade dependencies") - prefer a popular maintained library over hand-rolled code, check licence, size and maintenance, pin exact versions, swap only for a concrete gain, and keep copyleft and source-available licences out of a product that may go closed-source.
---

# Dependencies: reuse a good library, check it, pin it

Use well-kept libraries for solved problems, and check each one before it lands so it never surprises you on licence, size or upkeep.

## Rules

1. **Use a popular, maintained library for solved commodity problems.** Forms, dates, validation, data fetching, accessible UI parts and charts are solved. Write your own only for what is specific to the product: who may do what, and what happens after a failure.
2. **Look in the repo first.** Search for something the app already uses before adding anything. Never add a second library that does the same job; theme or wrap the one you have.
3. **Wrap a library behind a thin app-owned adapter** when the app needs its own look or API. The rest of the code imports the adapter, so a later swap touches one file.
4. **Run the adoption check before adding.** Confirm the current stable release supports your runtime and framework (read `peerDependencies` and `engines`). Check the bundle or install size in your own build, the transitive dependencies, the last release date, open security advisories, and whether issues get answered.
5. **Check the licence of the exact version you ship.** Read the SPDX id from the registry (`npm view <pkg>@<version> license`) or the project's LICENSE file, not a README or a search summary. Write the id and the date in the PR. Licences change between versions.
6. **Safe for a product that may be closed-source or sold as a service:** MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Zlib, Unlicense, CC0-1.0 and BSL-1.0 (the Boost licence). MPL-2.0 is fine to use, but changes you make to its files must be published.
7. **Not allowed in shipped code:** AGPL, SSPL, BUSL-1.1 (Business Source), FSL, Elastic, any PolyForm licence, Commons Clause and other "source-available" licences with use limits. GPL is for reading ideas only; never bundle or link it. LGPL only if linked dynamically and unmodified. If nothing allowed fits, build it yourself.
8. **Read the SPDX id, not the acronym.** BSL-1.0 is permissive Boost; BUSL-1.1 is restricted Business Source. Server parts are often licensed differently from client SDKs, so check the part you actually run.
9. **Enforce the licence allow-list in CI.** Fail the build on any licence not on the list (for npm, `license-checker-rseidelsohn --onlyAllow "..."`; for pnpm, `pnpm licenses list --json` into a small script). Each exception names the package, a reason and a date.
10. **Pin exact versions in an app.** No `^` or `~` in the manifest, a committed lockfile, and frozen-lockfile installs (`npm ci`, `pnpm install --frozen-lockfile`) in CI. Upgrades arrive as their own reviewed pull requests.
11. **Prove it in the real feature.** Land a new library in the feature that needed it, with that feature's tests, not in a demo page.
12. **Swap or refactor only for a concrete gain.** Name the gain in the issue (smaller bundle, a fixed bug, better accessibility, fewer lines to maintain) and show it in the PR. Never do a blind "upgrade everything to latest" or a broad rewrite that stalls current work.
13. **Ideas are free; code is not.** Learning from any project is fine. Copying code is allowed only from permissive licences, with the notice kept and the source, commit and SPDX id recorded in `THIRD_PARTY_NOTICES.md`.
14. **Popular is not the same as safe.** Download counts help you find a library; they are not a review. The licence and advisory checks still apply.

## Checklist before merge

- [ ] No new library duplicates one the app already has.
- [ ] The PR names each new dependency's version, SPDX licence id with the date checked, and size added.
- [ ] Every new licence is on the allow-list, and the CI licence check passes.
- [ ] The manifest shows exact versions, and the lockfile is committed.
- [ ] The audit step shows no new high or critical advisory.
- [ ] A swap or upgrade PR shows the before and after for its named gain.
