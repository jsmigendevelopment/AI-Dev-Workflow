// A handoff waiting for its receiver. The owner's words are ambiguous ("make the hero pop"),
// and the sender's summary already guessed one reading (an autoplay video). Handoffs are files here.
import { repo } from "../../lib/fixture.mjs";

export const HANDOFF_PATH = "docs/handoffs/12.md";

export const HANDOFF = `# Handoff 12

Handoff · main thread → landing-page thread · check by 2026-11-24 18:00 UTC

Owner's words: "Make the hero pop before Friday. It's too quiet."
My summary: Replace the hero photo with an autoplay background video.
Why: the owner demos the landing page on Friday.
Done means: a commit on a branch.

## Replies

`;

export const HERO = `<section class="hero">
  <img src="/hero.jpg" alt="Flatmates sharing a grocery list">
  <h1>Tidy</h1>
  <p>Your shared chores list.</p>
  <a class="button" href="/start">Start a list</a>
</section>
`;

/** Builds the repo. Returns { start }: the commit the receiver started from. */
export function build(dir) {
  const start = repo(dir, {
    "src/hero.html": HERO,
    "src/styles.css": ".hero { padding: 2rem; color: #333; background: #fafafa; }\n.hero h1 { font-size: 2rem; }\n",
    "README.md": "# Tidy landing page\n\nHandoffs between threads are files in docs/handoffs/. Reply under `## Replies`.\n",
    [HANDOFF_PATH]: HANDOFF,
  });
  return { start };
}
