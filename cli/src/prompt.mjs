// Questions on the terminal. ask(question) resolves to the trimmed answer, or "" once input
// ends, so piped answers work and a closed stdin means "take the default".
import { createInterface } from "node:readline";

export function terminalAsk(input = process.stdin, output = process.stdout) {
  let rl = null, closed = false;
  const lines = [], waiting = [];
  const start = () => {
    rl = createInterface({ input });
    rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
    rl.on("close", () => { closed = true; while (waiting.length) waiting.shift()(""); });
  };
  const ask = (question) => {
    if (!rl) start();
    output.write(question);
    if (lines.length) return Promise.resolve(lines.shift().trim());
    if (closed) return Promise.resolve("");
    return new Promise((done) => waiting.push((line) => done(line.trim())));
  };
  ask.close = () => rl?.close();
  return ask;
}

export async function confirm(ask, question) {
  return /^y(es)?$/i.test(await ask(`${question} [y/N] `));
}

// Ask with a default shown in brackets; an empty answer keeps it. choices: allowed answers.
export async function askDefault(ask, question, fallback, choices) {
  const hint = choices ? choices.join("|") : "";
  for (;;) {
    const shown = fallback ? ` [${fallback}]` : hint ? "" : " (blank to skip)";
    const answer = (await ask(`${question}${hint ? ` (${hint})` : ""}${shown}: `)) || fallback;
    if (!choices || choices.includes(answer)) return answer;
  }
}
