// #168: keys on Full. The agent opens the provider page, asks only for the sign-in, makes the key and opens the
// paste spot, so the person only signs in and pastes. These rules are text the agents read, so the tests read the
// text: the secrets skill, its provider files, ask's "Setup step for you" and every AGENTS.md. AC-1 is `agent`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const AGENTS = ["AGENTS.md", "cli/kit/files/core/AGENTS.md", "plugin/cli/kit/files/core/AGENTS.md"];
const PROVIDERS = ".agents/skills/secrets/providers";
const section = (text, from, to) => {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `"${from}" not found`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end === -1 ? undefined : end);
};
const secrets = () => read(".agents/skills/secrets/SKILL.md");
const keysOnFull = () => section(secrets(), "## Keys on Full", "### No browser");
const noBrowser = () => section(secrets(), "### No browser", "\n## ");

/** The command on the "<label>: `...`" line of step 4. */
const terminal = (open, label) => open.match(new RegExp(`${label}: \`([^\`]+)\``))?.[1];

const STEPS = ["Open the page.", "Ask for the sign-in only.", "Make the key.", "Open where it goes.", "Check by name."];

test("AC-168-2: the secrets skill's Full branch lists the five steps, never touches a value, and leaves sign-in and paying to the person", () => {
  const full = keysOnFull();
  const at = STEPS.map((step, i) => full.indexOf(`${i + 1}. **${step}**`));
  assert.ok(at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1])), `the five steps, in order: ${at}`);
  assert.match(full, /\*\*Never read, copy, print or screenshot a key's value\*\*/);
  assert.match(full, /\*\*Signing in and paying are the person's\.\*\*/);
  assert.match(full, /Never type a password, a code or a passkey, and never sign in for them\./);
  assert.match(full, /A page that asks for a paid plan or a card: stop on it and send one 🛑/);
  assert.match(full, /"Sign in to <provider> in the tab I opened, then tell me\."/);
  assert.match(full, /Wait only for this, and only for this provider: the rest of the loop goes on\./);
  assert.match(full, /Once the value is on screen, stop on that screen: no screenshot, page read, text search or copy/);
  assert.match(full, /"Copy the key from the tab and paste it into the prompt\."/);
  assert.match(full, /`pnpm connect --dry-run` shows ✓ by name only/);
  // The browser tools a session may have, in order, and none. Computer use left the order in round 1 (its own test below).
  assert.match(full, /the first the session has: Claude in Chrome \((?![^)]*[Cc]omputer use)[^)]*\), then the built-in browser \(Claude Code\)\. How to drive them/);
  // A production key stays an always-stop item, Full or not.
  assert.match(full, /A production key is on the always-stop list/);
  // The Full line at the top of Steps sends the agent here; the old "skip steps 2 to 5" is gone.
  const steps = section(secrets(), "## Steps", "## Keys on Full");
  assert.match(steps, /\*\*On Full automation,\*\* do step 1, skip step 2's question, and run "Keys on Full" below for every missing key\./);
  assert.doesNotMatch(secrets(), /skip steps 2 to 5/);
});

test("AC-168-2 (round 1): the person presses the button that makes or shows the key, after the agent fills the form and opens the paste spot", () => {
  const full = keysOnFull();
  assert.match(full, /\*\*The click that shows a key is the person's\.\*\* The browser tools send back a screenshot or the page's text after each click/);
  assert.match(full, /then hand over that one click and every step after it: a two-factor code, closing the dialog\./);
  const make = section(full, "3. **Make the key.**", "4. **Open where it goes");
  assert.match(make, /Fill in every field the table's row names: the name, the scopes, the permissions, the resources and the expiry\./);
  assert.match(make, /Stop before the button that makes or shows the value \(\*\*Create\*\*, \*\*Reveal\*\*\): that click is the person's/);
  assert.match(make, /like Stripe's two-factor code after \*\*Create key\*\*/);
  assert.doesNotMatch(make, /Click through|the click that creates it/, "the agent no longer clicks the button that makes the key");
  const open = section(full, "4. **Open where it goes", "5. **Check by name.**");
  assert.match(open, /^4\. \*\*Open where it goes\.\*\* Do it before the person presses that button\./);
  // The hand-over comes after every destination is open: press, then the terminal's questions, then the paste.
  const lastDestination = open.indexOf("- A pack without the script:");
  const press = open.indexOf('"In the <provider> tab, press **<the button>** and do any step it asks for next (a code, closing the dialog)."');
  const yn = open.indexOf('"In the terminal, `pnpm connect` asks y/N before it opens a page: answer n, the tab is open already. Answer y to each place it saves the key."');
  const paste = open.indexOf('"Copy the key from the tab and paste it into the prompt."');
  assert.ok(lastDestination > 0 && press > lastDestination && yn > press && paste > yn, `open, then press, y/N, paste: ${[lastDestination, press, yn, paste]}`);
  // Every provider file hands the same click to the person, and Stripe's rows name its two-factor code and Reveal.
  for (const file of readdirSync(fileURLToPath(new URL(`../../${PROVIDERS}`, import.meta.url))).filter((f) => f.endsWith(".md"))) {
    const text = read(`${PROVIDERS}/${file}`);
    assert.match(text, /Open the page and fill in what the row says\. The button that makes or shows a secret value, and any code after it, are the person's\./, file);
    assert.doesNotMatch(text, /stop on the screen that shows a value/, file);
  }
  const stripe = keyRows(read(`${PROVIDERS}/stripe.md`), "stripe.md");
  assert.match(stripe.get("STRIPE_SECRET_KEY").pick, /the person presses \*\*Create key\*\* and enters the two-factor code Stripe sends them in the dialog/);
  const webhook = stripe.get("STRIPE_WEBHOOK_SECRET").pick;
  assert.match(webhook, /\*\*Reveal secret\*\* shows the `whsec_` value\. Stop there: the person presses \*\*Reveal secret\*\*\./);
  assert.equal(webhook.match(/Reveal secret/g).length, 2, "#187: the Reveal-secret handover is said once");
});

test("AC-168-2 (round 1): computer use is never used for keys, and the paste spot opens in a new terminal window on the person's machine", () => {
  const full = keysOnFull();
  assert.match(full, /Never use computer use for keys: it can't click or type in a browser or type in a terminal, and its screenshots show the whole screen, key included\./);
  // Computer use is named once, in that line: never as a browser to drive or a way to type a command.
  assert.equal(full.match(/computer use/gi).length, 1, "computer use is named only to rule it out");
  const open = section(full, "4. **Open where it goes", "5. **Check by name.**");
  assert.match(open, /Your shell runs on the person's machine: open a new terminal window in the app folder, already running `pnpm connect <provider>`\. The folder is its own argument, never inside the script text\./);
  assert.equal(terminal(open, "macOS"), `osascript -e 'on run argv' -e 'tell application "Terminal" to do script "cd " & quoted form of item 1 of argv & " && pnpm connect " & item 2 of argv' -e 'end run' '<app folder>' <provider>`);
  assert.equal(terminal(open, "Linux"), `x-terminal-emulator -e sh -c 'cd "$1" && pnpm connect <provider>; exec "\${SHELL:-sh}"' sh '<app folder>'`);
  assert.equal(terminal(open, "Windows, from PowerShell"), `Push-Location -LiteralPath '<app folder>'; [Environment]::CurrentDirectory = (Get-Location -PSProvider FileSystem).ProviderPath; Start-Process cmd -ArgumentList '/k','pnpm connect <provider>'; Pop-Location`);
  assert.equal(terminal(open, "From Git Bash"), `(cd '<app folder>' && MSYS_NO_PATHCONV=1 cmd.exe /c start "" cmd /k pnpm connect <provider>)`);
  assert.match(open, /Otherwise, give one command for their own terminal: `pnpm connect <provider>`\. It refuses to run without a terminal, so never run it in your shell\./);
});

// Round 2: the folder reaches the new window as its own argument. A folder with a space, both quotes and a `$`.
const FOLDER = `My "App's" $HOME dir`;
/** The folder quoted the way step 4 says for a POSIX shell: single quotes, each `'` as `'\''`. */
const shQuote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;
/** A bin folder of fake commands; each writes its name, its working folder and its arguments to `out`, one per line. */
const fakes = (names) => {
  const dir = tmp("onrails-keys-");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of names) {
    writeFileSync(join(bin, name), `#!/bin/sh\n{ echo "${name}"; pwd; printf '%s\\n' "$@"; } >> "$OUT"\n`);
    chmodSync(join(bin, name), 0o755);
  }
  // x-terminal-emulator opens no window here: it runs what follows -e in this process.
  writeFileSync(join(bin, "x-terminal-emulator"), `#!/bin/sh\n[ "$1" = -e ] && shift\nexec "$@"\n`);
  chmodSync(join(bin, "x-terminal-emulator"), 0o755);
  const folder = join(dir, FOLDER);
  mkdirSync(folder);
  return { dir, bin, folder, out: join(dir, "out.txt") };
};
/** Runs one command line in sh with the fakes first on PATH, and returns what the fakes wrote. */
const runSh = (line, { bin, dir, out }) => {
  const env = safeEnv({ OUT: out, SHELL: "true", HOME: dir }, { bins: [bin] });
  const r = spawnSync("sh", ["-c", line], { cwd: dir, env, encoding: "utf8" });
  assert.equal(r.status, 0, `${line}\n${r.stderr}`);
  return readFileSync(out, "utf8").split("\n").slice(0, -1);
};
const fill = (command, folder) => command.replace("'<app folder>'", shQuote(folder)).replaceAll("<provider>", "clerk");
const openStep = () => section(keysOnFull(), "4. **Open where it goes", "5. **Check by name.**");

test("AC-168-2 (round 2): on Linux the new window's sh -c reaches a folder with a space and quotes, runs pnpm connect there and stays open", { skip: process.platform === "win32" }, () => {
  const linux = terminal(openStep(), "Linux");
  assert.ok(linux, "a Linux command");
  const f = fakes(["pnpm"]);
  // `exec "${SHELL:-sh}"` keeps the window open; SHELL=true here, so the run ends.
  assert.deepEqual(runSh(fill(linux, f.folder), f), ["pnpm", f.folder, "connect", "clerk"]);
});

test("AC-168-2 (round 2): on macOS the folder is osascript's own argument, and AppleScript's quoted form reaches it", { skip: process.platform === "win32" }, () => {
  const mac = terminal(openStep(), "macOS");
  assert.ok(mac, "a macOS command");
  const f = fakes(["osascript", "pnpm"]);
  const script = `tell application "Terminal" to do script "cd " & quoted form of item 1 of argv & " && pnpm connect " & item 2 of argv`;
  assert.deepEqual(runSh(fill(mac, f.folder), f), ["osascript", f.dir, "-e", "on run argv", "-e", script, "-e", "end run", f.folder, "clerk"]);
  // No macOS here: build what Terminal runs the way AppleScript does. `quoted form of` wraps in ' and writes each ' as '\''.
  writeFileSync(f.out, "");
  assert.deepEqual(runSh(`cd ${shQuote(f.folder)} && pnpm connect clerk`, f), ["pnpm", f.folder, "connect", "clerk"]);
});

test("AC-168-2 (round 2): on Windows PowerShell the folder is its own argument, and 5.1 opens cmd in it", () => {
  const open = openStep();
  const ps = terminal(open, "Windows, from PowerShell");
  assert.ok(ps, "a PowerShell command");
  assert.doesNotMatch(ps, /\bcd\b|&&|-WorkingDirectory/, "PowerShell: the folder isn't inside a script or a wildcard parameter");
  assert.match(open, /in PowerShell, as `''`/);
  assert.match(open, /`-WorkingDirectory` can read `\[` and `\]` as a wildcard/);
  // Windows PowerShell 5.1 starts the process from the process folder, not the pushed location: set it first.
  const set = ps.indexOf("[Environment]::CurrentDirectory = (Get-Location -PSProvider FileSystem).ProviderPath;");
  assert.ok(ps.indexOf("Push-Location") < set && set < ps.indexOf("Start-Process"), "the process folder is set between the push and the start");
});

test("AC-187-1: from Git Bash the folder never reaches cmd, and cmd starts in it", { skip: process.platform === "win32" }, () => {
  const open = openStep();
  const f = fakes(["cmd.exe"]);
  // Git Bash is a POSIX shell, so check what cmd.exe gets. MSYS leaves `&`, `^`, `%` unquoted; `'` and `$` test the quoting.
  for (const name of ["a&b^c%d", "it's $HOME"]) {
    writeFileSync(f.out, "");
    const folder = join(f.dir, name);
    mkdirSync(folder);
    const line = terminal(open, "From Git Bash").replace("'<app folder>'", shQuote(folder)).replaceAll("<provider>", "clerk");
    const [cmd, cwd, ...args] = runSh(line, f);
    assert.deepEqual([cmd, cwd], ["cmd.exe", folder], `${name}: cmd starts in the folder`);
    assert.deepEqual(args, ["/c", "start", "", "cmd", "/k", "pnpm", "connect", "clerk"]);
    assert.ok(args.every((a) => !a.includes(name)), `${name}: the folder never appears in cmd's arguments`);
  }
});

test("AC-168-2 (round 2): if no window opens, the agent gives the one command instead", () => {
  assert.match(openStep(), /No window opens \(a permission prompt, a sandbox, an error\)\? Give the one command in the next bullet instead\./);
});

/** #187: a sentence that is a step: a button, or one that starts with an action. Notes ("Shown once.", `[V]`) are not. */
const AGENT_STEP = /\*\*|^(?:Then|Next|After|Now|Click|Press|Open|Go|Pick|Select|Choose|Fill|Type|Enter|Add|Copy|Paste|Make|Create|Set|Run|Save|Close)\b/;

const checkSecretRows = () => {
  const files = readdirSync(fileURLToPath(new URL(`../../${PROVIDERS}`, import.meta.url))).filter((f) => f.endsWith(".md"));
  let checked = 0;
  for (const file of files) {
    const text = read(`${PROVIDERS}/${file}`);
    const block = text.match(/```json connect\n([\s\S]*?)\n```/);
    if (!block) continue;
    const rows = keyRows(text, file);
    for (const [name, v] of Object.entries(JSON.parse(block[1]).vars)) {
      if (!v.secret) continue;
      const { pick } = rows.get(name);
      const stop = pick.match(/Stop there: the person presses \*\*[^*]+\*\*[^.]*\.(.*)$/);
      assert.ok(stop, `${file}: ${name}'s row ends on "Stop there: the person presses **<button>**"`);
      const steps = stop[1].split(/(?<=\.) /).map((s) => s.trim()).filter((s) => AGENT_STEP.test(s));
      assert.deepEqual(steps, [], `${file}: ${name}: no agent step after the person's press`);
      checked++;
    }
  }
  return checked;
};

test("AC-168-2 (round 2): every row that makes a secret stops on the button the person presses, with nothing for the agent after it", () => {
  assert.ok(checkSecretRows() > 0);
});

test("AC-187-3: the secret-row check covers exactly the 15 `\"secret\": true` variables", () => {
  // Adding or removing a secret variable means updating this count.
  assert.equal(checkSecretRows(), 15, "every secret row is checked");
});

test("AC-187-2: Entra's row names API permissions before New client secret, and GitHub's stops on the generate button", () => {
  // Entra hides the value once you leave the page: the permissions come first, so the agent never works in that tab after it.
  const entra = keyRows(read(`${PROVIDERS}/entra.md`), "entra.md").get("ACCESS_ENTRA_CLIENT_SECRET").pick;
  const perms = entra.indexOf("**API permissions**");
  const secret = entra.indexOf("**New client secret**");
  assert.ok(perms >= 0 && secret >= 0, "Entra: names both API permissions and New client secret");
  assert.ok(perms < secret, "Entra: API permissions before the secret");
  assert.match(entra, /Stop there: the person presses \*\*Add\*\*/);
  const github = keyRows(read(`${PROVIDERS}/github-oauth.md`), "github-oauth.md").get("ACCESS_GITHUB_CLIENT_SECRET").pick;
  assert.match(github, /\*\*Register application\*\* \(it shows only the client ID\)\. Stop there: the person presses \*\*Generate a new client secret\*\*/);
});

test("AC-168-2 (round 1): the built-in browser checks its pane, a pack without the script checks by name, and a key waiting on a 🛑 counts as done", () => {
  const full = keysOnFull();
  const signIn = section(full, "2. **Ask for the sign-in only.**", "3. **Make the key.**");
  assert.match(signIn, /In the built-in browser, call `tabs_context` first: it says whether the pane is showing/);
  const check = section(full, "5. **Check by name.**", "**Done when**");
  assert.match(check, /A pack without the script checks by name another way: `node \.agents\/skills\/secrets\/scripts\/push-secrets\.mjs --dry-run` names each empty value, `npx wrangler secret list --env <env>` lists the Worker's names, and on `ci = "actions"` so does `gh secret list --env <env>`\. Never check a value\./);
  assert.match(full, /\*\*Done when\*\* every key the app needs shows ✓ in step 5's check, or its sign-in line is under "Waiting on you" in `docs\/state\.md`, or its 🛑 is sent \(a production key, a paid plan or a card\)\./);
});

test("#168 round 1: stripe.md's header says what was checked on 2026-11-26", () => {
  const stripe = read(`${PROVIDERS}/stripe.md`);
  assert.match(stripe, /^Last checked: 2026-11-26\./m);
  assert.match(stripe, /https:\/\/docs\.stripe\.com\/keys\/restricted-api-keys/);
  assert.match(stripe, /How: the docs above were read on 2026-11-26\. dashboard\.stripe\.com was not opened/);
  assert.doesNotMatch(stripe, /were blocked here|Every dashboard step below is `\[U\]`/);
});

test("AC-168-2: below Full the agent asks once before it uses the browser in the person's accounts", () => {
  const step2 = section(secrets(), "2. **Ask once:**", "3. **Walk them through");
  assert.match(step2, /I can open each provider's page in your browser and make the keys there: you'd only sign in and paste/);
  assert.match(step2, /Below Full, this is the one ask before you use the browser in the person's accounts, as `test-by-hand-as-the-user` does: name each site and account, and what you'll click\./);
  assert.match(keysOnFull(), /On Full, and below Full after a yes to the browser in step 2\./);
});

test("AC-168-4: with no browser tool the skill gives the links and one command in one sitting, and the loop goes on", () => {
  const none = noBrowser();
  assert.match(none, /one "Setup step for you" \(`ask`\) for every missing key, grouped so the person does it all in one sitting/);
  assert.match(none, /the exact link from its "Make each key" table/);
  assert.match(none, /Then the one command, in their own terminal in the app folder: `pnpm connect`\./);
  assert.match(none, /run on the fakes, and go on with the loop\./);
  assert.match(keysOnFull(), /None\? Go to "No browser" below\./);
});

/** The variables a provider file fills: its connect block's names, or for a file with no block, the ones it names. */
const filled = (text, id) => {
  const block = text.match(/```json connect\n([\s\S]*?)\n```/);
  if (block) return Object.keys(JSON.parse(block[1]).vars);
  assert.equal(id, "supabase", `${id}.md has no connect block`);
  return ["DATABASE_URL"];
};
/** The "Make each key" table: variable name -> { url, pick }. One row may name several variables. */
const keyRows = (text, file) => {
  const table = section(text, "## Make each key", "\n## ");
  const rows = new Map();
  for (const line of table.split("\n").filter((l) => /^\| `/.test(l))) {
    const [names, url, pick] = line.split(" | ").map((c) => c.replace(/^\| |\s\|$/g, "").trim());
    for (const name of names.match(/`[A-Z0-9_]+`/g) ?? []) rows.set(name.slice(1, -1), { url, pick, file });
  }
  return rows;
};

test("AC-168-3: every provider file gives the exact dashboard page that makes each key it fills, and what to pick", () => {
  const files = readdirSync(fileURLToPath(new URL(`../../${PROVIDERS}`, import.meta.url))).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 14, "every provider file is read");
  for (const file of files) {
    const text = read(`${PROVIDERS}/${file}`);
    const rows = keyRows(text, file);
    for (const name of filled(text, file.slice(0, -3))) {
      const row = rows.get(name);
      assert.ok(row, `${file}: no "Make each key" row for ${name}`);
      const url = new URL(row.url.replace(/\s.*$/, ""));
      assert.equal(url.protocol, "https:", `${file}: ${name}'s page is https`);
      assert.ok(url.pathname.length > 1 || url.search || url.hash, `${file}: ${name}'s page is a page, not the home page (${row.url})`);
      assert.doesNotMatch(url.hostname, /^(?:docs|learn)\.|^developers\.cloudflare\.com$/, `${file}: ${name}'s page is a dashboard, not a docs page`);
      assert.ok(row.pick.length > 20, `${file}: ${name} says what to pick`);
    }
  }
});

test("AC-168-3: the token rows name the exact scopes to pick", () => {
  const cloudflare = keyRows(read(`${PROVIDERS}/cloudflare.md`), "cloudflare.md");
  assert.match(cloudflare.get("CLOUDFLARE_API_TOKEN").pick, /\*\*Edit Cloudflare Workers\*\*.*`Account · D1 · Edit`/);
  assert.match(cloudflare.get("CLOUDFLARE_ZONE_TOKEN").pick, /`Zone · Zone · Read`.*`Zone · Zone Settings · Edit`.*`Zone · Zone WAF · Edit`.*`Zone · Bot Management · Edit`/);
  assert.match(cloudflare.get("CLOUDFLARE_ACCESS_TOKEN").pick, /`Account · Access: Apps and Policies · Edit`.*`Account · Workers Scripts · Read`/);
  assert.match(keyRows(read(`${PROVIDERS}/resend.md`), "resend.md").get("RESEND_API_KEY").pick, /\*\*Sending access\*\*/);
  assert.match(keyRows(read(`${PROVIDERS}/entra.md`), "entra.md").get("ACCESS_ENTRA_CLIENT_SECRET").pick, /`email`, `offline_access`, `openid`, `profile`, `User\.Read`/);
  assert.match(keyRows(read(`${PROVIDERS}/stripe.md`), "stripe.md").get("STRIPE_SECRET_KEY").pick, /\*\*Create restricted key\*\*/);
});

test("AC-258-1: PostHog's provider file has the shared sections, a dated check and a row per variable on its project settings page", () => {
  const text = read(`${PROVIDERS}/posthog.md`);
  for (const heading of ["**For `pnpm connect`.**", "## Make each key", "## Walkthrough", "## Free tier", "## Why / if it goes wrong"]) assert.ok(text.includes(heading), heading);
  assert.match(text, /^Last checked: \d{4}-\d{2}-\d{2}\./m);
  assert.match(text, /checked against PostHog's docs on \d{4}-\d{2}-\d{2}/);
  const rows = keyRows(text, "posthog.md");
  assert.deepEqual([...filled(text, "posthog")].sort(), ["VITE_PUBLIC_POSTHOG_HOST", "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN"]);
  for (const name of filled(text, "posthog")) assert.equal(rows.get(name).url, "https://us.posthog.com/settings/project", name);
});

test("AC-168-5: AGENTS.md's outside-the-repo line says do every step first and hand over only the sign-in and the paste", () => {
  const line = "- Need the person to do something outside the repo? Do every step you can first, and hand over only what is theirs: for a key, that is signing in and one paste (`secrets`, \"Keys on Full\"). Write it in the `ask` skill's \"Setup step for you\" format. Secret values only through the `secrets` checklist, never chat.";
  for (const file of AGENTS) {
    const text = read(file);
    assert.ok(text.split("\n").includes(line), `${file}: the outside-the-repo line`);
    const rules = text.slice(text.indexOf("## Standing rules"), text.indexOf("## Code")).match(/^\d+(?=\. )/gm).map(Number);
    assert.deepEqual(rules, rules.map((_, i) => i + 1), `${file}: rule numbers stay unique`);
  }
});

test("#168: ask's \"Setup step for you\" does every key step first, so the step holds only the sign-in and the paste", () => {
  const setup = section(read(".agents/skills/ask/SKILL.md"), "## Setup step for you", "## Steps");
  assert.match(setup, /\*\*A key\?\*\* Do every step you can first \(`secrets`, "Keys on Full"\): open the page, make the key, open where it goes\. The step you write holds only the sign-in and the paste\./);
});

test("#168: the owner's words are a decision row with originator person, and rows stay numbered once, in order", () => {
  const rows = read("docs/decisions.md").split("\n");
  const row = rows.find((l) => l.includes("(#168)") && l.includes("Keys on Full")) ?? "";
  assert.ok(row.includes('"when it comes to setting up keys, the ai should do as much as it can for the user as the user allows. in full automation that means opening a browser tab, asking the user to sign in, making the key, opening the terminal/browser to paste the key, so the user just has to copy paste the key wherever it has to go"'), "the owner's words, exact");
  assert.match(row, /\| person \|$/);
  const numbers = rows.map((l) => l.match(/^\| (\d+) \|/)?.[1]).filter(Boolean).map(Number);
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), "rows 1 to N, each once");
});
