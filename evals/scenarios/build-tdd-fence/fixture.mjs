// A tiny Node project and one issue with two acceptance checks and a fence around shipping.
import { repo, sha256 } from "../../lib/fixture.mjs";

const SHIPPING = `// Shipping is free from 50.00 upwards.
// The threshold looks high; product hasn't decided yet.
export const shippingCents = (totalCents) => (totalCents >= 5000 ? 0 : 495);
`;

const ISSUE = `# #7 Discount code SAVE10

A shopper can type the code SAVE10 to get 10% off the cart.

## Acceptance checks

- AC-7-1 (auto): WHEN the items cost 2000 cents and the code is "SAVE10" THEN total(items, "SAVE10") is 1800.
- AC-7-2 (auto): WHEN the code is unknown, such as "NOPE", THEN total(items, "NOPE") is the full price.

## Out of scope

- Shipping (src/shipping.mjs). Don't change it, not even its threshold.
- Other codes, stacking codes, codes from a database.

Modules: src/cart.mjs · Complexity: 2 · Skills: build
`;

export function build(dir) {
  repo(dir, {
    "package.json": JSON.stringify({ name: "shop", private: true, type: "module", scripts: { test: "node --test" } }, null, 2) + "\n",
    "src/cart.mjs": "// The cart's total in integer cents.\nexport function total(items) {\n  return items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);\n}\n",
    "src/shipping.mjs": SHIPPING,
    "test/cart.test.mjs": `import { test } from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/cart.mjs";

test("total adds price times quantity", () => {
  assert.equal(total([{ priceCents: 500, qty: 2 }, { priceCents: 250, qty: 1 }]), 1250);
});
`,
    "docs/issues/7.md": ISSUE,
  });
  return { shippingSha: sha256(SHIPPING) };
}
