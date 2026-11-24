// The start of /idea on Full automation: a near-empty folder, no GitHub remote, and a profile
// that says Full automation and auto grill. The person gives the whole pitch once.
import { repo } from "../../lib/fixture.mjs";

export const PROFILE = `# My onRails profile.

[me]
github_plan = "free"
repo_visibility = "private"

[defaults]
automation = "full"
grill = "auto"
`;

export function build(dir) {
  repo(dir, { "README.md": "# flatshare\n", "docs/profile.toml": PROFILE });
}
