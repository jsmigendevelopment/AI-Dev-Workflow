---
name: wireframes
description: Use when the screens need drawing or changing before they're built ("show me the screens", "wireframe it", "mock it up", "change this screen", the step after the product grill in /idea, new screens in /join or a big feature) - draws every main-flow screen and the core screen's empty, error and loading states, as sketches in docs/design.md and one clickable prototype in light and dark, then revises until the person approves and records the approval.
---

# Wireframes: the person sees every screen before anything is planned

Design work: the strongest tier at high effort (see `routing`). Ask first unless the profile says not to.

Before the repo exists, write to `kickoff/` instead of `docs/`. `name` moves it.

## Steps

1. **Read** `vision.md`, `features.md`, `mvp.md`, the grill log's main flow, and "Look and feel" in `design.md`.
2. **List the screens:** every screen in the main flow, in order, plus the core screen's **empty, error and loading** states. Name each one the way the person would.
3. **Theme tokens.** Turn "Look and feel" into tokens under "Theme tokens" in `design.md`: colours for light and dark (text contrast 4.5:1 or more in both), font stacks, type scale, spacing, radius, motion. Use only these in the prototype.
4. **Sketch each screen** under "Screens" in `design.md`: an ASCII or markdown wireframe, what's on it, and what each action does.
5. **Build the prototype:** one file, `docs/wireframes/index.html`.
   - Every value comes from the tokens, as CSS variables on `:root`.
   - Light and dark follow the device, plus a toggle.
   - Each screen is a section with an `id`. Buttons and links go to the next screen in the flow, and a screen list jumps to any of them.
   - Self-contained: inline CSS, inline SVG, inline script only. No fonts, images, scripts or styles from the network. **Done when** `grep -nE '(src|href)="(https?:)?//' docs/wireframes/index.html` finds nothing.
   - The error state has an icon, a title, a specific message, a next action and a reference ID. The loading state is a skeleton the shape of the real content, not a grey box. The empty state has an icon, one line on why it's empty, and the first action.
   - Fake but realistic content, in the voice from "Look and feel".
6. **Show it.** Open the file in a browser if you can. If not, give the full path and say how to open it (double-click it, or drag it into a browser). List the screens in one line each. Then ask: *"What would you change?"*
7. **Revise until they say yes.** Change the sketches and the prototype together. Show what changed and ask again. A "yes" with changes is not a yes yet.
8. **Record it.** Run `git hash-object docs/wireframes/index.html` (it works without a repo). Add a row to `decisions.md`: `Wireframes approved: <date>, <hash>`, with the screens covered. Commit both files if there's a repo.

**Done when** every screen from step 2 is in `design.md` and the prototype, and `decisions.md` has an approval row whose hash matches the file.

## Rules

- **A changed screen goes back through approval.** Redraw, show, and add a new approval row. The old row stays.
- **New screens later** (in `/join` or a big feature): same steps for the new screens only. Add them to the same prototype.
- The prototype is a drawing, not app code. Builders use it as the target and build with the UI kit.
