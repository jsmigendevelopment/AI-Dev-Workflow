// signature: --write and the markers, the TOML reader, the template and the flags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMPLATE } from "../src/profile.mjs";
import { KEYS, parseSignature } from "../src/signature-toml.mjs";
import { exists, put, read, tmp } from "./helpers.mjs";
import { END, FULL, PROFILE, START, crlf, run } from "./signature-fixture.mjs";

const BLOCK = `${START}\n${FULL}\n${END}\n`;
// An earlier compact block, as --write leaves it between the markers.
const OLD = '<p align="center">By <a href="https://example.com"><b>Old Name</b></a></p>';

// Writes text to a fresh README.md, runs --write, and returns { code, err, after, dir }.
function write(text, args = []) {
  const dir = tmp();
  put(dir, "README.md", text);
  const { code, err } = run(["--write", "README.md", ...args], PROFILE, { dir });
  return { code, err, after: read(dir, "README.md"), dir };
}

test("AC-4: WHEN --write README.md runs twice THEN the file is the same after both runs, with exactly one signature", () => {
  const { code, after: once, dir } = write("# App\n\nSome words.\n");
  assert.equal(code, 0);
  assert.equal(once, `# App\n\nSome words.\n\n---\n\n${BLOCK}`);
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  assert.equal(read(dir, "README.md"), once);
  assert.equal(once.match(/onrails:signature start/g).length, 1);
  assert.equal(run(["--write", "README.md", "--style", "compact"], PROFILE, { dir }).code, 0);
  const swapped = read(dir, "README.md");
  assert.equal(swapped.match(/<p align/g).length, 1, "a new block replaces the one between the markers");
  assert.ok(swapped.startsWith(`# App\n\nSome words.\n\n---\n\n${START}\n<p align="center"><a`));
});

test("AC-4: WHEN the markers are broken, or text follows the end marker, THEN --write refuses and writes nothing", () => {
  const broken = [
    [`# T\n\n${START}\n\nKeep me.\n`, /start marker but no end marker/],
    [`# T\n\nKeep me.\n${END}\n`, /end marker but no start marker/],
    [`# T\n\n${END}\nKeep me.\n${START}\n`, /end marker comes before the start marker/],
    [`# T\n${START}\na\n${END}\n${START}\nb\n${END}\n`, /more than one/],
    [`# T\n\n${START}\nold\n${END}\n\nMore words.\n`, /text follows its signature end marker/],
    // Markers quoted in a raw HTML block aren't the README's ending, so the example is never replaced.
    [`Docs:\n\n<pre>\n${START}\nexample kept?\n${END}\n</pre>\n`, /text follows its signature end marker/],
    [`# T\n\n${BLOCK}\n<script>\n${START}\nx\n${END}\n</script>\n`, /more than one/],
  ];
  for (const [text, message] of broken) {
    const { code, err, after } = write(text);
    assert.equal(code, 1, String(message));
    assert.match(err, message);
    assert.match(err, /Nothing was written/);
    assert.equal(after, text, "nothing written");
  }
});

test("AC-4: WHEN the text between the markers isn't a block this command writes THEN --write refuses and writes nothing", () => {
  const damaged = [
    // A quoted start marker, the real one lost: pairing them would delete the text in between.
    `# T\n<pre>\n${START}\n</pre>\nmy precious text\n${END}\n`,
    `# T\n<!--\n${START}\n-->\nmy precious text\n${END}\n`,
    `# T\n\n${START}\nmy notes\n${END}\n`,
    `# T\n\n${START}\n<p align="center">\n  Built by me\n</p>\n</details>\n${END}\n`,
    `# T\n\n${START}\n<p align="center">\n\n  Built by me\n</p>\n${END}\n`,
    `# T\n\n${START}\nBuilt by **[Ada](https://example.com)**\n<em>kept</em>\n${END}\n`,
  ];
  for (const text of damaged) {
    const { code, err, after } = write(text);
    assert.equal(code, 1, text);
    assert.match(err, /isn't a signature this command writes/);
    assert.match(err, /Nothing was written/);
    assert.equal(after, text, "nothing written");
  }
});

test("AC-4: WHEN the markers hold any block this command writes, or nothing, THEN --write replaces it", () => {
  for (const mode of [[], ["--style", "compact"], ["--markdown"], ["--markdown", "--style", "compact"]]) {
    const { code, dir } = write("# T\n", mode);
    assert.equal(code, 0, mode.join(" "));
    assert.equal(run(["--write", "README.md", "--theme", "personal"], PROFILE, { dir }).code, 0, mode.join(" "));
    assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0, mode.join(" "));
    assert.equal(read(dir, "README.md"), `# T\n\n---\n\n${BLOCK}`, mode.join(" "));
  }
  assert.equal(write(`# T\n\n${START}\n${END}\n`).after, `# T\n\n${BLOCK}`);
  assert.equal(write(`# T\n\n${START}\n\n${END}\n`).after, `# T\n\n${BLOCK}`);
});

test("AC-4: WHEN there are no markers THEN only spaces, tabs and line breaks are trimmed from the end", () => {
  assert.equal(write("hello\u00a0").after, `hello\u00a0\n\n---\n\n${BLOCK}`);
  assert.equal(write("hello\u2003 \t\n\n").after, `hello\u2003\n\n---\n\n${BLOCK}`);
});

test("AC-4: WHEN the file ends inside a code fence THEN --write refuses, so it never appends inside the fence", () => {
  const texts = [
    `- item\n  \`\`\`\n  code\n\n${START}\nold\n${END}\n`,
    "# T\n\n```js\nlet a = 1;\n",
    "# T\n\n~~~\nopen\n",
  ];
  for (const text of texts) {
    const { code, err, after } = write(text);
    assert.equal(code, 1, text);
    assert.match(err, /the code fence on line \d+ never closes/);
    assert.equal(after, text);
  }
});

test("AC-4: WHEN a marker is quoted inline THEN it is left alone, and the text outside the markers is kept byte for byte", () => {
  const quoted = `# T\r\n\r\nUse \`${START}\` and \`${END}\` around it.\r\n`;
  assert.equal(write(quoted).after, `${quoted.trimEnd()}${crlf(`\n\n---\n\n${BLOCK}`)}`, "a CRLF file stays CRLF");

  const before = "Intro  \r\n\t<em>keep</em>\n\n", after = "\n\n  \n";
  assert.equal(write(`${before}${START}\n${OLD}\n${END}${after}`).after, `${before}${START}\n${FULL}\n${END}${after}`);
});

test("AC-4: WHEN a marker pair sits inside a fenced code block THEN it is ignored", () => {
  for (const fence of ["```", "~~~~"]) {
    const text = `# T\n\nHow to mark it:\n\n${fence}md\n${START}\nyour signature\n${END}\n${fence}\n`;
    const { code, after: once, dir } = write(text);
    assert.equal(code, 0, fence);
    assert.equal(once, `${text}\n---\n\n${BLOCK}`, "the example in the fence is kept");
    assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
    assert.equal(read(dir, "README.md"), once, "the second run finds the real pair");
  }
});

test("AC-4: WHEN a marker pair is indented THEN it is ignored: a 4-space code block, or a fence nested in a list", () => {
  const texts = [
    `# T\n\nExample:\n\n    ${START}\n    your signature\n    ${END}\n`,
    `# T\n\n- Step one:\n\n    \`\`\`md\n    ${START}\n    your signature\n    ${END}\n    \`\`\`\n`,
  ];
  for (const text of texts) assert.equal(write(text).after, `${text}\n---\n\n${BLOCK}`, "the indented example is kept");
});

test("AC-4: WHEN a line of backticks has a backtick in its info string THEN it doesn't open a fence", () => {
  const text = `# T\n\n\`\`\` a\`b\n\n${START}\n${OLD}\n${END}\n`;
  assert.equal(write(text).after, `# T\n\n\`\`\` a\`b\n\n${BLOCK}`, "the real markers are replaced");
});

test("AC-4: WHEN the file uses CRLF THEN the marker lines and the block keep CRLF, and a second run changes nothing", () => {
  const { after: once, dir } = write("a\r\nb\r\n");
  assert.equal(once, crlf(`a\nb\n\n---\n\n${BLOCK}`));
  assert.equal(run(["--write", "README.md"], PROFILE, { dir }).code, 0);
  assert.equal(read(dir, "README.md"), once);
  assert.equal(write(crlf(`a\n\n${START}\n${OLD}\n${END}\n`)).after, crlf(`a\n\n${BLOCK}`));
});

test("--write to a folder fails clearly with 1", () => {
  const dir = tmp();
  put(dir, "docs/x.md", "x");
  const { code, err } = run(["--write", "docs"], PROFILE, { dir });
  assert.equal(code, 1);
  assert.match(err, /^docs: .*\nNothing was written\.$/s);
});

test("the profile template's [me.signature] is blank, so it counts as not set up", () => {
  const template = readFileSync(new URL(`../../${TEMPLATE}`, import.meta.url), "utf8");
  const parsed = parseSignature(template);
  assert.ok(parsed, "the template has a [me.signature] table");
  assert.deepEqual(Object.keys(parsed.base).sort(), [...KEYS].sort(), "the template has every key, and only those");
  assert.equal(parsed.base.name, "");
  assert.deepEqual(parsed.base.links, []);
  assert.doesNotMatch(template, /jsmigen|Jay/i, "no real person in the public template");
  assert.equal(run([], template).code, 3);
  assert.equal(exists(tmp(), "README.md"), false);
});

test("\\u and \\U escapes decode, and an unknown escape is refused", () => {
  const { code, out } = run([], PROFILE.replace('tagline = "Software engineer"', 'tagline = "caf\\u00e9 \\U0001F331"'));
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

test("the TOML reader refuses unknown, dotted and duplicate keys (in a link too), [[me.signature.links]] and an inline me table, with 1", () => {
  const cases = [
    [PROFILE.replace('tagline = "Software engineer"', 'taglne = "Software engineer"'), /\[me\.signature\] taglne: not a signature key\. Did you mean tagline\?/],
    [PROFILE.replace('[me]\nname = "Ada"', '[me]\nname = "Ada"\nsignature.name = "Ada"'), /signature\.name: dotted signature keys aren't supported/],
    [`me.signature.name = "Ada"\n${PROFILE}`, /me\.signature\.name: dotted signature keys aren't supported/],
    [PROFILE.replace('display = "Ada Dev"', "mark.size = 3"), /\[me\.signature\] mark\.size: dotted keys aren't supported/],
    [PROFILE.replace('display = "Ada Dev"', 'display = "Ada Dev"\ndisplay = "Again"'), /\[me\.signature\] display: set twice/],
    [PROFILE.replace('{ label = "Site", url = "https://example.com" }', '{ label = "Site", url = "https://example.com", label = "Evil" }'),
      /\[me\.signature\] links: label is set twice in one \{ \} table\. Keep one\./],
    [`${PROFILE}\n[[me.signature.links]]\nlabel = "x"\nurl = "https://example.com"\n`, /\[\[me\.signature\.links\]\] isn't supported/],
    [`${PROFILE}\n[me.signature.work]\nname = "x"\n`, /\[me\.signature\.work\] isn't a signature table/],
    ['me = { signature = { name = "Ada", name_url = "https://example.com" } }\n', /inline tables aren't supported here\. Use a \[me\.signature\] table/],
  ];
  for (const [profile, message] of cases) {
    const { code, err } = run([], profile);
    assert.equal(code, 1, String(message));
    assert.match(err, message);
  }
});

test("a spaced [ me . signature ] header is the same table", () => {
  const { code, out } = run([], PROFILE.replace("[me.signature]\n", "[ me . signature ]\n"));
  assert.equal(code, 0);
  assert.equal(out, FULL);
});

test("bad flags are refused", () => {
  assert.equal(run(["--theme", "loud"]).code, 2);
  assert.equal(run(["--style"]).code, 2);
  assert.equal(run(["--write"]).code, 2);
  assert.equal(run(["--nope"]).code, 2);
});
