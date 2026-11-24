import { test } from "node:test";
import assert from "node:assert/strict";
import { absolute, rewrite } from "../../scripts/npm-readme.mjs";

const REPO = "https://github.com/jsmigendevelopment/onRails";
const RAW = "https://raw.githubusercontent.com/jsmigendevelopment/onRails/main";

test("relative links and images become absolute, so they work on npm", () => {
  assert.equal(absolute("guide/cheat-sheet.md#-model-routing", "."), `${REPO}/blob/main/guide/cheat-sheet.md#-model-routing`);
  assert.equal(absolute("assets/banner.svg", "."), `${RAW}/assets/banner.svg`);
  assert.equal(absolute("../README.md#install-as-a-plugin", "cli"), `${REPO}#install-as-a-plugin`);
  assert.equal(absolute("../RELEASING.md", "cli"), `${REPO}/blob/main/RELEASING.md`);
});

test("anchors and full URLs are left alone", () => {
  for (const url of ["#-install", "https://me.jsmigen.dev", "mailto:x@example.com"]) assert.equal(absolute(url, "."), url);
});

test("rewrite covers markdown links and src/href attributes", () => {
  const out = rewrite('<img src="assets/a.svg"> [x](LICENSE) <a href="#top">t</a>', ".");
  assert.equal(out, `<img src="${RAW}/assets/a.svg"> [x](${REPO}/blob/main/LICENSE) <a href="#top">t</a>`);
});

test("rewrite makes <source srcset> absolute, so dark images work off GitHub's root", () => {
  const out = rewrite('<source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">', ".");
  assert.match(out, /srcset="https:\/\/raw\.githubusercontent\.com\/jsmigendevelopment\/onRails\/main\/assets\/banner-dark\.svg"/);
});
