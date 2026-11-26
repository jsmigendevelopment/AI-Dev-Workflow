// ci local [dir] [--dry-run] [--yes] (#133, part of #98): move a repo off GitHub Actions in one command.
// It turns Actions off (PUT /repos/{owner}/{repo}/actions/permissions, enabled=false), then opens an issue and a pull
// request on fix/<n>-no-actions that removes .github/workflows/ and writes ci = "local" to docs/stack.md.
// Actions goes off first: while it's on, the issue and the pull request could start a workflow (issues,
// pull_request_target). The commit is made in a temp worktree from the default branch, so your checkout isn't touched.
// On Full automation it asks nothing; on other levels it asks once. --dry-run only reads.
// #200: it never deletes or writes through a symlink committed on the default branch, removes its worktree after a
// Ctrl-C, and deletes the local branch once it is pushed.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { automationLevel } from "./full-kit.mjs";
import { writeFile } from "./files.mjs";
import { CI_FIX, githubRepo } from "./preflight-ci.mjs";
import { confirm } from "./prompt.mjs";

/** git or gh with no shell: { ok, out, err, signal }, trimmed. signal names what stopped it, as after a Ctrl-C. */
export function realRun(cmd, args, { cwd } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) return { ok: false, out: "", err: r.error.message };
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim(), signal: r.signal ?? undefined };
}

const CI_LINE = /^ci[ \t]*=.*$/m;
/** docs/stack.md's text with ci = "local": the ci line replaced in place, or a section added at the end. */
export function withCiLocal(text = "") {
  if (CI_LINE.test(text)) return text.replace(CI_LINE, 'ci = "local"');
  const base = text && !text.endsWith("\n") ? `${text}\n` : text;
  return `${base}${base ? "\n" : "# Stack\n\n"}## Checks and deploys\n\nci = "local"\n`;
}

const firstLine = (r) => (r.signal ? `stopped by ${r.signal}` : (r.err || r.out || "no output").split("\n")[0]);
const json = (r) => {
  try { return JSON.parse(r.out); } catch { return {}; } // not JSON: the caller reports the missing field
};
const SAFE_REF = /^(?!-)[\w./-]+$/;

// The pull request removes the default branch's workflow files, so the plan lists those, not the checkout's (#200).
// It reads git's own copy (origin/HEAD, as last fetched): a dry run stays offline and calls no API.
function defaultBranchFiles(root, run) {
  const head = run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: root });
  if (!head.ok || !SAFE_REF.test(head.out)) return null;
  const tree = run("git", ["ls-tree", "-z", head.out, "--", ".github/workflows/"], { cwd: root });
  if (!tree.ok) return null;
  // Each entry is "<mode> <type> <sha>\t<path>". Only files count, as in workflowFiles: GitHub reads no subfolder.
  const entries = tree.out.split("\0").filter(Boolean).map((entry) => entry.split("\t"));
  return { ref: head.out, files: entries.filter(([meta]) => meta.split(" ")[1] !== "tree").map(([, path]) => path).sort() };
}

function plan(repo, listed, log, dryRun) {
  log(`onrails ci local: move ${repo} off GitHub Actions${dryRun ? " (dry run, nothing changed)" : ""}`);
  log(`  1. Turn Actions off: PUT /repos/${repo}/actions/permissions enabled=false`);
  log(`  2. Open an issue, then a pull request on fix/<n>-no-actions from the default branch${listed ? ` (${listed.ref})` : ""} that:`);
  if (!listed) log("       removes .github/workflows/ (git can't name the default branch to list it: git remote set-head origin --auto)");
  else if (!listed.files.length) log("       removes .github/workflows/, if the default branch still has it");
  for (const file of listed?.files ?? []) log(`       removes ${file}`);
  log('       writes ci = "local" to docs/stack.md');
}

export async function ciLocal(dir = ".", { dryRun = false, ask, yes = false, log = console.log, run = realRun } = {}) {
  const top = run("git", ["rev-parse", "--show-toplevel"], { cwd: resolve(dir) });
  if (!top.ok) return log(`Not a git repo: ${resolve(dir)}. Run ${CI_FIX} in the repo.`), 1;
  const root = resolve(top.out);
  const remote = run("git", ["remote", "get-url", "origin"], { cwd: root });
  const repo = remote.ok ? githubRepo(remote.out) : null;
  if (!repo) return log("This repo has no GitHub remote (origin), so there is no Actions setting to turn off. Delete .github/workflows/ by hand."), 1;
  plan(repo, defaultBranchFiles(root, run), log, dryRun);
  if (dryRun) return 0;
  if (!yes && automationLevel(root) !== "full" && !(ask && (await confirm(ask, "Turn Actions off and open the pull request?")))) {
    return log("Nothing changed."), 0;
  }
  const off = run("gh", ["api", "--method", "PUT", `repos/${repo}/actions/permissions`, "-F", "enabled=false"], { cwd: root });
  if (!off.ok) {
    log(`Couldn't turn Actions off for ${repo}: ${firstLine(off)}. It needs admin rights on the repo (gh auth login as an admin).`);
    return log("Nothing else was done, so nothing could start a workflow."), 1;
  }
  log(`✓ Actions is off for ${repo}`);
  return pullRequest(root, repo, { run, log });
}

const SIGNALS = ["SIGINT", "SIGTERM"];
// Each step below is a synchronous git or gh. A Ctrl-C stops the child that is running, its step fails, and finally
// removes the worktree. This listener only keeps Node from dying before finally runs (#200).
const stayForCleanup = () => {};

// The issue and the pull request, from a temp worktree of the default branch.
function pullRequest(root, repo, { run, log }) {
  const base = json(run("gh", ["api", `repos/${repo}`], { cwd: root })).default_branch;
  if (!SAFE_REF.test(base ?? "")) return log(`Couldn't read ${repo}'s default branch, so no pull request was opened.`), 1;
  const fetched = run("git", ["fetch", "origin", base], { cwd: root });
  if (!fetched.ok) return log(`git fetch origin ${base} failed: ${firstLine(fetched)}`), 1;
  const parent = mkdtempSync(join(tmpdir(), "onrails-ci-local-"));
  const tree = join(parent, "checkout");
  const made = { branch: null, pushed: false };
  for (const signal of SIGNALS) process.on(signal, stayForCleanup);
  try {
    const added = run("git", ["worktree", "add", "--detach", tree, `origin/${base}`], { cwd: root });
    if (!added.ok) return log(`git worktree add failed: ${firstLine(added)}`), 1;
    return commitAndOpen(tree, repo, base, { run, log, made });
  } finally {
    run("git", ["worktree", "remove", "--force", tree], { cwd: root });
    rmSync(parent, { recursive: true, force: true });
    // Pushed, the branch is on GitHub; unpushed, the local branch is the only copy of the commit.
    const deleted = made.pushed && run("git", ["branch", "-D", made.branch], { cwd: root }).ok;
    if (made.branch && !deleted) log(`The local branch ${made.branch} is kept: git push -u origin ${made.branch} sends it.`);
    for (const signal of SIGNALS) process.off(signal, stayForCleanup);
  }
}

// Every part of what the commit deletes or writes, parents first. One committed as a symlink on the default branch
// would take the delete or the write outside the worktree (#200).
const TOUCHED = [".github", ".github/workflows", "docs", "docs/stack.md"];
function symlinkIn(tree) {
  return TOUCHED.find((path) => {
    try {
      return lstatSync(join(tree, path)).isSymbolicLink();
    } catch {
      return false; // not there: nothing to follow
    }
  });
}

function commitAndOpen(tree, repo, base, { run, log, made }) {
  const link = symlinkIn(tree);
  if (link) {
    log(`Stopped: ${link} is a symlink on ${repo}'s ${base}. A delete or a write through it could reach outside the repo.`);
    return log(`Replace it with the real folder or file, then run ${CI_FIX} again. Actions is off; nothing else was done.`), 1;
  }
  rmSync(join(tree, ".github", "workflows"), { recursive: true, force: true });
  const stack = join(tree, "docs", "stack.md");
  writeFile(stack, withCiLocal(existsSync(stack) ? readFileSync(stack, "utf8") : ""));
  const changed = run("git", ["status", "--porcelain"], { cwd: tree });
  if (!changed.ok) return log(`git status failed: ${firstLine(changed)}. No issue was opened; Actions is off.`), 1;
  if (!changed.out) return log(`${repo}'s ${base} has no workflow files and says ci = "local" already: no pull request needed.`), 0;
  const opened = run("gh", ["api", "--method", "POST", `repos/${repo}/issues`, "-f", "title=Move off GitHub Actions",
    "-f", `body=Remove .github/workflows/ and record ci = "local" in docs/stack.md. Actions is already off for this repo (${CI_FIX}).`], { cwd: tree });
  const issue = json(opened).number;
  if (!Number.isInteger(issue)) return log(`Couldn't open the issue on ${repo} (${firstLine(opened)}), so no pull request was opened.`), 1;
  const branch = `fix/${issue}-no-actions`;
  for (const args of [["switch", "-c", branch], ["add", "-A"],
    ["commit", "-q", "-m", `#${issue} Move off GitHub Actions: remove .github/workflows/, ci = "local"`], ["push", "-u", "origin", branch]]) {
    const r = run("git", args, { cwd: tree });
    if (!r.ok) return log(`git ${args[0]} failed: ${firstLine(r)}. Issue #${issue} is open; Actions is off.`), 1;
    if (args[0] === "switch") made.branch = branch;
  }
  made.pushed = true;
  const body = `Closes #${issue}\n\nRemoves .github/workflows/ and writes ci = "local" to docs/stack.md: every check, preview and deploy runs `
    + `from the agent's session. Actions is already off for this repo. This changes .github/ and docs/stack.md, so the agent-file guard `
    + "reviews it before it merges.\n\nOpened by `" + CI_FIX + "`.";
  const pr = json(run("gh", ["api", "--method", "POST", `repos/${repo}/pulls`, "-f", "title=Move off GitHub Actions", "-f", `head=${branch}`,
    "-f", `base=${base}`, "-f", `body=${body}`], { cwd: tree }));
  if (!pr.html_url) return log(`Pushed ${branch}, but couldn't open the pull request. Open it from ${branch} to ${base}.`), 1;
  log(`✓ Pull request: ${pr.html_url} (${branch}, closes #${issue})`);
  return 0;
}
