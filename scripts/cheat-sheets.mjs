// Edit guide/cheat-sheet.md first. Run this from any directory to rebuild the GitHub edition.
// Pass --site /path/to/onRails-Marketing to also refresh the site's data and identical artwork.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const guide = join(root, "guide");
const source = readFileSync(join(guide, "cheat-sheet.md"), "utf8");
const slug = (title) => title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const plain = (s) => s.replaceAll("`", "");
const width = 352;
const groups = [];
let group, card;
for (const line of source.split("\n")) {
  if (line.startsWith("## ")) {
    group = { title: line.slice(3), intro: "", cards: [] };
    groups.push(group);
    card = undefined;
  } else if (line.startsWith("### ")) {
    const title = line.slice(4);
    card = { id: slug(title), title, rows: [] };
    group.cards.push(card);
  } else if (card && line.startsWith("| ")) {
    const [label, body] = line.slice(2, -2).split(" | ");
    if (body !== "What happens") card.rows.push({ label, body });
  } else if (group && !card && line.trim()) {
    group.intro = line;
  }
}
const siteFlag = process.argv.indexOf("--site");
const site = siteFlag < 0 ? null : resolve(process.argv[siteFlag + 1]);
function output(path, contents) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== contents) throw new Error("Out of date: " + path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
function asset(id, svg, shared = true) {
  output(join(guide, "cheat-sheet", id + ".svg"), svg);
  if (shared && site) output(join(site, "public", "cheat-sheet", id + ".svg"), svg);
}

// These self-contained images use the site's light and dark tokens. An embedding page's
// color-scheme selects the palette, including when the visitor changes theme on the site.
const palette = `
  svg{--ink:#0f1020;--muted:#55566b;--paper:#ffffff;--panel:#f7f7fb;--line:#e4e4ee;--a:#7c3aed;--b:#2563eb}
  @media(prefers-color-scheme:dark){svg{--ink:#f2f2f7;--muted:#a3a4b8;--paper:#12121c;--panel:#0a0a12;--line:#262636;--a:#a78bfa;--b:#60a5fa}}
  text{font-family:system-ui,sans-serif;fill:var(--ink)}
  .body{font-size:16px;fill:var(--muted)}
  .key{font-family:ui-monospace,monospace;font-size:16px;font-weight:650;fill:var(--a)}
  .label{font-size:17px;font-weight:650}
`;
function frame(title, desc, height, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escape(title)}</title>
  <desc id="desc">${escape(desc)}</desc>
  <style>${palette}</style>
  <defs><linearGradient id="rails"><stop style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--b)"/></linearGradient></defs>
  <rect x="1" y="1" width="350" height="${height - 2}" rx="18" fill="var(--paper)" stroke="var(--line)"/>
  ${art}
</svg>\n`;
}
function textAt(x, y, words, attrs = "") {
  return `<text x="${x}" y="${y}" ${attrs}>${escape(words)}</text>`;
}
// Conservative system-font advances leave space for fallback fonts in GitHub's image proxy.
function advance(word) {
  return [...word].reduce(
    (n, c) => n + ("il.,:!'’j ".includes(c) ? 4.8 : "MW@mw—".includes(c) ? 14 : /[A-Z]/.test(c) ? 11.5 : 9.3),
    0,
  );
}
function wrap(copy, available) {
  const lines = [""];
  for (const word of plain(copy).split(" ")) {
    const last = lines.at(-1);
    if (last && advance(last + " " + word) > available) lines.push(word);
    else lines[lines.length - 1] = last ? last + " " + word : word;
  }
  return lines;
}
// Each topic has its own track diagram: a pair of entry lines, a branching plan, or a turnout
// into parallel reference tracks. Station rings in the margin connect each entry to its topic.
function track(kind) {
  const paths = [
    ["M-4 37h123c37 0 32-20 65-20h172", "M-4 43h123c37 0 32-20 65-20h172", "M38 37h19m147-20h21"],
    ["M-4 33h360", "M82 33h22c37 0 32-17 64-17h64", "M187 33h24c23 0 24 12 48 12h97"],
    ["M-4 24h360", "M-4 40h121c25 0 23-16 48-16", "M204 24c22 0 23 16 47 16h105"],
  ][kind];
  return `<g fill="none" stroke="url(#rails)" stroke-width="2.5">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>
  <g fill="var(--paper)" stroke="var(--a)" stroke-width="3"><circle cx="47" cy="${[37, 33, 24][kind]}" r="5"/><circle cx="269" cy="${[17, 33, 24][kind]}" r="5"/></g>`;
}
// Four distinct station symbols make the session commands recognizable at a glance.
function station(index, y) {
  const signs = [
    '<path d="M-3 2c0-2-3-3-3-6a6 6 0 0 1 12 0c0 3-3 4-3 6zM-2 5h4"/>',
    '<circle r="7"/><path d="m3-3-2 4-4 2 2-4z"/>',
    '<circle r="3.5"/><path d="M0-9v2m0 14v2m-9-9h2m14 0h2M-6-6l1.5 1.5m9 9L6 6M6-6 4.5-4.5m-9 9L-6 6"/>',
    '<path d="M5-5a7 7 0 1 0 1 10A8 8 0 0 1 5-5Z"/>',
  ];
  return `<g transform="translate(23 ${y})"><circle r="13" fill="var(--panel)" stroke="var(--line)"/><g fill="none" stroke="var(--a)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${signs[index]}</g></g>`;
}
function infographic(card, kind) {
  let y = 102;
  const rows = [],
    stops = [];
  for (const { label, body } of card.rows) {
    const key = label.startsWith("`/");
    const lines = key && plain(label).length > 29 ? plain(label).split(" · ") : wrap(label, 283);
    stops.push(y - 5);
    for (const line of lines) {
      rows.push(textAt(45, y, line, key ? 'class="key"' : 'class="label"'));
      y += 22;
    }
    for (const line of wrap(body, 282)) {
      rows.push(textAt(45, y, line, 'class="body"'));
      y += 21;
    }
    y += 18;
  }
  const height = y - 15;
  const spine = `<path d="M23 ${stops[0]}V${stops.at(-1)}" stroke="var(--line)" stroke-width="3"/>`;
  const dots = stops
    .map((y, i) =>
      kind === 0
        ? station(i, y)
        : `<circle cx="23" cy="${y}" r="4.5" fill="var(--paper)" stroke="var(--a)" stroke-width="2.5"/>`,
    )
    .join("");
  const top =
    kind === 0
      ? `<g transform="translate(192 20)"><path d="M-28-6h20m-17 5h15" stroke="var(--a)" opacity=".5" stroke-linecap="round"/><path d="M0-10h25q8 0 14 9l3 4H0q-3 0-3-4v-5q0-4 3-4Z" fill="url(#rails)"/><path d="M17-7h7q5 0 9 5H17Z" fill="var(--paper)"/><path d="M3-2h8" stroke="var(--paper)"/></g>`
      : "";
  const title = textAt(21, 72, card.title, 'font-size="24" font-weight="700" letter-spacing="-.7"');
  const alt = card.rows.map(({ label, body }) => plain(label) + ". " + plain(body)).join(" ");
  asset(
    card.id,
    frame(card.title, alt, height, track(kind) + top + title + spine + dots + rows.join("\n  ")),
  );
  return height;
}
// Match the README inventory exactly, including order and the Codex spelling of numbered steps.
const readme = readFileSync(join(root, "README.md"), "utf8");
const inventory = readme.split("| Skills | |")[1].split("\n\n")[0];
const expected = [...inventory.matchAll(/`([a-z][a-z0-9-]*[a-z])`/g)].map((match) => match[1]);
const actual = groups
  .flatMap((g) => g.cards.flatMap((c) => c.rows))
  .filter((row) => row.label.startsWith("`/"))
  .map(({ label }) => {
    const [, name] = /^`\/([a-z0-9-]+)( N)?` · `\$\1\2`$/.exec(label) ?? [];
    if (!name) throw new Error("Invalid Claude Code / Codex pair: " + label);
    return name;
  });
if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw new Error("Skill list differs from the README");
// Terminal commands in the reference must also be copyable straight from the kit README.
for (const [, command] of source.matchAll(/`((?:claude|codex|npx) [^`\n]+)`/g)) {
  if (!readme.includes(command)) throw new Error("Terminal command missing from README: " + command);
}
const intro = source.split("\n")[2];
const visual = [
  "[![onRails cheat sheet. Read the text version.](cheat-sheet/text-version.svg)](cheat-sheet.md)",
  "",
];
asset(
  "text-version",
  frame(
    "onRails cheat sheet",
    intro + " Open the text version.",
    154,
    textAt(20, 38, "onRails cheat sheet", 'font-size="25" font-weight="700"') +
      wrap(intro, 310)
        .map((line, i) => textAt(20, 67 + i * 21, line, 'class="body"'))
        .join("") +
      textAt(20, 135, "Read the text version →", 'class="key"'),
  ),
  false,
);
for (const [index, section] of groups.entries()) {
  const id = slug(section.title);
  const lines = wrap(section.intro, 307);
  asset(
    id,
    frame(
      section.title,
      section.intro,
      70 + 22 * lines.length,
      textAt(22, 37, section.title, 'font-size="26" font-weight="700"') +
        lines.map((line, i) => textAt(22, 65 + 22 * i, line, 'class="body"')).join(""),
    ),
    false,
  );
  visual.push(`![${section.title}. ${section.intro}](cheat-sheet/${id}.svg)`, "");
  const cards = [];
  for (const card of section.cards) {
    card.height = infographic(card, index);
    const alt = card.rows.map(({ label, body }) => plain(label) + ". " + plain(body)).join(" ");
    cards.push(
      `<img src="cheat-sheet/${card.id}.svg" width="352" align="top" alt="${escape(card.title + ". " + alt).replaceAll('"', "&quot;")}">`,
    );
  }
  visual.push(cards.join("\n"), "");
}
output(join(guide, "cheat-sheet-visual.md"), visual.join("\n"));
if (site)
  output(
    join(site, "src/modules/landing/cheat-sheet.json"),
    JSON.stringify({ intro, groups }, null, 2) + "\n",
  );
