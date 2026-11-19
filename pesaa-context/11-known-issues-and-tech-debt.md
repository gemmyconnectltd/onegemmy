# 11 — Known issues and tech debt

Findings from reading the code (and from bugs fixed during the latest sessions). Severity: **High** = wrong data, security or blocked users; **Med** = noticeable UX/perf problem; **Low** = cleanup.

## TODO / FIXME / HACK comments

None. `git grep -E "\b(TODO|FIXME|HACK|XXX)\b"` over `backend/app`, `frontend/src`, `super-admin/src`, `website/src` and `mobile/src` returns nothing. Debt is documented in prose comments and `docs/*.md` instead (e.g. `docs/DESIGN_SYSTEM.md` "Remaining review", `docs/ROLES.md` "Known limits").

## UX problems visible in the code

| Sev | Issue | Where |
|---|---|---|
| High | **Fake data shown as real:** Customers → Segments, Loyalty and Analytics render hardcoded arrays (`CUSTOMERS`, `MONTHLY`, `TOP_CUSTOMERS`, sample members) and are linked in the Customers menu | `frontend/src/app/(erp)/customers/{segments,loyalty,analytics}/page.tsx`, `frontend/src/lib/navigation.ts` |
| High | **Dashboard numbers can be wrong:** chart buckets the last 500 completed orders by hour/weekday/month without checking the date (older sales leak into "Today"/"This week"); "Wk 1–4" drops days 29–31; expenses line always 0; Top Products and category stock ignore the period; everything is computed from capped samples (500 orders, 200 products) | `frontend/src/app/(erp)/dashboard/page.tsx` (`buildChart`, `SidePanel`), `ModuleBreakdown.tsx` |
| Med | Orphan mock page `/products` (hardcoded `mockProducts`, saves nothing) still routable; `lib/config.ts` still lists it | `frontend/src/app/(erp)/products/page.tsx` |
| Med | Notification settings page is a placeholder ("not built yet") | `frontend/src/app/(erp)/settings/notifications/page.tsx` |
| Med | Repairs module has a page and API but no menu entry | `PRIMARY_NAV_GROUPS` in `lib/navigation.ts` |
| Med | Subscription & Billing page hidden from the menu (`hidden: true`) though built | `lib/navigation.ts`, `components/billing/TenantBilling` |
| Med | Signup collects gender and drops it | `frontend/src/app/(auth)/register/page.tsx` |
| Med | Held POS sales are kept only in browser memory (lost on refresh) | `frontend/src/app/(pos)/pos/page.tsx` (`heldOrders` state) |
| Med | Error handling is inconsistent: API errors are thrown as plain objects `{status, detail}` (`lib/api/client.ts`), but many components read `error.message` (undefined) — leads to blank or generic messages (one case fixed in `SaleDocumentDrawer`) | `frontend/src/lib/api/client.ts` and callers |
| Med | Frontend may show actions the server refuses: `hasPermission` falls back to role names (admin/owner/viewer, empty-permission "members"); `hasModuleAccess` returns true for `member`/`viewer` | `frontend/src/lib/auth.tsx` |
| Med | HR payroll has no batch run, payslips, statutory deductions or accounting posting; employees aren't linked to users | `backend/app/modules/hr/service/payroll.py`, `hr_employees` |
| Med | Quotation "Mark as sent" doesn't send anything | `components/sales/QuotationDetails.tsx` |
| Low | Pages without an error branch in code: `/dashboard`, `/hr/departments`, `/inventory/products/settings`, `/inventory/warranty`, `/procurement/requests`, `/procurement/suppliers`, `/repairs`, `/services/catalog`, `/services/staff-commissions` | see 10 |
| Low | Candidate pages without an explicit empty state (static heuristic — verify): accounting accounts/income, expenses categories, inventory overview, most procurement pages, `/reports/daily`, discount rule/new pages | see 10 |
| Low | Pages with no responsive breakpoints at all: `/approvals`, `/inventory/movements`, `/inventory/transfers/[id]`, `/manufacturing/bom`, `/manufacturing/materials`, `/profile`, `/sales/orders/[id]`, `/services/appointments`, `/services/calendar`, `/services/staff-commissions`, `/settings/users/roles`; super-admin traffic and data-management pages | see 10 |
| Low | Dashboard recent-sales order number always uses the "cash" color | `dashboard/page.tsx` (`METHOD_COLOR["cash"]`) |
| Low | Hardcoded tax-deadline banner ("Quarterly VAT & CIT instalment") regardless of the business's tax settings/country | `dashboard/page.tsx` (`nextTaxDeadline`) |

## Performance risks

| Sev | Issue | Where |
|---|---|---|
| High | **Client-side aggregation over big pages:** 31 places request 100–500 rows to compute totals in the browser — dashboard (`useOrders(1,500)`, `useProducts(1,200)`), customers (`useOrders(1,500)`), sales orders page (`useProducts(1,500)`, `useOrders(1,500)` for revenue), POS customers (500), manufacturing pages (500 ×3), returns (200 ×3), calendar (500). Results are wrong once a business exceeds the cap and payloads grow. | `grep -rnE "use[A-Z]\w+\(1, *(100|200|500)"` in `frontend/src` |
| Med | Hardcoded `page_size=200` for departments, categories, brands, units | `frontend/src/lib/api/hr.ts`, `inventory.ts` |
| Med | ~59 loops in services execute a query per iteration (N+1 pattern), e.g. product/variant lookups per order line, per-rule lookups in discounts, per-warehouse counts | `app/modules/sales/service/order.py` (`db.get(Product, …)` in loops), `discounts/service.py`, `inventory/service/warehouse.py`, `services/service/appointment.py` |
| Med | ~138 foreign keys have no index; notable lookup paths: `sales_orders.created_by` (own-sales filter), `sales_order_payments.branch_id`, `sales_quotations.customer_id`, `sales_returns.customer_id`, `sales_return_items.order_item_id`, `inventory_stock_transfers.from/to_branch_id` | see 06 |
| Med | No shared cache or queue: rate limiter, cache and background tasks are per-process; scaling to >1 API process breaks rate limits and may double-run background loops | `app/core/rate_limit.py`, `app/core/cache.py`, `app/main.py` |
| Low | `hooks.ts` is one 99 KB file with 463 hooks; `CsvImportDrawer.tsx` is 930 lines; `sales/service/order.py` is 80 KB | — |
| Low | `paginated_response` totals sometimes ignore filters (e.g. targets: `count_for_tenant` ignores `period`) | `app/modules/sales/service/target.py` |

## Security risks

| Sev | Issue | Where |
|---|---|---|
| High | **Tenant check missing on a restock path:** an Approved return line that names a `product_id` (no `order_item_id`) restocks `db.get(Product, product_id)` without checking the product belongs to the tenant — a crafted request could change another business's stock if it knew a product UUID | `backend/app/modules/sales/service/return_.py` (`_restock`, `create_return`) |
| Med | 151 `await db.get(Model, id)` lookups bypass tenant scoping by design; 76 have no tenant check within the next three lines (many are safe because the id came from a tenant-checked parent — needs a review pass) | `grep -rn "await db.get(" backend/app/modules` |
| Med | JWT access/refresh tokens stored in `localStorage`/`sessionStorage` (XSS would expose them); no CSP configured in the repo | `frontend/src/lib/api/client.ts` |
| Med | Rate limiter trusts the first `X-Forwarded-For` value — spoofable unless the proxy overwrites it; in-memory only | `backend/app/core/rate_limit.py` |
| Med | Runtime UI translation sends text to an **unofficial Google Translate endpoint** (no key, no SLA) | `frontend/src/app/api/translate/route.ts` |
| Low | Personal/dev defaults in settings: `EMAIL_FROM` uses a personal Gmail, `CONTACT_INBOX` a personal Gmail, `SEED_ADMIN_PASSWORD="admin123"`, a WhatsApp invite URL. `SECRET_KEY` and `CORS_ORIGINS="*"` **are** rejected in production by a validator | `backend/app/core/config.py` |
| Low | No backend CI (tests/lint only run locally) | `.github/workflows/` |
| Info | Good: production disables `/docs`; private uploads (`uploads/private/…`, purchase documents, data exports) are blocked from static serving; authz sweep test covers every write endpoint; password rules and audit logging exist | — |

Bug fixed recently (for context): a server crash (`MissingGreenlet`) when a non-manager opened their own sale/quotation/invoice — permission names were lazily re-loaded after the session expired the user; now read via `db.run_sync` in `own_sales_scope` (`backend/app/modules/sales/service/order.py`).

## Inconsistencies in code patterns

- **Backend module shape:** 13 modules are layered (`models/ routes/ schemas/ service/ repository/`), 11 are flat single files (`admin`, `ai`, `approvals`, `auth`, `billing`, `discounts`, `imports`, `marketing`, `support`, `tax`, `traffic`).
- **`_require_tenant` is redefined in 36 route files** instead of shared.
- **Responses:** routes return `JSONResponse` envelopes, so OpenAPI has almost no response models; some routes return lists directly in `data`, others paginated `{items,total,…}`.
- **Schemas use `float`** for money fields while the DB uses `NUMERIC` (e.g. `TargetCreate.target_value: float`) — precision is converted at the edge.
- **Two sources of truth for POS payment method** (`payment_method` column / payments table vs `"POS — cash"` in notes parsed by `lib/orders.ts`).
- **Two UI kits** (`frontend/src/components/ui` vs `super-admin/src/components/ui`) with diverged copies of the same components; duplicate local badge/pill components (see 09).
- **Raw palette colors and 20 ad-hoc font sizes** despite the token system (see 08).
- **Stale code:** `ADMIN_NAV_ITEMS` and `/admin` links in the ERP sidebar (console moved to `super-admin/`); empty `entities/ features/ processes/ shared/ widgets/` folders; many `/reports/*-overview` pages are now redirects.
- **`AGENTS.md` drift:** says VAT is "Ghana, 18%" and money fields are floats — the code now has per-business VAT settings and `NUMERIC` columns.

## i18n status

- **Mostly hardcoded English.** UI text is written inline in components and pages.
- A 195-key dictionary (`BASE_STRINGS` in `frontend/src/lib/appConfig.tsx`, mainly navigation and inventory labels) is translated **at runtime by machine translation** into Kinyarwanda (`rw`) and Kiswahili (`sw`) through `src/app/api/translate/route.ts`, cached per browser in `localStorage`. Only ~10 `t("…")` calls exist in components.
- `next-intl` is a dependency but unused. Backend messages, PDFs and emails are English only. Super-admin and website: English only (website shows a static language indicator by design).
- Money/dates: formatted with the business currency (`fmtMoney`, `currencySymbol`) and `toLocaleDateString`; some charts force `"en"` locale.
