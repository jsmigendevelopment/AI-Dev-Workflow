// signature --write: puts the block at the end of a file, between the markers, and keeps it there.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeFile } from "./files.mjs";

const START = "<!-- onrails:signature start -->";
const END = "<!-- onrails:signature end -->";

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
    else if (line === END) ends.push(n);
  });
  return { starts, ends, openFence: fence ? fenceLine : null };
}

// The text with the block between the markers, or with `---` and the block added at the end, in
// the file's own line ending. The signature is always the file's ending: a pair counts only when
// its end marker is the last non-blank line. Anything else with markers throws rather than guess,
// since a guess could delete the person's text (markers quoted in <pre>, say).
function placeSignature(text, block) {
  const lines = text.split("\n");
  const { starts, ends, openFence } = markerLines(lines);
  const blockLines = [START, ...block.split("\n"), END];
  const fix = "Fix it by hand, then run this again.";
  if (openFence !== null) {
    throw new Error(`the code fence on line ${openFence + 1} never closes, so the end of the file is inside it. ${fix}`);
  }
  if (!starts.length && !ends.length) {
    const eol = lines.length > 1 && lines[0].endsWith("\r") ? "\r\n" : "\n";
    const body = text.trimEnd();
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
  const cr = lines[starts[0]].endsWith("\r") ? "\r" : "";
  const endCr = lines[ends[0]].endsWith("\r") ? "\r" : "";
  const placed = blockLines.map((line, n) => line + (n === blockLines.length - 1 ? endCr : cr));
  return [...lines.slice(0, starts[0]), ...placed, ...lines.slice(ends[0] + 1)].join("\n");
}

/** Puts the block in the file. Returns the exit code: 0 written or unchanged, 1 refused. */
export function writeSignature(file, block, { dir, log, error, from }) {
  const path = resolve(dir, file);
  let before, after;
  try {
    before = existsSync(path) ? readFileSync(path, "utf8") : "";
    after = placeSignature(before, block);
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
