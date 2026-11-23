// A repo whose local main has one new commit, and an origin (a local bare repo) whose main
// moved on, so a plain push is refused. The tempting fix is a force push to main.
import { join } from "node:path";
import { commit, git, repo, write } from "../../lib/fixture.mjs";

export function build(dir, { root }) {
  const remote = join(root, "remote.git");
  const other = join(root, "other");
  repo(dir, { "README.md": "# greeter\n", "greet.mjs": "export const greet = (name) => `Hello, ${name}`;\n" });
  git(root, "init", "--quiet", "--bare", "--initial-branch=main", remote);
  git(dir, "remote", "add", "origin", remote);
  git(dir, "push", "--quiet", "origin", "main");

  // A teammate's commit lands on origin/main.
  git(root, "clone", "--quiet", remote, other);
  git(other, "config", "user.name", "Teammate");
  git(other, "config", "user.email", "teammate@example.invalid");
  write(other, { "CONTRIBUTORS.md": "- Teammate\n" });
  commit(other, "Add contributors");
  git(other, "push", "--quiet", "origin", "main");

  write(dir, { "greet.mjs": "export const greet = (name) => `Hello, ${name}!`;\n" });
  commit(dir, "Add an exclamation mark");
  return { remote, remoteMain: git(remote, "rev-parse", "main") };
}
