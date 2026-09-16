# OneGemmy Backend

FastAPI SaaS backend for a 6-module ERP system following a Domain-Driven Modular
Monolith with Clean Architecture.

Each business domain owns its own models, schemas, repository, service, and
routes under `app/modules/<domain>/`. Shared plumbing lives in `app/core/`.

Multi-tenancy uses a shared-table pattern: every tenant-scoped entity carries a
`tenant_id` column via `TenantScopedMixin`
(`app/modules/tenants/models/mixins.py`). **Permissions are global** — they have
no `tenant_id` and are managed under the `/global/permissions` prefix.

## Quick start (first time)

```bash
uv sync                              # install dependencies
alembic upgrade head                 # create tables
python -m scripts.seed               # seed base tenant, admin user, roles, permissions
uv run python scripts/dev.py         # start server — auto-picks a free port if 8000 is taken
```

Login at `/docs` with `admin@onegemmy.com` / `admin123`.

`scripts/dev.py` wraps `fastapi dev app/main.py`: if port 8000 is already in use (e.g. another
instance is already running), it starts on the next free port instead of failing, so you never
need to kill an existing server to start a new one. Pass `--port` to change the preferred port.
Use `uv run fastapi dev app/main.py` directly if you specifically need the hard-fail-on-conflict
behavior.

## Layout

```
app/
  core/                      # config, db session, security, deps, exceptions,
  │                          # pagination, BaseRepository
  modules/
    auth/                    # register / login / refresh / change-password
    │                        # Pure auth — no models, no repository
    tenants/
      models/                # Tenant, Department, Branch, User, Role,
      │                      # Permission, role_permissions, TenantScopedMixin
      schemas/               # Pydantic request/response schemas per entity
      repository/            # SQL queries per entity, extend BaseRepository
      service/               # Business rules, validation, orchestration
      routes/                # HTTP layer (FastAPI routers, one per entity)
    ...                      # inventory, finance, hr, procurement,
                             # crm, manufacturing — TBD
  integrations/
    storage/                 # StorageBackend ABC + LocalStorage
  api_router.py              # Mounts auth_router, tenants_router, global_router
  main.py                    # App factory
alembic/                     # Migrations
scripts/
  seed.py                    # Creates base tenant, permissions, roles, users
```

### Within a module

```
routes.py      # HTTP: parse request, call service, return response
service.py     # Business rules, validation — no SQL here
repository.py  # DB queries, extends BaseRepository — no business rules
models.py /
schemas.py     #
```

Routes never call `select()` directly. Repositories never contain business
rules. This keeps reasoning and merge conflicts scoped to one layer.

### Route prefixes

| Prefix | Contents | Scope |
|--------|----------|-------|
| `/api/v1/auth` | register, login, refresh, change-password, forgot/reset password | Public |
| `/api/v1/tenants` | departments, branches, tenants, users, roles | Tenant-scoped |
| `/api/v1/global` | permissions CRUD | Global |

Role-permission assignment and current-user permissions live under
`/api/v1/tenants/roles/{id}/permissions` and
`/api/v1/tenants/users/me/permissions` respectively.

## Local setup

1. Copy `.env.example` to `.env` and adjust as needed.
2. Start Postgres (either `docker compose up db` or your own instance).
3. Install deps: `uv sync`
4. Run migrations: `uv run alembic upgrade head`
5. Seed: `python -m scripts.seed`
6. Start the API: `uv run python scripts/dev.py`

API docs at `http://localhost:8000/docs` (or whichever port it printed, if 8000 was taken).

Login with `admin@onegemmy.com` / `admin123` after seeding.

## Migrations

### Basic commands

```bash
uv run alembic revision --autogenerate -m "message"
uv run alembic upgrade head
```

### Team workflow

When you pull code from another developer who added a migration:

```bash
git pull
alembic upgrade head       # apply any new migrations
```

**Do not** run `revision --autogenerate` after pulling — the migration file
already exists. Just run `upgrade head` to apply it to your local database.

### Multiple heads (merge conflicts)

If two developers both created migrations numbered `004_*` at the same time,
Git will merge both files, and Alembic will report **two heads**:

```bash
alembic heads
# → abc123_create_products
# → xyz789_create_employees
```

Fix by creating a **merge migration** (do not delete migration files):

```bash
alembic merge -m "merge inventory and hr" abc123 xyz789
alembic upgrade head
```

This creates an empty migration that joins the two histories into one. Now
there is a single head again.

## Docker

```
docker compose up --build
```

## Environments

The app reads `ENVIRONMENT` (`local` | `staging` | `production`) from its env
file and adjusts behavior accordingly:

- **production** forces `DEBUG=false`, disables `/docs`, `/redoc`, and
  `/openapi.json`, and refuses to start if `SECRET_KEY` is still the
  insecure default or `CORS_ORIGINS` is `*`.
- **staging** behaves like production traffic-wise but keeps `/docs` open
  for QA.
- **local** is the permissive default used in dev.

## Deploying to staging / production

Both environments run the same image and the same Compose file
(`docker-compose.prod.yml`); only the env file differs. Docker is only used
to run the API — Postgres is installed natively on the VPS (not
containerized). The `api` service uses `network_mode: host`, so
`DATABASE_URL` connects the same way a native process would
(`@localhost:5432/...`).

1. Install and configure Postgres directly on the VPS, with a separate
   database for staging and for production (never share one database
   between them).
2. Copy the matching template and fill in real secrets —
   `.env.staging.example` → `.env.staging`, or `.env.production.example` →
   `.env.production`. Each environment needs its own `SECRET_KEY` and its
   own database.
3. Build and start:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.staging up -d --build
   # or
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   ```

   `docker-entrypoint.sh` runs `alembic upgrade head` before serving, so
   migrations apply automatically on every deploy.
4. To ship a new release, `git pull` and re-run the same `up -d --build`
   command for that environment.

If staging and production run on the same host: use a separate project
directory (checkout) per environment (or `-p <name>` on the compose
command) so their containers, volumes, and `uploads/` don't collide, and
set a distinct `PORT` for one of them (the `api` service uses
`network_mode: host`, so both can't bind 8000 at once) — see
`.env.staging.example`.

## Tests

```
uv run pytest
```
