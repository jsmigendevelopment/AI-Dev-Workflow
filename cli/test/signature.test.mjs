import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { signature } from "../src/signature.mjs";
import { KEYS, parseSignature } from "../src/signature-toml.mjs";
import { TEMPLATE } from "../src/profile.mjs";
import { exists, logger, put, read, tmp } from "./helpers.mjs";

const PROFILE = `[me]
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

const FULL = `<p align="center">
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

// Runs the command in a fresh project with this profile; returns the exit code and output.
function run(args, profile = PROFILE, { dir = tmp(), home = tmp() } = {}) {
  if (profile !== null) put(dir, "docs/profile.toml", profile);
  const log = logger(), error = logger();
  const code = signature(args, { dir, home, log, error });
  return { code, out: log.text(), err: error.text(), dir, home };
}

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

test("AC-4: WHEN --write README.md runs twice THEN the file is the same after both runs, with exactly one signature", () => {
  const dir = tmp();
  put(dir, "README.md", "# App\n\nSome words.\n");
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  const once = read(dir, "README.md");
  assert.equal(once, `# App\n\nSome words.\n\n---\n\n<!-- onrails:signature start -->\n${FULL}\n<!-- onrails:signature end -->\n`);
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  assert.equal(read(dir, "README.md"), once);
  assert.equal(once.match(/onrails:signature start/g).length, 1);
  assert.equal(run(["--write", "README.md", "--style", "compact"], PROFILE, { dir }).code, 0);
  const swapped = read(dir, "README.md");
  assert.equal(swapped.match(/<p align/g).length, 1, "a new block replaces the one between the markers");
  assert.ok(swapped.startsWith("# App\n\nSome words.\n\n---\n\n<!-- onrails:signature start -->\n<p align=\"center\"><a"));
});

test("AC-5: WHEN a value holds an email or a mailto: link, or a URL isn't https://, THEN it fails clearly and writes nothing", () => {
  const cases = [
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "ada@example.com"'), /tagline.*email/],
    [PROFILE.replace('url = "https://github.com/example"', 'url = "mailto:ada@example.com"'), /links.*email/],
    [PROFILE.replace('name_url = "https://example.com"', 'name_url = "http://example.com"'), /name_url.*https:\/\//],
    [PROFILE.replace('mark_light = "https://example.com/personal.svg"', 'mark_light = "/personal.svg"'), /mark_light.*https:\/\//],
    [PROFILE.replace('url = "https://github.com/example"', 'url = "MAILTO:ada@example.com"'), /links\[2\]\.url.*email/],
    [PROFILE.replace('label = "Blog"', 'label = "Mail ada@example.com"'), /links\[1\]\.label.*email/],
    [PROFILE.replace('url = "https://example.com/blog/"', 'url = "javascript:alert(1)"'), /links\[1\]\.url.*https:\/\//],
    // A newline ends the HTML block, so what follows would render as Markdown: control characters are refused.
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "x\\n\\n[click](http://evil.example)"'), /tagline.*control character/],
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "a\\tb"'), /tagline.*control character/],
    [PROFILE.replace('signoff = "Build it right."', 'signoff = "a\\u007fb"'), /signoff.*control character/],
    [PROFILE.replace('url = "https://example.com/blog/"', 'url = "https://example.com/\\r\\nx"'), /links\[1\]\.url.*control character/],
    // GitHub autolinks bare URLs in text, escaped or not: they're refused in every text value.
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "see www.evil.example"'), /tagline.*URL.*www\./],
    [PROFILE.replace('label = "Blog"', 'label = "x](javascript:alert(1)) [y"'), /links\[1\]\.label.*URL.*javascript:/],
    [PROFILE.replace('label = "Site"', 'label = "x](http://evil.example) [y"'), /links\[0\]\.label.*URL.*http:/],
    [PROFILE.replace('name = "Ada Example"', 'name = "Ada evil.example//x"'), /^ {2}name holds a URL/m],
    [PROFILE.replace('signoff = "Build it right."', 'signoff = "data:text/html,hi"'), /signoff.*URL.*data:/],
    [PROFILE.replace('mark_alt = "Ada Dev monogram"', 'mark_alt = "//evil.example"'), /mark_alt.*URL/],
    [PROFILE.replace('display = "ada"', 'display = "HTTPS://evil.example"'), /personal\.display.*URL/],
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "javascript:alert(1)"'), /tagline.*URL.*javascript:/],
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "http:x"'), /tagline.*URL.*http:/],
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "mailto:a"'), /tagline.*(email|URL)/],
    [PROFILE.replace('tagline = "Software engineer"', 'tagline = "data:x"'), /tagline.*URL.*data:/],
  ];
  for (const [profile, message] of cases) {
    for (const mode of [[], ["--markdown"], ["--style", "compact"]]) {
      const dir = tmp();
      put(dir, "README.md", "# App\n");
      const { code, err } = run(["--write", "README.md", "--theme", "personal", ...mode], profile, { dir });
      assert.equal(code, 1, `${message} ${mode.join(" ")}`);
      assert.match(err, message);
      assert.equal(read(dir, "README.md"), "# App\n", "nothing written");
    }
  }
});

test("AC-4: WHEN the markers are broken THEN --write refuses and writes nothing", () => {
  const start = "<!-- onrails:signature start -->", end = "<!-- onrails:signature end -->";
  const broken = [
    [`# T\n\n${start}\n\nKeep me.\n`, /start marker but no end marker/],
    [`# T\n\nKeep me.\n${end}\n`, /end marker but no start marker/],
    [`# T\n\n${end}\nKeep me.\n${start}\n`, /end marker comes before the start marker/],
    [`# T\n${start}\na\n${end}\n${start}\nb\n${end}\n`, /more than one/],
  ];
  for (const [text, message] of broken) {
    const dir = tmp();
    put(dir, "README.md", text);
    const { code, err } = run(["--write", "README.md"], PROFILE, { dir });
    assert.equal(code, 1, String(message));
    assert.match(err, message);
    assert.match(err, /Nothing was written/);
    assert.equal(read(dir, "README.md"), text, "nothing written");
  }
});

test("AC-4: WHEN a marker is quoted inline THEN it is left alone, and the text outside the markers is kept byte for byte", () => {
  const start = "<!-- onrails:signature start -->", end = "<!-- onrails:signature end -->";
  const quoted = `# T\r\n\r\nUse \`${start}\` and \`${end}\` around it.\r\n`;
  const dir = tmp();
  put(dir, "README.md", quoted);
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  const crlf = (text) => text.replace(/\n/g, "\r\n");
  assert.equal(read(dir, "README.md"), `${quoted.trimEnd()}${crlf(`\n\n---\n\n${start}\n${FULL}\n${end}\n`)}`, "a CRLF file stays CRLF");

  const before = "Intro  \r\n\t<em>keep</em>\n\n", after = "\n  Tail with trailing spaces   \n\n\n";
  put(dir, "README.md", `${before}${start}\nold\n${end}${after}`);
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  assert.equal(read(dir, "README.md"), `${before}${start}\n${FULL}\n${end}${after}`);
});

test("AC-6: WHEN --markdown is given THEN Markdown specials in values are escaped, so a label can't make its own link", () => {
  const profile = PROFILE.replace('label = "Blog"', 'label = "x](evil) [y"')
    .replace('name = "Ada Example"', 'name = "*Ada* _Ex_ `code` \\\\ <b> ![i]"')
    .replace('url = "https://github.com/example"', 'url = "https://example.com/a(b)"');
  const { code, out } = run(["--markdown"], profile);
  assert.equal(code, 0);
  assert.match(out, /\[x\\\]\\\(evil\\\) \\\[y\]\(https:\/\/example\.com\/blog\/\)/);
  assert.match(out, /\*\*\[\\\*Ada\\\* \\_Ex\\_ \\`code\\` \\\\ \\<b> \\!\\\[i\\\]\]\(https:\/\/example\.com\)\*\*/);
  assert.match(out, /\(https:\/\/example\.com\/a%28b%29\)/);
  assert.doesNotMatch(out, /\]\(evil/, "the label made no link of its own");
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

test("AC-5: WHEN a colon is followed by a space or ends the value THEN it is ordinary text, in every mode", () => {
  const profile = PROFILE.replace('tagline = "Software engineer"', 'tagline = "Builder: web apps"')
    .replace('signoff = "Build it right."', 'signoff = "Note:"')
    .replace('compact_signoff = "Go build."', 'compact_signoff = "Note:"');
  for (const mode of [[], ["--style", "compact"], ["--markdown"]]) {
    const { code, out, err } = run(mode, profile);
    assert.equal(code, 0, `${mode.join(" ")} ${err}`);
    if (mode[0] !== "--style") assert.match(out, /Builder: web apps/);
    assert.match(out, /Note:/);
  }
});

test("AC-4: WHEN a marker pair sits inside a fenced code block THEN it is ignored", () => {
  const start = "<!-- onrails:signature start -->", end = "<!-- onrails:signature end -->";
  for (const fence of ["```", "~~~~"]) {
    const text = `# T\n\nHow to mark it:\n\n${fence}md\n${start}\nyour signature\n${end}\n${fence}\n`;
    const dir = tmp();
    put(dir, "README.md", text);
    assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0, fence);
    const once = read(dir, "README.md");
    assert.equal(once, `${text}\n---\n\n${start}\n${FULL}\n${end}\n`, "the example in the fence is kept");
    assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
    assert.equal(read(dir, "README.md"), once, "the second run finds the real pair");
  }
});

test("AC-4: WHEN the file uses CRLF THEN the marker lines and the block keep CRLF, and a second run changes nothing", () => {
  const start = "<!-- onrails:signature start -->", end = "<!-- onrails:signature end -->";
  const crlf = (text) => text.replace(/\n/g, "\r\n");
  const dir = tmp();
  put(dir, "README.md", "a\r\nb\r\n");
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  const once = read(dir, "README.md");
  assert.equal(once, crlf(`a\nb\n\n---\n\n${start}\n${FULL}\n${end}\n`));
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  assert.equal(read(dir, "README.md"), once);
  put(dir, "README.md", crlf(`a\n\n${start}\nold\n${end}\nz\n`));
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  assert.equal(read(dir, "README.md"), crlf(`a\n\n${start}\n${FULL}\n${end}\nz\n`));
});

test("--write to a folder fails clearly with 1", () => {
  const dir = tmp();
  put(dir, "docs/x.md", "x");
  const { code, err } = run(["--write", "docs"], PROFILE, { dir });
  assert.equal(code, 1);
  assert.match(err, /^docs: .*\nNothing was written\.$/s);
});

test("AC-6: WHEN a value holds < or \" THEN it is escaped in the output", () => {
  const profile = PROFILE.replace('name = "Ada Example"', 'name = "Ada <b>\\"X\\"</b> & Co"')
    .replace('label = "Blog"', 'label = "<script>"');
  const { code, out } = run([], profile);
  assert.equal(code, 0);
  assert.match(out, /<b>Ada &lt;b&gt;&quot;X&quot;&lt;\/b&gt; &amp; Co<\/b>/);
  assert.match(out, />&lt;script&gt;<\/a>/);
  assert.doesNotMatch(out, /<script>/);
});

test("AC-7: WHEN there is no [me.signature] THEN the command says how to add one and exits 3, apart from a refused value's 1", () => {
  const { code, err } = run([], '[me]\nname = "Ada"\n');
  assert.equal(code, 3);
  assert.match(err, /No \[me\.signature\]/);
  assert.match(err, /profile\.toml/);
  assert.match(err, /npx onrails signature/);
});

test("the profile template's [me.signature] is blank, so it counts as not set up", () => {
  const template = readFileSync(new URL(`../../${TEMPLATE}`, import.meta.url), "utf8");
  const parsed = parseSignature(template);
  assert.ok(parsed, "the template has a [me.signature] table");
  assert.deepEqual(Object.keys(parsed.base).sort(), [...KEYS].sort(), "the template has every key, and only those");
  assert.equal(parsed.base.name, "");
  assert.deepEqual(parsed.base.links, []);
  assert.doesNotMatch(template, /jsmigen|Jay/i, "no real person in the public template");
  const { code } = run([], template);
  assert.equal(code, 3);
  assert.equal(exists(tmp(), "README.md"), false);
});

test("\\u and \\U escapes decode, and an unknown escape is refused", () => {
  const profile = PROFILE.replace('tagline = "Software engineer"', 'tagline = "caf\\u00e9 \\U0001F331"');
  const { code, out } = run([], profile);
  assert.equal(code, 0);
  assert.match(out, /<sub>Ada Dev · café 🌱<\/sub>/);
  const bad = run([], PROFILE.replace('tagline = "Software engineer"', 'tagline = "a\\qb"'));
  assert.equal(bad.code, 1);
  assert.match(bad.err, /tagline: unknown escape \\q/);
  assert.match(run([], PROFILE.replace('tagline = "Software engineer"', 'tagline = "\\u00g9"')).err, /tagline: \\u needs 4 hex digits/);
});

test('the TOML reader refuses """ strings and text after a value, with 1 and a clear message', () => {
  const triple = run([], PROFILE.replace('name = "Ada Example"', 'name = """Ada"""'));
  assert.equal(triple.code, 1);
  assert.match(triple.err, /\[me\.signature\] name: multi-line strings \("""\) aren't supported/);
  const junk = run([], PROFILE.replace('tagline = "Software engineer"', 'tagline = "a" junk'));
  assert.equal(junk.code, 1);
  assert.match(junk.err, /\[me\.signature\] tagline: unexpected text after the value: "junk"/);
  const afterList = run([], PROFILE.replace("]\n\n[me.signature.personal]", "] extra\n\n[me.signature.personal]"));
  assert.equal(afterList.code, 1);
  assert.match(afterList.err, /links: unexpected text after the value: "extra"/);
});

test("bad flags are refused", () => {
  assert.equal(run(["--theme", "loud"]).code, 2);
  assert.equal(run(["--style"]).code, 2);
  assert.equal(run(["--write"]).code, 2);
  assert.equal(run(["--nope"]).code, 2);
});

// Runs a profile in HTML, compact and Markdown; each must refuse it with 1, print nothing and match the message.
function refusedEverywhere(profile, message) {
  for (const mode of [[], ["--style", "compact"], ["--markdown"]]) {
    const { code, out, err } = run(mode, profile);
    assert.equal(code, 1, `${message} ${mode.join(" ")}`);
    assert.equal(out, "", "nothing printed");
    assert.match(err, message);
  }
}

test("AC-5: WHEN a key has the wrong type THEN it is refused with 1 in every mode", () => {
  const swap = (from, to) => PROFILE.replace(from, to);
  const garden = 'links = [{ label = "Garden", url = "https://garden.example.com" }]';
  const cases = [
    [swap('name_url = "https://example.com"', 'name_url = ["http://evil.example"]'), /name_url must be a "string"/],
    [swap('url = "https://github.com/example"', 'url = ["http://evil.example"]'), /links\[2\]\.url must be a "string"/],
    [swap('name = "Ada Example"', 'name = ["ada@evil.example"]'), /^ {2}name must be a "string"/m],
    [swap('url = "https://github.com/example"', "url = 42"), /links\[2\]\.url must be a "string"/],
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

test("AC-5: WHEN text holds an @ before anything but a space, or an email with any TLD, THEN it is refused", () => {
  refusedEverywhere(PROFILE.replace('tagline = "Software engineer"', 'tagline = "ada@evil.c0m"'), /tagline holds an email address/);
  refusedEverywhere(PROFILE.replace('signoff = "Build it right."', 'signoff = "ping @ada"'), /signoff holds an email address, an @/);
  refusedEverywhere(PROFILE.replace('url = "https://github.com/example"', 'url = "https://x.example/ada@evil.c0m"'), /links\[2\]\.url holds an email/);
  const ok = run(["--markdown"], PROFILE.replace('tagline = "Software engineer"', 'tagline = "Q and A @ noon"'));
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /Q and A @ noon/);
});

test("AC-5: WHEN a URL holds any whitespace THEN it is refused, not encoded", () => {
  for (const space of [" ", "\\u00a0", "\\u2028"]) {
    refusedEverywhere(PROFILE.replace('url = "https://github.com/example"', `url = "https://example.com/a${space}b"`), /links\[2\]\.url holds a space/);
  }
});

test("AC-6: WHEN --markdown values start a line with block syntax THEN it is escaped", () => {
  const cases = [["# big", "\\# big"], ["> q", "\\> q"], ["- x", "\\- x"], ["+ x", "\\+ x"], ["= x", "\\= x"], ["| x", "\\| x"],
    ["1. x", "1\\. x"], ["2) x", "2\\) x"]];
  for (const [signoff, want] of cases) {
    const { code, out } = run(["--markdown"], PROFILE.replace('signoff = "Build it right."', `signoff = "${signoff}"`));
    assert.equal(code, 0, signoff);
    assert.equal(out.split("\n").at(-1), want);
  }
  const { out } = run(["--markdown"], PROFILE.replace('display = "Ada Dev"', 'display = "---"'));
  assert.match(out, /\*\* {2}\n\\--- · Software engineer\n/, "no setext heading");
});

test("AC-4: WHEN a marker pair is indented THEN it is ignored: a 4-space code block, or a fence nested in a list", () => {
  const start = "<!-- onrails:signature start -->", end = "<!-- onrails:signature end -->";
  const texts = [
    `# T\n\nExample:\n\n    ${start}\n    your signature\n    ${end}\n`,
    `# T\n\n- Step one:\n\n    \`\`\`md\n    ${start}\n    your signature\n    ${end}\n    \`\`\`\n`,
  ];
  for (const text of texts) {
    const dir = tmp();
    put(dir, "README.md", text);
    assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
    assert.equal(read(dir, "README.md"), `${text}\n---\n\n${start}\n${FULL}\n${end}\n`, "the indented example is kept");
  }
});

test("AC-4: WHEN a line of backticks has a backtick in its info string THEN it doesn't open a fence", () => {
  const start = "<!-- onrails:signature start -->", end = "<!-- onrails:signature end -->";
  const text = `# T\n\n\`\`\` a\`b\n\n${start}\nold\n${end}\n`;
  const dir = tmp();
  put(dir, "README.md", text);
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  assert.equal(read(dir, "README.md"), `# T\n\n\`\`\` a\`b\n\n${start}\n${FULL}\n${end}\n`, "the real markers are replaced");
});

test("the TOML reader refuses unknown, dotted and duplicate keys and [[me.signature.links]], with 1", () => {
  const cases = [
    [PROFILE.replace('tagline = "Software engineer"', 'taglne = "Software engineer"'), /\[me\.signature\] taglne: not a signature key\. Did you mean tagline\?/],
    [PROFILE.replace('[me]\nname = "Ada"', '[me]\nname = "Ada"\nsignature.name = "Ada"'), /signature\.name: dotted signature keys aren't supported/],
    [`me.signature.name = "Ada"\n${PROFILE}`, /me\.signature\.name: dotted signature keys aren't supported/],
    [PROFILE.replace('display = "Ada Dev"', "mark.size = 3"), /\[me\.signature\] mark\.size: dotted keys aren't supported/],
    [PROFILE.replace('display = "Ada Dev"', 'display = "Ada Dev"\ndisplay = "Again"'), /\[me\.signature\] display: set twice/],
    [`${PROFILE}\n[[me.signature.links]]\nlabel = "x"\nurl = "https://example.com"\n`, /\[\[me\.signature\.links\]\] isn't supported/],
    [`${PROFILE}\n[me.signature.work]\nname = "x"\n`, /\[me\.signature\.work\] isn't a signature table/],
  ];
  for (const [profile, message] of cases) {
    const { code, err } = run([], profile);
    assert.equal(code, 1, String(message));
    assert.match(err, message);
  }
});
