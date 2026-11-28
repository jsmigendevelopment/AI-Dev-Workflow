// Preflight's output (#195): the safe-value filter, each check's fix ladder, the table and the Environment record.
// The master copy is scripts/preflight-output.mjs in the kit; sync-skills.mjs copies it next to each preflight.mjs. No dependencies.

// The rows that need a command say this when the repo's layout can't be read (#182).
export const CLOSED = "the repo's checkouts can't all be read, so no PATH folder is used yet: checked after the repo is read";
// Said by the rows that run from outside the repo, when no temp folder outside it could be made.
export const NO_AWAY = "no empty temp folder outside the repo that only this user can write could be made, so it's checked after the repo is read";
// A PATH folder left off because a .git at or above it can't be read may hold the tool, so "isn't installed" could mislead (#195).
export const UNREAD = (cmd) => `${cmd} isn't on the PATH folders kept, and one left off couldn't be read: checked after the repo is read`;
export const TOOLS = { claude: "Claude Code", "claude-cloud": "Claude Code (cloud session)", codex: "Codex", other: "an unknown tool" };
const MARK = { ok: "✓", fix: "✗", blocked: "✗", limited: "–", skip: "–", info: "–" };

// The table, the ladder and the drafted message are read by the agent, and the message is posted. So a value
// from the repo or the environment is printed only when it matches a safe pattern, and plain words stand in for it otherwise.
export const SAFE = { range: /^[\d.xX*^~<>= |]{1,40}$/, host: /^[a-z0-9.-]{1,253}(:\d{1,5})?$/i, version: /^\d+(\.\d+){0,2}(-[0-9A-Za-z.-]{1,40})?$/,
  code: /^E[A-Z0-9_]{2,30}$/, model: /^[\w.:@\/[\]-]{1,80}$/, effort: /^[a-z]{1,12}$/i, flag: /^--?[a-z][\w-]{0,30}$/i,
  path: /^[\w .:~@+\/\\-]{1,400}$/, reason: /^[\w .,:'~@+()\/\\-]{1,600}$/ };
export const shown = (value, kind, instead) => (value != null && SAFE[kind].test(String(value)) ? String(value) : instead);
// Command output can carry text from the repo too, so only a cause from this list, or an error code, is taken from it.
const CAUSES = ["Read-only file system", "Permission denied", "Operation not permitted", "No space left on device", "Executable doesn't exist",
  "Host system is missing dependencies", "not a git repository", "dubious ownership"];
export const cause = (out = "", instead = "an error preflight doesn't print") =>
  CAUSES.find((c) => out.toLowerCase().includes(c.toLowerCase())) ?? shown(/\b(E[A-Z_]{4,30}|E\d{3})\b/.exec(out)?.[1], "code", instead);

// Rung 2: the tool's own way to run one command outside the sandbox.
const ONE_COMMAND = {
  codex: (cmd) => `Ask to run \`${cmd}\` outside the sandbox (\`approval_policy = "on-request"\`): the person approves that one command.`,
  claude: (cmd) => `Run \`${cmd}\` as one plain command, so a permission prompt covers only it.`,
  "claude-cloud": () => "A cloud session has no prompt that lifts this. Go to rung 3.",
  other: (cmd) => `If your tool can ask to run one command outside its sandbox, ask for \`${cmd}\`.`,
};
// Rung 3: the environment tools the session may use.
const ENV_TOOLS = {
  codex: "Check that `.codex/config.toml` loaded: the project must be trusted. It sets `network_access = true`.",
  claude: "Check the sandbox and permission settings you may change, such as `.claude/settings.json`.",
  "claude-cloud": "Use the session's environment tools: read its network and setup pages (`read_documentation`), then propose the change to the environment.",
  other: "Use any environment or setup tool your session has.",
};
const CODEX_TRUST = "Trust this project so `.codex/config.toml` loads (it sets `network_access = true`), then restart Codex.";

// Rung 1's project-local cache, in each manager's own words. yarn 2+ has no --prefer-offline, and yarn and bun have no --cache.
// yarn 1 reads YARN_CACHE_FOLDER and ignores the other variables. yarn 4 keeps its global cache on by default and then
// ignores YARN_CACHE_FOLDER, so the global cache is turned off too. Even then yarn 4 writes its mirror, metadata and
// install index under its global folder in the home folder, so that folder moves into the project as well.
const CACHE = { npm: "`npm install --prefer-offline --cache .npm-cache`", pnpm: "`pnpm install --prefer-offline --store-dir .pnpm-store`",
  yarn: "`YARN_GLOBAL_FOLDER=.yarn-global YARN_ENABLE_GLOBAL_CACHE=false YARN_CACHE_FOLDER=.yarn-cache yarn install`"
    + " (yarn 1 reads the cache folder; yarn 2+ also needs its global folder in the project and its global cache off)",
  bun: "`bun install --cache-dir .bun-cache`" };
// A bare VAR=value prefix works only in a POSIX shell (Git Bash too), so Windows also gets the PowerShell and cmd.exe forms.
const YARN_CACHE_WINDOWS = " In PowerShell: `$env:YARN_GLOBAL_FOLDER='.yarn-global'; $env:YARN_ENABLE_GLOBAL_CACHE='false';"
  + " $env:YARN_CACHE_FOLDER='.yarn-cache'; yarn install`. In cmd.exe: `set \"YARN_GLOBAL_FOLDER=.yarn-global\" &&"
  + ' set "YARN_ENABLE_GLOBAL_CACHE=false" && set "YARN_CACHE_FOLDER=.yarn-cache" && yarn install`.';

// Rung 1 for a blocked Go module proxy (#538): a module cache inside the project, and a mirror in GOPROXY. GOTOOLCHAIN=local
// keeps go from fetching a toolchain through the same proxy. A bare VAR=value prefix works only in a POSIX shell.
const GO_CACHE = "`GOMODCACHE=\"$PWD/.gomodcache\" GOTOOLCHAIN=local go mod download` (a project-local module cache; keep `.gomodcache/` out of git)";
const GO_CACHE_WINDOWS = " In PowerShell: `$env:GOMODCACHE=\"$PWD\\.gomodcache\"; $env:GOTOOLCHAIN='local'; go mod download`.";
const GO_MIRROR = "If the sandbox allows another host, a mirror: `GOPROXY=https://<mirror>,direct` in the same command, or `go env -w GOPROXY=https://<mirror>,direct`.";

/** The four rungs for a blocked check: 1 workarounds, 2 one command outside the sandbox, 3 environment tools, 4 the person. */
export function ladder(id, tool, { host = "the registry", pm = "npm", want = "", platform } = {}) {
  const install = `${pm} install`;
  const cache = CACHE[pm] + (pm === "yarn" && platform === "win32" ? YARN_CACHE_WINDOWS : "");
  const by = {
    repo: ["Work in a folder you can write: a temp folder, or a fresh clone under your home folder.", "touch a file here",
      { any: "Make this folder writable for the agent, or open the session in a folder that is." }],
    git: ["`git init` in a writable place and commit there (`git init --separate-git-dir <a writable folder>`), or keep working and commit at the end.",
      "git commit", { any: "Run the git command in your own terminal in this folder, or let the agent's git run outside the sandbox when it asks." }],
    registry: [`A project-local cache: ${cache}. Check \`.npmrc\` names the registry you mean.`, install, {
      codex: CODEX_TRUST, claude: `Allow network access to ${host} for this project, or run \`${install}\` in your own terminal in this folder.`,
      "claude-cloud": `Allow ${host} in the cloud environment's network settings.`,
      other: `Give the agent's sandbox network access to ${host}, or run \`${install}\` in your own terminal in this folder.` }],
    loopback: ["Try another port. Run the server and the tests in the same process (no listening port). Next.js: `--webpack` in place of Turbopack.",
      "the dev server and its tests", { codex: CODEX_TRUST, any: "Let the agent's sandbox listen on 127.0.0.1, or run the browser checks in your own terminal." }],
    versions: ["A version manager already on this machine: `nvm use`, `fnm use` or `volta`, if one is installed.", "nvm install",
      { any: `Install a Node that fits ${want || ">=22"} (https://nodejs.org), then start the agent again in this folder.` }],
    go: ["A Go already on this machine: `which -a go`, or a version manager such as `asdf`, `mise` or `gvm`, if one is installed.", "install Go",
      { any: `Install ${want ? `Go ${want} or newer` : "a Go that fits go.mod"} (https://go.dev/dl/), then start the agent again in this folder.` }],
    goproxy: [`${GO_CACHE}.${platform === "win32" ? GO_CACHE_WINDOWS : ""} ${GO_MIRROR}`, "go mod download", {
      codex: CODEX_TRUST, claude: `Allow network access to ${host} for this project, or run \`go mod download\` in your own terminal in this folder.`,
      "claude-cloud": `Allow ${host} in the cloud environment's network settings.`,
      other: `Give the agent's sandbox network access to ${host}, or run \`go mod download\` in your own terminal in this folder.` }],
  }[id];
  if (!by) return [];
  const [workaround, command, person] = by;
  return [
    { rung: 1, text: `In the sandbox: ${workaround}` },
    { rung: 2, text: `One command outside it: ${ONE_COMMAND[tool](command)}` },
    { rung: 3, text: `Environment tools: ${ENV_TOOLS[tool]}` },
    { rung: 4, text: `The person, last: ${person[tool] ?? person.any}` },
  ];
}
export const selfFix = (text) => [{ rung: 1, text: `Fix it yourself: ${text}` }];

// Said once, under the table, while the repo isn't marked read.
export function unreadNote(report) {
  if (report.read !== false) return [];
  const why = report.state ? "This repo has a docs/state.md, but no session on this machine has marked it read, so it counts as not read. " : "";
  const away = report.away ? " npm, git and gh ran from an empty temp folder outside it that only this user can write, and npm read no project settings above it." : "";
  return ["", `${why}Probes that could run the repo's own code ran nothing from it (the rows that say "after the repo is read").${away}`
    + " /join or /back marks it with `--mark-read`; then run preflight again."];
}

export const warningLines = (warnings = []) => (warnings.length ? ["", ...warnings.map((w) => `Warning: ${w}`)] : []);
// A PATH folder left off for another user's sake would make "git isn't installed" mislead, so each one is named (#232).
const unsafeLines = (unsafe = []) => (unsafe.length ? ["", `Left off PATH before the read, as another local user could change what runs from it: ${
  unsafe.map((why) => shown(why, "reason", "a folder that isn't printed")).join("; ")}.`] : []);

/** The one table, each failure's ladder, and a draft of the ONE message for whatever the ladder doesn't clear. */
export function render(report) {
  const out = [`Preflight · ${TOOLS[report.tool]} · ${report.checkedAt}`, "", "| Check | Result | Detail |", "|---|---|---|"];
  for (const r of report.results) out.push(`| ${r.label} | ${MARK[r.status]} | ${r.detail.replace(/\s+/g, " ").replaceAll("|", "\\|")} |`);
  out.push(...unreadNote(report), ...unsafeLines(report.unsafe), ...warningLines(report.warnings));
  const open = report.results.filter((r) => r.status === "fix" || r.status === "blocked");
  const blocked = open.filter((r) => r.status === "blocked");
  if (!open.length) return [...out, "", "Environment: ok."].join("\n");
  out.push("", `${open.length} to fix. Work down each ladder in order, then run preflight again. Ask only for what's left, in ONE message.`);
  if (blocked.some((r) => ["repo", "registry", "versions", "go", "goproxy"].includes(r.id))) out.push("Installs are blocked: don't scaffold or build until they work. Work that needs no install goes on.");
  for (const r of open) out.push("", r.label, ...r.ladder.map((l) => `  ${l.rung}. ${l.text}`));
  if (blocked.length) {
    out.push("", "Still blocked after rungs 1 to 3? Send ONE message. Write all of it, with its Tried line filled in, on the issue",
      "(with issues as files: in the issue's file, under \"## Comments\", plus `needs-human` on its Labels line). Then ping once.",
      "A line in chat or in docs/state.md alone is not the record. The message:", "",
      `Setup step for you · Unblock the agent's sandbox (${TOOLS[report.tool]}) · about 5 minutes`, "",
      ...blocked.map((r, i) => `${i + 1}. ${r.label}: ${r.ladder.at(-1).text.replace(/^The person, last: /, "")}`), "",
      "Tried: <for each one, what you tried on rungs 1 to 3, and why it didn't clear it>",
      "When it worked: the agent runs preflight again and every row shows ✓.");
  }
  return out.join("\n");
}

const RECORD = /^[ \t]*[-*]?[ \t]*\*\*Environment:\*\*[^\n]*$/m;

/** The Environment line of a state file: { ok, open: [ids], fingerprint } or null. */
export function readRecord(text = "") {
  const line = text.match(RECORD)?.[0];
  const m = line && /\*\*Environment:\*\*\s*(ok|open: ([a-z, ]+)) · checked \S+ · \S+ · fp ([0-9a-f]+)/.exec(line);
  return m ? { ok: m[1] === "ok", open: m[2] ? m[2].split(",").map((s) => s.trim()).filter(Boolean) : [], fingerprint: m[3] } : null;
}

/** The text with its Environment line replaced, or added as the first item under the first heading. */
export function withRecord(text, line) {
  if (RECORD.test(text)) return text.replace(RECORD, line);
  const heading = /^#[^\n]*$/m.exec(text);
  if (!heading) return `${line}\n${text}`;
  const end = heading.index + heading[0].length;
  const rest = text.slice(end).replace(/^\n+/, "");
  return `${text.slice(0, end)}\n\n${line}\n${rest.startsWith("- ") ? "" : rest ? "\n" : ""}${rest}`;
}

export function recordLine(report) {
  const open = report.results.filter((r) => r.status === "fix" || r.status === "blocked").map((r) => r.id);
  const model = report.results.find((r) => r.id === "model");
  const ran = model.model || model.effort ? ` · model ${model.model ?? "unknown"} · effort ${model.effort ?? "unknown"}` : "";
  return `- **Environment:** ${open.length ? `open: ${open.join(", ")}` : "ok"} · checked ${report.checkedAt} · ${report.tool} · fp ${report.fingerprint}${ran}`;
}
