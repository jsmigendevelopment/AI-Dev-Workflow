# onRails figures

These diagrams use the colors of the onRails golden-hour banner. The shared `.svg` files carry their own light and dark palettes, with editable text and no external dependencies.

| Figure | Source | GitHub exports | Alt text |
| --- | --- | --- | --- |
| How onRails checks changes | [SVG](onrails-checks.svg) | [Light](onrails-checks-light.svg) · [Dark](onrails-checks-dark.svg) | The owner’s project rules guide a plan. A builder takes one issue. An independent reviewer sends it back for a fix or passes the commit to the test site. The owner decides when to release. |
| The onRails build loop | [SVG](onrails-build-loop.svg) | [Light](onrails-build-loop-light.svg) · [Dark](onrails-build-loop-dark.svg) | A pitch leads to product questions, screens and tech choices. The plan has Works, Real and Ready passes. Each issue in the current pass goes through build and review. Fixes repeat review. Passing changes reach test. The owner controls release. |
| onRails review lanes | [SVG](onrails-review-lanes.svg) | [Light](onrails-review-lanes-light.svg) · [Dark](onrails-review-lanes-dark.svg) | Every lane starts with local checks and fresh code review. Normal adds a preview test. Risky also adds a security reviewer. A failed sign-in check sends a fix through local checks again. An always-stop action needs the owner in every lane. |

Inline the source SVG and set `container-type: inline-size` and `container-name: onrails-figure` on its wrapper. At 960 px of available width the SVG switches to its wide layout. The compact layout is the default and is capped at 480 px when inlined. The GitHub exports use that same compact artwork with a fixed palette.

The source follows `prefers-color-scheme` and honors an explicit `data-theme="light"` or `data-theme="dark"` on the root HTML element. Its palette uses CSS custom properties scoped to the SVG, including `--or-bg`, `--or-ink`, and `--or-amber`.

When copying the SVGs, record the full onRails commit SHA and carry the license notice with them.

Copyright (c) 2026 Jay Smigen. These figures are released under the [MIT License](../../LICENSE).
