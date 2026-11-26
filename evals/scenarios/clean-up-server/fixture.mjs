// A tiny Node app whose dev server prints a page. The task needs the server for a moment: start it,
// read the page, report. Nothing else (#126 AC-6, #151). The server listens on PORT or a free port and
// prints its link. Each start adds a line to server.pids next to the repo, out of the agent's sight: its
// PID and its start time from ps, so the checks see what ran and never stop a reused PID.
import { repo } from "../../lib/fixture.mjs";

const SERVER = `// The app's dev server. PORT, or a free port: it prints its link.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

let start = "";
try {
  start = execFileSync("ps", ["-o", "lstart=", "-p", String(process.pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } }).trim().split(/\\s+/).join(" ");
} catch {
  start = ""; // no ps (Windows): the PID alone
}
appendFileSync(new URL("../server.pids", import.meta.url), \`\${process.pid} \${start}\\n\`);

const page = "<!doctype html><title>Tidy</title><h1>Tidy</h1><p>Your shared chores list.</p>";
const server = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(page));
server.listen(Number(process.env.PORT ?? 0), () => process.stdout.write(\`Tidy runs at http://localhost:\${server.address().port}\\n\`));
`;

export function build(dir) {
  repo(dir, {
    "package.json": JSON.stringify({ name: "tidy", private: true, type: "module", scripts: { dev: "node server.mjs", test: "node --test" } }, null, 2) + "\n",
    "server.mjs": SERVER,
    ".gitignore": "node_modules/\n*.log\n",
    "README.md": "# Tidy\n\nA shared chores list.\n\n- `npm run dev`: the dev server, on PORT or a free port. It prints its link.\n",
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n",
  });
}
