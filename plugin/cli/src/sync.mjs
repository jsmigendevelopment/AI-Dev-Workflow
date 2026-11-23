// The engine behind init and update: compare the kit with the project and the manifest
// of what was installed last time, plan what to do with each file, then apply the plan.
// init is a sync against an empty manifest. The manifest maps each installed path to the
// sha256 of the kit's copy last installed (or offered as .onrails-new) there.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { hash, hashFile, pruneEmptyDirs, toNative, writeFile } from "./files.mjs";
import { ensureAgentsImport, mergeDeny } from "./merge.mjs";
import { NEW_SUFFIX, OLD_NEW_SUFFIX, OLD_PROJECT_MANIFEST, PROJECT_MANIFEST } from "./kit.mjs";

// If the person has their own copy of these, the kit's goes next to it.
const ALT = { "AGENTS.md": "AGENTS.onrails.md", ".codex/config.toml": ".codex/config.onrails.toml" };
// The same files' names before the rename to onRails. A manifest that records one is
// moved to the new name (see renameOldAlts).
const OLD_ALT = { "AGENTS.md": "AGENTS.kit.md", ".codex/config.toml": ".codex/config.kit.toml" };
// If the person has their own copy of these, the kit's is merged into it.
const MERGE = {
  "CLAUDE.md": (theirs) => ensureAgentsImport(theirs),
  ".claude/settings.json": (theirs, kit) => mergeDeny(theirs, kit),
};

export function plan(projectDir, kit, recorded = {}) {
  const { oldFiles, actions } = renameOldAlts(projectDir, recorded);
  const targets = new Set(actions.map((a) => a.target));
  for (const path of Object.keys(kit.core)) {
    const action = planFile(projectDir, path, kit.readCore(path), oldFiles);
    targets.add(action.target);
    actions.push(action);
  }
  for (const [target, recorded] of Object.entries(oldFiles)) {
    if (targets.has(target)) continue;
    const current = hashFile(toNative(projectDir, target));
    if (current === null) continue;
    actions.push({ type: current === recorded ? "delete" : "orphan", target });
  }
  return actions;
}

// A project set up before the rename records AGENTS.kit.md or .codex/config.kit.toml.
// The kit's copy moves to the new name: an untouched old copy is deleted and the new one
// added; an old copy you edited is kept; one you already merged and deleted stays gone.
function renameOldAlts(projectDir, recorded) {
  const oldFiles = { ...recorded };
  const actions = [];
  for (const [path, oldName] of Object.entries(OLD_ALT)) {
    if (!(oldName in oldFiles) || ALT[path] in oldFiles) continue;
    const sha = oldFiles[oldName];
    delete oldFiles[oldName];
    const current = hashFile(toNative(projectDir, oldName));
    if (current === null) oldFiles[ALT[path]] = sha;
    else actions.push({ type: current === sha ? "delete" : "orphan", target: oldName, renamedTo: ALT[path] });
  }
  return { oldFiles, actions };
}

function planFile(projectDir, path, data, oldFiles) {
  const kitSha = hash(data);
  const target = resolveTarget(projectDir, path, kitSha, oldFiles);
  const base = { path, target, data, alt: target !== path };
  const current = hashFile(toNative(projectDir, target));
  const recorded = oldFiles[target];

  if (current === null) {
    if (recorded === kitSha) return { ...base, type: "left-deleted", record: recorded };
    return { ...base, type: "add", record: kitSha };
  }
  if (current === kitSha) return { ...base, type: "same", record: kitSha };
  if (recorded === current) return { ...base, type: "replace", record: kitSha };
  // From here on the file is the person's: they changed it, or it was never ours.
  if (recorded === kitSha) return { ...base, type: "kept", record: recorded };
  if (MERGE[path] && !base.alt) {
    const theirs = readFileSync(toNative(projectDir, target), "utf8");
    try {
      const merged = MERGE[path](theirs, data.toString("utf8"));
      if (merged === null) return { ...base, type: "kept" };
      const text = typeof merged === "string" ? merged : merged.text;
      return { ...base, type: "merge", text, added: merged.added };
    } catch {
      return { ...base, type: "offer", record: kitSha, note: "not valid JSON, so not merged" };
    }
  }
  // Record the kit's version we offered, so the next update stays quiet until the kit changes again.
  return { ...base, type: "offer", record: kitSha };
}

function resolveTarget(projectDir, path, kitSha, oldFiles) {
  if (path in oldFiles || !ALT[path]) return path;
  if (ALT[path] in oldFiles) return ALT[path];
  const current = hashFile(toNative(projectDir, path));
  return current === null || current === kitSha ? path : ALT[path];
}

// manifestName: where to write the record (the old name while the person keeps it).
export function apply(projectDir, kit, actions, manifestName = PROJECT_MANIFEST) {
  for (const a of actions) {
    const abs = toNative(projectDir, a.target);
    if (a.type === "add" || a.type === "replace") writeFile(abs, a.data);
    if (a.type === "offer") writeFile(`${abs}${NEW_SUFFIX}`, a.data);
    if (a.type === "merge") writeFile(abs, a.text);
    if (a.type === "delete") {
      rmSync(abs);
      pruneEmptyDirs(projectDir, abs);
    }
  }
  const files = {};
  for (const a of actions) if (a.record) files[a.target] = a.record;
  const sorted = Object.fromEntries(Object.entries(files).sort(([x], [y]) => (x < y ? -1 : 1)));
  const manifest = { kitVersion: kit.version, files: sorted };
  writeFile(toNative(projectDir, manifestName), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

// Which manifest file the project has: the new name, else the old one, else null.
export function projectManifestName(projectDir) {
  return [PROJECT_MANIFEST, OLD_PROJECT_MANIFEST].find((name) => existsSync(toNative(projectDir, name))) ?? null;
}

export function readProjectManifest(projectDir) {
  const name = projectManifestName(projectDir);
  return name ? JSON.parse(readFileSync(toNative(projectDir, name), "utf8")) : null;
}

// Copies the old CLI offered as <file>.kit-new that are still waiting to be compared.
export function oldKitNewFiles(projectDir, actions) {
  return [...new Set(actions.map((a) => a.target))]
    .map((target) => `${target}${OLD_NEW_SUFFIX}`)
    .filter((path) => existsSync(toNative(projectDir, path)));
}

const LABELS = {
  add: "add",
  replace: "update",
  merge: "merge",
  offer: "yours kept, kit's copy in",
  delete: "delete (removed from the kit)",
  renamed: "delete (renamed)",
  orphan: "keep (removed from the kit, but you changed it)",
};

// Print the plan. list: which action types to list file by file (others are only counted).
export function report(actions, log, list = Object.keys(LABELS)) {
  const count = (type) => actions.filter((a) => a.type === type).length;
  for (const a of actions) {
    if (!list.includes(a.type) && !a.alt) continue;
    if (!LABELS[a.type]) continue;
    const label = a.renamedTo && a.type === "delete" ? LABELS.renamed : LABELS[a.type];
    const shown = a.type === "offer" ? `${a.target}${NEW_SUFFIX}` : a.target;
    const extra = a.renamedTo ? ` (now ${a.renamedTo})` : a.alt ? ` (you have your own ${a.path})` : a.added ? ` (+${a.added.length} deny rules)` : a.note ? ` (${a.note})` : "";
    log(`  ${label} ${shown}${extra}`);
  }
  const parts = [
    ["added", count("add")], ["updated", count("replace")], ["merged", count("merge")],
    ["unchanged", count("same")], ["kept as yours", count("kept") + count("offer") + count("orphan")],
    ["deleted", count("delete")],
  ].filter(([, n]) => n).map(([label, n]) => `${n} ${label}`);
  log(parts.length ? parts.join(", ") + "." : "Nothing to do.");
}
