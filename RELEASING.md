# Releasing the onrails CLI

The CLI goes to npm as `onrails`. After the first version, GitHub Actions publishes it. No npm token is stored anywhere. npm trusts one workflow in this repo instead. That's called trusted publishing (OIDC).

The CLI, the plugin and the kit carry one version. `npm run versions:check` in `cli/` fails if they drift, and CI runs it on every pull request.

## One time: set it up

Only the owner can do these steps. They need your npm account and the repo's settings, which an agent session can't change.

### 1. Publish the first version by hand

Trusted publishing is set in the package's settings on npmjs.com, so the package has to exist first. The first version goes from your machine.

```bash
npm login
cd cli && npm run bundle && npm publish --access public
```

### 2. Make the `release` environment on GitHub

Do this before step 3. A tag pushed before it exists would publish with no one approving.

1. Repo → **Settings** → **Environments** → **New environment**.
2. Name: `release`. Exactly that, lowercase.
3. Tick **Required reviewers** and add yourself.
4. Under **Deployment branches and tags**, pick **Selected branches and tags**, add a **Tag** rule, and enter `v*`.

Now every publish waits for your click.

### 3. Add the trusted publisher on npmjs.com

Go to npmjs.com → **Packages** → `onrails` → **Settings** → **Trusted publishing**. Pick **GitHub Actions** and fill in:

| Field | Value |
|---|---|
| Organization or user | `jsmigendevelopment` |
| Repository | `onRails` |
| Workflow filename | `release.yml` (the file name only, not the path) |
| Environment name | `release` |
| Allowed actions | `npm publish` |

Every field is case-sensitive. npm doesn't check them when you save. A typo shows up only when a publish fails.

**Cut the first CI release within 2 days.** A new trusted publisher that hasn't published in 2 days expires, and you have to delete it and add it again.

### 4. Then lock tokens out

Once a CI release has worked: **Settings** → **Publishing access** → **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working. Revoke any old npm tokens you no longer use.

## When to release

**Only when the owner asks.** Agents never cut a version on their own: no version bump, no tag and no publish after a merge, a pass, or a batch of features. Merged changes collect under **Unreleased** in `CHANGELOG.md` until the owner says to release. This holds at every automation level, Full included.

## Every release

1. Make sure everything you want is merged, and `CHANGELOG.md` has it under **Unreleased**.
2. On a branch, bump the version:

   ```bash
   cd cli && npm run release:bump 0.5.0
   ```

   It sets the version in `cli/package.json` and both plugin manifests, updates the `AGENTS.md` footer, moves **Unreleased** in `CHANGELOG.md` under a new `## [0.5.0]` heading, and rebuilds `plugin/cli/`. It lists the tests that name the old version. Update the ones that check the package version.
3. Run `npm test`, then open a pull request and merge it.
4. Tag the merge on `main` and push the tag:

   ```bash
   git checkout main && git pull
   git tag v0.5.0 && git push origin v0.5.0
   ```

5. Open the **release** run in the repo's **Actions** tab and approve it.

The workflow stops if the tag isn't exactly `v` plus the version in `cli/package.json`. It runs the same checks as CI, checks the package holds only `bin/`, `src/`, `kit/`, `package.json`, `README.md` and `LICENSE`, then publishes with provenance (a signed record of which commit and workflow built it).

A wrong tag? Delete it (`git push origin :refs/tags/v0.5.0`) and tag again. A version on npm can't be reused, so if a bad one went out, bump to the next one.
