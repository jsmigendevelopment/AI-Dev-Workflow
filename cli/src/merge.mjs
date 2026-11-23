// Merges for the two files people usually have their own copy of.

// CLAUDE.md: keep theirs, make sure it loads AGENTS.md. Returns null if nothing changes.
export function ensureAgentsImport(text) {
  if (text.split(/\r?\n/).some((line) => line.trim() === "@AGENTS.md")) return null;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const sep = text === "" || text.endsWith("\n") ? "" : eol;
  return `${text}${sep}@AGENTS.md${eol}`;
}

// .claude/settings.json: keep everything of theirs, add the kit's permissions.deny rules.
// Returns null if nothing changes. Throws if their file isn't valid JSON.
export function mergeDeny(theirsText, kitText) {
  const theirs = JSON.parse(theirsText);
  const kitDeny = JSON.parse(kitText)?.permissions?.deny ?? [];
  if (typeof theirs !== "object" || theirs === null || Array.isArray(theirs)) throw new Error("not a JSON object");
  const permissions = theirs.permissions ?? {};
  const deny = Array.isArray(permissions.deny) ? permissions.deny : [];
  const added = kitDeny.filter((rule) => !deny.includes(rule));
  if (!added.length) return null;
  theirs.permissions = { ...permissions, deny: [...deny, ...added] };
  return { text: JSON.stringify(theirs, null, 2) + "\n", added };
}
