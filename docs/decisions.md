# Decisions

## 2026-11-24 · Cheat sheets and logo (#115)

The owner chose GPT-6.2 Astra at Extra High to draw the SVGs for the kit and marketing site, including the logo. The site records this exception to its decision 19.

The mark uses two white rails bending to the right across a violet-to-blue tile. Three sleepers keep the two rails recognizable at favicon size. A locomotive silhouette needed finer detail, and a letterform carried less of the railway meaning. The README banners use the same paths as the site favicon. The plugin uses the site's generated 512 px icon.

Edit `guide/cheat-sheet.md` to change the shared reference. Run `node scripts/cheat-sheets.mjs --site ../onRails-Marketing` to regenerate the visual guide, site data and SVGs. Add `--check` to compare without writing. The generator checks the Claude Code and Codex command pairs against the skill inventory in the README. The source for this edition is main at `4d9b885cf5dc2f9cb382651d548bff7a6a1a2c9d`.
