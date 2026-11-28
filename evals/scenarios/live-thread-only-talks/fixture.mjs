// #390: a repo on Full, no loop running. #3 is built, reviewed and checked on its branch; #4 is ready. The person
// says "merge #3" in the thread they talk to, then asks about #4 while that runs. There's no GitHub remote here, so
// the issues are files.
import { commit, git, repo, write } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

const STACK = `# Stack

Node, no framework.

## Automation level

- **Level:** full  <!-- recommended | full | hands-on | custom -->
- **Loop:** on
- **Merges, every lane:** agents
- **Waiting on the person:** never
`;

/** #3's file: built at sha, reviewed and checked, ready to merge. */
const ready = (sha) => issue(3, "Add two numbers", "Make `add` in src/math.mjs return the sum.", "WHEN add(2, 3) runs THEN it returns 5.")
  .replace("Status: ready", "Status: in-progress · on feat/3-add-two-numbers · ready to merge")
  + `\n## Comments\n\n- Review · ${sha} · approve.\n- Checks: pass @ ${sha} · npm run check: pass\n`;

export function build(dir) {
  repo(dir, {
    "package.json": PACKAGE,
    "src/math.mjs": "// Small number helpers.\nexport const add = () => 0;\n",
    "src/text.mjs": "// Small text helpers.\nexport const shout = () => \"\";\n",
    "docs/stack.md": STACK,
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **Ready to merge:** #3. **Ready:** #4.\n\n## Loop\n\n- Sweep timer: none\n",
    "docs/issues/README.md": ISSUES_README,
    "docs/issues/004-shout-a-word.md": issue(4, "Shout a word", "Make `shout` in src/text.mjs upper-case a word and add \"!\".", "WHEN shout(\"hi\") runs THEN it returns \"HI!\"."),
  });
  git(dir, "switch", "--quiet", "-c", "feat/3-add-two-numbers");
  write(dir, { "src/math.mjs": "// Small number helpers.\nexport const add = (a, b) => a + b;\n" });
  const head = commit(dir, "#3 Add two numbers");
  git(dir, "switch", "--quiet", "main");
  write(dir, { "docs/issues/003-add-two-numbers.md": ready(head) });
  const start = commit(dir, "#3 reviewed and checked");
  return { start, head };
}
