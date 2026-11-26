# Stub pack: Python service with FastAPI

**Stub pack. Not built yet. Researched 2026-11-22 (fact-checked). Re-check versions before building.**

**Confidence: high** for the code stack (FastAPI, uv, ruff, pyright, pytest, import-linter). **Medium-low** for Cloudflare Python Workers as the deploy target, until someone runs the example module there and measures CPU per request.

Source: `research/platform-packs.md`, section 3, and fact-check rows 36 to 49. Marks: [V] verified, [S] secondary, [I] inferred, as in the dossier.

## When to choose it

**Ask first: does this need Python at all?** A service that only calls model APIs over HTTP can live in the web pack's TypeScript Worker for nothing extra.

Choose it when the work needs Python libraries: data frames, document parsing, ML models, or an agent framework that only exists in Python.

Don't choose it when:

- the work is plain CRUD or calls one HTTP API (use the web pack);
- the person wants Django's admin and ORM (use Django instead, below).

Alternatives considered:

- **Litestar 2.25:** good and typed, team-run, fewer examples, no documented Workers path.
- **Django 6.1 + django-ninja 1.8:** very mature, but a large surface and agents drift into fat models. Cloudflare maintains `django-cf`.
- **Flask 3.1:** no typed request handling without add-ons.

## Pinned versions

Re-check any row with `curl -s https://pypi.org/pypi/<name>/json | jq -r .info.version` (or `pip index versions <name>`).

| Piece | Version | Re-check with |
|---|---|---|
| Python | 3.14.10 (3.15.2 exists; 3.14 has wider wheel coverage [I]) | `uv python list` |
| uv (commit `uv.lock`) | 0.13.9 | PyPI `uv` |
| FastAPI | 0.165.0 (needs Python 3.11+) | PyPI `fastapi` |
| pydantic / pydantic-settings | 2.14.4 / 2.16.3 | PyPI `pydantic`, `pydantic-settings` |
| uvicorn (containers) | 0.54.0 | PyPI `uvicorn` |
| ruff | 0.17.6 | PyPI `ruff` |
| pyright (strict) | 1.1.414 | PyPI `pyright` |
| import-linter | 2.17 | PyPI `import-linter` |
| pytest / pytest-asyncio / httpx | 9.2.0 / 1.5.0 / 0.28.1 | PyPI each |
| schemathesis | 4.34.0 | PyPI `schemathesis` |
| poethepoet | 0.49.0 | PyPI `poethepoet` |
| clerk-backend-api | 7.1.1 | PyPI `clerk-backend-api` |
| PyJWT (fallback auth) | 2.15.1 | PyPI `pyjwt` |
| workers-py (`pywrangler`) | 1.17.9 | PyPI `workers-py` |
| SQLAlchemy / psycopg (containers) | 2.1.9 / 3.3.9 | PyPI each |
| anthropic / pydantic-ai, if needed | 2.12.0 / 2.71.0 | PyPI each |

Notes:

- FastAPI is 0.x and ships several times a week. Pin exactly, read the release notes, batch updates weekly.
- `httpx` hasn't released since 2024-12-06 [V]. FastAPI's test client needs it. It works; watch it.
- Type checker: **pyright**. mypy 2.4.1 if a dependency needs a mypy plugin. Not `ty` 0.0.108 yet: its README says beta. Revisit at 1.0.

## Folder structure

```
services/ai/                     (or the repo root)
  pyproject.toml  uv.lock  .importlinter  .env.example
  Dockerfile                     runs uvicorn; for the container path
  wrangler.jsonc                 for the Workers path
  src/app/
    main.py                      builds the FastAPI app; the composition root
    worker.py                    Cloudflare entry, wrapping the app with asgi.entrypoint
    core/                        settings, the auth dependency, errors, logging
    modules/
      summaries/                 the example module
        router.py                controller: HTTP in, HTTP out, no rules
        service.py               rules; no FastAPI, no SQL, no HTTP client, no SDK
        repository.py            a Protocol, plus memory and D1 or Postgres adapters
        client.py                outbound calls (a model API), behind a Protocol
        schemas.py               Pydantic request and response models, extra fields forbidden
  tests/
    unit/  integration/  e2e/
```

This is `docs/architecture.md` in Python: router → service → repository or client, one composition root in `main.py`, modules never import each other, `core/` never imports a module. Nothing in `modules/` knows whether it runs on Workers or in a container.

The boundary check is **import-linter**, run inside `lint`. Three standard contract types [V]:

```ini
[importlinter]
root_package = app
include_external_packages = True

[importlinter:contract:layers]
name = Router above service above repository and client
type = layers
containers = app.modules.summaries
layers =
    router
    service
    repository | client

[importlinter:contract:independent]
name = Modules don't import each other
type = independence
modules = app.modules.*

[importlinter:contract:pure-services]
name = Services hold rules, not SDKs
type = forbidden
source_modules = app.modules.*.service
forbidden_modules = fastapi, sqlalchemy, httpx, anthropic, clerk_backend_api
```

The exact syntax is [I]: wildcards in each field, `|` for sibling layers and `include_external_packages` for third-party bans. Check them against import-linter's docs. Add each new module to `containers` if wildcards aren't accepted there. Prove every contract fails on a deliberate bad import before trusting it.

## Check contract

Python has no `package.json`, so the commands are poe tasks in `pyproject.toml`, run as `uv run poe <task>`. In a monorepo, add a small `package.json` whose six scripts call these, so Turborepo treats the service like any other package.

| Command | Poe task runs | Notes |
|---|---|---|
| `lint` | `ruff check . && ruff format --check . && lint-imports` | boundary check included |
| `typecheck` | `pyright` (strict) | |
| `test` | `pytest tests/unit tests/integration` | memory adapters; no network |
| `build` | `uv lock --check && docker build .` (container), or a `pywrangler` dry-run deploy (Workers) | the dry-run flag is **unverified** |
| `test:e2e` | start the app, then `pytest tests/e2e` and `schemathesis run <base>/openapi.json` | for Workers, start `pywrangler dev`, not uvicorn |
| `check` | `lint`, `typecheck`, `test`, `build`, in order | |

Name the e2e task `test-e2e` in poe if a colon isn't accepted in task names, and map `test:e2e` to it in the `package.json` shim the local gate calls. Record which in `docs/decisions.md`.

Where e2e is weaker than web: there is no UI, so e2e is HTTP only. schemathesis generates requests from the OpenAPI document and finds crashes and schema mismatches. It doesn't know the business rules; the `pytest tests/e2e` cases do. **Tests run on CPython, production may run on Pyodide.** A package can pass every test and fail to import on deploy. That's why Workers e2e must run against `pywrangler dev`.

What a human must check: that the deployed test service answers, that responses from the model API make sense (quality, not shape), and the bill after the first real week.

## Auth and backend

The service checks the same Clerk session token as the web pack's API.

1. **Preferred: not public at all.** The web Worker calls the Python Worker over a Cloudflare service binding, and the Python service has no public route [I]. The web pack's `/api/v1` routes (being added to the web pack) stay the only public door. Forward the caller's bearer token so the service still knows the user [I].
2. **If clients call it directly** (mobile, desktop), they send `Authorization: Bearer <Clerk session token>`, as they do for `/api/v1`.
3. **Verify** in one FastAPI dependency in `core/auth.py`. Use `clerk-backend-api`'s `authenticate_request` with authorized parties [V]. Whether this SDK runs under **Pyodide is unverified** (row 47). If it doesn't, verify the JWT with PyJWT against Clerk's public keys; that needs `cryptography`, which Pyodide bundles [I].
4. Someone else's data returns "not found". One error shape for every route. No stack traces to the client.

`.env.example` lines (names only, the `secrets` skill's format):

```bash
# Clerk secret key · get it: Clerk dashboard → API keys · scope: local,test,production · secret: yes
CLERK_SECRET_KEY=
# Allowed token origins, comma-separated · get it: your web, desktop and mobile origins · scope: local,test,production · secret: no
CLERK_AUTHORIZED_PARTIES=
# Model API key, only if the service calls one · get it: the provider's console · scope: local,test,production · secret: yes
ANTHROPIC_API_KEY=
```

## Deploy, checks and costs

The pack asks the person one question, then follows the answer:

1. **Dependencies are FastAPI, Pydantic, an HTTP client and model SDKs → Cloudflare Python Workers.** Same account, `wrangler` flow and bindings as the web pack. Free to start.
2. **Native code Pyodide lacks, heavy CPU, long jobs, threads or raw sockets → a container.** Cloudflare Containers if the person already pays $5 a month; Railway Hobby or Fly.io otherwise.

| | Python Workers | Cloudflare Containers | Fly.io / Railway |
|---|---|---|---|
| Free tier | 100,000 requests a day; **10 ms CPU** per request [V] | none; Workers Paid $5 a month [V] | Fly: none [S]. Railway: $1 Free, $5 Hobby [S]. Both **unverified** |
| Limits | 128 MB memory, 64 MiB bundle, 1 s startup, 5 min CPU on paid [V] | included: 25 GiB-hours memory, 375 vCPU-minutes, 200 GB-hours disk [V] | yours to size |
| Packages | pure Python, Pyodide wheels; support "still in early stages" [V] | anything | anything |

Both doors stay open: the app is plain ASGI, `worker.py` is a short entry (copy Cloudflare's FastAPI example) and the `Dockerfile` runs uvicorn. Paying for Workers Paid or a container host is spending money: **ask first.**

Data: under Workers, call D1 through the binding in a small repository adapter; no D1 driver for SQLAlchemy was verified [I]. In a container, SQLAlchemy with psycopg against Postgres.

**Checks and deploys, from the session** (no GitHub Actions; `coordinate`'s local gate):

- Pull requests: on the exact head in a clean worktree, `uv sync --locked`, then `lint`, `typecheck`, `test`, `build`, `test:e2e`.
- After a merge: deploy main to **test** from the session with `uv run pywrangler deploy` (Workers, after `wrangler login`) or the container host's CLI.
- Production deploy only when the person says so.

The session's deploys sign in with `wrangler login`. Only on `ci = "actions"`, these names go in GitHub environment secrets:

```bash
# Cloudflare API token with Workers edit rights · get it: Cloudflare dashboard → My Profile → API Tokens · scope: test,production · secret: yes
CLOUDFLARE_API_TOKEN=
# Cloudflare account ID · get it: Cloudflare dashboard → Workers overview · scope: test,production · secret: no
CLOUDFLARE_ACCOUNT_ID=
```

Server secrets go to the Worker with `npx wrangler secret put NAME`, as the `secrets` skill says.

## Build steps for the agent

1. Ask whether the job needs Python (see the top). If not, stop and use the web pack.
2. Re-check every version. Write the pins to `docs/stack.md`.
3. Ask the deploy question (Workers or container) and record it in `docs/decisions.md`.
4. `uv init`, set `requires-python` (Cloudflare's examples use `>=3.13`), add the pinned packages, commit `uv.lock`.
5. Lay out the folders above. Build `main.py` as the composition root.
6. Add the `summaries` example module: schemas, a service tested first with a memory repository and a fake client, then the router.
7. Add `core/auth.py` and its tests, with a fake verifier. Unauthenticated requests get 401 in the one error shape.
8. Write `.importlinter`. Commit a deliberate violation locally, see `lint-imports` fail, remove it.
9. Add the poe tasks for the six commands. Configure ruff and pyright strict in `pyproject.toml`.
10. Add `worker.py` and `wrangler.jsonc`, or the `Dockerfile`, per step 3. On Workers, run `pywrangler dev` and check every dependency imports. Run the auth spike: does `clerk-backend-api` load under Pyodide? Record the answer.
11. Write `tests/e2e` and the schemathesis run. Measure CPU per request on Workers if that's the target; above 10 ms, tell the person the free plan won't hold.
12. Add `.env.example`. Run the `secrets` skill.
13. Add no `.github/workflows/`. Write `ci = "local"` in `docs/stack.md`, and a `deploy:test` task (`uv run pywrangler deploy`, or the container host's CLI) the session runs after each merge.
14. Fill in "Commands that work here" in `AGENTS.md`.
15. Slice 0 is done when every check-contract command passes in the local gate.
16. Offer to contribute the starter back to the kit: `stacks/python-fastapi/` app files with the example module, plus a `stack-python-fastapi` skill and the spike results. Strip project names, keys and anything private first.

## Known risks and unverified items

- **CPython in tests, Pyodide in production** (above). The main reason the deploy confidence is lower.
- **CPU per FastAPI request on Pyodide** has no published number. Assume the paid plan until measured.
- **Python Workers GA is recent** (2026-09-21 by secondary sources). The announcement's fine print wasn't read.
- **`clerk-backend-api` under Pyodide:** unverified. PyJWT is the fallback.
- **`pywrangler` dry-run flag** for `build`: unverified.
- **Fly.io and Railway pricing:** sources conflict.
- **Service-binding auth forwarding** is inferred, not tested.

What agents can and can't do reliably here:

| Reliable | Needs a human |
|---|---|
| Routers, services, schemas, adapters and their tests | Choosing Workers vs a container when costs differ (money) |
| ruff, pyright, import-linter, pytest in a sandbox | Judging model output quality |
| The local checks and a test deploy with test credentials | Production deploys and production keys |
| Reading a Pyodide import error and finding a pure-Python swap | Deciding a missing native package means moving to a container |
