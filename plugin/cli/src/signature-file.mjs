// signature --write: puts the block at the end of a file, between the markers, and keeps it there.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeFile } from "./files.mjs";

const START = "<!-- onrails:signature start -->";
const END = "<!-- onrails:signature end -->";
// The end marker --write writes carries the sha256 of the block, so a later run replaces only a
// block it wrote. Older blocks have none: those must equal a render of the current profile.
const END_LINE = /^<!-- onrails:signature end(?: sha256=(\S*))? -->$/;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const endMarker = (block) => `<!-- onrails:signature end sha256=${sha256(block)} -->`;

// Line numbers of the markers, outside fenced code blocks, and the line of a fence left open at
// the end. A marker counts only as the whole line, at column 0, the way this command writes it:
// an indented one is in code or a list.
function markerLines(lines) {
  const starts = [], ends = [];
  let fence = null, fenceLine = null;
  lines.forEach((raw, n) => {
    const line = raw.replace(/\r$/, "");
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) fence = null;
      return;
    }
    // A backtick fence's info string can't hold a backtick (CommonMark), so "``` a`b" isn't one.
    const open = /^ {0,3}(`{3,})[^`]*$/.exec(line)?.[1] ?? /^ {0,3}(~{3,})/.exec(line)?.[1];
    if (open) {
      fence = open;
      fenceLine = n;
    } else if (line === START) starts.push(n);
    else if (END_LINE.test(line)) ends.push(n);
  });
  return { starts, ends, openFence: fence ? fenceLine : null };
}

// Throws unless the marked lines hold a block this command wrote: its sha256 matches the end
// marker's, or, with no sha256, it equals a render of this profile. Anything else (a quoted marker
// paired with the real end, a hand edit) could be the person's text.
function ownBlock(marked, known, fix) {
  const inner = marked.slice(1, -1).join("\n");
  const hash = END_LINE.exec(marked.at(-1))[1];
  if (hash === undefined) {
    if (known.includes(inner)) return;
    throw new Error(`the text between its signature markers isn't a signature this profile renders, and its end marker has no sha256, so replacing it could delete your text (a marker quoted in <pre> or a comment, say). ${fix}`);
  }
  if (hash !== sha256(inner)) {
    throw new Error(`the signature between its markers changed after --write wrote it (its sha256 doesn't match), so replacing it could delete your edits. ${fix}`);
  }
}

// The text with the block between the markers, or with `---` and the block added at the end, in
// the file's own line ending. The signature is always the file's ending: a pair counts only when
// its end marker is the last non-blank line. Anything else with markers throws rather than guess,
// since a guess could delete the person's text (markers quoted in <pre>, say).
function placeSignature(text, block, known) {
  const lines = text.split("\n");
  const { starts, ends, openFence } = markerLines(lines);
  const blockLines = [START, ...block.split("\n"), endMarker(block)];
  const fix = "Fix it by hand, then run this again.";
  if (openFence !== null) {
    throw new Error(`the code fence on line ${openFence + 1} never closes, so the end of the file is inside it. ${fix}`);
  }
  if (!starts.length && !ends.length) {
    const eol = lines.length > 1 && lines[0].endsWith("\r") ? "\r\n" : "\n";
    // Only what a line ending leaves: a non-breaking space at the very end is the person's text.
    const body = text.replace(/[ \t\r\n]+$/, "");
    const wrapped = blockLines.join(eol);
    return body ? `${body}${eol}${eol}---${eol}${eol}${wrapped}${eol}` : `${wrapped}${eol}`;
  }
  if (starts.length > 1 || ends.length > 1) throw new Error(`it has more than one signature start or end marker. Keep one pair. ${fix}`);
  if (!ends.length) throw new Error(`it has a signature start marker but no end marker (${END}). ${fix}`);
  if (!starts.length) throw new Error(`it has a signature end marker but no start marker (${START}). ${fix}`);
  if (ends[0] < starts[0]) throw new Error(`its signature end marker comes before the start marker. ${fix}`);
  if (ends[0] !== lines.findLastIndex((line) => line.trim() !== "")) {
    throw new Error(`text follows its signature end marker, and the signature must be the file's ending. Move the block to the end, or remove markers that are only examples. ${fix}`);
  }
  ownBlock(lines.slice(starts[0], ends[0] + 1).map((line) => line.replace(/\r$/, "")), known, fix);
  const cr = lines[starts[0]].endsWith("\r") ? "\r" : "";
  const endCr = lines[ends[0]].endsWith("\r") ? "\r" : "";
  const placed = blockLines.map((line, n) => line + (n === blockLines.length - 1 ? endCr : cr));
  return [...lines.slice(0, starts[0]), ...placed, ...lines.slice(ends[0] + 1)].join("\n");
}

/** Puts the block in the file, over a block it wrote or one of `known` (this profile's renders). Returns 0 written or unchanged, 1 refused. */
export function writeSignature(file, block, { dir, log, error, from, known }) {
  const path = resolve(dir, file);
  let before, after;
  try {
    before = existsSync(path) ? readFileSync(path, "utf8") : "";
    after = placeSignature(before, block, known);
  } catch (e) {
    error(`${file}: ${e.message}\nNothing was written.`);
    return 1;
  }
  if (after === before) {
    log(`${file}: the signature is already up to date.`);
    return 0;
  }
  writeFile(path, after);
  log(`${file}: wrote the signature from ${from}.`);
  return 0;
}
