// A repo on Full automation with a kit from before the Full override (#143). Those kits still stop for
// gates that Full and the person's recorded decisions lift. doctor and update both say so.
import { existsSync, readFileSync } from "node:fs";
import { toNative } from "./files.mjs";

/** The first kit with `automation`'s central Full override, where Full stopped asking. */
export const FULL_OVERRIDE_KIT = "0.7.0";

/** The automation level in docs/stack.md ("- **Level:** full"), the same read as agent-files.mjs. */
export function automationLevel(projectDir) {
  const path = toNative(projectDir, "docs/stack.md");
  if (!existsSync(path)) return "recommended";
  return readFileSync(path, "utf8").match(/\*\*Level:\*\*\s*`?([a-z-]+)/i)?.[1].toLowerCase() ?? "recommended";
}

const parts = (v) => String(v).split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);

/** True when version a comes before version b, comparing major, minor and patch as numbers. */
export function olderThan(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/** The warning for a repo on Full with an old kit, or null. */
export function fullOnOldKit(projectDir, kitVersion) {
  if (!kitVersion || automationLevel(projectDir) !== "full" || !olderThan(kitVersion, FULL_OVERRIDE_KIT)) return null;
  return `Full automation on kit v${kitVersion}: kits before v${FULL_OVERRIDE_KIT} still stop for gates that Full and your decisions lift`;
}
