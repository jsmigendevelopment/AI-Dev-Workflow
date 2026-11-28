# Experiment: Versions and repository facts

Run on 2026-11-28 on Linux x86-64 with Node 22.23.5. Go 1.24.7 was installed; its toolchain switch (GOTOOLCHAIN=auto) fetched 1.26.x for the tools that need it. What the Go module proxy, the npm registry and the GitHub REST API said on 2026-11-28. These pages are not stable: run the three scripts again for today's numbers.

Paths are shortened to `<tmp>`. A step's output is cut when it is long, and the cut says how many lines are missing.

## Latest versions: Go modules from proxy.golang.org, npm packages from registry.npmjs.org

Script `ver.mjs`:

```js
// Prints the latest version and time of Go modules (proxy.golang.org) and npm packages.
const go = [
  "github.com/golangci/golangci-lint/v2",
  "github.com/OpenPeeDeeP/depguard/v2",
  "github.com/fe3dback/go-arch-lint",
  "github.com/arch-go/arch-go",
  "github.com/oapi-codegen/oapi-codegen/v2",
  "github.com/ogen-go/ogen",
  "github.com/danielgtaylor/huma/v2",
  "github.com/swaggo/swag",
  "github.com/go-chi/chi/v5",
  "github.com/labstack/echo/v4",
  "github.com/gin-gonic/gin",
  "github.com/stretchr/testify",
  "github.com/gotestyourself/gotestsum",
  "github.com/getkin/kin-openapi",
  "github.com/oapi-codegen/runtime",
  "github.com/pb33f/libopenapi",
  "github.com/daixiang0/gci",
  "github.com/uber-go/mock",
  "github.com/ory/dockertest/v3",
  "github.com/Orange-OpenSource/hurl",
  "github.com/go-task/task/v3",
  "github.com/kisielk/errcheck",
  "github.com/securego/gosec/v2",
  "github.com/tetafro/godot",
  "golang.org/x/vuln",
  "honnef.co/go/tools",
  "github.com/google/go-cmp",
  "github.com/go-playground/validator/v10",
  "github.com/oapi-codegen/nethttp-middleware",
  "github.com/oapi-codegen/echo-middleware",
  "github.com/danielgtaylor/huma",
];
const npm = [
  "openapi-typescript",
  "openapi-fetch",
  "orval",
  "@hey-api/openapi-ts",
  "@redocly/cli",
  "@stoplight/spectral-cli",
  "schemathesis",
  "typescript",
  "openapi-typescript-codegen",
  "@openapitools/openapi-generator-cli",
  "oazapfts",
  "@apidevtools/swagger-cli",
  "orval-fetch",
  "swagger-typescript-api",
  "openapi-zod-client",
  "@scalar/cli",
  "dependency-cruiser",
  "@tanstack/react-query",
  "openapi-react-query",
];
const get = async (u) => {
  try {
    const r = await fetch(u);
    if (!r.ok) return { err: r.status };
    return await r.json();
  } catch (e) {
    return { err: String(e.cause?.code ?? e.message) };
  }
};
const only = process.argv.slice(2);
const enc = (m) => m.replace(/[A-Z]/g, (c) => "!" + c.toLowerCase());
for (const m of go) {
  if (only.length && !only.some((o) => m.includes(o))) continue;
  const j = await get(`https://proxy.golang.org/${enc(m)}/@latest`);
  console.log("go", m, j.err ?? `${j.Version} ${j.Time}`);
}
for (const p of npm) {
  if (only.length && !only.some((o) => p.includes(o))) continue;
  const j = await get(`https://registry.npmjs.org/${p.replace("/", "%2f")}`);
  if (j.err) { console.log("npm", p, j.err); continue; }
  const v = j["dist-tags"].latest;
  console.log("npm", p, v, j.time[v], "license", j.versions[v].license, "modified", j.time.modified);
}
```

Output:

```
go github.com/golangci/golangci-lint/v2 v2.15.0 2026-10-16T10:51:54Z
go github.com/OpenPeeDeeP/depguard/v2 v2.3.0 2026-10-27T01:39:31Z
go github.com/fe3dback/go-arch-lint v1.19.2 2026-11-17T13:08:10Z
go github.com/arch-go/arch-go v1.7.0 2025-02-25T15:28:23Z
go github.com/oapi-codegen/oapi-codegen/v2 v2.9.0 2026-11-21T20:10:06Z
go github.com/ogen-go/ogen v1.25.0 2026-11-13T20:10:05Z
go github.com/danielgtaylor/huma/v2 v2.41.0 2026-11-17T23:04:53Z
go github.com/swaggo/swag v1.16.6 2025-07-28T03:01:37Z
go github.com/go-chi/chi/v5 v5.5.0 2026-10-14T13:20:04Z
go github.com/labstack/echo/v4 v4.16.6 2026-11-20T18:11:23Z
go github.com/gin-gonic/gin v1.12.0 2026-02-28T10:10:09Z
go github.com/stretchr/testify v1.12.1 2026-08-17T08:24:05Z
go github.com/gotestyourself/gotestsum v1.13.0 2025-09-11T03:13:16Z
go github.com/getkin/kin-openapi v0.153.0 2026-11-07T12:55:06Z
go github.com/oapi-codegen/runtime v1.9.1 2026-11-20T15:37:41Z
go github.com/pb33f/libopenapi v0.44.0 2026-11-21T19:00:21Z
go github.com/daixiang0/gci v0.14.0 2026-02-28T08:10:00Z
go github.com/uber-go/mock v0.6.0 2025-08-18T14:58:04Z
go github.com/ory/dockertest/v3 v3.12.0 2025-03-12T16:12:11Z
go github.com/Orange-OpenSource/hurl v0.0.0-20261014030429-96ce983a50d2 2026-10-14T03:04:29Z
go github.com/go-task/task/v3 v3.54.0 2026-10-01T20:21:39Z
go github.com/kisielk/errcheck v1.30.0 2026-10-10T16:16:37Z
go github.com/securego/gosec/v2 v2.30.0 2026-10-23T09:07:23Z
go github.com/tetafro/godot v1.5.6 2026-03-27T07:56:41Z
go golang.org/x/vuln v1.10.0 2026-11-17T20:25:28Z
go honnef.co/go/tools v0.8.2 2026-10-12T13:34:44Z
go github.com/google/go-cmp v0.7.0 2025-01-14T18:15:44Z
go github.com/go-playground/validator/v10 v10.30.6 2026-10-29T22:49:01Z
go github.com/oapi-codegen/nethttp-middleware v1.3.1 2026-10-23T06:12:02Z
go github.com/oapi-codegen/echo-middleware v1.2.1 2026-10-23T04:54:20Z
go github.com/danielgtaylor/huma v1.14.3 2024-09-11T22:41:25Z
npm openapi-typescript 7.13.0 2026-02-11T16:02:25.378Z license MIT modified 2026-06-15T07:56:25.328Z
npm openapi-fetch 0.17.0 2026-02-11T16:02:21.454Z license MIT modified 2026-06-15T07:55:35.074Z
npm orval 8.49.0 2026-11-22T13:22:29.889Z license MIT modified 2026-11-22T13:22:30.070Z
npm @hey-api/openapi-ts 0.99.0 2026-06-22T06:38:34.730Z license MIT modified 2026-09-30T19:13:44.313Z
npm @redocly/cli 2.84.0 2026-11-26T14:10:04.179Z license MIT modified 2026-11-26T14:10:04.596Z
npm @stoplight/spectral-cli 6.17.1 2026-11-06T06:04:42.381Z license Apache-2.0 modified 2026-11-06T06:04:42.606Z
npm schemathesis 404
npm typescript 7.0.2 2026-07-08T15:55:18.431Z license Apache-2.0 modified 2026-11-27T08:09:58.676Z
npm openapi-typescript-codegen 0.31.0 2026-06-20T19:05:22.935Z license MIT modified 2026-06-20T19:05:23.047Z
npm @openapitools/openapi-generator-cli 2.44.0 2026-11-26T18:26:09.708Z license Apache-2.0 modified 2026-11-26T18:26:09.926Z
npm oazapfts 7.5.0 2026-03-20T12:46:05.069Z license MIT modified 2026-03-20T12:46:05.435Z
npm @apidevtools/swagger-cli 4.0.4 2020-07-19T14:21:27.373Z license MIT modified 2026-01-24T16:02:51.849Z
npm orval-fetch 404
npm swagger-typescript-api 13.15.0 2026-11-23T09:36:19.357Z license MIT modified 2026-11-23T09:36:19.732Z
npm openapi-zod-client 1.18.3 2025-02-10T16:46:14.578Z license ISC modified 2026-06-15T07:55:46.908Z
npm @scalar/cli 2.25.0 2026-11-27T14:03:47.225Z license MIT modified 2026-11-27T14:03:47.432Z
npm dependency-cruiser 18.9.0 2026-11-22T18:02:21.890Z license MIT modified 2026-11-22T18:02:22.179Z
npm @tanstack/react-query 5.108.4 2026-11-23T13:20:10.775Z license MIT modified 2026-11-23T13:20:11.257Z
npm openapi-react-query 0.5.4 2026-02-11T16:02:20.863Z license MIT modified 2026-02-11T16:02:21.140Z
```

## Repository facts from the GitHub REST API (unauthenticated)

Script `repos.mjs`:

```js
// Prints repo facts from the GitHub REST API (unauthenticated): pushed_at, archived, license, stars, latest release.
const repos = process.argv.slice(2);
for (const r of repos) {
  const res = await fetch(`https://api.github.com/repos/${r}`, { headers: { "user-agent": "research-script" } });
  if (!res.ok) { console.log(r, "HTTP", res.status); continue; }
  const j = await res.json();
  const rel = await fetch(`https://api.github.com/repos/${r}/releases/latest`, { headers: { "user-agent": "research-script" } });
  const rj = rel.ok ? await rel.json() : {};
  console.log(r, "| pushed", j.pushed_at, "| archived", j.archived, "| license", j.license?.spdx_id, "| stars", j.stargazers_count, "| open issues", j.open_issues_count, "| latest release", rj.tag_name ?? "-", rj.published_at ?? "");
}
```

Output:

```
golangci/golangci-lint | pushed 2026-11-24T20:56:42Z | archived false | license GPL-3.0 | stars 19555 | open issues 115 | latest release v2.15.0 2026-10-16T11:33:37Z
OpenPeeDeeP/depguard | pushed 2026-11-23T12:52:52Z | archived false | license GPL-3.0 | stars 210 | open issues 9 | latest release v2.0.0 2023-03-25T06:30:04Z
fe3dback/go-arch-lint | pushed 2026-11-27T22:21:59Z | archived false | license MIT | stars 627 | open issues 17 | latest release v1.19.2 2026-11-17T14:20:32Z
arch-go/arch-go | pushed 2026-11-24T20:52:31Z | archived false | license MIT | stars 286 | open issues 25 | latest release v2.1.2 2026-02-03T13:39:55Z
oapi-codegen/oapi-codegen | pushed 2026-11-24T19:37:53Z | archived false | license Apache-2.0 | stars 8676 | open issues 238 | latest release v2.9.0 2026-11-21T20:24:58Z
ogen-go/ogen | pushed 2026-11-26T04:03:32Z | archived false | license Apache-2.0 | stars 2178 | open issues 128 | latest release v1.25.0 2026-11-13T20:25:05Z
danielgtaylor/huma | pushed 2026-11-26T20:57:30Z | archived false | license MIT | stars 4567 | open issues 119 | latest release v2.41.0 2026-11-17T23:05:44Z
swaggo/swag | pushed 2026-09-30T06:38:40Z | archived false | license MIT | stars 13049 | open issues 487 | latest release v2.0.0-rc6 2026-09-13T09:18:53Z
go-chi/chi | pushed 2026-11-07T15:51:20Z | archived false | license MIT | stars 23183 | open issues 163 | latest release v5.5.0 2026-10-14T13:20:54Z
labstack/echo | pushed 2026-11-20T18:13:45Z | archived false | license MIT | stars 32850 | open issues 89 | latest release v5.4.7 2026-11-20T18:13:54Z
openapi-ts/openapi-typescript | pushed 2026-09-25T15:43:01Z | archived false | license MIT | stars 8444 | open issues 288 | latest release openapi-react-query@0.5.4 2026-02-11T16:02:36Z
orval-labs/orval | pushed 2026-11-27T18:01:05Z | archived false | license MIT | stars 6663 | open issues 27 | latest release v8.49.0 2026-11-22T13:20:42Z
hey-api/openapi-ts | pushed 2026-11-08T10:55:20Z | archived false | license MIT | stars 5608 | open issues 683 | latest release 2026-06-22 2026-06-22T06:38:50Z
```

## npm dist-tags, peer dependencies and engines

Script `npmtags.mjs`:

```js
// Prints dist-tags, peerDependencies and recent versions for npm packages.
for (const p of process.argv.slice(2)) {
  const r = await fetch(`https://registry.npmjs.org/${p.replace("/", "%2f")}`);
  const j = await r.json();
  const tags = j["dist-tags"];
  const latest = j.versions[tags.latest];
  const vs = Object.keys(j.time).filter((v) => v !== "created" && v !== "modified").slice(-6).map((v) => `${v}@${j.time[v].slice(0, 10)}`);
  console.log(p, JSON.stringify(tags), "peer", JSON.stringify(latest.peerDependencies ?? {}), "engines", JSON.stringify(latest.engines ?? {}), "deps", Object.keys(latest.dependencies ?? {}).length);
  console.log("  recent:", vs.join(" "));
}
```

Output:

```
openapi-typescript {"swagger-v2":"5.4.2","next":"7.0.0-rc.1","latest":"7.13.0"} peer {"typescript":"^5.x"} engines {} deps 6
  recent: 7.9.0@2025-08-11 7.9.1@2025-08-11 7.10.0@2025-10-14 7.10.1@2025-10-15 7.12.0@2026-02-08 7.13.0@2026-02-11
openapi-fetch {"latest":"0.17.0"} peer {} engines {} deps 1
  recent: 0.14.0@2025-05-10 0.14.1@2025-10-02 0.15.0@2025-10-14 0.15.2@2026-02-08 0.16.0@2026-02-08 0.17.0@2026-02-11
orval {"alpha":"6.14.1","next":"7.3.0","rc":"8.0.0-rc.6","latest":"8.49.0"} peer {"typedoc":"^0.28.19","prettier":">=3.0.0","typedoc-plugin-markdown":"^4.10.0"} engines {"node":">=22.18.0"} deps 26
  recent: 8.44.0@2026-10-21 8.45.0@2026-10-25 8.46.0@2026-10-30 8.47.0@2026-11-07 8.48.0@2026-11-14 8.49.0@2026-11-22
@hey-api/openapi-ts {"latest":"0.99.0","next":"0.0.0-next-20260930190945"} peer {"typescript":">=5.5.3 || >=6.0.0 || 6.0.1-rc"} engines {"node":">=22.18.0"} deps 10
  recent: 0.0.0-next-20260804175203@2026-08-04 0.0.0-next-20260811214609@2026-08-11 0.0.0-next-20260813201118@2026-08-13 0.0.0-next-20260819153534@2026-08-19 0.0.0-next-20260824173136@2026-08-24 0.0.0-next-20260930190945@2026-09-30
```
