# 13 — Improvement opportunities

Top 15, ranked by impact ÷ effort (1 = do first). Impact/Effort: H/M/L. Each item points at the evidence in files 06–11.

| # | Area | Recommendation | Impact | Effort |
|---|---|---|---|---|
| 1 | Security | **Fix the returns restock tenant check:** load the product/variant with `tenant_id` in `return_.py` (`_restock`, create path) and add a cross-tenant test. | H | L |
| 2 | UX/design | **Remove or hide the fake-data pages** (Customers → Segments/Loyalty/Analytics, `/products`) until they read real data; showing invented numbers erodes trust. | H | L |
| 3 | Frontend | **Make the dashboard truthful:** move KPIs, chart series (incl. expenses), top products and category breakdowns to one server summary endpoint per period; fix the date filtering in `buildChart`. | H | M |
| 4 | Performance | **Replace "fetch 500 and sum in the browser"** (31 call sites) with server aggregates or paged/search endpoints (customers picker, sales revenue, manufacturing pages, invoices list). | H | M |
| 5 | Frontend | **One error shape:** make `request()` throw an `ApiError extends Error` with `status`/`detail`/`message`, so every `error.message` shows the server's reason (today many show blank/generic text). | H | L |
| 6 | Security | **Review the 76 unscoped `db.get()` calls** and replace client-reachable ones with `get_by_id_for_tenant`; add a lint/test that flags `db.get` on tenant models. | H | M |
| 7 | UX/design | **Finish the design-system migration:** collapse the 20 ad-hoc text sizes to the 6-step scale, map raw `red/amber/emerald` classes to semantic tokens, one shared `Badge` (success/warning/error/neutral) for all statuses, re-color charts to the brand/semantic palette. | M | M |
| 8 | Frontend | **Single shared UI package** for `frontend` and `super-admin` (Button, Drawer, Form, TableScroll, Badge, EmptyState, DataTable, PageHeader) instead of drifting copies. | M | M |
| 9 | Frontend | **Align frontend permission checks with the server:** drop role-name fallbacks in `hasPermission`/`hasModuleAccess`; drive UI purely from `GET /tenants/users/me/permissions` + entitlements. | M | L |
| 10 | Backend | **Payment method as data, not notes:** stop parsing `"POS — cash"` from `notes`; report from `sales_order_payments.payment_method`; backfill old orders. | M | L |
| 11 | Performance | **Add indexes** on hot foreign keys (`sales_orders.created_by`, `sales_order_payments.branch_id`, `sales_quotations.customer_id`, `sales_returns.customer_id`, `sales_return_items.order_item_id`, stock transfer branch ids) and batch per-line lookups in `order.py` with `selectinload`/`IN` queries. | M | L |
| 12 | Backend | **HR ↔ users ↔ accounting:** link `hr_employees` to `users`, add batch payroll runs with payslips and post payroll to the ledger; statutory deductions per country later. | M | H |
| 13 | Frontend/i18n | **Real i18n:** use the already-installed `next-intl` with reviewed `en/rw/sw` message files; drop the runtime unofficial Google Translate route. | M | H |
| 14 | Security/ops | **Harden sessions and infra:** httpOnly refresh-token cookie (or at least a CSP), shared rate-limit store, trust `X-Forwarded-For` only from the proxy, move background loops to a single worker, add backend CI (ruff + pytest). | M | M |
| 15 | UX/design | **Small flow fixes:** persist held POS sales server-side, "Send quotation" actually emails the PDF, add Repairs to the menu or hide it, unhide Subscription & Billing or remove it, store or drop the signup gender field, real Notification settings. | M | M |

## By category

- **UX/design:** #2, #7, #15 (and the dashboard truthfulness in #3).
- **Frontend:** #3, #5, #8, #9, #13.
- **Backend:** #10, #12 (and the batching half of #11).
- **Performance:** #4, #11.
- **Security:** #1, #6, #14.
