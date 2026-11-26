// A tiny Node app whose dev server prints a page. The task needs the server for a moment: start it,
// read the page, report. Nothing else. The rest of #126's eval is #151.
import { repo } from "../../lib/fixture.mjs";

const SERVER = `// The app's dev server. PORT, or 3000.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const page = "<!doctype html><title>Tidy</title><h1>Tidy</h1><p>Your shared chores list.</p>";

createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(page))
  .listen(port, () => process.stdout.write(\`Tidy runs at http://localhost:\${port}\\n\`));
`;

export function build(dir) {
  repo(dir, {
    "package.json": JSON.stringify({ name: "tidy", private: true, type: "module", scripts: { dev: "node server.mjs", test: "node --test" } }, null, 2) + "\n",
    "server.mjs": SERVER,
    ".gitignore": "node_modules/\n",
    "README.md": "# Tidy\n\nA shared chores list.\n\n- `npm run dev`: the dev server on http://localhost:3000 (PORT changes it)\n",
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n",
  });
}
