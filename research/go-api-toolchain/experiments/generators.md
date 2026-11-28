# Experiment: TypeScript client generators on TypeScript 6.0.3 and 7.0.2

Run on 2026-11-28 on Linux x86-64 with Node 22.23.5. Go 1.24.7 was installed; its toolchain switch (GOTOOLCHAIN=auto) fetched 1.26.x for the tools that need it. The same spec through openapi-typescript, Hey API and orval. TypeScript 6.0.3 is what the web pack pins; 7.0.2 is npm's `latest` for `typescript` on 2026-11-28.

Paths are shortened to `<tmp>`. A step's output is cut when it is long, and the cut says how many lines are missing.

## Three generators, TypeScript 6.0.3: output size, typecheck, and a rename of `title` to `name`

Script `exp18.sh`:

```bash
#!/bin/bash
# Three TypeScript client generators on the same spec, TypeScript 6.0.3 (the web pack's pin).
set -u
D=$TMPDIR/exp/tsgen; rm -rf $D; mkdir -p $D; cd $D
cp $TMPDIR/openapi.orig openapi.yaml
cp $TMPDIR/exp/spec/web/tsconfig.json .
echo '{ "name": "tsgen", "private": true, "type": "module" }' > package.json
echo "=== install"
npm install --save-dev --no-audit --no-fund typescript@6.0.3 @hey-api/openapi-ts@0.99.0 orval@8.49.0 2>&1 | tail -4
echo "=== hey-api"
mkdir -p src
./node_modules/.bin/openapi-ts -i openapi.yaml -o src/hey 2>&1 | tail -5
ls src/hey; wc -l src/hey/*.ts src/hey/**/*.ts 2>/dev/null | tail -1
echo "=== orval"
cat > orval.config.mjs <<'EOF'
export default { notes: { input: "./openapi.yaml", output: { target: "./src/orval/notes.ts", client: "fetch", mode: "single" } } };
EOF
./node_modules/.bin/orval --config orval.config.mjs 2>&1 | tail -5
ls src/orval; wc -l src/orval/*.ts | tail -1
echo "=== usage + tsc"
cat > src/use-hey.ts <<'EOF'
import { listNotes } from "./hey";
export async function firstTitle(): Promise<string | undefined> {
  const { data } = await listNotes();
  return data?.items[0]?.title;
}
EOF
cat > src/use-orval.ts <<'EOF'
import { listNotes } from "./orval/notes";
export async function firstTitle(): Promise<string | undefined> {
  const r = await listNotes();
  return r.data.items[0]?.title;
}
EOF
./node_modules/.bin/tsc --noEmit -p . 2>&1 | head -12 | cut -c1-220; echo "tsc exit ${PIPESTATUS[0]}"
echo "=== drift: rename title->name in spec, regenerate both, tsc"
awk '/^    Note:/{n=1} /^    NewNote:/{n=0} {if(n){gsub(/title/,"name")} print}' $TMPDIR/openapi.orig > openapi.yaml
./node_modules/.bin/openapi-ts -i openapi.yaml -o src/hey > /dev/null 2>&1
./node_modules/.bin/orval --config orval.config.mjs > /dev/null 2>&1
./node_modules/.bin/tsc --noEmit -p . 2>&1 | head -6 | cut -c1-220; echo "tsc exit ${PIPESTATUS[0]}"
du -sk node_modules | cut -f1
```

Output:

```
=== install
added 138 packages in 8s
=== hey-api
@hey-api/openapi-ts v0.99.0
[Job 1] ~ Generating...
[Job 1]   [1] openapi.yaml
[Job 1] ✓ <tmp>/exp/tsgen/src/hey · 4 files · 95ms
client
client.gen.ts
core
index.ts
sdk.gen.ts
types.gen.ts
 2026 total
=== orval
🍻 orval v8.49.0 - A swagger client generator for typescript
notes - 🎉 Notes - Your OpenAPI spec has been converted into ready to use orval!
notes.ts
116 src/orval/notes.ts
=== usage + tsc
tsc exit 0
=== drift: rename title->name in spec, regenerate both, tsc
src/use-hey.ts(5,26): error TS2339: Property 'title' does not exist on type 'Note'.
src/use-orval.ts(5,27): error TS2339: Property 'title' does not exist on type 'Note'.
tsc exit 2
103132
```

## The same three on TypeScript 7.0.2

Script `exp20.sh`:

```bash
#!/bin/bash
# Do the generators still run, and do their outputs still typecheck, on TypeScript 7.0.2 (npm's latest)?
set -u
rm -rf $TMPDIR/ts7; mkdir -p $TMPDIR/ts7; cd $TMPDIR/ts7
cp $TMPDIR/openapi.orig openapi.yaml
cp $TMPDIR/exp/spec/web/tsconfig.json .
echo '{ "name": "ts7", "private": true, "type": "module" }' > package.json
npm install --save-dev --legacy-peer-deps --no-audit --no-fund typescript@7.0.2 openapi-typescript@7.13.0 openapi-fetch@0.17.0 @hey-api/openapi-ts@0.99.0 orval@8.49.0 2>&1 | tail -2
./node_modules/.bin/tsc --version
mkdir -p src
echo "=== openapi-typescript on TS 7"
./node_modules/.bin/openapi-typescript openapi.yaml -o src/schema.d.ts 2>&1 | tail -6 | cut -c1-200; echo "exit ${PIPESTATUS[0]}"
echo "=== hey-api on TS 7"
./node_modules/.bin/openapi-ts -i openapi.yaml -o src/hey 2>&1 | tail -2 | cut -c1-200; echo "exit ${PIPESTATUS[0]}"
echo "=== orval on TS 7"
cat > orval.config.mjs <<'EOF'
export default { notes: { input: "./openapi.yaml", output: { target: "./src/orval/notes.ts", client: "fetch", mode: "single" } } };
EOF
./node_modules/.bin/orval --config orval.config.mjs 2>&1 | tail -2 | cut -c1-200; echo "exit ${PIPESTATUS[0]}"
cat > src/use-hey.ts <<'EOF'
import { listNotes } from "./hey";
export async function firstTitle(): Promise<string | undefined> {
  const { data } = await listNotes();
  return data?.items[0]?.title;
}
EOF
cat > src/use-orval.ts <<'EOF'
import { listNotes } from "./orval/notes";
export async function firstTitle(): Promise<string | undefined> {
  const r = await listNotes();
  return r.data.items[0]?.title;
}
EOF
echo "=== tsc 7 over hey + orval output"
./node_modules/.bin/tsc --noEmit -p . 2>&1 | head -6 | cut -c1-200; echo "tsc exit ${PIPESTATUS[0]}"
```

Output:

```

added 167 packages in 6s
Version 7.0.2
=== openapi-typescript on TS 7
    at file://<tmp>/ts7/node_modules/openapi-typescript/dist/lib/ts.mjs:11:28
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:681:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
Node.js v22.23.5
exit 1
=== hey-api on TS 7
Node.js v22.23.5
exit 1
=== orval on TS 7
🍻 orval v8.49.0 - A swagger client generator for typescript
notes - 🎉 Notes - Your OpenAPI spec has been converted into ready to use orval!
exit 0
=== tsc 7 over hey + orval output
src/use-hey.ts(1,27): error TS2307: Cannot find module './hey' or its corresponding type declarations.
tsc exit 1
```

## Why the two crashed, and orval's output on TypeScript 7

Script `exp21.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/ts7
./node_modules/.bin/openapi-ts -i openapi.yaml -o src/hey 2>&1 | grep -i "error\|cannot\|export\|typescript" | head -4 | cut -c1-220
./node_modules/.bin/openapi-typescript openapi.yaml -o src/schema.d.ts 2>&1 | grep -i "error\|cannot\|export\|typescript" | head -3 | cut -c1-220
rm src/use-hey.ts
./node_modules/.bin/tsc --noEmit -p . 2>&1 | head -6 | cut -c1-200; echo "tsc 7 over orval output: exit ${PIPESTATUS[0]}"
```

Output:

```
TypeError: Cannot read properties of undefined (reading 'AnyKeyword')
file://<tmp>/ts7/node_modules/openapi-typescript/dist/lib/ts.mjs:11
TypeError: Cannot read properties of undefined (reading 'createKeywordTypeNode')
    at file://<tmp>/ts7/node_modules/openapi-typescript/dist/lib/ts.mjs:11:28
tsc 7 over orval output: exit 0
```

## Open openapi-typescript issues that mention TypeScript 6 (GitHub search API)

Script `issues.mjs`:

```js
// Searches issues of a repo for a phrase (GitHub search API, unauthenticated).
const [repo, ...words] = process.argv.slice(2);
const q = encodeURIComponent(`repo:${repo} ${words.join(" ")}`);
const r = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=8&sort=updated`, { headers: { "user-agent": "research-script" } });
const j = await r.json();
if (!r.ok) { console.log("HTTP", r.status, j.message); process.exit(0); }
console.log("total", j.total_count);
for (const i of j.items) console.log(i.number, i.state, i.updated_at.slice(0, 10), i.title.slice(0, 110));
```

Output:

```
total 736
2829 open 2026-11-22 fix(openapi-react-query): propagate undefined errors from empty-body non-OK responses
2841 open 2026-11-16 openapi-typescript doesn't work with Typescript 7
2872 open 2026-11-09 Support TypeScript 6 and 7 without a runtime compiler dependency
2818 open 2026-11-07 feat: Typescript 6 support
2523 open 2026-11-04 [CLI] Hangs when Options (-/-- flags) are out-of-order
2486 open 2026-11-04 Component caching with Math.random in openapi-fetch
1651 open 2026-11-04 `--properties-required-by-default` and `--default-non-nullable` flags do not work
2155 open 2026-11-04 Missing types
```

## pnpm, run once

The web pack's package manager is pnpm 12.21.0. This was run once from the session. It wrote into pnpm's shared store, so it was not run again and has no log file. The text below is its output as the session showed it.

```
$ npx pnpm@12.21.0 add -D typescript@6.0.3 openapi-typescript@7.13.0
Packages: +33
Progress: resolved 33, reused 11, downloaded 22, added 33, done
[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.
devDependencies:
+ openapi-typescript 7.13.0
+ typescript 6.0.3
Done in 732ms using pnpm v12.21.0
pnpm exit 0
```
