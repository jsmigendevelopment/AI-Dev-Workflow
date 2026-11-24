#!/usr/bin/env node
// Builds cli/README.md, the npm page, from the root README.md plus cli/CLI.md (the CLI reference).
// npm shows the package's README, and many people find onRails there first, so it gets the whole
// story. Relative links and images would break on npm, so they become absolute GitHub URLs.
//   node scripts/npm-readme.mjs          write cli/README.md
//   node scripts/npm-readme.mjs --check  fail if cli/README.md is out of date
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "https://github.com/jsmigendevelopment/onRails";
const RAW = "https://raw.githubusercontent.com/jsmigendevelopment/onRails/main";
const IMAGE = /\.(svg|png|jpe?g|gif|webp)$/i;

// Turns a link written relative to `fromDir` (a folder inside the repo) into an absolute URL.
export function absolute(target, fromDir) {
  if (/^([a-z]+:|#|\/\/)/i.test(target)) return target;
  const [path, hash = ""] = target.split("#");
  const clean = normalize(join(fromDir, path)).replace(/\\/g, "/").replace(/^\.\//, "");
  if (clean === "README.md" || clean === "") return `${REPO}${hash ? `#${hash}` : ""}`;
  const base = IMAGE.test(clean) ? `${RAW}/${clean}` : `${REPO}/blob/main/${clean}`;
  return hash ? `${base}#${hash}` : base;
}

export function rewrite(markdown, fromDir) {
  return markdown
    .replace(/(src|href)="([^"]+)"/g, (_, attr, url) => `${attr}="${absolute(url, fromDir)}"`)
    .replace(/\]\(([^)\s]+)\)/g, (_, url) => `](${absolute(url, fromDir)})`);
}

export function build() {
  const readme = rewrite(readFileSync(join(ROOT, "README.md"), "utf8"), ".");
  const cli = rewrite(readFileSync(join(ROOT, "cli", "CLI.md"), "utf8"), "cli");
  const note = "<!-- Made by scripts/npm-readme.mjs from README.md and cli/CLI.md. Edit those, then run it. -->\n\n";
  return `${note}${readme.trimEnd()}\n\n---\n\n${cli.trimEnd()}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(ROOT, "cli", "README.md");
  const next = build();
  if (process.argv.includes("--check")) {
    const now = readFileSync(out, "utf8");
    if (now !== next) {
      console.error("cli/README.md is out of date. Run: node scripts/npm-readme.mjs");
      process.exit(1);
    }
    console.log("cli/README.md in sync");
  } else {
    writeFileSync(out, next);
    console.log("wrote cli/README.md");
  }
}
