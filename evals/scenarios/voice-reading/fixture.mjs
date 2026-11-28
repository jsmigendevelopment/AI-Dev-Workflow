// #457: a tiny app that has no framework yet, and a project profile that says the person dictates. The person's
// message has "10 stack start" in it, which sounds like TanStack Start. A real run keeps the personal profile out
// of it (the runner's HOME may be the person's own), so the project's own docs/profile.toml carries the setting.
import { repo } from "../../lib/fixture.mjs";

export const PROFILE = `[me]
input = "voice"
`;

export const STACK = `# Stack

Framework: not chosen yet.
`;

export function build(dir) {
  const start = repo(dir, {
    "README.md": "# Tidy\n\nA shared chores list for flatmates.\n",
    "docs/profile.toml": PROFILE,
    "docs/stack.md": STACK,
  });
  return { start };
}
