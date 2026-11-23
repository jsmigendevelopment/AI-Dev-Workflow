# Foundations research: one library per area

> **Draft, 2026-11-23. Fact-checked once, same day** (see [Fact-check](#fact-check) at the end). One research pass plus one independent fact-check. Nothing here has been built into the pack or deployed. What was run is small probes in a scratch folder: `npm view`, esbuild bundles, and the Workers runtime (`workerd`) started locally. Treat every pick as a starting point until a spike in the real pack agrees.

Scope: the web pack (`stacks/tanstack-start`): TanStack Start 1.169.7, React 19.3.1, TypeScript 6.0.3, Zod 4.6.7, Drizzle 0.45.4 on D1, Clerk, Vitest 5, Playwright, Cloudflare Workers (wrangler 4.164.0, compatibility date 2026-11-17).

What the owner asked for: popular, maintained, typed, small, permissively licensed; Cloudflare for anything it offers free; the TanStack family where it fits; no Next.js or Vercel promotion. The owner's private research library was read first. It already covers the adoption check, the licence allow-list, Workers Logs cost and redaction, and a plan for field data on Workers Analytics Engine. None of that is redone here; it is used.

## Summary

| # | Area | Pick | Version | Confidence |
|---|---|---|---|---|
| 1 | Time | The Temporal API as the one model, through `temporal-polyfill` until every runtime has it | 1.0.8 | High on the facts, medium on the pick |
| 2 | Money | `dinero.js` v2 inside `lib/money.ts`; the wire and database shape stays `{ amountMinor, currency }` | 2.0.2 | Medium |
| 3 | Logging | Build a small one (`lib/logger.ts` on `console`), no library. Workers Logs to search | none | High |
| 4 | Translations | Paraglide JS, with its format plugin installed from npm | 3.2.2 | Medium-low |
| 5 | OpenAPI | `zod-openapi`; viewer Scalar, never in production | 6.0.2; 1.83.0 | High; medium |
| 6 | Analytics events | Typed registry and `track()` into the app's own D1 table. Add-on: PostHog | none; posthog-js 1.453.2 | Medium |
| 7 | Feature flags | Build a small one (typed list, values from `vars`). Add-on: Cloudflare Flagship | none; `@cloudflare/flagship` 0.7.0 | High; low (beta) |
| 8 | IDs | UUIDv7 from the `uuid` package | 14.0.3 | High |
| 9 | CMS | Not Payload inside the app. Default: Markdown in the repo. Payload only as its own service | Content Collections 0.15.3; Payload 3.94.1 | Medium |

Three picks differ from what `app-conventions.md` says "until research confirms": time (was `date-fns` plus `@date-fns/tz`), translations (was `i18next`) and where logs are kept longer (was Logpush). The OpenAPI generator is confirmed. See [What this changes in the conventions](#what-this-changes-in-the-conventions).

## How to read the marks

| Mark | Means |
|---|---|
| **[M]** | Measured here on 2026-11-23: a command or probe was run and the output read |
| **[V]** | Read at a primary source on 2026-11-23: the npm registry, a vendor's docs repository, release notes, a package's own files |
| **[S]** | Secondary: a web search summary or a third-party page. Not opened at the source |
| **[I]** | Inferred or from memory. Not checked |

How things were checked:

- **Versions, licences, dates, peers:** `npm view <pkg>` against the registry. Every version in this file is the `latest` tag on 2026-11-23 unless it says otherwise.
- **Sizes:** each library bundled alone with esbuild 0.28.2 (`--bundle --minify --format=esm`, React and Zod external), then gzip -9 and brotli 11. The entry file imports what a typical app would use. Sizes are for that entry, not the whole package. A KB is 1,024 bytes, as in the pack's budget script.
- **Workers runtime:** `workerd` 1.20261117.1 (the exact version wrangler 4.164.0 depends on) and 1.20261122.2, run locally with a small Worker. Not a deployed Worker.
- **Browser support:** `@mdn/browser-compat-data` 8.1.10 (built 2026-11-19), the caniuse data file, and Apple's release notes.
- **Cloudflare facts:** the `cloudflare/cloudflare-docs` repository at commit `1c6e632` (2026-11-22) and `cloudflare/workerd` `main`.
- **Payload facts:** the `payloadcms/payload` repository, `main` at `ce66418` (2026-11-21).

Could not be reached from this session: `api.npmjs.org` (so **no download counts**: every "popular" below is [I]), bundlephobia, the GitHub API, and `payloadcms.com`.

---

## 1. Time

### Is Temporal available everywhere? No, not yet

Temporal is a finished standard: the proposal is Stage 4, listed in TC39's finished proposals with expected publication year 2027 (ES2027) [V]. As of 2026-11-23:

| Runtime | Temporal | Since | Mark |
|---|---|---|---|
| Chrome (desktop and Android) | yes | 144, 2026-01-13 | [V] |
| Edge | yes | 144, 2026-01-21 | [V] |
| Firefox (desktop and Android) | yes | 139, 2025-05-27 | [V] |
| Samsung Internet | yes | 31.0, 2026-09-23 | [V] |
| **Safari on macOS** | **no** in any released version. The current release is 27.2 (2026-10-26). It is in the **27.3 beta** (release notes dated 2026-11-16, build 20626.1.17: "Added support for `Temporal`") | not shipped | [V] |
| **Safari on iOS and iPadOS** | **no**, same as macOS: 27.3 beta only | not shipped | [V] |
| Node.js | yes from 26.0.0 (2026-05-05). **No** in Node 22 and 24. The pack's CI and dev container run Node 22 | 26.0.0 | [V], Node 22.23.5 [M] |
| Deno, Bun | yes | Deno 2.7, Bun 1.4.0 | [V] |
| **Cloudflare Workers** | **behind a flag today.** `compatibility_flags: ["temporal"]` turns it on. It is on by default for a compatibility date of **2026-12-01** or later | flag now; default 2026-12-01 | [V] [M] |

Notes on the table:

- **Workers, measured.** With the pack's settings (compatibility date 2026-11-17), `typeof Temporal` is `"undefined"`. With the `temporal` flag it is an object, and `Temporal.ZonedDateTime`, `PlainDate` and `Date.prototype.toTemporalInstant` work. `workerd` refuses a compatibility date in the future, so 2026-12-01 can't be set before that day. [M]
- **Where the flag is written down.** `workerd`'s `compatibility-date.capnp` has `temporal` / `no_temporal` with the enable date 2026-12-01. Cloudflare's docs repository already holds the changelog entry, dated 2026-12-01. [V] This is local `workerd`; that the deployed runtime behaves the same is [I].
- **Safari sources disagree.** MDN's data says 27.3. The caniuse data file still says "no" for 27.3 and "yes" only for Technology Preview. Apple's own 27.3 beta notes list it, so 27.3 is taken as right. caniuse puts global support at 72.14%. [V]
- **When 27.3 ships is unknown.** No date was found. Old iPhones that can't update stay without it for years. [I]
- **TypeScript 6.0.3 has the types** (`lib.esnext.temporal.d.ts` is in the package). [M]

So: not everywhere. Safari (every iPhone) and the pack's own test runtime lack it today.

### Options

| Option | Version (released) | Licence | Size: min / gzip / brotli [M] | Notes |
|---|---|---|---|---|
| **`temporal-polyfill`** (FullCalendar) | 1.0.8 (2026-11-04) | MIT | 54.9 / 19.0 / **17.2 KB** | Uses native Temporal when present. "Near-perfect" spec compliance "with just 2 intentional deviations" by its README. CI on Node 16 to 26. 2 small dependencies [V] |
| `@js-temporal/polyfill` | 0.5.1 (2025-03-31) | ISC | 158.5 / 46.0 / 39.7 KB | 20 months without a release. Its README still lists "Release production version" as not done. Depends on `jsbi` [V] |
| `date-fns` + `@date-fns/tz` | 4.4.0 (2026-05-29) + 1.5.0 (2026-05-21) | MIT | 8.7 / 3.3 / **3.0 KB** | Smallest. Built on `Date`: no type for a calendar date or a wall-clock time, so the three types the conventions demand can't be told apart by the compiler |
| Day.js + `utc` + `timezone` plugins | 1.11.23 (2026-08-17) | MIT | 12.2 / 5.0 / 4.5 KB | Mutable plugin setup, one wrapper type for everything |
| Luxon | 3.7.2 (2025-09-05) | MIT | 69.4 / 21.5 / 19.3 KB | Bigger than the Temporal polyfill, and not the standard |

**Accuracy, measured.** Native Temporal in `workerd` (flag on), `temporal-polyfill` and `@js-temporal/polyfill` gave **identical answers on 16 cases**: a local time that doesn't exist (02:30 on 2026-03-29 in Paris), one that happens twice (both choices), 23-hour and 25-hour days, a weekly event across the change, plus 24 hours across the change, 31 January plus one month, Lord Howe's 30-minute shift, Samoa's skipped day, an impossible date, February in a leap year, and a month as days. [M] Sixteen cases are a smoke test, not the test262 suite.

`@date-fns/tz` matched on the four of those it can express. For the time that happens twice it returned the later one (`+01:00`); Temporal's default is the earlier one, and lets you choose. [M]

### Recommendation: the Temporal API, through `temporal-polyfill`, behind `lib/time.ts`

Write all date logic against the standard now. The polyfill fills the gaps (Safari, Node 22 in tests) and steps aside where the runtime has it.

- `lib/time.ts` is the only file that imports the polyfill: `import { Temporal } from 'temporal-polyfill'`. Everything else imports from `lib/time.ts`.
- On the Worker, add `"temporal"` to `compatibility_flags` now. From a compatibility date of 2026-12-01 the flag isn't needed.
- **Keep display apart from arithmetic.** Showing a time needs only `Intl.DateTimeFormat`, which every runtime has. Put the `Intl` formatters in their own file so a page that only shows dates doesn't download the polyfill. Arithmetic (adding months, repeating events, zone conversion) belongs in services on the server. The pack's page budget is 150 KB gzip and `/notes` is already at 160.7 KB, so 19.0 KB gzip on the client needs a reason.

**Why not `date-fns`:** it is almost six times smaller, but it can't express the rule the conventions care about most. A birthday, an instant and "9:00 in Paris" are all a `Date`. With Temporal they are `PlainDate`, `Instant` and `ZonedDateTime`, and mixing them is a compile error. It would also be a second migration later.

### The standard for storing time

| Type | In code | In D1 (SQLite) | In Postgres | Over the API |
|---|---|---|---|---|
| Instant (when a note was created) | `Temporal.Instant` | `integer`, epoch milliseconds (what the pack's `created_at` already is) | `timestamptz` | ISO 8601 with `Z`, checked by `z.iso.datetime()` |
| Calendar date (a birthday, a due date) | `Temporal.PlainDate` | `text`, `YYYY-MM-DD` | `date` | `YYYY-MM-DD`, checked by `z.iso.date()` |
| Wall-clock time plus zone ("9:00 every Monday in Europe/Paris") | `Temporal.ZonedDateTime`, built when needed | two `text` columns: the local time (`2026-12-15T09:00`) and the IANA zone (`Europe/Paris`) | `timestamp` (no zone) plus a `text` zone | the same two fields |

For a future or repeating zoned time, never store only the instant: zone rules change, and the stored instant would then be wrong. Store the local time and the zone, and compute the instant when it's needed. A cached "next run" instant next to it is fine. [I]

Services get `now` injected, as the pack already does (`now: Date.now` in `composition.ts`).

### Once Temporal ships everywhere

1. **2026-12-01:** raise the Worker's compatibility date and remove the `temporal` flag.
2. **CI on Node 26:** unit tests no longer need the polyfill.
3. **When the browser floor reaches Safari 27.3:** change the one import in `lib/time.ts` to the global and remove the dependency. No other file changes, because the code was written against the standard all along.

**Verified:** every row of the availability table, the Workers flag and date, the sizes, the 16-case agreement. **Inferred:** production Workers match local `workerd`; when Safari 27.3 ships; the note about zone rule changes.

Sources (all read 2026-11-23): `@mdn/browser-compat-data` 8.1.10, `javascript.builtins.Temporal` · [Safari 27.3 beta release notes](https://developer.apple.com/documentation/safari-release-notes/safari-27_3-release-notes) (2026-11-16) · [tc39/proposal-temporal README](https://github.com/tc39/proposal-temporal) · [caniuse data, temporal.json](https://github.com/Fyrd/caniuse/blob/main/features-json/temporal.json) · [workerd compatibility-date.capnp](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp) · cloudflare-docs `src/content/compatibility-flags/temporal.md` and `changelog/workers/2026-12-01-temporal-api.mdx` · [temporal-polyfill README](https://github.com/fullcalendar/temporal-polyfill) · npm registry.

---

## 2. Money

### Options

| Option | Version (released) | Licence | Size [M] | Notes |
|---|---|---|---|---|
| **`dinero.js` v2** | 2.0.2 (2026-03-13). 2.0.0 stable came on 2026-03-02 after alphas from 2021 | MIT | 6.6 / 2.4 / **2.2 KB** with three currencies; 14.1 / 4.3 / 3.4 KB with every ISO 4217 currency | Zero dependencies, pure functions, tree-shakes. `number` and `bigint` builds. One maintainer [V] |
| In-house `Money` on integer minor units | none | ours | about 80 lines | The exact shape the conventions want. We would own the rounding and splitting bugs |
| `currency.js` | 2.0.4 (2021-05-19) | MIT | 2.8 / 1.3 / 1.2 KB | No release in five years. Takes decimal numbers as input, no currency table, no rounding modes |
| `big.js` / `decimal.js` | 7.0.1 (2025-04-21) / 10.6.0 (2025-07-06) | MIT | not measured | Arbitrary decimals, not money: no currency, no allocation |

### What Dinero v2 does, measured

- **Allocation keeps every cent.** 100 cents split `[1, 1, 1]` gives 34, 33, 33. Minus 100 gives -34, -33, -33. 5 yen split `[50, 50]` gives 3 and 2. [M]
- **Rounding modes** are functions you pass: `halfEven`, `halfUp`, `halfDown`, `halfOdd`, `halfAwayFromZero`, `halfTowardsZero`, `up`, `down`. $2.50 times 1% is 2.5 cents: `halfEven` gives 2, `halfUp` gives 3. Minus $2.50: `halfEven` -2, `halfAwayFromZero` -3. [M]
- **Mixed currencies throw:** "Objects must have the same currency." [M]
- **Currencies** carry their own exponent: JPY 0, USD 2, KWD 3. `toDecimal` printed `1.234` for 1234 KWD minor units and `1234` for JPY. [M]
- **Formatting is left to `Intl`**, which is what the conventions want: `toDecimal(d, ({ value, currency }) => new Intl.NumberFormat(locale, { style: 'currency', currency: currency.code }).format(value))` printed `1.234,56 $` for `de-DE`. [M]
- **No overflow guard seen** in the `number` build: `Number.MAX_SAFE_INTEGER` times 2 returned a number with no error. Use the `bigint` build when a sum can pass about 9 quadrillion minor units (90 trillion dollars in cents). [M]
- **Its "scale" idea leaks.** Multiplying by a rate returns an amount at a finer scale (`829125` at scale 6); you then call `transformScale(d, 2, halfEven)`. Easy to forget. [M]
- **Its JSON is not our wire shape:** `{"amount":500,"currency":{"code":"USD","base":10,"exponent":2},"scale":2}`. [M]

`Intl.NumberFormat` in `workerd` knows the exponents too (USD 2, JPY 0, KWD 3, CLF 4) and formats a decimal string of 20 digits without losing precision, so an in-house type would need no currency table. [M]

### Recommendation: `dinero.js` 2.0.2, wrapped by `lib/money.ts`

Money maths is a solved problem with sharp edges, which is exactly where the kit's own rule says to use a library. Dinero is small, typed, MIT and has no dependencies.

`lib/money.ts` is the only file that imports it, and it hides the two rough parts:

- The app's `Money` stays `{ amountMinor: number, currency: 'USD' }`. That is what the database (`amount_minor` integer plus `currency` text) and the API carry. The wrapper turns it into a Dinero object, does the maths, and turns it back.
- Every function that can produce a fraction takes the rounding mode and returns whole minor units, so "scale" never leaves the file. Default `halfEven`, as the conventions say.
- Formatting is one function over `Intl.NumberFormat`, used at the edge only.

**Fallback:** if the wrapper ends up longer than the maths it wraps, drop Dinero and write the 80 lines (integer minor units, `BigInt` for the product in a rate multiplication, half-even, allocate by largest remainder). A sketch of exactly that gave the same answers as Dinero on the cases above. [M] The conventions' test list (rounding, a split with a remainder, a zero-decimal currency, a refund, mixed currencies) applies either way.

**Verified:** versions, licence, sizes, every behaviour bullet. **Inferred:** that Dinero is widely used (no download counts); how its rounding behaves outside the cases run.

Sources (2026-11-23): npm registry for `dinero.js`, `currency.js`, `big.js`, `decimal.js` · the `dinero.js` 2.0.2 package files · [dinerojs.com](https://dinerojs.com) (named by the README, not opened).

---

## 3. Logging on Workers

### Options

| Option | Version (released) | Licence | Size [M] | Verdict |
|---|---|---|---|---|
| **A small in-house logger on `console`** | none | ours | about 30 lines today | **Pick.** The pack already has one (`src/lib/logger.ts`) |
| LogTape (`@logtape/logtape`) | 2.4.2 (2026-10-18) | MIT | 43.2 / 13.0 / 11.7 KB | Runner-up. Zero dependencies, built for edge runtimes, has `@logtape/redaction` and `@logtape/sentry`. One maintainer. Far more than the conventions need |
| `workers-tagged-logger` | 2.0.0 (2026-11-11) | MIT | 3.6 / 1.3 / 1.2 KB | Tags through `AsyncLocalStorage`, made for Workers. No redaction. One maintainer |
| pino | 10.4.0 (2026-10-02) | MIT | 14.6 / 5.3 / 4.8 KB (browser build) | **Doesn't fit, measured.** See below |

**pino on Workers, measured.** The Node build, bundled with esbuild, failed at start in `workerd`: `Dynamic require of "node:os" is not supported`. The browser build ran, but it ignored `redact` (a field named `token` was printed in full) and it did not print one JSON line: it handed `console` an object and a message. [M] The failure of the Node build may come from the bundler, and wrangler might do better. The redaction result is enough to rule it out.

**Why build it.** The conventions fix the fields (`ts`, `level`, `event`, `request_id`, `user_id`, `route`, `duration_ms`, `error_code`) and want redaction on by default. That is a typed function over `console`, and Workers Logs already does the collecting, indexing and searching. A library would add options nobody uses.

### Where the logs go

| Product | What it is | Plan and price [V] |
|---|---|---|
| **Workers Logs** | Stores and indexes what the Worker logs. Already on in the pack (`observability.enabled`) | Until 2026-11-30: Free 200,000 events a day, kept 3 days; Paid 20 million a month included, then $0.60 per million, kept 7 days. **From 2026-12-01** (Cloudflare Observability pricing): Free 0.5 GB ingested a day, kept 7 days, and ingestion **stops** at the limit until midnight UTC; Paid 50 GB a billing cycle and 10 GB-month of storage included, then $0.25 per GB and $0.10 per GB-month |
| `wrangler tail` | Live stream of a Worker's logs | Included |
| Tail Workers | A second Worker that receives the first one's events | Workers Paid, billed by CPU time |
| Workers Logpush | Pushes trace events to R2 or an outside store | **Workers Paid only.** 10 million requests a month, then $0.05 per million |
| OpenTelemetry export | Sends logs and traces to any OTLP destination; `persist: false` skips Cloudflare's copy | Cloudflare's Logpush page now says to prefer this for new integrations |

Other facts that shape the logger:

- **Log objects or JSON, not sentences.** Cloudflare's docs show `console.log({ user_id: 123 })` being indexed by field. The pack's logger passes `JSON.stringify(...)` as a string. Whether a JSON **string** is indexed the same way was not tested. Check it on a deployed Worker, and pass the object if it isn't. **Unverified.**
- **Sampling** is one setting: `observability.head_sampling_rate` (0 to 1), which keeps or drops whole requests. It can't keep every `warn` and `error` while sampling `info`. To honour "never sample warn or error", sample `info` inside the logger and leave head sampling at 1. [V]
- **Limits:** a log line over 256 KB is cut. Retention is 7 days at most. [V]
- **Redaction:** Cloudflare hides header values whose names contain auth, key, secret, token or cookie in tail and trace events. Client IP headers stay. (From the owner's private library, vendor-documented there; not re-read today.)
- **Invocation logs** (one per request, with the URL) are written by Cloudflare, not by the app. They can be turned off with `observability.logs.invocation_logs = false`. [V]

### Request IDs

- Take the ID once, in the first request middleware: the `cf-ray` header when present, else `crypto.randomUUID()`.
- Hold it in `AsyncLocalStorage` (`node:async_hooks`). Node compatibility is on by default for compatibility dates from 2026-08-04 [V], and the pack's `wrangler.jsonc` sets `nodejs_compat` anyway [V], and request-scoped storage worked in `workerd` under concurrent requests (seen through Paraglide's middleware, section 4). [M]
- The logger reads it from there and adds `request_id` to every line. The same ID goes into the error envelope, the UI's reference ID, an `X-Request-Id` response header, and Sentry.

### What the pack's logger still needs

Read on 2026-11-23, `src/lib/logger.ts` writes one JSON line and masks values by key name. Missing against the conventions: `request_id` from request storage, a level switch (`debug` off in production), `info` sampling, and a hook for error monitoring. Masking by key name also misses a secret inside a free-text value, so keep "no bodies, no free text" as a review rule.

### Pairing with the Sentry add-on

Today the add-on turns `console.error` calls into Sentry events (`captureConsoleIntegration`). With a JSON logger, each event's title becomes a JSON blob. Better:

- The logger takes one optional `onError(error, fields)` hook. The Sentry add-on sets it to `Sentry.captureException(error, { tags: { request_id, error_code } })`. The logger stays free of any Sentry import.
- The middleware calls `Sentry.setTag('request_id', id)`, so an event and its log lines share the ID.
- `@sentry/cloudflare` 11.16.0 also exports `consoleLoggingIntegration`, for shipping logs to Sentry. [V] Leave it off: Workers Logs already has them, and Sentry bills for it. [I]

**Recommendation for keeping logs longer:** by default, don't. Seven days in Workers Logs, written down in `docs/stack.md`. When an app needs more, the add-on is Logpush to the app's own R2 bucket (stays on Cloudflare, needs Workers Paid) or OpenTelemetry export to an outside store.

**Verified:** all prices and limits above, the pino result, the sizes. **Inferred or unverified:** JSON-string indexing; Sentry log billing; the redaction rule (not re-read).

Sources (cloudflare-docs at `1c6e632`, 2026-11-22): `workers/observability/logs/workers-logs.mdx`, `logpush.mdx`, `tail-workers.mdx` · `workers/observability/opentelemetry-export.mdx` · `partials/workers/workers_logs_pricing.mdx` · `observability/pricing/index.mdx` · `changelog/workers/2026-08-04-nodejs-compat-default.mdx` · npm registry for the four loggers and `@sentry/cloudflare` · the kit's `stacks/tanstack-start-addons/sentry/ADDON.md`.

---

## 4. Translations

### Options

| Option | Version (released) | Licence | Client size [M] | Type safety | Notes |
|---|---|---|---|---|---|
| **Paraglide JS** (`@inlang/paraglide-js`) | 3.2.2 (2026-11-10); 3.0.0 on 2026-11-03 | MIT | 11.7 / 4.4 / **4.0 KB** for the runtime plus four messages in two languages | By construction: each message is a typed function, a wrong key or a missing parameter doesn't compile | A compiler and Vite plugin. The TanStack Router repository ships a Start example for it |
| `i18next` + `react-i18next` | 27.2.4 (2026-11-22) + 18.0.3 (2026-11-19) | MIT | 66.5 / 22.7 / **20.5 KB** | Keys, through type augmentation over the JSON files | The most established. Namespaces map to "one file per module per language". Lazy loading per namespace |
| Lingui (`@lingui/core` + `@lingui/react`) | 6.12.0 (2026-11-03) | MIT | 10.5 / 4.4 / **3.9 KB** | Through macros and extraction | Macros need a Babel step: `@lingui/vite-plugin` has `@babel/core` and `@rolldown/plugin-babel` as peers. PO files |
| `use-intl` | 4.15.1 (2026-11-12) | MIT | 40.7 / 12.5 / **11.2 KB** | Keys and ICU arguments, through augmentation | From the next-intl repository. Framework-neutral, but its home is a Next.js project |
| `react-intl` (FormatJS) | 12.2.0 (2026-11-18) | BSD-3-Clause | 50.2 / 14.6 / 13.0 KB | Weak without extra tooling | ICU. Mature |

### What was checked for Paraglide

- **It runs on Workers with a locale per request.** A Worker using the generated `paraglideMiddleware` answered four concurrent German requests (by cookie) and four English ones correctly in `workerd`. It loads `AsyncLocalStorage` from `async_hooks`. [M]
- **TanStack fit.** `examples/react/start-i18n-paraglide` exists in the TanStack Router repository, with the Vite plugin, the server middleware and the router's `rewrite` hooks for localized URLs. It pins Paraglide `^2.4.0`, not 3. No example was found there for i18next, Lingui or use-intl (guessed folder names returned 404, which is weak evidence). [V]
- **Trap: the default setup downloads a plugin at build time.** The TanStack example's `project.inlang/settings.json` points at `https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/...`, and Paraglide 3.2.2's own `init` defaults write `.../plugin-message-format@4.5.0/...` (both on jsdelivr) [V]. With that host blocked, the compiler printed a warning, said "Successfully compiled", and produced **zero messages**. [M] Installing `@inlang/plugin-message-format` 4.6.0 from npm and pointing `modules` at `./node_modules/@inlang/plugin-message-format/dist/index.js` fixed it. [M]
- **Every language is in every message function** by default (`if (locale === "de") ... else ...`), so the client grows with messages times languages. Per-language builds exist but are marked experimental (`experimentalPerLocaleBuild`). [V]
- **It changed hands and just had a major release.** The npm maintainer of 2.21.0 was the original author; the maintainer of 3.2.2 is a `generaltranslation.com` account, and the repository moved from `opral/paraglide-js` to `generaltranslation/paraglide-js`. 3.0.0 is three weeks old and removed options. [V] What the new owner plans is unknown.

### Recommendation: Paraglide JS 3.2.2, with conditions

It is the smallest, it is typed in the way agents benefit from most (a bad key fails `pnpm typecheck`), and it is the one TanStack's own repository carries an example for. On a pack whose `/notes` page is already over its 150 KB target, 4 KB against 20 KB matters.

Conditions, all cheap:

1. Install the format plugin from npm and reference it by path. No network at build time.
2. Pin exact versions of both packages.
3. Add a test that the compiled output has at least as many messages as `messages/en.json` has keys, because the compiler reports success on an empty result.
4. Spike it in the real pack first: Start plus `@cloudflare/vite-plugin` plus the pack's nonce CSP and request middleware. **Not done here.**

**Fallback:** `i18next` 27 with `react-i18next` 18. If the spike fails, or the ownership change turns out badly, it is the safe choice at a cost of about 16 KB brotli. It is what the conventions name today.

**English only stays the default.** `<module>/copy.ts` per module, no library. With Paraglide the later move is small: each `copy.ts` entry becomes a message function with the same name.

**Verified:** versions, sizes, the Workers run, the build-time download trap, the maintainer and repository change, the example's existence and its pin. **Inferred:** popularity of each; that Lingui's Babel step slows a Vite 8 build; anything about the new owner's plans.

Sources (2026-11-23): npm registry (versions, maintainers, peers, per-version metadata) · [Paraglide CHANGELOG](https://github.com/generaltranslation/paraglide-js/blob/main/CHANGELOG.md) · [TanStack Router `start-i18n-paraglide` example](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide) · the compiled output of Paraglide 3.2.2.

---

## 5. OpenAPI from Zod 4

### Options

| Option | Version (released) | Licence | Dependencies | Notes |
|---|---|---|---|---|
| **`zod-openapi`** | 6.0.2 (2026-08-31) | MIT | none; peer `zod ^4.0.0` | Uses Zod 4's own `.meta()`. No patching of Zod. One `createDocument({...})` call. Handles input and output shapes and named components. Types cover OpenAPI 3.1.0, 3.1.1 and 3.2.0. One maintainer |
| `@asteasolutions/zod-to-openapi` | 9.1.0 (2026-07-19) | MIT | `openapi3-ts` (which pulls `yaml`); peer `zod ^4.0.0` | A registry you fill step by step, then a generator class. Also emits 3.0. `@hono/zod-openapi` is built on it |
| Zod 4's `z.toJSONSchema()` plus our own wrapper | Zod 4.6.7 | MIT | none | Gives the schema objects. We would write the rest: query parameters from an object, `$ref` components, input against output, response maps |
| oRPC (`@orpc/openapi`) | 1.16.4 (2026-11-19) | MIT | 9 | A whole RPC layer that also emits OpenAPI. It would replace the pack's controllers, not describe them |

**Tried on schemas shaped like the pack's** (`z.strictObject`, `z.coerce.number().int().min(1).max(100).default(20)`, `z.uuid()`, `z.iso.datetime()`):

- `zod-openapi` and `@asteasolutions/zod-to-openapi` both produced a valid-looking document. Both turned the list query object into `cursor` and `limit` query parameters with the right bounds and default, and both kept `additionalProperties: false`. [M]
- The native route produced correct JSON Schema, including a registry export with `#/components/schemas/Note` IDs, but only the schemas. [M]
- Build-time bundle, for scale: `zod-openapi` 18.2 / 5.0 / 4.5 KB; asteasolutions 27.8 / 7.8 / 7.1 KB. Neither ships to the browser. [M]

### Recommendation: `zod-openapi` 6.0.2

The provisional pick in the conventions holds. It is the thinnest thing that isn't hand-rolling: no dependencies, no Zod patching, and its input is one plain object per version, which matches "one document per version".

How it fits the pack:

- **One file per API version**, `src/api/openapi.v1.ts`, exports the `createDocument` input. Each module adds its paths from the same schemas its controller validates with (`src/modules/<name>/schemas.ts`). `servers: [{ url: '/api/v1' }]`, one `bearer` security scheme for the Clerk token, and the pack's error envelope as a named component.
- **Response schemas are new work.** The pack's schemas today describe inputs. Each DTO needs a Zod schema too, for the document and for the contract tests.
- **Generation in CI is a test.** A Vitest test builds the document and compares it with the committed `openapi/openapi.v1.json`. A route change without a spec change fails `pnpm test`. A `pnpm openapi:write` script updates the file. Vitest already resolves the `@/` alias, so no extra runner is needed. [I]
- **Per-version docs:** `/api/v2` gets its own `openapi.v2.ts` and JSON file. Both import the shared schemas where they still agree.
- **A drift check the generator can't do:** a test that walks the route tree for `/api/v*` files and fails if a path is missing from the document.

### Viewer

| Viewer | Version (released) | Licence | Standalone bundle [M] | Notes |
|---|---|---|---|---|
| **Scalar** (`@scalar/api-reference`) | 1.83.0 (2026-11-22) | MIT | 4.44 MB raw, **1.28 MB gzip** | Modern, with a built-in request client. **`telemetry` defaults to `true`** in its config schema, and its README example sets `proxyUrl: 'https://proxy.scalar.com'` [V] |
| Swagger UI (`swagger-ui-dist`) | 5.35.1 (2026-11-19) | Apache-2.0 | 1.65 MB raw, **448 KB gzip**, plus 26 KB gzip of CSS | The classic. A third the size. Depends on `@scarf/scarf`, an install-time analytics package [V] |
| Redoc | 3.2.0 (2026-11-19) | MIT | 2.28 MB raw, 660 KB gzip | Read-only docs. Version 3 added peers (`react-router`, `styled-components`, `@redocly/config`) and a `@redocly/redoc-opentelemetry` dependency [V] |

**Pick: Scalar**, with three rules:

1. **Never in production by default.** One server route (`/api/docs`) that returns 404 unless the environment is local or test, where the pack's site protection (Cloudflare Access or the password gate) already stands in front. To show docs in production, put the route behind Clerk auth.
2. **Self-host the script.** Copy `standalone.js` into the build's static files. No CDN, so the CSP isn't widened to a third party.
3. **Set `telemetry: false` and no `proxyUrl`.**

Not checked: whether Scalar runs under the pack's nonce CSP. The docs route may need its own, looser policy for that one page. If the size or the telemetry default bothers the owner, Swagger UI is the drop-in second choice.

**Verified:** versions, licences, peers, the generated output, viewer sizes, Scalar's telemetry default. **Inferred:** the Vitest-as-generator plan; CSP behaviour of any viewer.

Sources (2026-11-23): npm registry · the `zod-openapi` 6.0.2 and `@asteasolutions/zod-to-openapi` 9.1.0 READMEs and type files · `@scalar/types` config schema · the installed viewer packages.

---

## 6. Product analytics events

### What each destination can do

| Destination | Custom events? | Free allowance | Notes |
|---|---|---|---|
| Cloudflare Web Analytics | **No.** The FAQ: "Does Web Analytics support custom events? Not yet" [V] | Free | Page views, referrers, Core Web Vitals. Tracks SPA navigations by itself. Unsampled for 7 days, then about 10%; six months of history [V]. Already a kit add-on |
| **The app's own D1 table** | Yes | Free plan: 100,000 rows written and 5 million read a day, 5 GB [V] | Exact counts, joins with the app's own tables, works in tests and local dev. No charts. Shares the app's write allowance |
| Workers Analytics Engine | Yes | Free plan: 100,000 data points written and 10,000 queries a day. "Currently, you will not be billed" [V] | Built for this, and writes don't block. Kept three months. 250 data points per invocation. Queried over an HTTP SQL API with a token; no joins with app data |
| PostHog | Yes, plus funnels, retention, replay | 1 million events a month [S] | `posthog-js` 1.453.2: **369 KB min, 125 KB gzip, 106 KB brotli** [M]. Licence `(Apache-2.0 AND MIT)`; 1.200.0 was MIT [V]. `posthog-node` 6.0.5: 242 / 75 / 65 KB [M] |

### Recommendation

**Default: the registry, `track()`, and a D1 table.**

- `lib/analytics-events.ts` is the typed registry the conventions describe. `lib/track.ts` exports the one `track(name, props)`. Its types only accept registry names and properties.
- `track()` calls an `AnalyticsSink` port. The default adapter writes one row to `analytics_events` (`id`, `name`, `props` as JSON text, `user_id`, `request_id`, `created_at`) and logs the same name through the logger. Tests use a memory fake.
- Server-side for the facts that matter (sign-up, payment). Client-side UI events go to one server function that validates against the registry and calls the same `track()`. It sits behind the pack's existing rate limit.
- A scheduled job deletes rows older than the retention written in `docs/stack.md`.

Why D1 over Analytics Engine for the default: at a starter's volume, exact rows that join with users and notes answer product questions with plain SQL, and they work offline in tests. Move high-volume UI events to Analytics Engine when the D1 write allowance gets tight; that is a second adapter behind the same port.

**Add-on: PostHog**, when the person wants funnels, retention or session replay.

- Server events: a PostHog adapter for the same port. Either `posthog-node` or a plain `fetch` to PostHog's capture endpoint, sent inside `waitUntil` so the response isn't held up. Which one works best on Workers was **not tested**.
- Browser: load `posthog-js` lazily, after first paint and only with consent where the law asks for it. At 125 KB gzip it must never be in the first load of a pack whose page target is 150 KB.
- It is a new data processor: the add-on's lane is `risky`, and the CSP gets PostHog's host.

**Keep the Cloudflare Web Analytics add-on** for page views and Web Vitals. It is not a `track()` destination.

**Verified:** the Web Analytics FAQ, the D1 and Analytics Engine numbers, PostHog package sizes and licence. **Secondary or inferred:** PostHog's free million and its prices (sources disagree on paid rates); how `posthog-node` behaves on Workers.

Sources: cloudflare-docs `web-analytics/faq.mdx`, `web-analytics/get-started/web-analytics-spa.mdx`, `analytics/analytics-engine/pricing.mdx` and `limits.mdx`, `partials/workers/d1-pricing.mdx` (2026-11-22) · npm registry for `posthog-js` and `posthog-node` · [posthog.com/pricing](https://posthog.com/pricing) (through a search summary, 2026-11-23).

---

## 7. Feature flags

### Options

| Option | Version (released) | Licence | Size [M] | Notes |
|---|---|---|---|---|
| **In-house: a typed list, values from config** | none | ours | about 30 lines | What the conventions ask for. No request-time I/O |
| OpenFeature SDK with a provider | `@openfeature/server-sdk` 1.23.0 (2026-07-28); web 1.10.0; React 1.4.1 | Apache-2.0 | server 21.8 / 6.0 / 5.3 KB; web plus React 32.1 / 9.1 / 8.2 KB | The vendor-neutral standard (CNCF). Worth it once there is a real provider. The server SDK imports `async_hooks` |
| **Cloudflare Flagship** | `@cloudflare/flagship` 0.7.0 (2026-11-04) | Apache-2.0 | not measured | Cloudflare's flag service. **Public beta since 2026-05-26.** A Workers binding (`env.FLAGS.getBooleanValue('key', false, context)`), targeting rules, percentage rollouts, an audit history, a local flag store in `wrangler dev` and the Vite plugin, and OpenFeature providers [V]. **No price is published in the docs** |
| A hosted service (LaunchDarkly, GrowthBook, PostHog flags) | `@launchdarkly/cloudflare-server-sdk` 2.7.56; `@growthbook/growthbook` 2.2.0 | Apache-2.0; MIT | not measured | More account, more cost, more bundle. Nothing a new app needs |

### Recommendation

**Default: build the small one.**

- `lib/flags.ts` holds a typed list of flags, each with a default, an owner and a date, like the event registry.
- Values come from `vars` in `wrangler.jsonc`, per environment (for example `FLAGS: "new_checkout,bulk_export"`), read through the typed env schema in the composition root. A flag is on in test and off in production by editing config and deploying.
- The function is `isEnabled(flag, context?)`. Shape it like OpenFeature's and Flagship's `getBooleanValue(key, default, context)` so a later swap changes one file.
- A test fails when a flag in the list is older than, say, 90 days, so finished flags get removed. [I]

**No D1 table in the default.** A flag row read on every request costs a query and adds a way for the app to fail. Flipping a flag by deploy is fine while one person owns the product.

**Add-on: Cloudflare Flagship**, when the app needs to flip a flag without a deploy, roll out to a percentage, or target a plan. It is the Cloudflare-native choice and speaks OpenFeature, so it isn't a lock-in. Offer it once it leaves beta and its price is known. Until then, an app that needs runtime flags today can put overrides in D1 or KV behind the same function.

**Verified:** Flagship's existence, beta date, binding API, limits (10,000 apps, 5,000 flags per app, both soft) and local store; OpenFeature versions and sizes. **Unverified:** Flagship's price and when it leaves beta.

Sources (cloudflare-docs at `1c6e632`): `flagship/index.mdx`, `flagship/binding/index.mdx`, `flagship/reference/limits.mdx`, `flagship/sdk/server-provider.mdx`, `changelog/flagship/2026-05-26-public-beta.mdx`, `2026-11-02-local-flag-store.mdx` · npm registry.

---

## 8. IDs

### Options

| Option | Version (released) | Licence | Size [M] | Sorts by time? | Notes |
|---|---|---|---|---|---|
| **UUIDv7 from `uuid`** | 14.0.3 (2026-10-10) | MIT | 1.3 / 0.7 / **0.6 KB** | yes | The standard format (RFC 9562). Zero dependencies. The package everyone already has in their lockfile [I] |
| UUIDv7 from `uuidv7` | 1.2.1 (2026-03-22) | Apache-2.0 | 4.7 / 1.8 / 1.5 KB | yes | A 42-bit counter, very careful about order. Apache-2.0 is fine, but brings a NOTICE duty when copied |
| UUIDv7 written by hand on `crypto.getRandomValues` | none | ours | about 10 lines | **not within one millisecond** | See the measurement below |
| ULID (`ulid`) | 3.0.2 (2025-11-30) | MIT | 2.3 / 1.1 / 1.0 KB | yes | 26 characters, shorter to read. Not an RFC, and no native database type |
| nanoid | 6.0.2 (2026-10-05) | MIT | 0.2 KB | no | Random only. Right for share tokens, wrong for primary keys under the conventions |
| `crypto.randomUUID()` | built in | none | 0 | no | UUIDv4. What the pack uses today |

### What was measured in `workerd`

- **There is no built-in UUIDv7.** `crypto.randomUUIDv7` is `undefined` on Workers and on Node 22. `crypto.randomUUID()` gives v4. [M]
- **The clock stands still inside a request.** 2,000 calls to `Date.now()` in one request gave 2 distinct values. Workers only moves the clock forward at I/O. So every ID made in one batch shares a timestamp. [M]
- **`uuid`'s `v7()` stays in order anyway:** 2,000 IDs made in a row were strictly increasing. [M]
- **A ten-line version doesn't:** it was valid and had the right timestamp, but the 2,000 IDs were not in order, because the bits after the timestamp are random. [M]
- **Zod accepts it.** The pack's `z.uuid()` allows versions 1 to 8. [M]

That second and fourth point settle "library or hand-rolled": on Workers the hand-rolled version loses the one property it was chosen for whenever a request inserts several rows.

### Recommendation: UUIDv7, `v7()` from `uuid` 14.0.3

- In the composition root: `newId: () => v7()` in place of `crypto.randomUUID()`. Services keep receiving `newId`, so tests still pass a fixed one.
- **D1:** `text('id').primaryKey()`, the 36-character form. Nothing else changes: `z.uuid()` and the keyset pagination on `(created_at, id)` keep working.
- **Postgres (the Supabase add-on):** the native `uuid` column type, 16 bytes. PostgreSQL 18 has a built-in `uuidv7()` [V: `doc/src/sgml/func.sgml` on `REL_18_STABLE`; the September 2025 release date is from memory, I], but the conventions say the server makes the ID, not the database, so keep `v7()` in the app for both databases.
- **Why UUIDv7 over ULID:** it is the standard, Postgres stores it natively, every tool and validator knows it. ULID's shorter string is its only gain.

Two cautions:

- **A UUIDv7 shows when the row was made** (the first 48 bits are the time). Never use it as a secret. Invite links and share tokens get their own random value.
- **Order is per isolate.** Two Workers isolates inserting in the same millisecond can interleave. IDs are for uniqueness and rough order; sort lists by `created_at, id` as the pack already does. [I]

**Verified:** every bullet under "measured", versions, licences, sizes. **Verified at the fact-check:** PostgreSQL 18's `uuidv7()`, in the source. **Inferred:** which Postgres version Supabase runs; popularity.

Sources (2026-11-23): npm registry · the `uuid` 14.0.3 and `uuidv7` 1.2.1 READMEs · [PostgreSQL 18 release announcement](https://www.postgresql.org/about/news/postgresql-18-released-3142/) (through a search summary).

---

## 9. Payload CMS

### What Payload is today

| Fact | Detail | Mark |
|---|---|---|
| Current version | `payload` **3.94.1** (2026-11-20) is `latest`. **4.0.0-beta.11** (same day) is on the `beta` tag | [V] |
| Licence | MIT (`LICENSE.md`, and every `@payloadcms/*` package checked) | [V] |
| Payload 3 and Next.js | The admin panel and the REST and GraphQL routes run inside a Next.js app. `@payloadcms/next` 3.94.1 has `next` as a peer: `>=15.2.9 <15.3`, `>=15.3.9 <15.4`, `>=15.4.11 <15.5`, or `>=16.4.5 <17` (15.5 to 16.4.4 are excluded) | [V] |
| Owner | Figma bought Payload in 2025. Payload Cloud has paused new sign-ups | [S] |
| Cost | The software is free. You pay for where it runs. No current managed price for new customers was found | [S] |

### Payload on Cloudflare

There is an official template, `templates/with-cloudflare-d1` [V]. **On `main` it is already the Payload 4 beta** (`@payloadcms/db-d1-sqlite` 4.0.0-beta.11, Node `^24.22.3 || >=26.13.1`). The Payload 3 version is at the `v3.94.1` tag (`@payloadcms/db-d1-sqlite` 3.94.0, `@opennextjs/cloudflare` 1.20.1, Node 22 allowed) [V]. Both versions:

- Next.js 16.4.6, built for Workers with **`@opennextjs/cloudflare`**.
- **`@payloadcms/db-d1-sqlite`** for D1. Payload's docs: "This adapter is currently in beta." D1 read replicas are "experimental".
- **`@payloadcms/storage-r2`** for uploads.
- A custom `console` logger, because Payload's default (`pino-pretty`) fails on Workers.
- Known issues in its README: "full support for GraphQL is not currently guaranteed when deployed", and "This can only be deployed on Paid Workers right now due to size limits" (3 MB).

That last line looks out of date: Cloudflare removed the compressed size limit on 2026-09-04, and the limit is now 64 MiB uncompressed on Free and Paid. [V] Whether Payload's admin fits the Free plan's 10 ms of CPU per request was not tested; assume Workers Paid. [I]

### Payload 4 and TanStack Start

This is new and changes the long-term answer [V]:

- Payload 4 adds **`@payloadcms/tanstack-start`** (4.0.0-beta.11, first published 2026-06-09). The docs: "Payload's Admin Panel also runs on TanStack Start."
- `@payloadcms/ui` "no longer depends on `next` directly".
- Its peers are `vite >=8`, `@tanstack/react-start ^1.169.1`, `@tanstack/react-router ^1.170.44`, React `^19.3.1`; the pack's 1.169.7, 1.170.46, Vite 8.3.8 and React 19.3.1 meet them [V].
- It needs **React Server Components**: `@vitejs/plugin-rsc` 0.5.38 or newer. TanStack Start's own docs say "Server Components are experimental!"
- The `blank-tanstack` template targets a **Node server** (`srvx`) with MongoDB. There is **no TanStack Start plus Cloudflare template**. The only Cloudflare template is still the Next.js one.
- Tooling needs Node `^24.22.3 || >=26.13.1`. The pack's CI runs Node 22.
- Payload's own demo repository for it is described as experimental and not for production. [S]

So "Payload inside a TanStack Start app on Workers" is three unproven things at once: a beta CMS, an experimental framework feature, and a runtime nobody has published a template for.

### The ways to offer a CMS

| Way | Fits the kit? |
|---|---|
| **A. Payload 3 inside the app** | No. It needs Next.js as the host framework |
| **B. Payload 4 beta inside the TanStack Start app** | Not yet. Beta, needs experimental RSC, unproven on Workers. Revisit at 4.0 stable |
| **C. Payload as its own service** (its own repository and deploy), read by the app over HTTP | Possible today, with caveats below |
| **D. Content in the repo: Markdown** | Yes. Free, versioned, reviewed like code |
| **E. Another headless CMS** | See the table below |

**C in detail.** The CMS is a separate Worker made from the official Cloudflare template (D1 and R2 of its own), taken from the `v3.94.1` tag, not `main` (which is 4.0 beta). The app reads it through Payload's REST API, with `@payloadcms/sdk` 3.94.1 or plain `fetch`, and checks every response with Zod at the boundary. Caveats:

- **Next.js is still there**, contained in the CMS service. The app has none of it, but someone maintains a Next.js project.
- **The Local API is not available** across services. It only works in the process Payload runs in. REST only; GraphQL isn't guaranteed on Workers.
- The D1 adapter is beta, and the plan is Workers Paid.
- A second deploy, a second set of secrets, a second login for editors (Payload's own auth, not Clerk).

**Alternatives**

| Option | Version | Licence | Runs with Workers? | Notes |
|---|---|---|---|---|
| **Markdown with Content Collections** | `@content-collections/core` 0.15.3, `@content-collections/vite` 0.3.1 (2026-09-21) | MIT | Yes: content is built into the app | TanStack Start's own "Rendering Markdown" guide uses it, with `@tanstack/markdown` 1.2.1 (MIT, zero dependencies, first released 2026-06-21) as the renderer. Frontmatter is validated with Zod. TanStack Markdown doesn't run MDX and doesn't cover all of CommonMark [V] |
| Keystatic | `@keystatic/core` 0.6.10 (2026-11-17) | MIT | Edits files in the repo through GitHub | An editing screen over the same Markdown files. Still 0.x. 62 dependencies [V]; the rest [I] |
| Sanity | `@sanity/client` 8.17.0 (2026-11-19) | MIT client; hosted service | Yes: the app only calls an API | Free tier exists [I]. A paid service past it; ask the person first |
| SonicJS | `@sonicjs-cms/core` 3.0.1 (2026-11-19) | MIT | Made for Workers: Hono, D1, R2 | One maintainer; this package dates from 2025-10. Promising, young [V] |
| EmDash | `emdash` 1.6.0 (2026-11-22) | MIT | Yes, but it is built on **Astro** (peer `astro >=6`) | A site-plus-CMS, not a headless add-on for a Start app [V]; the rest [I] |
| TinaCMS / Decap | 3.15.2 (Apache-2.0) / 3.18.0 (MIT) | permissive | Git-based editors | Not looked at further |
| Strapi (`@strapi/strapi`) | 5.63.0 | MIT, except anything under an `ee/` folder, which is under Strapi's Enterprise licence [V, the package's `LICENSE`] | No: needs a Node server and a database | Usable core; keep the EE parts out |
| Directus | 12.7.0 | **Monospace Sustainable Core License 1.0 (MSCL-1.0-GPL)**: source-available, bans a "Competing Use", becomes GPL-3.0 four years after each release [V, the package's `license`] | No: needs a Node server | Not BUSL-1.1 as first guessed, but still source-available, so the kit's licence rule keeps it out |

### Recommendation

**Offer a `content` add-on, and don't offer Payload inside the app.**

1. **Default CMS add-on: content in the repo.** Markdown files, Content Collections for typed, validated loading, TanStack Markdown to render. It is free, it is all TanStack and Vite, it deploys with the app, and an agent can write and review content like code. Add `@content-collections/mdx` only if a page truly needs components in content (its last release is from 2025-03).
2. **A `ContentSource` port from the start.** Pages ask the port for posts and pages. The Markdown adapter is the default. This is what makes a CMS a later swap and not a rewrite.
3. **Payload as a documented recipe, not kit files.** For an app whose editors can't use Git: "run Payload as its own service from the official Cloudflare template, and add a REST adapter for `ContentSource`." The kit ships the adapter and the instructions, not a Next.js project. The tech grill asks: *"Will people who don't use GitHub edit the content?"* and only then offers it, with the costs above stated plainly.
4. **Re-check when Payload 4.0 is stable.** If it then runs on Workers through the TanStack Start adapter, it becomes a real in-app add-on: one deploy, the Local API, no Next.js. Today that is unproven.

**Verified:** versions and tags, licences, the Cloudflare template's contents and README, the D1 adapter's beta banner, the Payload 4 docs on TanStack Start and RSC, the `blank-tanstack` template's targets, the Workers size limit change, the TanStack Markdown guide. **Secondary:** the Figma purchase, Payload Cloud's pause, the demo repository's wording. **Inferred or unverified:** CPU fit on Workers Free; every alternative beyond its registry data.

Sources: `payloadcms/payload` `main` at `ce66418` (2026-11-21): `docs/getting-started/installation.mdx`, `docs/database/sqlite.mdx`, `docs/production/deployment.mdx`, `docs/migration-guide/v4.mdx`, `templates/with-cloudflare-d1/`, `templates/blank-tanstack/`, `LICENSE.md` · TanStack Router `main`: `docs/start/framework/react/guide/rendering-markdown.md`, `server-components.md`, `hosting.md` · cloudflare-docs `changelog/workers/2026-09-04-increased-worker-size-limit.mdx`, `workers/platform/limits.mdx` · npm registry · web search summaries of payloadcms.com and figma.com/blog (2026-11-23; `payloadcms.com` itself could not be opened).

---

## What this changes in the conventions

Nothing was edited. These are the lines in `guide/app-conventions.md` that say "until research confirms", and what this research says.

| Rule | Says today | Research says |
|---|---|---|
| 11 Time | "`date-fns` with `@date-fns/tz`" as the fallback | `temporal-polyfill` 1.0.8, so the code is written against Temporal from day one. Add the `temporal` compatibility flag on the Worker until 2026-12-01 |
| 12 Database | "UUIDv7 or ULID (one per project, picked in the tech grill)" | UUIDv7, from `uuid`'s `v7()`. No need to ask |
| 13 Logging | "Logpush to keep them longer" | Workers Logs only by default (7 days). Logpush needs Workers Paid, and Cloudflare now points new setups at OpenTelemetry export. Workers Logs pricing changes on 2026-12-01 |
| 15 OpenAPI | "`zod-openapi`" | Confirmed, 6.0.2. Viewer: Scalar, off in production |
| 17 Translations | "`i18next` with `react-i18next`" | Paraglide JS 3.2.2 if the spike passes; i18next stays the fallback |

The money, analytics and flag rules need no change: the picks fit them as written.

## Top risks

1. **Paraglide** changed maintainers and shipped a major release three weeks ago. Its default setup fetches code from a CDN at build time and reports success with zero messages when that fails. Mitigated by the four conditions in section 4, not removed.
2. **Temporal's dates can slip.** The Workers default (2026-12-01) and Safari 27.3 are both in the future. The polyfill pick doesn't depend on either date.
3. **Dinero** is one maintainer and was in alpha for over four years before March 2026. The wrapper keeps it to one file.
4. **Flagship is beta with no price.** It is only the add-on, never the default.
5. **Payload** is the area most likely to be out of date in three months: version 4 is in beta and moving weekly.
6. **Everything here was measured in isolation.** Nothing was installed in the pack, built with `@cloudflare/vite-plugin`, or deployed.

## Still unverified

- Download counts and so "popular" for every library (`api.npmjs.org` was unreachable).
- Temporal on a **deployed** Worker, and the release date of Safari 27.3.
- Whether Workers Logs indexes a JSON **string** the way it indexes an object.
- Paraglide, Scalar and `temporal-polyfill` inside the real pack: its build, its nonce CSP, its bundle budget.
- `posthog-node` on Workers; PostHog's current prices.
- Cloudflare Flagship's price and the end of its beta.
- Payload's CPU use on Workers Free; Payload 4 on Workers at all; the Figma and Payload Cloud details.
- Supabase's Postgres version.
- That Vitest can serve as the OpenAPI generator without extra setup.

## Fact-check

An independent pass on 2026-11-23, by a different agent, starting from the claims and not the conclusions. It re-ran `npm view` for every package, read the primary sources again (raw files from `cloudflare/cloudflare-docs` `production`, `cloudflare/workerd` `main`, `payloadcms/payload` `main` and the `v3.94.1` tag, `TanStack/router` `main`, `tc39/proposals`, `Fyrd/caniuse`, `postgres/postgres` `REL_18_STABLE`, Apple's Safari release-notes JSON, `@mdn/browser-compat-data` 8.1.10), and repeated two probes. Sizes and the 16-case accuracy run were not repeated.

### What changed

- **Payload's Cloudflare template.** On `main` it is already the 4.0 beta (Node 24 or 26 only). The Payload 3 template is at the `v3.94.1` tag. Option C now says to take it from there.
- **`@payloadcms/next` peer range.** Was "15.2 to 16.x". It is four narrow ranges; 15.5 to 16.4.4 are excluded.
- **Directus licence.** Was "believed BUSL-1.1". It is MSCL-1.0-GPL: source-available, with a competing-use ban, turning GPL-3.0 after four years. The verdict (keep it out) stands.
- **Strapi licence.** Was "not read". MIT, except `ee/` folders under an Enterprise licence.
- **Paraglide's CDN URL.** The `@4` URL is the TanStack example's. Paraglide 3.2.2's own `init` writes a pinned `@4.5.0` jsdelivr URL. Same trap.
- **Added:** Temporal's expected publication year (ES2027); Payload 4's TanStack adapter peers, which the pack meets; the pack already sets `nodejs_compat`; PostgreSQL 18's `uuidv7()` moved from secondary to verified.

### What was confirmed

- Every version, release date, licence and `latest` tag in the tables. Every one matched the registry.
- Maintainers: one each for `dinero.js`, `zod-openapi`, LogTape, `workers-tagged-logger`, SonicJS, `uuidv7`. Paraglide 2.21.0 by the original author with the `opral/paraglide-js` repository; 3.2.2 by a `generaltranslation.com` account with `generaltranslation/paraglide-js`.
- Temporal: Chrome and Chrome Android 144 (2026-01-13), Edge 144 (2026-01-21), Firefox 139 (2025-05-27), Samsung 31.0 (2026-09-23), Node 26.0.0 (2026-05-05), Deno 2.7, Bun 1.4.0, Safari and iOS 27.3 (MDN). Safari 27.2 released 2026-10-26; Apple's 27.3 beta notes, dated 2026-11-16, build 20626.1.17, say "Added support for `Temporal`". caniuse still says no for 27.3, 72.14% global. Node 22.23.5 has no Temporal and no `randomUUIDv7`.
- Workers: `temporal` / `no_temporal`, enable date 2026-12-01, in `compatibility-date.capnp`, the flag page and the changelog. **Re-measured** in `workerd` 1.20261117.1 (what wrangler 4.164.0 pins): no Temporal at 2026-11-17, Temporal with the flag, and a refusal of the future date 2026-12-01.
- Workers Logs prices before and after 2026-12-01, the stop at the Free limit, 7-day retention, 256 KB lines, `head_sampling_rate`, `invocation_logs`; Logpush Paid-only at 10 million then $0.05 per million; the "prefer OpenTelemetry export" note and `persist: false`; Tail Workers billed by CPU time; the 64 MiB size limit from 2026-09-04; 10 ms CPU on Free.
- D1, Analytics Engine and Web Analytics numbers and quotes, including "Not yet" on custom events.
- Flagship: public beta on 2026-05-26, "Beta" badge on its docs, the binding call, soft limits of 10,000 apps and 5,000 flags, the local store (2026-11-02), the OpenFeature provider. No pricing page found.
- Paraglide's trap, **re-measured**: with the plugin URL unreachable, 3.2.2 printed `PluginImportError`, then "Successfully compiled", and emitted no message files. With the npm plugin by path it emitted them.
- The TanStack example pins Paraglide `^2.4.0`. TanStack's guide uses Content Collections and `@tanstack/markdown`, and says it doesn't run MDX or all of CommonMark. Server Components are "experimental".
- Payload: MIT, 3.94.1 `latest`, 4.0.0-beta.11 `beta`, the TanStack adapter first published 2026-06-09, "`@payloadcms/ui` no longer depends on `next` directly", `@vitejs/plugin-rsc ^0.5.38`, `blank-tanstack` on `srvx` and MongoDB, the template README's Paid-plan and GraphQL lines, the D1 adapter's beta banner.
- Scalar's `telemetry` defaults to `true` (`@scalar/types` 0.32.0) and the README shows `proxy.scalar.com`. `swagger-ui-dist` depends on `@scarf/scarf`. `uuid` 14.0.3 has no dependencies, and 2,000 `v7()` IDs in a row sorted strictly on Node too.

### What could not be verified, and why

- PostHog's free allowance and prices, the Figma purchase and Payload Cloud's pause: `posthog.com`, `payloadcms.com` and `figma.com` were blocked from this session. Still [S].
- Download counts: `api.npmjs.org` was blocked. "Popular" stays [I].
- PostgreSQL 18's release date: `postgresql.org` was blocked. From memory.
- Not repeated: sizes, the 16 Temporal cases, Dinero's behaviour, the pino run, Paraglide on `workerd`, the OpenAPI output. They stay as first measured.
- Everything that was already marked inferred: deployed Workers matching local `workerd`, Safari 27.3's ship date, JSON-string indexing, Payload's CPU use.

No pick changes. The Payload recipe now names the right template version.

