#!/usr/bin/env node
// Checks this research library: research-library.json first, then the research folder it names,
// with check-research.mjs. No dependencies; Node 22+.
// Usage:  node scripts/check-library.mjs [--base <git ref>]   (--base also checks the append-only files)
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkResearch } from "./check-research.mjs";
import { readManifest } from "./research-library.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--base");
const base = at > 0 ? process.argv[at + 1] : undefined;

const { manifest, errors } = readManifest(root);
for (const e of errors) console.error(`error: research-library.json: ${e}`);
if (!manifest || errors.length) process.exit(1);

const research = join(root, dirname(manifest.layout.report));
const r = checkResearch(research, { base });
for (const e of r.errors) console.error(`error: ${e}`);
for (const w of r.warnings) console.log(`warn:  ${w}`);
for (const s of r.stale) console.log(`stale: ${s.dossier} (re-check ${s.recheck})`);
console.log(`library: ${r.dossiers} dossiers, ${r.errors.length} errors, ${r.warnings.length} warnings, ${r.stale.length} stale`);
process.exit(r.errors.length ? 1 : 0);
