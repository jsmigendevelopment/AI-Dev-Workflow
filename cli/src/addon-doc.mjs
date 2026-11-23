// Reads an add-on's ADDON.md at bundle time.
// From ADDON.md the CLI needs a one-line summary and the "## Apply" steps it can't do itself:
// step 1, which says "The CLI does this step", is the copy of files/, so it is left out.
export function parseAddon(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const intro = lines.find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? "";
  // The first sentence: up to the first ". " (or the end), for one-line listings.
  const summary = intro.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? intro;
  const start = lines.findIndex((l) => l.trim() === "## Apply");
  if (start === -1) return { summary, apply: "" };
  const section = [];
  let fenced = false;
  for (const line of lines.slice(start + 1)) {
    if (line.trimStart().startsWith("```")) fenced = !fenced;
    if (!fenced && /^## /.test(line)) break;
    section.push(line);
  }
  // Drop the numbered step that the CLI performs, with its indented continuation lines.
  const out = [];
  let skipping = false;
  for (const line of section) {
    if (/^\d+\. /.test(line)) skipping = /The CLI does this step/.test(line);
    else if (skipping && line.trim() && !/^\s/.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return { summary, apply: out.join("\n").trim() };
}
