// Merges for the two files people usually have their own copy of.

// CLAUDE.md: keep theirs, make sure it loads AGENTS.md. Returns null if nothing changes.
export function ensureAgentsImport(text) {
  if (text.split(/\r?\n/).some((line) => line.trim() === "@AGENTS.md")) return null;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const sep = text === "" || text.endsWith("\n") ? "" : eol;
  return `${text}${sep}@AGENTS.md${eol}`;
}

// .claude/settings.json: keep everything of theirs, add the kit's permissions.deny and
// permissions.allow rules and the kit's hooks (an event's hook group is added only if
// none of its commands is already there). Returns null if nothing changes.
// Throws if their file isn't valid JSON.
export function mergeDeny(theirsText, kitText) {
  const theirs = JSON.parse(theirsText);
  const kit = JSON.parse(kitText) ?? {};
  if (typeof theirs !== "object" || theirs === null || Array.isArray(theirs)) throw new Error("not a JSON object");
  const added = [];
  const permissions = { ...(theirs.permissions ?? {}) };
  for (const key of ["deny", "allow"]) {
    const mine = Array.isArray(permissions[key]) ? permissions[key] : [];
    const extra = (kit.permissions?.[key] ?? []).filter((rule) => !mine.includes(rule));
    if (extra.length) {
      permissions[key] = [...mine, ...extra];
      added.push(...extra);
    }
  }
  const hooks = { ...(theirs.hooks ?? {}) };
  for (const [event, groups] of Object.entries(kit.hooks ?? {})) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
    const have = new Set(existing.flatMap((g) => (g.hooks ?? []).map((h) => h.command)));
    const fresh = groups.filter((g) => !(g.hooks ?? []).some((h) => have.has(h.command)));
    if (fresh.length) {
      hooks[event] = [...existing, ...fresh];
      added.push(`hook ${event}`);
    }
  }
  if (!added.length) return null;
  theirs.permissions = permissions;
  if (Object.keys(hooks).length) theirs.hooks = hooks;
  return { text: JSON.stringify(theirs, null, 2) + "\n", added };
}
