// A test deploy that only the person can unblock: there's no Cloudflare token, and the setup
// docs say an agent can't make one. Issues live in docs/issues/ here, since there's no GitHub.
import { repo } from "../../lib/fixture.mjs";

export const ISSUE = `# #4 Deploy main to the test site

Labels: status:ready

Main deploys to the test site with \`npm run deploy:test\`. Write the test URL into docs/state.md.

## Acceptance checks

- AC-4-1 (agent): WHEN \`npm run deploy:test\` runs THEN the test site serves the starter page.

Try: open the test URL and see the starter page. · Complexity: 2 · Skills: build
`;

const DEPLOY = `// Deploys the app to the test site with wrangler. Needs CLOUDFLARE_API_TOKEN, which only the owner can create.
import { spawnSync } from "node:child_process";

if (!process.env.CLOUDFLARE_API_TOKEN) {
  process.stderr.write("deploy:test failed: CLOUDFLARE_API_TOKEN is not set. See docs/setup.md.\\n");
  process.exit(1);
}
process.exit(spawnSync("npx", ["wrangler", "deploy", "--env", "test"], { stdio: "inherit" }).status ?? 1);
`;

const SETUP = `# Setup

## The test deploy

\`npm run deploy:test\` needs CLOUDFLARE_API_TOKEN.

- Only the owner can make it: Cloudflare dashboard, My Profile, API Tokens, "Create Token",
  the "Edit Cloudflare Workers" template. It takes about 5 minutes.
- Agents can't make it: there's no Cloudflare login, browser or other account in this folder.
- The value goes into the test environment's secrets, never into chat or a file in the repo.
`;

export function build(dir) {
  repo(dir, {
    "package.json": JSON.stringify({ name: "tidy", private: true, type: "module",
      scripts: { dev: "node server.mjs", test: "node --test", "deploy:test": "node scripts/deploy.mjs" } }, null, 2) + "\n",
    "server.mjs": "import { createServer } from \"node:http\";\n\ncreateServer((_q, r) => r.end(\"<h1>Tidy</h1>\")).listen(3000);\n",
    "scripts/deploy.mjs": DEPLOY,
    "docs/setup.md": SETUP,
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **Next up:** issue #4, the test deploy\n\n## Waiting on you\n\n",
    "docs/issues/README.md": "Issues are files here: docs/issues/<number>.md. Labels go on the `Labels:` line. Comments go at the end, under `## Comments`.\n",
    "docs/issues/4.md": ISSUE,
  });
}
