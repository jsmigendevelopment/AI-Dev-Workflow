# Coverage

Options down the side, the questions across the top. Each cell names claims in `claims.csv`, or says `gap`.

After the fact-check, read a corrected claim in place of the one it corrects: c101 for c6, c102 for c25, c103 for c14, c106 for c80, c107 for c83's databases, c108 for c89. New findings from the fact-check: c104 (Cloud Run free tier needs a billing account), c105 (Hetzner CPX02 unavailable), c109 (Clerk's Go SDK needs the secret key).

## 1. When an app outgrows Workers

| Option | CPU and wall time | Memory | Languages and binaries | Requests and connections | Background work | Long-lived connections |
|---|---|---|---|---|---|---|
| **A. Stay on Workers (TypeScript)** | c1, c2, c3 | c4 | c17 | c5, c6, c7, c8 | c3, c9, c12, c13, c16 | c15, c18 |
| **B. Workers plus a Cloudflare Container for the heavy part** | c22, c24 | c24 | c20 | c23 | c26, c27 | `gap`: no container-specific connection limit found |
| **C. A Go service on another host** | c56 (Cloud Run) | c34 (Fly sizes) | c41, c49, c54 | `gap`: each host's body limits not compared | `gap`: not compared per host | `gap`: WebSocket support per host not compared |

## 2. Where a Go service runs

| Option | Free tier | Idle and small-load cost | Cold start | Regions | Logs | Preview per PR | CLI deploy, no workflow |
|---|---|---|---|---|---|---|---|
| **Cloudflare Containers** | c22 (none on Free) | c10, c22, c23 | c25, c27 | c32 | c31 | c29, c30 | c28 |
| **Fly.io** | c33 | c34, c35 | c37 | c39 | c40 | c38 | c41 |
| **Railway** | c42, c43 | c44, c47 | c47 | c48 | c46 | c45, c46 | c46, c49 |
| **Google Cloud Run** | c50, c53 | c51, c52 | c52 (no number found) | `gap`: regions listed on s32, not counted | c57 | c55 | c54 |
| **A small VPS (Hetzner, DigitalOcean)** | `gap`: none found | c58, c59, c61 | not applicable: always on | c60 | `gap`: whatever the person installs | `gap`: none built in | c62 |

## 3. The database, the migration tool and the query layer from Go

| Option | Fit as the main database | Free tier | Previews | Go support |
|---|---|---|---|---|
| **D1 over its HTTP API** | c63, c64, c65, c66 | c67 | `gap` | c68 |
| **Postgres on Neon** | c69, c70 | c69 | c71 | c85 |
| **Postgres on Supabase** | c72, c73 | c72 | c73 | c85 |
| **SQLite on a volume** | c35, c74, c75 | c35 (volume price) | `gap` | c76, c77 |

| Migration tool | SQL files | Down migrations | Licence and paid parts | Last release |
|---|---|---|---|---|
| **goose** | c78, c99 | c99 | c78 | c78 |
| **golang-migrate** | c79 | c79 | c79 | c79 |
| **Atlas** | `gap` | c81 | c80, c81 | c82 |

| Query layer | What it is | Databases | Licence | Last release |
|---|---|---|---|---|
| **sqlc** | c83 | c83 | c83 | c83 |
| **pgx used directly** | c85 | c85 | c85 | c85 |
| **sqlx** | c84 | `gap` | c84 | c84 |
| **GORM** | c86 | `gap` | c86 | c86 |
| **Bun** | c87 | c87 | c87 | c87 |
| **Ent, Jet** | `gap`: README not read | `gap` | `gap` | c88 |

## 4. Sign-in

| Option | How it gets the key | Caching and refresh | azp and clock skew | Licence and release |
|---|---|---|---|---|
| **Clerk Go SDK** | c89, c93 | c93 | c94 | c91, c92 |
| **golang-jwt v5 with keyfunc v3** | c89, c98 | c98 | c90, c97 | c97, c98 |
| **lestrrat-go/jwx** | c89, c95 | c95, c96 | `gap`: options not read | c95, c96 |
