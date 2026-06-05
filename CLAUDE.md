# Navidrome — Claude Code Guide

## Project Overview

**Navidrome** is a self-hosted personal music server. It exposes a Subsonic/OpenSubsonic-compatible API for third-party clients and ships a built-in React PWA. It supports multi-user, multi-library setups with per-user favorites, ratings, playlists, and scrobbling to Last.fm/ListenBrainz.

**Architecture**: Modular Monolith — single Go binary that embeds the compiled React frontend. Layered: HTTP handlers → core services → model interfaces → SQLite persistence.

## Quick Reference: Key Files

| What | Where |
|---|---|
| DataStore interface (root of all DB access) | `model/datastore.go` |
| DI wiring (generated — do not edit) | `cmd/wire_gen.go` |
| DI injector declarations | `cmd/wire_injectors.go` |
| Subsonic API router | `server/subsonic/api.go` |
| Native REST API router | `server/nativeapi/native_api.go` |
| Server bootstrap + TLS | `server/server.go` |
| Config struct (all options) | `conf/configuration.go` |
| Application constants | `consts/consts.go` |
| Scanner entry point | `scanner/controller.go` |
| Streaming + transcoding pipeline | `core/stream/media_streamer.go` |
| React-Admin root + Redux store | `ui/src/App.jsx` |
| Frontend data provider | `ui/src/dataProvider/index.js` |

## Architecture in 30 Seconds

```
HTTP (chi router)  →  subsonic/ or nativeapi/  →  core/ services  →  model/ interfaces  →  persistence/ (SQLite)
                                                       ↑
                                              adapters/ (Last.fm, ListenBrainz, Deezer)
```

- **`model/`**: interfaces only. `core/` depends on `model/`, never on `persistence/`.
- **`persistence/`**: SQLite implementations of every repository interface.
- **`cmd/wire_gen.go`**: auto-generated DI bindings. Run `make gen` after any provider change.
- **SSE** (`server/events/`): real-time UI pushes (scan progress, now-playing, resource refresh).

## Running with Docker Compose

```bash
# First run (builds Go image, downloads all deps — takes a few minutes)
docker compose -f docker-compose.dev.yml up --build

# Subsequent runs
docker compose -f docker-compose.dev.yml up
```

| Service  | Port | Description |
|---|---|---|
| backend  | 4633 | Go server with reflex hot-reload |
| frontend | 4533 | Vite dev server — **open this in browser** |

The frontend proxies `/auth`, `/api`, `/rest`, and `/backgrounds` to the backend automatically.

```bash
docker compose -f docker-compose.dev.yml logs -f backend   # backend logs
docker compose -f docker-compose.dev.yml logs -f frontend  # frontend logs
docker compose -f docker-compose.dev.yml down              # stop everything
```

## Running without Docker

```bash
make setup   # one-time: installs Go and Node dependencies
make dev     # starts both services with hot-reload
```

## Common Make Targets

```bash
make test          # Run Go tests
make test-js       # Run frontend tests (Vitest)
make testall       # Run Go + JS + i18n validation
make test-race     # Go tests with race detector
make lint          # golangci-lint
make build         # Build binary
make gen           # Regenerate Wire DI + JSON schemas (run after DI changes)
make watch         # Ginkgo watch mode (re-runs on file changes)
```

## Database

**SQLite only** — no Postgres or MySQL. File: `./data/navidrome.db`.

```bash
# Host (requires sqlite3)
sqlite3 ./data/navidrome.db

# Inside running backend container
docker compose -f docker-compose.dev.yml exec backend sqlite3 /data/navidrome.db
```

```sql
.tables               -- list all tables
.schema media_file    -- show a table's schema
SELECT * FROM user;   -- query data
.quit                 -- exit
```

Migrations live in `db/migrations/` (goose format — timestamp prefix). They run automatically on startup.

## Configuration

Config file: `navidrome.toml`. All options also available as `ND_*` env vars.

| Variable | Dev Value |
|---|---|
| `ND_PORT` | `4633` |
| `ND_MUSICFOLDER` | `/music` |
| `ND_DATAFOLDER` | `/data` |
| `ND_LOGLEVEL` | `info` |
| `ND_ENABLEINSIGHTSCOLLECTOR` | `false` |
| `ND_DEVAUTOCREATEADMINPASSWORD` | `admin` |

Default dev credentials: **`admin` / `admin`**. Drop audio files in `./music/` — the scanner picks them up.

## Adding New Features: Checklist

1. **Model**: add interface method to `model/datastore.go` and relevant `*Repository` interface.
2. **Persistence**: implement in `persistence/` (use squirrel query builder + dbx scanning).
3. **Core service**: implement business logic in `core/`; depend only on `model/` interfaces.
4. **Wire**: add provider to `core/wire_providers.go` or `cmd/wire_injectors.go`, then run `make gen`.
5. **API handler**: add to `server/subsonic/` (Subsonic) or `server/nativeapi/` (Native REST).
6. **Migration**: create a new file in `db/migrations/` with timestamp prefix if schema changes.
7. **Tests**: add Ginkgo suite in `*_test.go` co-located with the code; use mocks from `tests/`.
8. **Frontend**: register new react-admin `<Resource>` in `ui/src/App.jsx`; use `useTranslate()` for strings.

## Testing Conventions

**Go**: Ginkgo v2 BDD (`Describe` / `Context` / `It` / `BeforeEach`). Each package has a `*_suite_test.go` bootstrapper. Mocks for all repositories live in `tests/`. Persistence tests use real in-memory SQLite via `tests.Init(t, false)`.

**Frontend**: Vitest + `@testing-library/react`. Tests co-located as `*.test.jsx`.

## API Routes

| Prefix | Description |
|---|---|
| `/rest/*` | Subsonic / OpenSubsonic API (v1.16.1) |
| `/api/*` | Native JSON REST (react-admin protocol) |
| `/auth/*` | Login, logout, OAuth callbacks |
| `/share/*` | Public share player (unauthenticated) |
| `/app/*` | Frontend SPA |

**Native API resources**: `song`, `album`, `artist`, `genre`, `user`, `player`, `transcoding`, `share`, `playlist`, `radio`, `tag`, `translation`

## Important Constraints

- **SQLite only** — no alternative DB support.
- **CGO required** (`mattn/go-sqlite3`) — needs a C compiler; cross-compilation uses the `xx` toolchain.
- **Build tags** `netgo,sqlite_fts5` are required for all production builds.
- **Frontend must be built before the Go binary** — `ui/build/` must exist at compile time.
- **Never edit `cmd/wire_gen.go` manually** — always regenerate with `make gen`.
- **Password storage** uses reversible AES encryption (required for Subsonic MD5 challenge auth).

## Security Notes

- JWT HS256; secret generated randomly and stored encrypted in the DB.
- **Set `PasswordEncryptionKey` in production** — the default key is public and hardcoded.
- HTTP security headers via `unrolled/secure`; CORS via `go-chi/cors`.
- HTML user content sanitized with `microcosm-cc/bluemonday`.
- Rate limiting only covers `/auth/login`.

## Full Context Documents

- `PROJECT_CONTEXT.md` — comprehensive architecture, API, DB, security, and DevOps analysis
- `AI_CONTEXT.yaml` — machine-readable context for AI tooling
