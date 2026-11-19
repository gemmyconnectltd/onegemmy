# 04 — Tech stack

Versions are the **installed/locked** versions (`backend/uv.lock`, each app's `node_modules`), with the declared range in brackets where it differs.

## Repository layout (monorepo)

| Folder | What it is | Port (dev) | Production host |
|---|---|---|---|
| `backend/` | FastAPI API for every app | 8000 | API behind `app.pesaa.io` / `admin.pesaa.io` [exact API host not in repo] |
| `frontend/` | ERP web app + desktop POS (Next.js) | 3000 | app.pesaa.io |
| `super-admin/` | Platform admin console (Next.js) | 3003 | admin.pesaa.io |
| `website/` | Public marketing site (Next.js) | 3002 | pesaa.io |
| `mobile/` | Separate mobile web app (Next.js, offline POS) | 3001 | `shop.` / `m.` hosts (redirect in `frontend/src/proxy.ts`) — **not analyzed in these docs** |
| `flutter_app/` | Flutter app | — | [UNCLEAR — not referenced by the other apps; not analyzed] |
| `design-system/` | Canonical tokens, button variants, shared CSS, synced into each app | — | — |
| `scripts/` | Design-system generator/checker, repo tooling | — | — |

## Backend

| Concern | Choice | Where |
|---|---|---|
| Language | Python ≥ 3.14 (`python:3.14-slim` image) | `backend/pyproject.toml`, `backend/Dockerfile` |
| Framework | FastAPI 0.140.0 (Starlette 1.3.1), Uvicorn 0.51.0 | `backend/app/main.py` |
| Validation | Pydantic 2.13.4, pydantic-settings 2.14.2 | `app/modules/*/schemas` |
| ORM | SQLAlchemy 2.0.51, async (`AsyncSession`) | `app/core/database.py` |
| Database | PostgreSQL 16 (docker-compose dev); production Postgres runs natively on the VPS host (`docker-compose.prod.yml` uses host networking). `DATABASE_NEON_URL` setting exists for a Neon DB [UNCLEAR whether used] | `backend/docker-compose*.yml`, `app/core/config.py` |
| Driver | asyncpg 0.31.0 | — |
| Migrations | Alembic 1.18.5; run automatically on container start (`alembic upgrade head` in `docker-entrypoint.sh`) | `backend/alembic/versions/` |
| Auth | JWT HS256 via python-jose 3.5.0; access token 60 min, refresh token 30 days; passwords hashed with `bcrypt` 5.0.0 directly (`passlib` 1.7.4 is a dependency but not used for hashing); server-side strength rule: ≥8 chars, a digit and an uppercase letter; `HTTPBearer` scheme | `app/core/security.py`, `app/core/deps.py`, `app/modules/auth/` |
| Rate limiting | In-memory fixed window per IP (register 5/h, login 10/5 min, forgot-password 5/h); single-process only | `app/core/rate_limit.py` |
| Background jobs | No queue. In-process asyncio tasks started at app startup: support (email/WhatsApp sync) and marketing (send engine). Billing has a `worker.py` [UNCLEAR how it is scheduled] | `app/main.py`, `app/modules/support/background.py`, `app/modules/marketing/background.py`, `app/modules/billing/worker.py` |
| Caching | No Redis. Small in-process cache helper | `app/core/cache.py` |
| File storage | Local disk `uploads/` mounted at `/uploads` (public) with a `private/` subfolder blocked from serving; expense receipts in `./private/expense-receipts`. Docker volume `./uploads:/app/uploads` | `app/integrations/storage/`, `app/main.py` |
| Email | SMTP (default Gmail, `smtp.gmail.com:587`) with separate mailboxes per purpose (accounts, admin, marketing, support); support inbox via IMAP or Microsoft Graph | `app/core/email.py`, `app/core/config.py` |
| WhatsApp | OpenWA (self-hosted WhatsApp gateway) for support | `app/modules/support/openwa.py`, `deploy/openwa/` |
| SMS | none found | — |
| Payments (subscriptions) | pawaPay (mobile money) | `app/modules/billing/provider.py`, `payments.py` |
| PDFs / spreadsheets | ReportLab 5.0.0 (invoices, receipts, quotations, reports); openpyxl 3.1.5 (Excel import/export) | `app/modules/sales/service/*_pdf.py`, `app/core/brand_pdf.py` |
| AI | Pluggable provider: `mock` (default, offline), OpenAI, Groq, Ollama; used for the in-app assistant and document/photo imports | `app/modules/ai/`, `app/modules/imports/` |
| Logging | Structured logging with request middleware | `app/core/logging.py`, `app/core/middleware.py` |
| Lint / tests | ruff 0.16.0 (line length 100); pytest 9.1.1 + pytest-asyncio 1.4.0 (`asyncio_mode=auto`), 81 test files | `backend/tests/` |

Full Python dependency list (`pyproject.toml`): `fastapi[standard]>=0.140.0`, `sqlalchemy[asyncio]>=2.0.35`, `asyncpg>=0.29.0`, `httpx>=0.28.0`, `alembic>=1.13.0`, `pydantic-settings>=2.5.0`, `python-jose[cryptography]>=3.3.0`, `passlib[bcrypt]>=1.7.4`, `python-multipart>=0.0.9`, `email-validator>=2.2.0`, `reportlab>=5.0.0`, `openpyxl>=3.1.0`; dev: `pytest>=8.3.0`, `pytest-asyncio>=0.24.0`, `ruff>=0.7.0`.

## Frontend (`frontend/`, ERP + POS)

| Concern | Choice | Where |
|---|---|---|
| Framework | Next.js 16.2.11 (App Router), React 19.2.4, TypeScript 5.9.3 | `frontend/src/app` |
| Routing | App Router route groups: `(auth)`, `(erp)`, `(pos)`; `src/proxy.ts` (Next 16 middleware replacement) redirects mobile hosts | `frontend/src/app`, `frontend/src/proxy.ts` |
| Server state | TanStack Query 5.101.4 via `useQ` / `mutation()` wrappers (≈463 hooks) | `frontend/src/lib/api/hooks.ts` |
| Client state | React context: `AuthProvider` (`lib/auth.tsx`), `AppConfigProvider` (`lib/appConfig.tsx`: theme, brand color, locale, currency, nav orientation); local `useState` per page. No Redux/Zustand. | `frontend/src/lib` |
| HTTP client | Custom `fetch` wrapper `request<T>()` with timeout, bearer token, `X-Branch-Id`, automatic refresh on 401 | `frontend/src/lib/api/client.ts` |
| UI primitives | Base UI (`@base-ui/react` 1.7.0) wrapped in local components; shadcn 4.16.2 CLI config (`components.json`) | `frontend/src/components/ui` |
| CSS | Tailwind CSS 4.3.3 (`@tailwindcss/postcss`), tw-animate-css 1.4.0, class-variance-authority 0.7.1, tailwind-merge 3.6.0, clsx 2.1.1; generated CSS variables from `design-system/` | `frontend/src/app/globals.css`, `frontend/src/design-system/` |
| Icons | lucide-react 1.30.0 | — |
| Charts | Recharts 3.10.0 (lazy-loaded via `components/charts/lazy.tsx`) | — |
| Forms | No form library — controlled inputs + native validation + hand-written checks; shared `Form.tsx` / `FormKit.tsx` | `frontend/src/components/ui` |
| Spreadsheets | SheetJS `xlsx` 0.20.3 (from cdn.sheetjs.com tarball) for imports/exports | `frontend/src/lib/importEngine.ts` |
| i18n | `next-intl` 4.13.4 is installed but **never imported**. Real mechanism: a 195-key English dictionary in `lib/appConfig.tsx` machine-translated at runtime to Kinyarwanda/Kiswahili through `src/app/api/translate/route.ts` (unofficial Google Translate endpoint) and cached in `localStorage` | — |
| PWA | `public/sw.js`, `src/app/manifest.json` [service worker scope/behavior not analyzed] | — |
| Fonts | Geist + Geist Mono (local variable TTF in `src/app/fonts`) | — |
| Tests | `node --test tests/*.test.cjs` (73 unit tests on helpers/components); no browser E2E | `frontend/tests` |

Full `frontend/package.json` dependencies: `@base-ui/react ^1.7.0`, `@tanstack/react-query ^5.101.4`, `class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `lucide-react ^1.30.0`, `next 16.2.11`, `next-intl ^4.13.4`, `react 19.2.4`, `react-dom 19.2.4`, `recharts ^3.10.0`, `shadcn ^4.16.2`, `tailwind-merge ^3.6.0`, `tw-animate-css ^1.4.0`, `world-countries ^5.1.0`, `xlsx (cdn 0.20.3)`. Dev: `@tailwindcss/postcss ^4`, `@types/node ^20`, `@types/react ^19`, `@types/react-dom ^19`, `eslint ^9` (9.39.5), `eslint-config-next 16.2.11`, `sharp ^0.35.3`, `tailwindcss ^4`, `typescript ^5`.

## Super-admin (`super-admin/`)

Same stack as the ERP (Next 16.2.11, React 19.2.4, Tailwind 4.3.3, TanStack Query 5.104.2, Base UI 1.9.0, lucide-react 1.57.0, Recharts 3.10.1) **plus `chart.js` 4.6.1** for traffic charts. No `next-intl`, no `xlsx`. Port 3003.

## Website (`website/`)

Next 16.2.11, React 19.2.4, Tailwind 4.3.3, lucide-react 1.57.0, tw-animate-css, world-countries. No data-fetching library (server `fetch` with `revalidate`). Build step generates `src/lib/navigation-media.generated.ts` from image bytes (`scripts/navigation-media.mjs`). Port 3002.

Note: the three Next apps pin slightly different minor versions of shared libraries (e.g. lucide-react 1.30.0 vs 1.57.0, Base UI 1.7.0 vs 1.9.0).

## Hosting / deployment (what is visible in the repo)

- **Backend container:** `backend/Dockerfile` (python:3.14-slim + uv, `uv sync --frozen --no-dev`), entrypoint runs migrations then `uvicorn app.main:app --port ${PORT:-8000}`. Production compose (`docker-compose.prod.yml`) uses `network_mode: host` and mounts `./uploads`.
- **Server deploy script:** `~/apps/onegemmy/deploy.sh` on a VPS (targets `backend | website | app | admin | staging-* | staging | production | all`). The script itself is **not in the repo** [UNCLEAR: exact Nginx/process setup for the Next apps].
- **Containers seen in ops:** `onegemmy-production-api-1`, `onegemmy-staging-api-1` (Docker Compose projects).
- **CI:** `.github/workflows/design-system.yml` — for `frontend`, `website`, `super-admin`: `npm ci`, design check/test, lint, typecheck, ERP unit tests, isolated production build. **No backend CI** (pytest/ruff run locally only).
- **Nginx:** not in repo [UNCLEAR].
- **API docs:** `/docs`, `/redoc`, `/openapi.json` are disabled when `ENVIRONMENT=production`.
