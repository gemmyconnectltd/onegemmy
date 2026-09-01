# OneGemmy — Project Rules

Multi-tenant ERP (SaaS) for small/medium businesses. Monorepo: FastAPI backend + Next.js frontend.

- **Backend** (`backend/`): FastAPI, SQLAlchemy 2 async (`asyncpg`), Alembic, Pydantic v2, ruff, pytest.
- **Frontend** (`frontend/`): Next.js 16 App Router, React 19, Tailwind v4, @tanstack/react-query, lucide-react. Read `frontend/AGENTS.md` (Next 16 breaking-change warning) before writing frontend code.

## Repo layout

```
backend/app/
  main.py, api_router.py          # app factory; routers prefixed /api/v1, tenant routers under /tenants
  core/                           # config, database, deps, exceptions, pagination, repository, response, security
  modules/<module>/               # one dir per domain: admin, auth, accounting, hr, inventory, procurement, sales, tenants
    models/  routes/  service/  repository/  schemas/
  alembic/                        # every schema change = a migration
frontend/src/
  app/(admin)/ (auth)/ (erp)/ (mobile)/ (pos)/   # route groups; pages colocate under each group
    (auth)/login|register|forgot-password        # auth screens (no sidebar)
    (erp)/<module>/…                             # web ERP: dashboard, sales, inventory, accounting, hr, reports, settings…
    (admin)/admin/…                              # super-admin console (tenants, platform users, plans)
    (pos)/pos/                                   # desktop POS (uses shared pos/ components)
    (mobile)/m/…                                 # mobile app (see mobile UX rules below)
  components/                     # shared UI (ui/), dashboard shell (Sidebar, Topbar, ModuleLayout), domain (mobile/, pos/, inventory/, hr/, …)
  lib/                            # api/ (request layer + hooks), auth, appConfig, orders, roles, pageTitles, utils
```

## General engineering principles

- **Professional ERP mindset**: correctness of money and stock beats convenience. Every feature must be multi-tenant safe, auditable, and defensible.
- **Follow existing conventions** — mimic the surrounding code's structure, types, and patterns. No new libraries unless required; check `package.json` / `pyproject.toml` first.
- **No secrets** in code, logs, or commits. Never log tokens, passwords, or customer data.
- **Commit only when asked.** Conventional-commit messages (`feat:`, `fix:`, `chore:`). Never commit the stray root `package-lock.json` (no root `package.json` exists).

## Backend rules

- **Layered architecture**: `routes` (thin, HTTP only) → `service` (business logic) → `repository` (queries via `BaseRepository`), `schemas` (Pydantic), `models` (SQLAlchemy). Never put SQL in routes.
- **Multi-tenancy is mandatory**: every tenant query must be scoped by `tenant_id` (use `get_by_id_for_tenant`, `list_for_tenant`, `count_for_tenant`). Reject cross-tenant access. Guard with `_require_tenant(current_user.tenant_id)` in routes.
- **Auth**: use `DbSession` / `CurrentUser` deps; never trust client-supplied IDs for ownership decisions.
- **Responses**: use the shared envelope — `success_response(data, message, status_code)` and `paginated_response(items, total, page, page_size)` from `app.core.response`. Errors via `AppError`, `NotFoundError`, `ValidationError` — never raw 500s for expected failures.
- **Money**: prices/totals are **VAT-inclusive** (Ghana, 18%). `net = gross × 100/118`, `VAT = gross × 18/118`. Store money in integer minor units or `Decimal` for new fields; existing `float` price fields are known debt — don't compound it.
- **Database**: async SQLAlchemy + Alembic. Every schema change ships a migration (`alembic revision --autogenerate`), commit both model + migration.
- **Code quality**: ruff with `line-length = 100`, full type hints, `AsyncSession` everywhere, no blocking IO in async paths. Run `ruff check` and `pytest` before finishing.

## Frontend rules

- **Data fetching**: use the TanStack Query hooks in `src/lib/api/hooks.ts` (`useQ` wrapper, `mutation()` helper with invalidation keys). Never hand-roll `useEffect` + `fetch` + `setState`. Never call `getSales()`/`getPurchases()` for server-backed screens — read backend data via hooks (see below).
- **Hydration safety (critical)**: never read `localStorage`/`window` during render. SSR + hydration render must match. Restore client-only state after mount (async in `useEffect`) or use `useSyncExternalStore` with a server snapshot. The auth provider restores the token in an effect — keep it that way.
- **Source of truth for sales**: `src/lib/orders.ts` maps backend `ApiOrder` → `SaleResult` (`orderToSale`, `parsePaymentFromNotes`). Sales screens (stats, transactions, sales list/detail) MUST come from `useOrders`, not localStorage. Payment method is parsed from `POS — <method>` order notes.
- **Client/server split**: pages that fetch/hydrate are `"use client"`. No env secrets in client components (only `NEXT_PUBLIC_*`).
- **Styling**: Tailwind v4 utility classes, design tokens/theme via `useAppConfig`, consistent surfaces (`bg-card`, `border-border`, `rounded-xl/2xl`), lucide-react icons only.
- **Loading states (one way)**: there is ONE loader — `PageLoader` from `@/components/ui/PageLoader`. Use it for every page/content load: `variant="page"` (full page skeleton), `variant="compact"` (inline content block), `variant="screen"` (full-screen/auth). Route groups ship a `loading.tsx` that renders `PageLoader`. Never hand-roll spinners/skeletons for page loads; only small inline `Loader2` spinners inside action buttons are allowed. Do not add extra loading components or wrappers.
- **Money display**: format with `currencySymbol` + `fmt` from `useAppConfig` / `useMobilePos`; never hardcode `$`/commas.

### Web ERP (desktop, `(erp)` route group)

The web app is a full dashboard ERP — the "big" experience (mobile is the fast/lean one). Requirements:

- **Shell**: pages render inside the `(erp)/layout.tsx` shell — `Sidebar` (vertical/horizontal toggle, collapsible), `Topbar`, `ModuleLayout` for per-module secondary nav, `SupportFab`. New ERP pages go under `app/(erp)/<module>/…` and colocate inside that shell.
- **Desktop POS** (`(pos)/pos`, `/pos`): shared POS components (`ProductCard` vertical layout, `CartPanel`, `PaymentPanel`, `Receipt`) with local state; VAT math must match mobile (VAT-inclusive).
- **Super-admin** (`(admin)/admin/…`): tenant/platform management, gated by `isSuperAdmin`.
- **Auth screens** (`(auth)`): login/register/forgot-password, no sidebar; unauthenticated users are redirected to `/login`.
- **Responsive**: layout collapses the sidebar below 1024px; heavy charts/tables stay lazy-loaded.
- Same data-fetching/hydration/money rules as the rest of the frontend apply here.

### Mobile app (`(mobile)` route group, `/m/*`) UX rules

- **≤2 screens per task**; complete flows in the fewest taps possible.
- **Bottom nav order is fixed**: Home → Transactions → **Sell (center pill FAB, cart badge)** → Reports → Account.
- **Home icon tiles**: 4 per row, icon-only, 6 tiles (Purchases, Inventory, Products, Customers, Suppliers, Expenses). No tiles for Sales/Reports (they are nav tabs).
- **Sell flow**: fastest path = 2 taps — add product, then **Charge** (exact cash) on the floating cart bar. Cart drawer has Charge + "Other payment methods". `/m/payment` (numpad/change, mobile/card/invoice) is the secondary path. Receipt shows inline after charge.
- **Mobile subdomain (entry point)**: `frontend/src/proxy.ts` (Next 16 proxy, former middleware) serves the mobile app "alone" on a branded subdomain (hosts prefixed `shop.`/`m.`/`mobile.`, or exact domains via `MOBILE_APP_HOSTS` env). On those hosts, non-`/m/*` paths 307-redirect: `/login|register|forgot-password` → `/m/login`, everything else → `/m` (ERP pages are unreachable there). The main domain keeps serving both surfaces.
- Keep existing screens/components; don't remove buttons that mirror nav tabs without explicit confirmation from the user.

## Enterprise / large-business rules

The same product must serve small shops AND large multi-branch businesses. Design for scale from the start — every feature must stay correct, fast, and auditable at volume.

### Scale & performance

- **Pagination everywhere**: never return unbounded lists. Backend lists take `PageQuery` (offset/limit) with sane caps; frontend lists use pagination or windowing, not `page_size=500` shortcuts.
- **Indexes on lookup paths**: every tenant-scoped query needs `(tenant_id, <column>)` composite indexes for filters/sorts. Check the model's indexes before writing a repo query.
- **No N+1**: eager-load relations with `selectinload` in repositories; batch any per-row lookup into a single query.
- **Bulk operations**: imports/restocks/order lines go through dedicated bulk endpoints, never per-row API calls from the client.
- **Heavy reports**: don't compute large aggregations on the fly per request — pre-aggregate/materialize summaries (e.g. daily rollups) and read those.
- **Async everywhere on the backend**: no blocking IO in `async` paths; never `time.sleep`, sync requests, or blocking DB drivers in request handlers.
- **Frontend bundle discipline**: no one-off libraries; keep heavy charts/tables lazy-loaded; reuse shared components.

### Money & correctness (amplified for enterprise)

- **Idempotency**: financial mutations (charges, receipts, refunds) must be safe to retry — reject duplicate order/reference numbers.
- **Precision**: money in integer minor units or `Decimal`; never accumulate floats. Rounding rules (VAT: `net = gross × 100/118`) must be applied consistently backend + frontend.
- **Reconciliation**: every financial mutation is traceable to an order/receipt with a stable reference; keep an immutable audit of who/what/when.
- **Inventory integrity**: stock mutations are atomic (row-level) and serialized — no lost updates under concurrency; log every movement with reason/actor.

### Security & tenancy at scale

- **Tenant isolation is absolute**: rows are never addressable cross-tenant, even in joins/counts/reports. Never trust client-supplied tenant IDs.
- **RBAC is granular**: permissions follow `module:action` patterns; enforce in service layer, not just UI.
- **Sensitive data**: PII/payments handled per least-privilege; no PII in URLs, logs, or analytics events.
- **Rate limiting + validation** on public/abuse-prone endpoints; never trust raw client input (validate via Pydantic).

### Observability & operations

- **Structured logging** with request IDs and tenant context — never log secrets/tokens/customer data.
- **Graceful degradation**: external integrations (email, storage, payments) fail soft with clear error paths, not hard 500s.
- **Safe migrations**: schema changes run without locking hot tables (batch/`--autogenerate` reviewed); additive first, backfill, then drop.
- **Backups & recovery**: document restore paths for databases and uploads; scheduled backups for any data store.

## Verification checklist

- Frontend: `npx tsc --noEmit` and `npx eslint <changed files>`; dev server runs on `http://localhost:3000` — curl changed routes and expect HTTP 200.
- Backend: `ruff check` and `pytest` (asyncio_mode=auto).
