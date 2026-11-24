// signature: what text values may hold. Text is NFC first, then allowlisted, in every mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE, refusedEverywhere, run } from "./signature-fixture.mjs";

const swap = (from, to) => PROFILE.replace(from, to);
const TAGLINE = 'tagline = "Software engineer"';
const SIGNOFF = 'signoff = "Build it right."';
const tagline = (text) => swap(TAGLINE, `tagline = "${text}"`);
const MODES = [[], ["--style", "compact"], ["--markdown"]];

// Passes in every mode; returns the full HTML block.
function passes(profile) {
  for (const mode of MODES) {
    const { code, err } = run(mode, profile);
    assert.equal(code, 0, `${mode.join(" ")} ${err}`);
  }
  return run([], profile).out;
}

test("AC-5: WHEN text holds a bare URL, a scheme or an email THEN it is refused in every mode", () => {
  const cases = [
    [swap(TAGLINE, 'tagline = "see www.evil.example"'), /tagline holds a URL.*www\./],
    [swap('label = "Site"', 'label = "x](http://evil.example) [y"'), /links\[0\]\.label holds a URL.*http:/],
    [swap(SIGNOFF, 'signoff = "data:text/html,hi"'), /signoff holds a URL.*data:/],
    [swap('display = "ada"', 'display = "HTTPS://evil.example"'), /personal\.display holds a URL/],
    [swap(TAGLINE, 'tagline = "javascript:alert(1)"'), /tagline holds a URL.*javascript:/],
    [swap(TAGLINE, 'tagline = "http:x"'), /tagline holds a URL.*http:/],
    [swap(TAGLINE, 'tagline = "mailto:a"'), /tagline holds an email/],
    [swap(TAGLINE, 'tagline = "data:x"'), /tagline holds a URL.*data:/],
    [swap(TAGLINE, 'tagline = "ada@evil.c0m"'), /tagline holds an email/],
  ];
  for (const [profile, message] of cases) refusedEverywhere(profile, message);
});

test("AC-6: WHEN text holds a character outside the allowlist, such as @, a backtick or * THEN it is refused in every mode", () => {
  const cases = [
    // A newline ends the HTML block, so what follows would render as Markdown.
    [swap(TAGLINE, 'tagline = "x\\n\\n[click](http://evil.example)"'), /tagline holds a control character/],
    [swap(TAGLINE, 'tagline = "a\\tb"'), /tagline holds a control character/],
    [swap(SIGNOFF, 'signoff = "a\\u007fb"'), /signoff holds a control character/],
    [swap('url = "https://example.com/blog/"', 'url = "https://example.com/\\r\\nx"'), /links\[1\]\.url holds a control character/],
    [swap('label = "Blog"', 'label = "x](javascript:alert(1)) [y"'), /links\[1\]\.label holds "\]"/],
    [swap('name = "Ada Example"', 'name = "Ada evil.example//x"'), /^ {2}name holds "\/"/m],
    [swap('mark_alt = "Ada Dev monogram"', 'mark_alt = "//evil.example"'), /mark_alt holds "\/"/],
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

test("AC-6: WHEN text holds letters, numbers, emoji and the allowed punctuation THEN it passes in every mode", () => {
  const profile = swap(TAGLINE, "tagline = \"Café 🌱 ✔️ – it’s 1, 2; (yes) & more + ok? Sure!\"");
  for (const mode of [[], ["--style", "compact"], ["--markdown"]]) assert.equal(run(mode, profile).code, 0, mode.join(" "));
});

// markdown-it 14.1.0 with linkify links every one of these, so a full stop between two characters is refused.
test("AC-5: WHEN text holds a full stop with a character on both sides THEN it is refused in every mode, as a domain", () => {
  const STOP = /holds a full stop between two characters/;
  const cases = [
    [tagline("evil.com"), /^ {2}tagline holds a full stop between two characters \("l\.c"\)/m],
    [tagline("See EVIL.COM now"), STOP],
    [swap(SIGNOFF, 'signoff = "Go to sub.evil.co."'), /signoff holds a full stop/],
    [swap('display = "ada"', 'display = "ѡѡѡ.com"'), /personal\.display holds a full stop/],
    [swap('mark_alt = "Ada Dev monogram"', 'mark_alt = "x2.dev logo"'), /mark_alt holds a full stop/],
    // The review's probes: a label ending in a mark, an invisible joiner or an emoji.
    [tagline("evil️.com"), STOP],
    [tagline("evil͏.com"), STOP],
    [tagline("eviĺ.com"), STOP],
    [tagline("eviĺ.com"), STOP],
    [tagline("\u{1F525}.ws"), STOP],
    [tagline("1️⃣.com"), STOP],
    [tagline("\u{1F1FA}\u{1F1F8}.com"), STOP],
    // The accepted cost: tech names and version numbers go in a link label, or lose the dot.
    [tagline("Built with Node.js"), STOP],
    [tagline("Version 2.0"), STOP],
    [tagline("e.g. this"), STOP],
    [tagline("Wait...what"), STOP],
  ];
  for (const [profile, message] of cases) refusedEverywhere(profile, message);
});

test("AC-5: WHEN a full stop is followed by a space or ends the value, or sits in a link label, THEN it is ordinary text", () => {
  const profile = tagline("Build it right. Ship it.").replace('label = "Blog"', 'label = "Node.js"');
  assert.match(passes(profile), /<sub>Ada Dev · Build it right\. Ship it\.<\/sub>[\s\S]*>Node\.js<\/a>/);
  assert.match(run(["--markdown"], profile).out, /\[Node\.js\]\(https:\/\/example\.com\/blog\/\)/);
});

test("AC-6: WHEN text is decomposed THEN it is checked and printed as NFC", () => {
  assert.match(passes(tagline("Café")), /<sub>Ada Dev · Café<\/sub>/);
});

test("AC-6: WHEN a combining mark is left after NFC, or an invisible character is used, THEN it is refused", () => {
  const cases = [
    [tagline("a️"), /tagline holds a combining mark \(U\+FE0F\)/],
    [tagline("a︎"), /tagline holds a combining mark \(U\+FE0E\)/],
    [tagline("a\u{E0100}"), /tagline holds a combining mark \(U\+E0100\)/],
    [tagline("é́́"), /tagline holds a combining mark \(U\+0301\)/],
    [tagline("a⃣"), /tagline holds a combining mark \(U\+20E3\)/],
    [tagline("कि"), /tagline holds a combining mark \(U\+093F\)/],
  ];
  for (const char of ["034F", "180B", "180C", "180D", "180E", "180F", "3164", "115F", "1160", "FFA0", "2800"]) {
    cases.push([tagline(`a\\u${char}b`), new RegExp(`tagline holds an invisible character \\(U\\+${char}\\)`)]);
  }
  for (const [profile, message] of cases) refusedEverywhere(profile, message);
});

test("AC-6: WHEN text holds skin-tone, joined, keycap or flag emoji THEN it passes", () => {
  const text = "Coder \u{1F469}‍\u{1F4BB} \u{1F44D}\u{1F3FD} ❤️‍\u{1F525} 1️⃣ \u{1F1FA}\u{1F1F8}\u{1F1EB}\u{1F1F7}"
    + " \u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F} \u{1F3F4}‍☠️";
  assert.ok(passes(tagline(text)).includes(`<sub>Ada Dev · ${text}</sub>`));
});

test("AC-6: WHEN an emoji piece stands alone, or a flag isn't in its exact form, THEN it is refused", () => {
  const cases = [
    [tagline("w‍ww"), /tagline holds "‍"/],
    [tagline("\u{1F469}‍"), /tagline holds "‍"/],
    [tagline("a\u{1F3FD}"), /tagline holds "\u{1F3FD}"/u],
    [tagline("\u{1F1FA}"), /tagline holds "\u{1F1FA}"/u],
    [tagline("\u{1F1FA}\u{1F1F8}\u{1F1EB}"), /tagline holds "\u{1F1EB}"/u],
    // Tag characters only after the black flag, two letters and one to four letters or digits, then the cancel tag.
    [tagline("\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}"), /tagline holds "\u{E0067}"/u],
    [tagline("\u{1F3F4}\u{E0067}\u{E007F}"), /tagline holds "\u{E0067}"/u],
    [tagline("\u{1F3F4}\u{E0047}\u{E0042}\u{E0073}\u{E007F}"), /tagline holds "\u{E0047}"/u],
    [tagline("a\u{E0067}\u{E0062}\u{E0065}\u{E007F}"), /tagline holds "\u{E0067}"/u],
    [tagline("\u{E007F}"), /tagline holds "\u{E007F}"/u],
  ];
  for (const [profile, message] of cases) refusedEverywhere(profile, message);
});
