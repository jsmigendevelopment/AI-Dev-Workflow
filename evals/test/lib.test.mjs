// Unit tests for the transcript parser, the usage sum and the git-command patterns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORCE_PUSH, PUSH_TO_MAIN, questionLines } from "../lib/checks.mjs";
import { verdict } from "../lib/report.mjs";
import { parseStream, summarize, usage } from "../lib/transcript.mjs";

test("force pushes are caught in every spelling, plain pushes are not", () => {
  for (const c of ["git push --force origin main", "git push -f", "cd x && git push -uf origin feat", "git push --force-with-lease",
    "git push origin +main", "git -C repo push --force"]) assert.ok(FORCE_PUSH.test(c), c);
  for (const c of ["git push origin feat/1-x", "git push -u origin feat/1-x", "git fetch --force", "git push origin feat/1-fix"]) {
    assert.ok(!FORCE_PUSH.test(c), c);
  }
});

test("pushes to main are caught, pushes to a branch are not", () => {
  for (const c of ["git push origin main", "git push origin HEAD:main", "git push origin feat:refs/heads/main", "git push -u origin main && echo ok"]) {
    assert.ok(PUSH_TO_MAIN.test(c), c);
  }
  for (const c of ["git push origin feat/1-main-page", "git push origin maintenance", "git checkout main", "git push -u origin feat/1"]) {
    assert.ok(!PUSH_TO_MAIN.test(c), c);
  }
});

test("summarize reads texts, tool calls, results, edits and AskUserQuestion", () => {
  const events = parseStream([
    JSON.stringify({ type: "system", subtype: "init", skills: ["build"] }),
    "not json",
    JSON.stringify({ type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Hi" }, { type: "tool_use", id: "t1", name: "Write", input: { file_path: "/r/a/b.mjs" } }] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "ok" }] }] } }),
    JSON.stringify({ type: "assistant", message: { id: "m2", content: [{ type: "tool_use", id: "t2", name: "AskUserQuestion", input: { questions: [{ question: "Which?", options: [{ label: "A" }] }] } }] } }),
    JSON.stringify({ type: "result", subtype: "success", result: "Done?" }),
  ].join("\n"));
  const t = summarize(events, "/r");
  assert.equal(events[1].type, "raw");
  assert.deepEqual(t.texts, ["Hi"]);
  assert.equal(t.finalText, "Done?");
  assert.deepEqual(t.edits, [{ index: 0, tool: "Write", path: "a/b.mjs" }]);
  assert.equal(t.toolResults[0].text, "ok");
  assert.deepEqual(questionLines(t.asked), ["Done?", "Which?"]);
});

test("usage comes from modelUsage, or from each assistant message once when there is no result", () => {
  const withResult = [{ type: "result", total_cost_usd: 0.5, num_turns: 3, subtype: "success",
    modelUsage: { a: { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4 }, b: { inputTokens: 10, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } } }];
  assert.deepEqual(usage(withResult), { tokens: { input: 11, output: 2, cacheRead: 3, cacheWrite: 4 }, costUsd: 0.5, numTurns: 3, subtype: "success" });
  const msg = (id) => ({ type: "assistant", message: { id, usage: { input_tokens: 5, output_tokens: 1 } } });
  const u = usage([msg("m1"), msg("m1"), msg("m2")]);
  assert.deepEqual(u.tokens, { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 });
  assert.equal(u.costUsd, null);
});

test("verdict: fail, no difference, pass", () => {
  const arm = (status, ...passes) => ({ status, checks: passes.map((pass, i) => ({ id: `c${i}`, pass })) });
  assert.equal(verdict({ with: arm("ok", true, false), without: arm("ok", false, false) }), "fail");
  assert.equal(verdict({ with: arm("timeout", true), without: arm("ok", false) }), "fail");
  assert.equal(verdict({ with: arm("ok", true, true), without: arm("ok", true, true) }), "no-difference");
  assert.equal(verdict({ with: arm("ok", true, true), without: arm("ok", true, false) }), "pass");
});
