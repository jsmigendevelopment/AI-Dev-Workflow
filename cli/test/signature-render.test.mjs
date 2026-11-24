// signature: what it prints, and the guards on every value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { put, tmp } from "./helpers.mjs";
import { FULL, PROFILE, refusedEverywhere, run } from "./signature-fixture.mjs";

const swap = (from, to) => PROFILE.replace(from, to);
const TAGLINE = 'tagline = "Software engineer"';
const SIGNOFF = 'signoff = "Build it right."';
const GITHUB_URL = 'url = "https://github.com/example"';

test("AC-1: WHEN the profile has [me.signature] THEN signature prints the full HTML block, with the links in order", () => {
  const { code, out } = run([]);
  assert.equal(code, 0);
  assert.equal(out, FULL);
});

test("AC-1: the home profile is read when the project has none, and --markdown prints plain Markdown", () => {
  const home = tmp();
  put(home, ".onrails/profile.toml", PROFILE);
  const { code, out } = run(["--markdown"], null, { home });
  assert.equal(code, 0);
  assert.equal(out, [
    "[![Ada Dev monogram](https://example.com/mark.svg)](https://example.com)",
    "",
    "Built by **[Ada Example](https://example.com)**  ",
    "Ada Dev · Software engineer",
    "",
    "[Site](https://example.com) · [Blog](https://example.com/blog/) · [GitHub](https://github.com/example)",
    "",
    "Build it right.",
  ].join("\n"));
});

test("AC-2: WHEN --theme personal is given THEN the personal table's keys override the base ones", () => {
  const { code, out } = run(["--theme", "personal"]);
  assert.equal(code, 0);
  assert.match(out, /<img src="https:\/\/example\.com\/personal\.svg"/);
  assert.match(out, /<sub>ada · Maker of small things<\/sub>/);
  assert.match(out, /<a href="https:\/\/garden\.example\.com">Garden<\/a>\n  <br><br>/);
  assert.doesNotMatch(out, /GitHub/, "the personal links replace the base links");
  assert.match(out, /<b>Ada Example<\/b>/, "keys the personal table leaves out stay");
});

test("AC-3: WHEN --style compact is given THEN the output is one line, with the compact mark size and signoff", () => {
  const { code, out } = run(["--style", "compact"]);
  assert.equal(code, 0);
  assert.equal(out, '<p align="center"><a href="https://example.com"><img src="https://example.com/mark.svg" width="20" height="20" alt="Ada Dev monogram"></a>'
    + ' By <a href="https://example.com"><b>Ada Example</b></a>'
    + ' · <a href="https://example.com">Site</a> · <a href="https://example.com/blog/">Blog</a> · <a href="https://github.com/example">GitHub</a>'
    + " · <sub>Go build.</sub></p>");
});

test("AC-5: WHEN a value holds an email, a mailto: link or a URL that isn't plain https THEN it is refused in every mode", () => {
  const cases = [
    [swap(TAGLINE, 'tagline = "ada@example.com"'), /tagline.*email/],
    [swap(GITHUB_URL, 'url = "mailto:ada@example.com"'), /links\[2\]\.url.*email/],
    [swap(GITHUB_URL, 'url = "MAILTO:ada@example.com"'), /links\[2\]\.url.*email/],
    [swap('label = "Blog"', 'label = "Mail ada@example.com"'), /links\[1\]\.label.*email/],
    [swap('name_url = "https://example.com"', 'name_url = "http://example.com"'), /name_url must be a plain https:\/\//],
    [swap('mark_light = "https://example.com/personal.svg"', 'mark_light = "/personal.svg"'), /personal\.mark_light must be a plain https:\/\//],
    [swap('url = "https://example.com/blog/"', 'url = "javascript:alert(1)"'), /links\[1\]\.url must be a plain https:\/\//],
    // Encoded emails: % and & never pass, so nothing decodes into a value that wasn't checked.
    [swap(GITHUB_URL, 'url = "https://x.example/?to=bob%40example.com"'), /links\[2\]\.url must be a plain https:\/\//],
    [swap(GITHUB_URL, 'url = "https://x.example/bob&#64;example.com"'), /links\[2\]\.url must be a plain https:\/\//],
    [swap(GITHUB_URL, 'url = "https://x.example/bob&commat;example.com"'), /links\[2\]\.url must be a plain https:\/\//],
    [swap(GITHUB_URL, 'url = "https://Example.com/"'), /links\[2\]\.url must be a plain https:\/\//],
    [swap(GITHUB_URL, 'url = "https://example.com:8080/"'), /links\[2\]\.url must be a plain https:\/\//],
    [swap(GITHUB_URL, 'url = "https://example.com/a(b)"'), /links\[2\]\.url must be a plain https:\/\//],
    [swap(GITHUB_URL, 'url = "https://example.com/#top"'), /links\[2\]\.url must be a plain https:\/\//],
    [swap(GITHUB_URL, 'url = "https://user@example.com/"'), /links\[2\]\.url holds an email|plain https/],
  ];
  for (const [profile, message] of cases) refusedEverywhere(profile, message);
});

test("AC-5: WHEN text holds anything outside the allowlist, or a bare URL, THEN it is refused in every mode", () => {
  const cases = [
    // A newline ends the HTML block, so what follows would render as Markdown.
    [swap(TAGLINE, 'tagline = "x\\n\\n[click](http://evil.example)"'), /tagline holds a control character/],
    [swap(TAGLINE, 'tagline = "a\\tb"'), /tagline holds a control character/],
    [swap(SIGNOFF, 'signoff = "a\\u007fb"'), /signoff holds a control character/],
    [swap('url = "https://example.com/blog/"', 'url = "https://example.com/\\r\\nx"'), /links\[1\]\.url holds a control character/],
    [swap(TAGLINE, 'tagline = "see www.evil.example"'), /tagline holds a URL.*www\./],
    [swap('label = "Blog"', 'label = "x](javascript:alert(1)) [y"'), /links\[1\]\.label holds "\]"/],
    [swap('label = "Site"', 'label = "x](http://evil.example) [y"'), /links\[0\]\.label holds a URL.*http:/],
    [swap('name = "Ada Example"', 'name = "Ada evil.example//x"'), /^ {2}name holds "\/"/m],
    [swap(SIGNOFF, 'signoff = "data:text/html,hi"'), /signoff holds a URL.*data:/],
    [swap('mark_alt = "Ada Dev monogram"', 'mark_alt = "//evil.example"'), /mark_alt holds "\/"/],
    [swap('display = "ada"', 'display = "HTTPS://evil.example"'), /personal\.display holds a URL/],
    [swap(TAGLINE, 'tagline = "javascript:alert(1)"'), /tagline holds a URL.*javascript:/],
    [swap(TAGLINE, 'tagline = "http:x"'), /tagline holds a URL.*http:/],
    [swap(TAGLINE, 'tagline = "mailto:a"'), /tagline holds an email/],
    [swap(TAGLINE, 'tagline = "data:x"'), /tagline holds a URL.*data:/],
    [swap(TAGLINE, 'tagline = "ada@evil.c0m"'), /tagline holds an email/],
    [swap(TAGLINE, 'tagline = "Q and A @ noon"'), /tagline holds "@"/],
    [swap(TAGLINE, 'tagline = "bob\\uff20example.com"'), /tagline holds "＠"/],
    [swap(TAGLINE, 'tagline = "bob&#64;example.com"'), /tagline holds "#"/],
    [swap(SIGNOFF, 'signoff = "~~~"'), /signoff holds "~"/],
    [swap('display = "Ada Dev"', 'display = " ==="'), /^ {2}display holds "="/m],
    [swap('display = "Ada Dev"', 'display = " ==="'), /^ {2}display has a leading, trailing or double space/m],
    [swap(SIGNOFF, 'signoff = "Two  spaces"'), /signoff has a leading, trailing or double space/],
    [swap('name = "Ada Example"', 'name = "Ada <b>\\"X\\"</b>"'), /^ {2}name holds "<"/m],
    [swap(SIGNOFF, 'signoff = "*bold* _it_ `code` | # > \\\\"'), /signoff holds "\*"/],
  ];
  for (const [profile, message] of cases) refusedEverywhere(profile, message);
});

test("AC-5: WHEN a colon is followed by a space or ends the value THEN it is ordinary text, in every mode", () => {
  const profile = swap(TAGLINE, 'tagline = "Builder: web apps"').replace(SIGNOFF, 'signoff = "Note:"')
    .replace('compact_signoff = "Go build."', 'compact_signoff = "Note:"');
  for (const mode of [[], ["--style", "compact"], ["--markdown"]]) {
    const { code, out, err } = run(mode, profile);
    assert.equal(code, 0, `${mode.join(" ")} ${err}`);
    if (mode[0] !== "--style") assert.match(out, /Builder: web apps/);
    assert.match(out, /Note:/);
  }
});

test("AC-5: WHEN text holds letters, numbers, emoji and the allowed punctuation THEN it passes in every mode", () => {
  const profile = swap(TAGLINE, "tagline = \"Café 🌱 ✔️ – it’s 1, 2; (yes) & more + ok? Sure!\"");
  for (const mode of [[], ["--style", "compact"], ["--markdown"]]) assert.equal(run(mode, profile).code, 0, mode.join(" "));
});

// The profile's own URLs, longest first, so removing one never leaves part of another.
const OWN_URLS = ["https://example.com/personal.svg", "https://garden.example.com", "https://example.com/blog/",
  "https://example.com/mark.svg", "https://github.com/example", "https://example.com"];

test("AC-5: WHEN any mode renders THEN no URL appears but the profile's own, and the HTML block has no blank line", () => {
  for (const theme of ["professional", "personal"]) {
    for (const mode of [[], ["--style", "compact"], ["--markdown"], ["--markdown", "--style", "compact"]]) {
      const { code, out } = run(["--theme", theme, ...mode], PROFILE);
      assert.equal(code, 0);
      let rest = out;
      for (const url of OWN_URLS) rest = rest.split(url).join("");
      assert.doesNotMatch(rest, /[a-z][a-z0-9+.-]*:|www\.|\/\//i, `${theme} ${mode.join(" ")}`);
      // In CommonMark a blank line ends an HTML block, and the rest renders as Markdown.
      if (!mode.includes("--markdown")) assert.doesNotMatch(out, /\n[ \t]*\n/, "one HTML block");
    }
  }
});

test("AC-5: WHEN a key has the wrong type THEN it is refused with 1 in every mode", () => {
  const garden = 'links = [{ label = "Garden", url = "https://garden.example.com" }]';
  const cases = [
    [swap('name_url = "https://example.com"', 'name_url = ["http://evil.example"]'), /name_url must be a "string"/],
    [swap(GITHUB_URL, 'url = ["http://evil.example"]'), /links\[2\]\.url must be a "string"/],
    [swap('name = "Ada Example"', 'name = ["ada@evil.example"]'), /^ {2}name must be a "string"/m],
    [swap(GITHUB_URL, "url = 42"), /links\[2\]\.url must be a "string"/],
    [swap('mark_light = "https://example.com/mark.svg"', "mark_light = true"), /mark_light must be a "string", not true/],
    [swap('name_url = "https://example.com"', 'name_url = { a = "x" }'), /name_url must be a "string"/],
    [swap('label = "Blog"', "label = 5"), /links\[1\]\.label must be a "string"/],
    [swap("mark_size = 64", "mark_size = 0"), /mark_size must be a whole number from 1 to 512, not 0/],
    [swap("mark_size = 64", "mark_size = 513"), /mark_size must be a whole number from 1 to 512, not 513/],
    [swap("compact_mark_size = 20", 'compact_mark_size = "20"'), /compact_mark_size must be a whole number/],
    [swap('theme = "professional"', 'theme = "loud"'), /theme is professional or personal, not "loud"/],
    [swap('style = "full"', "style = 3"), /style must be a "string", not 3/],
    [swap(garden, 'links = "https://example.com"'), /personal\.links must be a list/],
    [swap(garden, "links = [1]"), /personal\.links\[0\] must be a \{ label/],
    [swap(garden, 'links = [{ label = "G", url = "https://e.example", rel = "x" }]'), /personal\.links\[0\] has rel: a link has only label and url/],
  ];
  for (const [profile, message] of cases) refusedEverywhere(profile, message);
});

test("AC-5: WHEN a URL holds any whitespace THEN it is refused, not encoded", () => {
  for (const space of [" ", "\\u00a0", "\\u2028"]) {
    refusedEverywhere(swap(GITHUB_URL, `url = "https://example.com/a${space}b"`), /links\[2\]\.url holds a space/);
  }
});

test("AC-6: WHEN a value holds characters HTML or Markdown read THEN they are escaped, as a second layer", () => {
  const profile = swap('name = "Ada Example"', 'name = "Ada (Ex) & Co!"').replace(TAGLINE, "tagline = \"Ada's work\"")
    .replace('label = "Blog"', 'label = "R&D"');
  const html = run([], profile);
  assert.equal(html.code, 0, html.err);
  assert.match(html.out, /<b>Ada \(Ex\) &amp; Co!<\/b>/);
  assert.match(html.out, /<sub>Ada Dev · Ada&#39;s work<\/sub>/);
  assert.match(html.out, />R&amp;D<\/a>/);
  const md = run(["--markdown"], profile);
  assert.equal(md.code, 0, md.err);
  assert.match(md.out, /\*\*\[Ada \\\(Ex\\\) &amp; Co\\!\]\(https:\/\/example\.com\)\*\*/);
  assert.match(md.out, /\[R&amp;D\]\(https:\/\/example\.com\/blog\/\)/);
});

test("AC-6: WHEN a value holds < or \" THEN it is refused, so it can never reach the output", () => {
  refusedEverywhere(swap('name = "Ada Example"', 'name = "Ada <b>"'), /^ {2}name holds "<"/m);
  refusedEverywhere(swap('label = "Blog"', 'label = "Say \\"hi\\""'), /links\[1\]\.label holds "\\""/);
});

test("AC-6: WHEN --markdown values start a line with list or setext syntax THEN it is escaped", () => {
  const cases = [["- x", "\\- x"], ["+ x", "\\+ x"], ["1. x", "1\\. x"], ["2) x", "2\\) x"]];
  for (const [signoff, want] of cases) {
    const { code, out } = run(["--markdown"], swap(SIGNOFF, `signoff = "${signoff}"`));
    assert.equal(code, 0, signoff);
    assert.equal(out.split("\n").at(-1), want);
  }
  const { out } = run(["--markdown"], swap('display = "Ada Dev"', 'display = "---"'));
  assert.match(out, /\*\* {2}\n\\--- · Software engineer\n/, "no setext heading");
});

test("AC-7: WHEN there is no [me.signature] THEN the command says how to add one and exits 3, apart from a refused value's 1", () => {
  const { code, err } = run([], '[me]\nname = "Ada"\n');
  assert.equal(code, 3);
  assert.match(err, /No \[me\.signature\]/);
  assert.match(err, /profile\.toml/);
  assert.match(err, /npx onrails signature/);
});
