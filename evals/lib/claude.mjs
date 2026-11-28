// Runs Claude Code headless on one fixture and returns its events.
// Flags checked 2026-11-23 against `claude --help` of Claude Code 2.1.330 and
// code.claude.com/docs/en/cli-reference (--max-turns is documented there, not in --help).
import { spawn } from "node:child_process";

// What the agent may do without asking. Anything else is denied, not prompted (dontAsk mode),
// and the attempt still shows in the transcript, which is what the checks read.
export const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "TodoWrite",
  "Bash(git *)", "Bash(node *)", "Bash(npm *)", "Bash(ls *)", "Bash(cat *)", "Bash(mkdir *)", "Bash(grep *)"];
// No network from a fixture: no web, no GitHub, no downloads.
export const DISALLOWED_TOOLS = ["WebFetch", "WebSearch", "Bash(gh *)", "Bash(curl *)", "Bash(wget *)"];

/** The argv for one run. The prompt goes on stdin, so the variadic tool lists can't swallow it. `tools` adds to
 * ALLOWED_TOOLS for one scenario, such as `Agent` for a scenario that starts a background sub-agent (#280).
 * `streamInput` reads the messages as stream-json, for a scenario with follow-up messages (#390). */
export function claudeArgs({ model, maxTurns, maxBudgetUsd, tools = [], streamInput = false }) {
  return [
    "-p",
    "--output-format", "stream-json",
    ...(streamInput ? ["--input-format", "stream-json"] : []),
    "--verbose", // stream-json in print mode needs it
    "--model", model,
    "--max-turns", String(maxTurns),
    "--max-budget-usd", String(maxBudgetUsd),
    "--permission-mode", "dontAsk",
    // Project settings only: the kit's .claude/settings.json loads, the person's own ~/.claude/settings.json doesn't.
    "--setting-sources", "project,local",
    "--strict-mcp-config", // no MCP servers from anywhere
    "--no-session-persistence",
    "--allowedTools", [...ALLOWED_TOOLS, ...tools].join(","),
    "--disallowedTools", DISALLOWED_TOOLS.join(","),
  ];
}

// The child gets only these variables: no GitHub tokens, no cloud keys, nothing else from the shell.
const PASS_ENV = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "TMPDIR", "TEMP", "TMP",
  "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "XDG_CONFIG_HOME", "CLAUDE_CONFIG_DIR",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "ANTHROPIC_API_KEY"];

/** The environment for a run. With an API key, HOME is a clean temp folder, so no personal skills or CLAUDE.md leak in. */
export function claudeEnv(source, { home }) {
  const env = {};
  for (const key of PASS_ENV) if (source[key] !== undefined) env[key] = source[key];
  if (source.ANTHROPIC_API_KEY && home) env.HOME = env.USERPROFILE = home;
  env.ONRAILS_NOTIFY_PRINT = "1"; // the kit's notify hook never pings anyone's phone from an eval
  return env;
}

/** One user message as a stream-json input line. */
const userLine = (text) => JSON.stringify({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, session_id: "" }) + "\n";
const isResult = (line) => {
  try {
    return JSON.parse(line).type === "result";
  } catch {
    return false; // a line that isn't JSON (a crash message) ends no turn
  }
};
// After the last reply the run is done: a background sub-agent still working gets this long, then it's stopped.
const END_GRACE_MS = 10_000;

/** Spawns claude in cwd with the prompt on stdin. Kills it at the timeout. Never rejects. With `followUps`, the prompt
 * and each follow-up go as stream-json messages: each follow-up as soon as a turn's result arrives, marked in stdout
 * with an `onrails_follow_up` event (#390), and the run ends after the last one's result. */
export function runClaude({ bin = "claude", args, cwd, env, prompt, timeoutSec, followUps = [] }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let ended = false;
    let partial = "";
    let sent = 0;
    let child;
    try {
      child = spawn(bin, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      resolve({ status: "error", error: error.message, stdout, stderr, durationMs: 0 });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutSec * 1000);
    // Each complete line, in order. After a turn's result the next follow-up goes in, or the run ends.
    const onLine = (line) => {
      stdout += line + "\n";
      if (!isResult(line)) return;
      if (sent < followUps.length) {
        const text = followUps[sent++];
        stdout += JSON.stringify({ type: "onrails_follow_up", index: sent, text }) + "\n";
        child.stdin.write(userLine(text));
      } else if (!ended) {
        ended = true;
        child.stdin.end();
        setTimeout(() => child.kill("SIGTERM"), END_GRACE_MS).unref();
      }
    };
    child.stdout.on("data", (d) => {
      if (!followUps.length) return void (stdout += d);
      const lines = (partial + d).split("\n");
      partial = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.on("error", () => {}); // a child that exits early closes stdin; the exit code reports it
    if (followUps.length) child.stdin.write(userLine(prompt));
    else child.stdin.end(prompt);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: "error", error: error.message, stdout, stderr, durationMs: Date.now() - started });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      stdout += partial;
      // Stopped by the runner after the last reply: the run itself finished.
      const status = timedOut ? "timeout" : code === 0 || ended ? "ok" : "error";
      resolve({ status, exitCode: code, stdout, stderr: stderr.slice(-2000), durationMs: Date.now() - started });
    });
  });
}
