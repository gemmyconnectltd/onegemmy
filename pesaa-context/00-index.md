# Pesaa codebase context — index

Documentation of the Pesaa (OneGemmy) monorepo as it exists in the code on 2026-11-19 (branch `main`). Written for an AI project working on Pesaa's design, UX and implementation. Large tables (API, models, screens, components) were generated from the code itself; narrative files were checked against the code. Markers: **[UNCLEAR]** = could not be confirmed from code, **[PARTIAL]** = half-built.

| File | Summary |
|---|---|
| [01-product-overview.md](01-product-overview.md) | What Pesaa is, the apps, every ERP module with screens/actions/status, super-admin modules, how tenants are separated |
| [02-user-roles-permissions.md](02-user-roles-permissions.md) | User kinds, `resource:action` model, baseline grants, 55 role templates as a role × module matrix, backend and frontend enforcement and their mismatches |
| [03-user-flows.md](03-user-flows.md) | Step-by-step flows (signup, branches, add product, POS sale, invoice, record payment, add employee, payroll, add customer, invite user) with screens, endpoints and rough edges |
| [04-tech-stack.md](04-tech-stack.md) | Backend, frontend, super-admin and website stacks with exact versions; storage, email, payments, AI, CI and deployment |
| [05-folder-structure.md](05-folder-structure.md) | 3-level trees for backend, ERP frontend and super-admin, purpose of key folders, where to put new code |
| [06-data-models.md](06-data-models.md) | All 133 tables / 1,669 columns with types, keys, indexes and relationships; ER diagram of core entities; schema issues |
| [07-api-reference.md](07-api-reference.md) | All 779 endpoints grouped by router tag (method, path, purpose, request, response, auth, paging) + conventions and paginated endpoints |
| [openapi.json](openapi.json) | Machine-readable OpenAPI spec exported from the running app |
| [08-design-system.md](08-design-system.md) | Colors (hex), typography, spacing, radius, shadows, theming/dark mode, assets, measured inconsistencies |
| [09-components-inventory.md](09-components-inventory.md) | App shells and every menu item; how buttons/forms/tables/drawers/charts are built; duplicates; full component list with props and usage |
| [10-screens-inventory.md](10-screens-inventory.md) | Every route in the three web apps with file, API calls, loading/empty/error/responsive flags; detailed dashboard widget breakdown |
| [11-known-issues-and-tech-debt.md](11-known-issues-and-tech-debt.md) | UX problems, performance and security risks, pattern inconsistencies, i18n status (no TODO comments exist) |
| [12-code-patterns.md](12-code-patterns.md) | Complete real examples: backend model/schema/repository/service/route, a list page, a validated form, the API client/auth; naming, errors, response format |
| [13-improvement-opportunities.md](13-improvement-opportunities.md) | Top 15 recommendations ranked by impact vs effort, by category |

## Not covered or uncertain

- **`mobile/`** (separate offline mobile web app) and **`flutter_app/`** were not analyzed; only their existence and the redirect from `frontend/src/proxy.ts` are described.
- **Production infrastructure** outside the repo: the server `deploy.sh`, Nginx/reverse proxy, how the Next.js apps are run, backups and the real API hostname.
- **Billing worker scheduling** (`backend/app/modules/billing/worker.py`) and whether `DATABASE_NEON_URL` is used.
- **Runtime behavior**: screen states and responsiveness are flagged by static code analysis, not by visual testing; endpoint lists per screen come from a static import walk (two levels) and can miss calls made in deeper components.
- **Accounting → Payroll vs HR → Payroll** relationship, tenant CRM email sending, and the service worker (`public/sw.js`) behavior.
