// #593: the build skill's reference files are copies of guides, and an agent may read only the copy. A relative link
// in a copy that points at a guide nobody copied next to it is dead there, so every such link must resolve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const FOLDERS = [".agents/skills/build/references", ".claude/skills/build/references"];

/** The relative targets (no fragment) of the inline links in `text`, outside code fences and inline code. */
function relativeLinks(text) {
  const prose = text.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1].split("#")[0])
    .filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target));
}

/** "file -> target" for each relative link in the named files of `folder` whose target is not on disk. */
function deadLinks(folder, names) {
  return names.flatMap((name) => {
    const file = resolve(REPO, folder, name);
    return relativeLinks(readFileSync(file, "utf8"))
      .filter((target) => !existsSync(resolve(dirname(file), target)))
      .map((target) => `${folder}/${name} -> ${target}`);
  });
}

test("AC-593-1: WHEN the test follows each relative link in build/references/code-style.md and app-conventions.md THEN every target file exists next to the copy", () => {
  for (const folder of FOLDERS) assert.deepEqual(deadLinks(folder, ["code-style.md", "app-conventions.md"]), []);
});

test("AC-593-3: WHEN the test follows each relative link in every build/references/*.md copy THEN every target file exists next to the copy", () => {
  for (const folder of FOLDERS) {
    const names = readdirSync(resolve(REPO, folder)).filter((name) => name.endsWith(".md"));
    assert.ok(names.length >= 4, `${folder} holds its reference files`);
    assert.deepEqual(deadLinks(folder, names), []);
  }
});

test("AC-593-4: WHEN the link check reads text with a dead, an external, an anchor, a code-span and a fenced link THEN only the dead relative target is returned", () => {
  assert.deepEqual(relativeLinks("See [a](gone.md#x), [b](https://example.com/x.md), [c](#top) and `[d](no.md)`.\n```\n[e](no.md)\n```\n"), ["gone.md"]);
});
