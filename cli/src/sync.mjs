// The engine behind init and update: compare the kit with the project and the manifest
// of what was installed last time, plan what to do with each file, then apply the plan.
// init is a sync against an empty manifest. The manifest maps each installed path to the
// sha256 of the kit's copy last installed (or offered as .kit-new) there.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { hash, hashFile, pruneEmptyDirs, toNative, writeFile } from "./files.mjs";
import { ensureAgentsImport, mergeDeny } from "./merge.mjs";
import { PROJECT_MANIFEST } from "./kit.mjs";

// If the person has their own copy of these, the kit's goes next to it.
const ALT = { "AGENTS.md": "AGENTS.kit.md", ".codex/config.toml": ".codex/config.kit.toml" };
// If the person has their own copy of these, the kit's is merged into it.
const MERGE = {
  "CLAUDE.md": (theirs) => ensureAgentsImport(theirs),
  ".claude/settings.json": (theirs, kit) => mergeDeny(theirs, kit),
};

export function plan(projectDir, kit, oldFiles = {}) {
  const actions = [];
  const targets = new Set();
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
      return { ...base, type: "kit-new", record: kitSha, note: "not valid JSON, so not merged" };
    }
  }
  // Record the kit's version we offered, so the next update stays quiet until the kit changes again.
  return { ...base, type: "kit-new", record: kitSha };
}

function resolveTarget(projectDir, path, kitSha, oldFiles) {
  if (path in oldFiles || !ALT[path]) return path;
  if (ALT[path] in oldFiles) return ALT[path];
  const current = hashFile(toNative(projectDir, path));
  return current === null || current === kitSha ? path : ALT[path];
}

export function apply(projectDir, kit, actions) {
  for (const a of actions) {
    const abs = toNative(projectDir, a.target);
    if (a.type === "add" || a.type === "replace") writeFile(abs, a.data);
    if (a.type === "kit-new") writeFile(`${abs}.kit-new`, a.data);
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
  writeFile(toNative(projectDir, PROJECT_MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export function readProjectManifest(projectDir) {
  const path = toNative(projectDir, PROJECT_MANIFEST);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

const LABELS = {
  add: "add",
  replace: "update",
  merge: "merge",
  "kit-new": "yours kept, kit's copy in",
  delete: "delete (removed from the kit)",
  orphan: "keep (removed from the kit, but you changed it)",
};

// Print the plan. list: which action types to list file by file (others are only counted).
export function report(actions, log, list = Object.keys(LABELS)) {
  const count = (type) => actions.filter((a) => a.type === type).length;
  for (const a of actions) {
    if (!list.includes(a.type) && !a.alt) continue;
    if (!LABELS[a.type]) continue;
    const shown = a.type === "kit-new" ? `${a.target}.kit-new` : a.target;
    const extra = a.alt ? ` (you have your own ${a.path})` : a.added ? ` (+${a.added.length} deny rules)` : a.note ? ` (${a.note})` : "";
    log(`  ${LABELS[a.type]} ${shown}${extra}`);
  }
  const parts = [
    ["added", count("add")], ["updated", count("replace")], ["merged", count("merge")],
    ["unchanged", count("same")], ["kept as yours", count("kept") + count("kit-new") + count("orphan")],
    ["deleted", count("delete")],
  ].filter(([, n]) => n).map(([label, n]) => `${n} ${label}`);
  log(parts.length ? parts.join(", ") + "." : "Nothing to do.");
}
