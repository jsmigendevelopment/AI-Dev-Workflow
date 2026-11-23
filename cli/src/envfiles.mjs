// The .env check. Reads .env.local only to learn variable names and whether each is empty.
// Values never leave this file: nothing here returns, logs or writes a value.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { toNative } from "./files.mjs";

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

// [{ name, empty }] for each NAME=value line; comments and blank lines are skipped.
export function envNames(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const raw = m[2].trim();
    const quoted = /^(["'])(.*)\1/.exec(raw);
    const value = quoted ? quoted[2] : raw.replace(/(^|\s)#.*$/, "").trim();
    out.push({ name: m[1], empty: value === "" });
  }
  return out;
}

const names = (text) => envNames(text).map((v) => v.name);

export function envChecks(projectDir, { OK, FAIL, INFO }) {
  const examplePath = toNative(projectDir, ".env.example");
  const localPath = toNative(projectDir, ".env.local");
  const hasExample = existsSync(examplePath), hasLocal = existsSync(localPath);
  if (!hasExample && !hasLocal) return [{ status: INFO, label: "No .env.example yet (fine until the app needs settings)" }];
  if (!hasLocal) return [{ status: OK, label: ".env.example present" }];

  const local = envNames(readFileSync(localPath, "utf8"));
  const known = new Set(hasExample ? names(readFileSync(examplePath, "utf8")) : []);
  const missing = [...new Set(local.map((v) => v.name))].filter((n) => !known.has(n));
  const checks = [];
  const lines = missing.map((n) => `${n}=`).join("\n") + "\n";
  if (!hasExample) {
    checks.push({
      status: FAIL, required: false, label: ".env.example missing (you have a .env.local)",
      fix: "Create .env.example listing every variable name from .env.local, with no values",
      remedy: { action: { describe: `create .env.example with ${missing.length} name(s), no values`, run: () => writeFileSync(examplePath, lines) } },
    });
  } else if (missing.length) {
    checks.push({
      status: FAIL, required: false, label: `.env.example is missing ${missing.length} name(s) from .env.local: ${missing.join(", ")}`,
      fix: "Add those names to .env.example, with no values",
      remedy: { action: { describe: `add ${missing.join(", ")} to .env.example, with no values`, run: () => appendWithNewline(examplePath, lines) } },
    });
  } else checks.push({ status: OK, label: ".env.example lists every variable in .env.local" });

  const empty = local.filter((v) => v.empty).map((v) => v.name);
  if (empty.length) checks.push({ status: INFO, label: `Empty in .env.local: ${empty.join(", ")}` });
  return checks;
}

function appendWithNewline(path, text) {
  const current = readFileSync(path, "utf8");
  appendFileSync(path, current === "" || current.endsWith("\n") ? text : `\n${text}`);
}
