# OneGemmy Backend

FastAPI SaaS backend. Modular-monolith layout: each business domain owns its
own models, schemas, repository, service, and routes under
`app/modules/<domain>/`, with shared plumbing in `app/core/`. Multi-tenancy is
row-level (`tenant_id` on every tenant-owned table) via
`TenantScopedMixin` in `app/modules/tenants/models.py` — see
`app/modules/users/models.py` for an example.

## Layout

```
app/
  core/        # config, db session, security, deps, exceptions, pagination, BaseRepository
  modules/
    auth/      # register / login / refresh + roles + permissions
    users/     # per-tenant users
    tenants/   # Tenant, Department, Shop + TenantScopedMixin
    ...        # inventory, finance, hr, procurement, crm, manufacturing — TBD
  shared/      # enums, utils, validators, pagination
  integrations/# storage, email, payments
  api_router.py  # mounts every module's router under /api/v1
  main.py        # app factory
alembic/         # migrations
```

### Layering, within a module

```
routes.py      # HTTP layer only: parse request, call service, return response
service.py     # business rules, validation, orchestration — no SQL here
repository.py  # all DB queries for this module's model(s), extends BaseRepository
models.py / schemas.py
```

Routes never touch the DB session's `select()` directly, and repositories never
contain business rules — they just fetch/persist. This keeps merge conflicts
and reasoning scoped to one layer at a time. See `users/` for the reference
implementation. Add a module-local `utils.py` only once there's real
cross-cutting logic to extract (e.g. slug generation) — don't create an empty
one up front.

Adding a new domain: create `app/modules/<name>/{models,schemas,repository,service,routes}.py`
following the `users` module, then register its router in `app/api_router.py`.

## Local setup

1. Copy `.env.example` to `.env` and adjust as needed.
2. Start Postgres (either `docker compose up db` or your own instance).
3. Install deps: `uv sync`
4. Run migrations: `uv run alembic upgrade head`
5. Start the API: `uv run fastapi dev app/main.py`

API docs at `http://localhost:8000/docs`.

## Migrations

```
uv run alembic revision --autogenerate -m "message"
uv run alembic upgrade head
```

## Docker

```
docker compose up --build
```

## Tests

```
uv run pytest
```
