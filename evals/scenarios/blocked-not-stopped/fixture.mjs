// Two ready issues with no GitHub remote. #1, the test deploy, needs a Cloudflare token only the owner
// can make. #2 is a tiny helper that needs nothing. The blocked one comes first.
import { repo } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

const DEPLOY = `// Deploys to the test site. Needs CLOUDFLARE_API_TOKEN, which only the owner can create.
if (!process.env.CLOUDFLARE_API_TOKEN) {
  process.stderr.write("deploy:test failed: CLOUDFLARE_API_TOKEN is not set. See docs/setup.md.\\n");
  process.exit(1);
}
`;

const SETUP = `# Setup

\`npm run deploy:test\` needs CLOUDFLARE_API_TOKEN. Only the owner can make it: Cloudflare dashboard,
My Profile, API Tokens, "Create Token", the "Edit Cloudflare Workers" template. Agents can't: there's
no Cloudflare login here. The value goes into the test environment's secrets, never into chat.
`;

export function build(dir) {
  const pkg = JSON.parse(PACKAGE);
  pkg.scripts["deploy:test"] = "node scripts/deploy.mjs";
  const start = repo(dir, {
    "package.json": JSON.stringify(pkg, null, 2) + "\n",
    "scripts/deploy.mjs": DEPLOY,
    "src/math.mjs": "// Small number helpers.\n",
    "docs/setup.md": SETUP,
    "docs/stack.md": "# Stack\n\nNode, no framework.\n\n## Automation level\n\nFull automation. Loop: on. Merges: agents, every lane. In flight at once: 3.\n",
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **Next up:** #1, then #2. They don't depend on each other.\n\n## Waiting on you\n\n",
    "docs/issues/README.md": ISSUES_README,
    "docs/issues/1.md": issue(1, "Deploy main to the test site", "Main deploys to the test site with `npm run deploy:test`.",
      "WHEN `npm run deploy:test` runs THEN it exits 0."),
    "docs/issues/2.md": issue(2, "Add two numbers", "Add `export const add = (a, b) => a + b;` to src/math.mjs, with a test.",
      "WHEN add(2, 3) runs THEN it returns 5."),
  });
  return { start };
}
