// Reads Claude Code's stream-json output (`claude -p --output-format stream-json --verbose`):
// one JSON event per line. The first is usually `system/init`, the last is `result`.
// Shapes: code.claude.com/docs/en/agent-sdk/typescript (SDKSystemMessage, SDKResultMessage),
// checked 2026-11-23 against Claude Code 2.1.330.
import { isAbsolute, relative } from "node:path";

/** Parses stream-json text into events. Lines that aren't JSON (a crash message) are kept as `{ type: "raw" }`. */
export function parseStream(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      events.push({ type: "raw", text: line });
    }
  }
  return events;
}

const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.map((c) => c.text ?? (typeof c.content === "string" ? c.content : "")).join("\n") : "";

/** Pulls out what checks need: the texts, the tool calls in order, the tool results, init and result. */
export function summarize(events, dir) {
  const init = events.find((e) => e.type === "system" && e.subtype === "init") ?? null;
  const result = [...events].reverse().find((e) => e.type === "result") ?? null;
  const texts = [];
  const toolUses = [];
  const toolResults = [];
  for (const e of events) {
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (e.type === "assistant" && block.type === "text") texts.push(block.text);
      if (e.type === "assistant" && block.type === "tool_use") toolUses.push({ id: block.id, name: block.name, input: block.input ?? {} });
      if (e.type === "user" && block.type === "tool_result") {
        toolResults.push({ id: block.tool_use_id, text: textOf(block.content), isError: Boolean(block.is_error) });
      }
    }
  }
  const finalText = typeof result?.result === "string" && result.result ? result.result : texts.at(-1) ?? "";
  const questions = toolUses.filter((t) => t.name === "AskUserQuestion")
    .flatMap((t) => (t.input.questions ?? []).map((q) => [q.question, ...(q.options ?? []).map((o) => o.label ?? "")].join("\n")));
  const rel = (p) => !p ? "" : (isAbsolute(p) && dir ? relative(dir, p) : p).split("\\").join("/");
  return {
    init,
    result,
    texts,
    finalText,
    // What the agent said to the person at the end, plus any AskUserQuestion it tried.
    asked: [finalText, ...questions].join("\n"),
    allText: [...texts, ...questions].join("\n"),
    toolUses,
    toolResults,
    bash: toolUses.filter((t) => t.name === "Bash").map((t) => String(t.input.command ?? "")),
    // File edits in the order they were made: { index, tool, path } with a repo-relative path.
    edits: toolUses.map((t, index) => ({ index, tool: t.name, path: rel(t.input.file_path ?? t.input.notebook_path) }))
      .filter((e) => ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(e.tool) && e.path),
  };
}

/** Tokens and cost of one run. From `result.modelUsage`; without a result (a timeout), from each assistant message once. */
export function usage(events) {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const result = [...events].reverse().find((e) => e.type === "result");
  if (result?.modelUsage && Object.keys(result.modelUsage).length) {
    for (const m of Object.values(result.modelUsage)) {
      tokens.input += m.inputTokens ?? 0;
      tokens.output += m.outputTokens ?? 0;
      tokens.cacheRead += m.cacheReadInputTokens ?? 0;
      tokens.cacheWrite += m.cacheCreationInputTokens ?? 0;
    }
  } else {
    // Messages from one step share an id and repeat the same usage, so count each id once.
    const seen = new Set();
    for (const e of events) {
      const u = e.type === "assistant" ? e.message?.usage : null;
      if (!u || seen.has(e.message.id)) continue;
      seen.add(e.message.id);
      tokens.input += u.input_tokens ?? 0;
      tokens.output += u.output_tokens ?? 0;
      tokens.cacheRead += u.cache_read_input_tokens ?? 0;
      tokens.cacheWrite += u.cache_creation_input_tokens ?? 0;
    }
  }
  return {
    tokens,
    // Claude Code's own estimate, not a bill. Unknown (null) when the run never reported a result.
    costUsd: typeof result?.total_cost_usd === "number" ? result.total_cost_usd : null,
    numTurns: result?.num_turns ?? null,
    subtype: result?.subtype ?? null,
  };
}
