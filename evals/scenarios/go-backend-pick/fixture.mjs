// #541: a made-up app at the tech grill, with a stack file that has no choices yet. The pitch's answers say the app
// needs a backend (jobs that run for hours) and won't run on Cloudflare Workers, so the stack skill's backend rule (#344,
// decision 344-1) says Go with a TypeScript web frontend. The old default was TypeScript, Drizzle and D1.
import { repo } from "../../lib/fixture.mjs";

export const STACK = `# Stack

Nothing is picked yet. The tech grill fills this in.
`;

const VISION = `# Vision

Clipdesk: a small video studio uploads raw footage, and the app turns each clip into the web sizes the studio sends to its clients.

## The main flow

1. The studio uploads a clip.
2. The app queues a transcode job. A job can run for up to two hours.
3. The studio sees live progress while the job runs, and downloads the finished sizes.

## Answers from the pitch

- Does it need a backend? Yes: it owns the clips, the job queue and the progress.
- Will it run on Cloudflare Workers? No: the jobs run for hours and need real CPU, so it runs on a server the studio rents.
`;

export function build(dir) {
  const start = repo(dir, {
    "README.md": "# Clipdesk\n\nA transcode queue for a small video studio.\n",
    "docs/vision.md": VISION,
    "docs/stack.md": STACK,
  });
  return { start };
}
