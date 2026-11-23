# Security policy

## Report a problem privately

Don't open a public issue for a security problem.

Use GitHub's private reporting instead:

1. Go to the repo's **Security** tab.
2. Click **Report a vulnerability**.
3. Say what you found, how to reproduce it, and what someone could do with it.

Only the maintainer sees the report. You'll get a reply in the advisory thread. If the problem is real, it gets fixed, and you're credited in the advisory unless you'd rather not be.

## What's in scope

- **The CLI** (`cli/`): `init`, `update`, `doctor`, `add` and `profile`. For example, a file written outside the project, a file of yours overwritten without asking, or a command run without a yes.
- **The scripts** the kit ships: `setup-github.mjs`, `setup-cloudflare.mjs`, `push-secrets.mjs`, `worklog.mjs`, the Claude Code hooks and `scripts/sync-skills.mjs`. For example, a secret printed, logged or sent somewhere it shouldn't go.
- **The packs' security defaults** (`stacks/`): security headers, the CSP, rate and body limits, request guards, auth checks on `/api/v1`, and what the add-ons turn on. For example, a default that lets one user read another's data.
- **The guardrails:** the blocked git commands, the agent-file guard in CI, and the always-stop list. For example, a way past them that the kit claims to block.

## What's out of scope

- Bugs in Claude Code, Codex, GitHub, Cloudflare, Clerk or other tools the kit uses. Report those to their makers.
- An app someone built with the kit and then changed.
- An agent ignoring a written rule in a skill or `AGENTS.md`, when no guardrail claims to stop it. Open a normal issue for that.

## Versions

Only the newest version gets fixes. Update with `npx ai-dev-workflow@latest update`.
