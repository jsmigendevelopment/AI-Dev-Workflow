// The person's onRails folder: ~/.onrails (profile, boards, presence, work log, held pings).
// Before the rename it was ~/.ai-dev-workflow. While only the old folder exists, everything
// reads and writes it there, and the CLI offers to move it. Nothing is moved or deleted
// without a yes.
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FAIL, INFO } from "./marks.mjs";
import { confirm } from "./prompt.mjs";

export const HOME_NAME = ".onrails";
export const OLD_HOME_NAME = ".ai-dev-workflow";

const paths = (home = homedir()) => ({ now: join(home, HOME_NAME), old: join(home, OLD_HOME_NAME) });

// The folder to use: the new one, unless only the old one exists.
export function homeDir(home = homedir()) {
  const { now, old } = paths(home);
  return !existsSync(now) && existsSync(old) ? old : now;
}

export const onlyOldHome = (home = homedir()) => {
  const { now, old } = paths(home);
  return !existsSync(now) && existsSync(old);
};

function move(home) {
  const { now, old } = paths(home);
  try {
    renameSync(old, now);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    // A home folder split across disks: copy, then remove the old one (the person said yes).
    cpSync(old, now, { recursive: true });
    rmSync(old, { recursive: true, force: true });
  }
}

// On a run of the CLI: offer to move ~/.ai-dev-workflow to ~/.onrails. A no keeps using
// the old folder. --yes moves it without asking.
export async function offerHomeMove({ home = homedir(), ask, yes = false, log = console.log } = {}) {
  if (!onlyOldHome(home)) return false;
  log(`Found ~/${OLD_HOME_NAME}, the folder onRails used before its rename. Reading from it.`);
  const ok = yes || (ask && (await confirm(ask, `Move it to ~/${HOME_NAME}? Nothing is deleted.`)));
  if (!ok) {
    log(`Kept ~/${OLD_HOME_NAME}. Everything keeps working. To move it later, run any onrails command with --yes.`);
    return false;
  }
  move(home);
  log(`Moved ~/${OLD_HOME_NAME} to ~/${HOME_NAME}.`);
  return true;
}

// For doctor: one line when the old folder is still around.
export function homeChecks({ home = homedir() } = {}) {
  const { now, old } = paths(home);
  if (!existsSync(old)) return [];
  if (!existsSync(now)) {
    return [{
      status: FAIL, required: false,
      label: `Your onRails folder still has its old name, ~/${OLD_HOME_NAME} (it still works)`,
      fix: `Run: npx onrails doctor --fix, to move it to ~/${HOME_NAME}`,
      remedy: { action: { describe: `move ~/${OLD_HOME_NAME} to ~/${HOME_NAME}`, run: () => move(home) } },
    }];
  }
  return [{ status: INFO, label: `~/${OLD_HOME_NAME} is still there next to ~/${HOME_NAME}. onRails uses ~/${HOME_NAME}; delete the old one once you've checked it` }];
}
