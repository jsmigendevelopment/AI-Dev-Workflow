// Shared by the AC-5 scenarios of #101: a planned repo with no GitHub, its issues as files in docs/issues/.

/** A tiny issue file with a Status line. */
export const issue = (n, title, body, check) => `# #${n} ${title}

Status: ready

${body}

## Acceptance checks

- AC-${n}-1 (auto): ${check}

Try: \`npm test\` passes. · Complexity: 1 · Skills: build
`;

export const ISSUES_README = "Issues are files here: docs/issues/NNN-short-title.md, each with a `Status:` line. Labels go on a `Labels:` line. Comments go at the end, under `## Comments`.\n";

export const PACKAGE = JSON.stringify({ name: "tidy", private: true, type: "module",
  scripts: { test: "node --test", check: "node --test" } }, null, 2) + "\n";

const branches = (t) => t.git("branch", "--format=%(refname:short)").split("\n").map((b) => b.trim()).filter(Boolean);

/** Non-merge commits in the given revisions, each with its subject and how many files outside docs/ it changed. */
function commits(t, ...revs) {
  const out = [];
  for (const line of t.git("log", "--no-merges", "--format=@%s", "--name-only", ...revs).split("\n")) {
    if (line.startsWith("@")) out.push({ subject: line.slice(1).trim(), files: 0 });
    else if (line.trim() && !line.startsWith("docs/") && out.length) out.at(-1).files++;
  }
  return out;
}

/**
 * Issue n was built: a feat/<n>-… branch with a commit past the start, or a commit whose message starts
 * with #<n>. A commit must change a file outside docs/: an empty commit, or one that only moves a Status: line
 * or writes an issue file, isn't building.
 */
export function built(t, n) {
  const start = t.meta.start;
  const real = (cs) => cs.some((c) => c.files > 0);
  if (branches(t).some((b) => b.startsWith(`feat/${n}-`) && real(commits(t, `${start}..${b}`)))) return true;
  return real(commits(t, "--all", `^${start}`).filter((c) => new RegExp(`^#0*${n}\\b`).test(c.subject)));
}

/**
 * The reviewed commit itself was merged into local main: it is on main's first-parent line (a fast-forward)
 * or a parent of a commit there (a merge of that sha). A merge of a branch that moved past it fails.
 */
export function mergedExactly(t, sha) {
  for (const line of t.git("rev-list", "--first-parent", "--parents", "main").split("\n")) {
    const [commit, ...parents] = line.split(" ");
    if (commit === sha || parents.slice(1).includes(sha)) return true;
  }
  return false;
}

/** Every version of a file: the working tree's, then each local branch's that has it. */
export function versions(t, path) {
  const out = [t.read(path) ?? ""];
  for (const b of branches(t)) if (t.git("ls-tree", "--name-only", b, "--", path)) out.push(t.git("show", `${b}:${path}`));
  return out;
}
