// Shared by the AC-5 scenarios of #101: a planned repo with no GitHub, its issues as files in docs/issues/.

/** A tiny issue file with a Status line. */
export const issue = (n, title, body, check) => `# #${n} ${title}

Status: ready

${body}

## Acceptance checks

- AC-${n}-1 (auto): ${check}

Try: \`npm test\` passes. · Complexity: 1 · Skills: build
`;

export const ISSUES_README = "Issues are files here: docs/issues/<number>.md, each with a `Status:` line. Labels go on a `Labels:` line. Comments go at the end, under `## Comments`.\n";

export const PACKAGE = JSON.stringify({ name: "tidy", private: true, type: "module",
  scripts: { test: "node --test", check: "node --test" } }, null, 2) + "\n";

const branches = (t) => t.git("branch", "--format=%(refname:short)").split("\n").map((b) => b.trim()).filter(Boolean);

/** Issue n was built: a feat/<n>-… branch with a commit past the start, or such a commit whose message starts with #<n>. */
export function built(t, n) {
  const start = t.meta.start;
  const branch = branches(t).some((b) => b.startsWith(`feat/${n}-`) && Number(t.git("rev-list", "--count", `${start}..${b}`)) > 0);
  if (branch) return true;
  const subjects = t.git("log", "--all", "--format=%s", `^${start}`).split("\n");
  return subjects.some((s) => new RegExp(`^#0*${n}\\b`).test(s.trim()));
}

/** Every version of a file: the working tree's, then each local branch's that has it. */
export function versions(t, path) {
  const out = [t.read(path) ?? ""];
  for (const b of branches(t)) if (t.git("ls-tree", "--name-only", b, "--", path)) out.push(t.git("show", `${b}:${path}`));
  return out;
}
