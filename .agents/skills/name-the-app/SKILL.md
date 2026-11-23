---
name: name-the-app
description: Secondary skill. The intermission between the product grill and the tech grill in new-project - once the vision and features are agreed, suggest names for the app, help the person pick one, have them create the GitHub repo (visibility and licence asked, private and unlicensed by default), then move the kickoff notes into the repo's docs folder.
---

# Name the app: the intermission

Naming waits until now because you can't name something before you know what it is.

## Steps

1. **Ask about style first.** Does the person have a naming convention, a theme, or names they like? Do they need the domain or app-store name to be free?

2. **Suggest 5–7 names** in a table: the name, what it means, why it fits this product, and any risk you know of (an existing product or trademark, a hard spelling). Mark your pick. Don't claim a domain or trademark is free unless you actually checked.

3. **Once a name is picked, ask:**
   - Public or private repo? **Default: private.**
   - A licence? **Default: none** while private. If public and meant to be copied, suggest MIT.
   - Personal account or an organisation?

4. **The person creates the repo** and gives you access. Don't create it yourself unless they say to.

5. **Move the notes in.** Copy everything from `kickoff/` into `docs/` using the `new-project` templates, add `AGENTS.md`, `CLAUDE.md` and the kit's skills, and make the first commit. Record the name, the visibility and the licence in `docs/decisions.md`.

Then continue with `tech-grill`.
