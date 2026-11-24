// Shared by the signature tests: a made-up profile, its full block, and runners.
import assert from "node:assert/strict";
import { signature } from "../src/signature.mjs";
import { logger, put, read, tmp } from "./helpers.mjs";

export const START = "<!-- onrails:signature start -->";
export const END = "<!-- onrails:signature end -->";
export const crlf = (text) => text.replace(/\n/g, "\r\n");

export const PROFILE = `[me]
name = "Ada"

[me.signature]
theme = "professional"
style = "full"
name = "Ada Example"
name_url = "https://example.com"   # a comment
display = "Ada Dev"
tagline = "Software engineer"
mark_light = "https://example.com/mark.svg"
mark_dark = "https://example.com/mark-dark.svg"
mark_alt = "Ada Dev monogram"
mark_size = 64
compact_mark_size = 20
signoff = "Build it right."
compact_signoff = "Go build."
links = [
  { label = "Site", url = "https://example.com" },
  { label = "Blog", url = "https://example.com/blog/" },
  { label = "GitHub", url = "https://github.com/example" },
]

[me.signature.personal]
display = "ada"
tagline = "Maker of small things"
mark_light = "https://example.com/personal.svg"
links = [{ label = "Garden", url = "https://garden.example.com" }]

[defaults]
name = "not the signature"
`;

export const FULL = `<p align="center">
  <a href="https://example.com">
    <img src="https://example.com/mark.svg" width="64" height="64" alt="Ada Dev monogram">
  </a><br>
  Built by <a href="https://example.com"><b>Ada Example</b></a><br>
  <sub>Ada Dev · Software engineer</sub><br><br>
  <a href="https://example.com">Site</a> ·
  <a href="https://example.com/blog/">Blog</a> ·
  <a href="https://github.com/example">GitHub</a>
  <br><br>
  <sub>Build it right.</sub>
</p>`;

/** Runs the command in a fresh project with this profile; returns the exit code and output. */
export function run(args, profile = PROFILE, { dir = tmp(), home = tmp() } = {}) {
  if (profile !== null) put(dir, "docs/profile.toml", profile);
  const log = logger(), error = logger();
  const code = signature(args, { dir, home, log, error });
  return { code, out: log.text(), err: error.text(), dir, home };
}

/** Each mode (HTML, compact, Markdown) must refuse the profile with 1, print nothing, match the message and write nothing. */
export function refusedEverywhere(profile, message) {
  for (const mode of [[], ["--style", "compact"], ["--markdown"]]) {
    const { code, out, err } = run(mode, profile);
    assert.equal(code, 1, `${message} ${mode.join(" ")}`);
    assert.equal(out, "", "nothing printed");
    assert.match(err, message);
  }
  const dir = tmp();
  put(dir, "README.md", "# App\n");
  assert.equal(run(["--write", "README.md", "--theme", "personal"], profile, { dir }).code, 1);
  assert.equal(read(dir, "README.md"), "# App\n", "nothing written");
}
