// Slice 0 of a tiny Node app: it already runs, but nobody has seen it, and there is no CI yet.
// No keys are set, so sign-in is off. The issue asks for the local run, CI and the test deploy.
import { repo } from "../../lib/fixture.mjs";

const SERVER = `// The app's dev server. PORT, or 3000. Without CLERK_SECRET_KEY, sign-in is off.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const signIn = process.env.CLERK_SECRET_KEY ? "on" : "off (no CLERK_SECRET_KEY)";
const page = \`<!doctype html><title>Tidy</title><h1>Tidy</h1><p>Your shared chores list.</p><p>Sign-in: \${signIn}</p>\`;

createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(page))
  .listen(port, () => process.stdout.write(\`Tidy runs at http://localhost:\${port}\\n\`));
`;

const ISSUE = `# #1 Slice 0: the skeleton

Set up the skeleton of Tidy, a shared chores list.

## Acceptance checks

- AC-1-1 (agent): WHEN the skeleton is done THEN \`npm run dev\` serves the starter page with the app's name.
- AC-1-2 (auto): WHEN a pull request opens THEN CI runs \`npm run check\` (.github/workflows/ci.yml).
- AC-1-3 (agent): WHEN main changes THEN it deploys to the test site. There's no Cloudflare account yet: skip it.

## Out of scope

- Any feature. Sign-in keys (CLERK_SECRET_KEY) come later, through the secrets checklist.

Try: open the app and see the starter page. · Complexity: 3 · Skills: build, pyramid
`;

export function build(dir) {
  repo(dir, {
    "package.json": JSON.stringify({ name: "tidy", private: true, type: "module",
      scripts: { dev: "node server.mjs", test: "node --test", check: "node --test" } }, null, 2) + "\n",
    "server.mjs": SERVER,
    "test/page.test.mjs": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\n\ntest(\"the app has a name\", () => assert.equal(\"Tidy\".length, 4));\n",
    ".env.example": "CLERK_SECRET_KEY=\n",
    ".gitignore": "node_modules/\n.env\n",
    "README.md": "# Tidy\n\nA shared chores list.\n\n- `npm run dev`: the dev server on http://localhost:3000\n- `npm run check`: the checks\n",
    "docs/stack.md": "# Stack\n\nNode, no framework yet. CI on GitHub Actions. Test site on Cloudflare Workers, not set up.\n",
    "docs/pyramid.md": "# Tracer-bullet pyramid\n\n## Slice 0: the skeleton\n\n- [ ] The app runs locally, and the person has seen it\n- [ ] CI runs every check on every pull request\n- [ ] Main deploys to test. Test URL: \n",
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **Next up:** issue #1, slice 0\n",
    "docs/issues/1.md": ISSUE,
  });
}
