# OneGemmy — Product Requirements Document (PRD)

**Version:** 1.0
**Status:** Living document
**Scope:** Whole product — backend, web ERP, and mobile app

---

## 1. Overview

**OneGemmy** is a multi-tenant ERP (SaaS) for small and medium businesses. It helps shop owners run sales, inventory, money, suppliers, and reporting from one system — on the phone and on desktop.

The product must serve two ends of the same market:

1. **Small shops** — one cashier, one device, fast cash sales. Value = speed and simplicity.
2. **Large / multi-branch businesses** — volume, auditability, granular permissions, and correct accounting at scale.

### Problem statement

Small businesses run on paper and spreadsheets: sales aren't recorded, stock goes missing, VAT is computed wrong, and there's no way to know the business is making money. Larger businesses grow past those tools but can't afford enterprise-grade ERPs. OneGemmy closes that gap with a single, tenant-isolated platform that is **fast on a phone** and **correct enough for an accountant**.

### Value proposition

- **Sell in 2 taps** from a phone (add product → charge).
- **Money that is always VAT-correct** (VAT-inclusive pricing, Ghana 18%).
- **Real-time, auditable inventory** — every movement logged with reason and actor.
- **Absolute tenant isolation** — no customer can ever see another tenant's data.
- **One codebase scales** from a corner shop to multi-branch operations.

---

## 2. Goals & non-goals

### Goals (v1)

- Fast, reliable mobile POS (≤2 screens per task, ≤2 taps for a cash sale).
- VAT-inclusive pricing applied consistently backend + frontend.
- Every financial mutation idempotent and traceable to an order/receipt.
- Multi-branch-ready tenancy and granular RBAC from day one.
- Real-time inventory with no lost updates under concurrency.

### Non-goals (v1)

- Full offline-first sync (device-local cache is read-only convenience, not the source of truth).
- Manufacturing / MRP modules (listed in architecture as planned, not v1 commitment).
- Marketplace / multi-vendor e-commerce.
- Native iOS/Android apps (Progressive Web App on the web).

---

## 3. Users & personas

| Persona | Where they work | Primary need |
|---|---|---|
| **Shop owner** | Mobile app | See today's sales, low stock, and charge fast |
| **Cashier / attendant** | Mobile POS | Add items, take cash/mobile/card, print receipt |
| **Accountant** | Desktop ERP | Books: expenses, taxes, trial balance, income statement |
| **Store manager** | Desktop ERP + mobile | Inventory, purchases, staff, suppliers |
| **Super Admin** | Admin console | Tenants, platform users, plans, platform stats |
---

## 4. Product modules (map to implementation)

| Module | Capabilities | Status |
|---|---|---|
| **Auth & tenancy** | JWT login/refresh, tenant user + role + permission, branch, department | Built |
| **Inventory** | Products, variants, categories, brands, units, suppliers; restock; valuation; image upload; bulk create | Built |
| **Sales** | Customers, deals, orders + order items, returns, targets | Built |
| **Finance** | Accounts, transactions + lines, expenses, budgets, tax config; reports (trial balance, income statement, balance sheet, cash flow, GL) | In progress |
| **HR** | Employees, attendance, leave, payroll, applicants | In progress |
| **Procurement** | Purchase orders, receive, cancel | Built |
| **Tenants / Admin** | Tenant management, platform users, plans, stats | Built |

See `docs/backend-architecture.md` and `docs/erd.md` for detail.

---

## 5. Functional requirements (priority order)

### P0 — Money correctness & sales integrity

- **FR-MNY-001** Prices are **VAT-inclusive**. `net = gross × 100/118`, `VAT = gross × 18/118` (18% VAT). Applied identically in backend and frontend.
- **FR-MNY-002** Money stored in integer minor units or `Decimal` for new fields; existing `float` price fields are known debt and must not be compounded.
- **FR-MNY-003** Order creation is idempotent — duplicate/repeated reference numbers are rejected.
- **FR-SLS-001** A completed sale persists an order with line items (product, variant, qty, unit price, line discount, line total) and a stable order number.
- **FR-SLS-002** Stock is decremented atomically at sale time; no lost updates under concurrent sales.
- **FR-SLS-003** Every inventory movement is logged with reason and actor.

### P1 — Mobile sell flow

- **FR-MOB-000** The mobile app is reachable standalone via a branded subdomain (`shop.`/`m.`/`mobile.` hosts, or exact domains in `MOBILE_APP_HOSTS`): `src/proxy.ts` 307-redirects every non-`/m/*` path there (auth → `/m/login`, everything else → `/m`), so ERP pages are never shown on the mobile host. Same deployment — no separate codebase.
- **FR-MOB-001** Fastest cash sale = 2 taps: add product → **Charge** on the floating cart bar (exact cash).
- **FR-MOB-002** Cart drawer shows items, totals (items incl. VAT, discount, VAT, total), and offers **Charge** plus **Other payment methods**.
- **FR-MOB-003** `/m/payment` handles exact/cash-with-change (numpad + presets), mobile money, card, and invoice (customer required).
- **FR-MOB-004** Receipt renders inline after charge; back returns to POS with a fresh cart.
- **FR-MOB-005** Payment method is recorded in order notes as `POS — <method>` and parsed back out for reports.

### P1 — Reporting & transactions

- **FR-RPT-001** Stats and Transactions read completed orders from the backend (`useOrders`), not device-local storage.
- **FR-RPT-002** Period filters (Today / 7 days / This month / All time) must change results based on real order dates.
- **FR-RPT-003** Stats show revenue, sales count, items sold, avg sale, payment breakdown, top products, held sales, recent activity.

### P2 — Supporting operations

- Customers, suppliers CRUD (with mobile create forms).
- Purchases (create + receive), expenses, low-stock alerts, notifications.
- Account hub: business profile, payment methods, taxes, printer, notifications, help & support.

---

## 6. Mobile app UX requirements

- **≤2 screens per task**; complete flows in the fewest taps.
- **Bottom nav (fixed order):** Home → Transactions → **Sell** (center pill FAB, cart badge) → Reports → Account.
- **Home icon tiles:** 4 per row, icon-only, 6 tiles (Purchases, Inventory, Products, Customers, Suppliers, Expenses). No Sales/Reports tiles (they are nav tabs).
- **Hold sale** flow supported (`/m/held`).
- Screens that mirror nav tabs are not to be removed without explicit confirmation.

## 6b. Web ERP (desktop) experience

The web app is the full dashboard ERP — the "big" experience (mobile is the fast/lean one). Requirements:

- **Dashboard shell** (`/`, `(erp)`): `Sidebar` (vertical/horizontal toggle, collapsible), `Topbar`, per-module secondary nav (`ModuleLayout`), `SupportFab`. All ERP pages colocate under `app/(erp)/<module>/…`.
- **Module pages** under `(erp)`: dashboard, customers, crm, expenses, finance, hr, inventory, manufacturing, procurement, products, reports, sales, settings.
- **Desktop POS** (`/pos`, `(pos)`): full-width sales terminal reusing the shared POS components (`ProductCard` vertical layout, `CartPanel`, `PaymentPanel`, `Receipt`) with local cart state. VAT math identical to mobile (VAT-inclusive).
- **Super-admin console** (`/admin`, `(admin)`): tenant/platform management, gated by `isSuperAdmin`.
- **Auth screens** (`/login`, `/register`, `/forgot-password`, `(auth)`): no sidebar; unauthenticated users are redirected to `/login`.
- **Responsive**: sidebar collapses below 1024px; heavy charts/tables lazy-loaded.
- Web ERP must respect the same data-fetching, hydration, money, and security rules as mobile.

---

## 7. Non-functional requirements

### Security & tenancy

- Every tenant query scoped by `tenant_id`; cross-tenant access rejected, including in joins/counts/reports.
- Granular RBAC (`module:action`), enforced in the service layer, not just the UI.
- No PII in URLs, logs, or analytics; least-privilege access to payment data.
- Rate limiting + Pydantic validation on public/abuse-prone endpoints.

### Scale & performance

- Pagination on every list; sane caps; no unbounded responses.
- Composite `(tenant_id, column)` indexes on lookup paths; no N+1 (`selectinload`).
- Bulk endpoints for imports/restocks; no per-row client calls.
- Heavy reports read pre-aggregated summaries, never compute on the fly.
- No blocking IO in async backend paths.

### Reliability & observability

- Structured logs with request IDs and tenant context; never log secrets/tokens/customer data.
- External integrations fail soft with clear error paths.
- Lock-safe migrations (additive → backfill → drop); documented backup/restore paths.

---

## 8. Acceptance criteria (key features)

| Feature | Acceptance criteria |
|---|---|
| Cash sale | `+` product → **Charge** → order created in backend, stock decremented, receipt shown. Total = shelf price (VAT included). |
| Payment methods | Cash (exact/change), mobile, card, invoice each persist the correct method in order notes and appear in payment breakdown. |
| Period filters | "Today" shows only today's completed orders; "All time" shows every completed order; numbers differ when data spans days. |
| Tenant isolation | User A's account can never fetch user B's products/orders/sales, including via crafted IDs. |
| Duplicate prevention | Re-submitting the same order reference is rejected without double stock decrement. |

---

## 9. Success metrics

- Median time to complete a cash sale ≤ 2 taps.
- Zero float-rounding discrepancies on VAT on any tested basket.
- Zero cross-tenant data leaks in integration tests.
- Reports match the accounting books (trial balance / income statement tie to sales totals).

---

## 10. Assumptions, constraints & open questions

### Assumptions
- Prices entered by the business are **VAT-inclusive** shelf prices.
- A sale is a completed order; only `Completed` orders count in sales reports.
- Device-local sales storage is a convenience mirror, not the source of truth.

### Constraints
- Free-tier hosting (cold starts); the backend must degrade gracefully.
- Python 3.14 / Next.js 16 / React 19 — check framework docs before writing code (see `frontend/AGENTS.md`).

### Open questions
- TBD: invoice numbering source (backend) vs client-generated reference.
- TBD: VAT rate configurability per tenant/region beyond Ghana 18%.
- TBD: offline sync strategy for multi-branch at scale.
