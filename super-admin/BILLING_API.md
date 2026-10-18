# Plans & Billing — backend contract (not implemented yet)

The Super Admin billing screens run on a **demo service** (`src/lib/billing/service.ts`, sample data in the browser).
Nothing below exists in the backend today. This is what the screens need so `service.ts` can be swapped for real calls.
Conventions: `/api/v1/admin/billing/...`, platform-admin only, standard envelope (`success_response` / `paginated_response`),
**money = integer minor units + ISO currency per record, never converted across currencies**, every mutation audited
(actor, time, before/after), financial mutations idempotent (`Idempotency-Key` header).

| Area | Endpoints | Notes |
|---|---|---|
| Plans | `GET/POST /plans`, `GET/PATCH /plans/{id}`, `POST /plans/{id}/archive` | Price edits create a new immutable **price version**; `GET /plans/{id}/prices` returns history. Existing subscriptions keep their version. Modules = existing `FeatureFlag.key`s; limits map to `max_products` / `max_storage_mb` (+ `max_users`/`max_branches` derived from included + extra). |
| Subscriptions | `GET /subscriptions` (filters plan/status/country/cycle/q, page), `GET /subscriptions/{id}`, `POST …/change-plan`, `…/cycle`, `…/allowances`, `…/extend-trial`, `…/cancel`, `…/reactivate`, `GET …/history` | Backend computes amounts, proration and the new `tenant.limits`/`subscription_plan`/`subscription_status`. Frontend previews are estimates only. |
| Payments | `GET /payments`, `GET /payments/{id}` | Status changes **only** from the payment provider's webhook (pending → processing → succeeded/failed → refunded). `POST /payments/{id}/refund` only once a provider supports it. No endpoint marks a payment paid. |
| Invoices | `GET /invoices`, `GET /invoices/{id}`, `GET /invoices/{id}/pdf` | Lines/amounts frozen at issue; never re-rendered with new prices. Sequential numbers per `invoice_prefix`. |
| Coupons | `GET/POST /coupons`, `PATCH/DELETE /coupons/{id}`, `POST /coupons/validate` | Server enforces dates, redemption caps, plan scope and currency match. |
| Settings | `GET/PUT /settings` | Provider block is **read-only status** (`name`, `mode`, `webhook_healthy`); credentials live in server env only. |

Suggested tables: `plans`, `plan_prices` (versioned), `subscriptions` (copies the price version), `subscription_events`,
`payments`, `invoices`, `invoice_lines`, `coupons`, `coupon_redemptions`, `billing_settings`.
Every table is platform-level, with `(tenant_id, …)` indexes where tenant-scoped; Alembic migration required.

Integration already in place: the Plans page shows live tenant counts per `subscription_plan` from `GET /admin/stats`,
and the Create/Edit Plan module picker loads real feature flags from `GET /admin/features` (falls back to a static list).
