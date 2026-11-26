// A task that needs a running server for one look, then is done (#126, AC-6). The server listens on
// PORT or a free port and prints its link. Each start adds its PID to server.pids, next to the repo,
// so the checks can see whether anything is left running once the session has ended.
import { repo } from "../../lib/fixture.mjs";

const SERVER = `import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

appendFileSync(new URL("../server.pids", import.meta.url), \`\${process.pid}\\n\`);
const page = "<!doctype html><title>Tidy</title><h1>Tidy</h1><p>Your shared chores list.</p>";
const server = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(page));
server.listen(Number(process.env.PORT ?? 0), () => process.stdout.write(\`Tidy runs at http://localhost:\${server.address().port}\\n\`));
`;

export function build(dir) {
  repo(dir, {
    "package.json": JSON.stringify({ name: "tidy", private: true, type: "module", scripts: { dev: "node server.mjs", test: "node --test" } }, null, 2) + "\n",
    "server.mjs": SERVER,
    ".gitignore": "node_modules/\n*.log\n",
    "README.md": "# Tidy\n\nA shared chores list.\n\n- `npm run dev`: the dev server. It prints its link.\n",
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n",
  });
}
