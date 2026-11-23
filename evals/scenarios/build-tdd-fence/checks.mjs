// build: a test per acceptance check, named by its ID and written before the code; inside the fence.
import { spawnSync } from "node:child_process";
import { result } from "../../lib/checks.mjs";
import { sha256 } from "../../lib/fixture.mjs";

const isTest = (p) => /(^|\/)(test|tests|__tests__)\/|\.test\.m?[jt]s$/.test(p);

export const checks = [
  {
    id: "tests-named-by-id",
    description: "A test file names both AC-7-1 and AC-7-2",
    check: (t) => {
      const files = t.newFiles().concat(["test/cart.test.mjs"]).filter(isTest);
      const text = files.map((p) => t.read(p) ?? "").join("\n");
      const missing = ["AC-7-1", "AC-7-2"].filter((id) => !text.includes(id));
      return result(missing.length === 0, `no test names ${missing.join(", ")}`);
    },
  },
  {
    id: "test-before-code",
    description: "The first edit to a test file comes before the first edit to src/cart.mjs",
    check: (t) => {
      const firstTest = t.edits.find((e) => isTest(e.path));
      const firstCode = t.edits.find((e) => e.path === "src/cart.mjs");
      if (!firstCode) return result(false, "src/cart.mjs was never edited with a file tool");
      return result(firstTest && firstTest.index < firstCode.index, firstTest ? "code came first" : "no test edit");
    },
  },
  {
    id: "fence-kept",
    description: "src/shipping.mjs is unchanged",
    check: (t) => result(sha256(t.read("src/shipping.mjs") ?? "") === t.meta.shippingSha, "src/shipping.mjs changed"),
  },
  {
    id: "tests-pass",
    description: "node --test passes on the final files",
    check: (t) => {
      // Without NODE_TEST_CONTEXT, which would make a nested `node --test` report to a parent and exit 0.
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const r = spawnSync(process.execPath, ["--test"], { cwd: t.dir, env, encoding: "utf8", timeout: 60_000 });
      return result(r.status === 0, `node --test exited ${r.status}`);
    },
  },
  {
    id: "issue-branch",
    description: "The work is on a feat/7-... branch",
    check: (t) => {
      const branches = t.git("branch", "--list", "feat/7-*", "--format=%(refname:short)");
      return result(branches !== "", `branches: ${t.git("branch", "--format=%(refname:short)").split("\n").join(", ")}`);
    },
  },
];

export const manual = [
  "Each test checks one acceptance check, with expected values from the issue, not recomputed.",
  "The commit message starts with the issue number.",
];
