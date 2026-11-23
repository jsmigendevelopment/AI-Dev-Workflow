---
name: name
description: Use to name a new app and set up its repo ("help me name this", "what should we call it", the intermission in /idea after the product grill). Suggests names, asks about visibility and licence, runs git init, connects GitHub if the person wants it, and moves the kickoff notes into docs/.
---

# Name: the intermission

Naming waits until now because you can't name something before you know what it is.

## Steps

1. **Ask about style first.** Does the person have a naming convention, a theme, or names they like? Does the domain or app-store name need to be free?

2. **Suggest 5–7 names** in a table: the name, what it means, why it fits this product, and any risk you know of (an existing product, a hard spelling). Mark your pick. Don't claim a domain or trademark is free unless you actually checked.

3. **Once a name is picked, ask:**
   - Public or private repo? **Default: private.**
   - A licence? **Default: none** while private. If it's public and meant to be copied, suggest MIT.
   - Personal account or an organisation?
   - Does your school or employer have rules about where code lives?

4. **Make it a git repo now.** Run `git init` in this folder if it isn't one already. Add a `.gitignore` that covers `.env*`, secrets and build output. Move `kickoff/` into `docs/`, then make the first commit.

5. **Connect GitHub.** The person creates the GitHub repo (don't create it yourself unless they say to). Then add it as the remote and push.
   - If they'd rather wait, carry on locally. Issues are written as files until there's a remote (see `issues`).

6. **Record** the name, visibility, licence and remote in `docs/decisions.md`.

Then go back to `/idea` step 5 and open `stack`.
