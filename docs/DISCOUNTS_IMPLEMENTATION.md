# Discount and promotion implementation status

This is a working core implementation, **not completion of the master acceptance criteria**. No production deployment or production financial-data changes were performed. Existing uncommitted super-admin work was preserved.

## Implemented

- Tenant-persisted optional switches, all disabled by default; feature-aware Sales navigation and a Sales Settings entry accessible when disabled.
- Shared Decimal pricing engine for percentage, fixed, product, category, customer, volume, BOGO, coupon, order-level and tiered discounts. Highest-tier and progressive quantity calculations have explicit semantics. Volume quantities can be combined or counted by product.
- Product/variant/category/customer/branch/channel eligibility; schedules; priorities; exclusive and combinable rules; amount/percentage caps; configured margin floors on automatic rules; exact line allocations.
- Rule and campaign management APIs; coupon generation/status APIs; dedicated rule creation workspace; management tabs; genuine overview/usage data; basic date-filtered analytics.
- Backend settings, creation, editing, activation, manual application, campaign/coupon management, approval and analytics permissions. New grants are added to the catalogue without silently widening existing roles.
- Desktop POS automatic repricing, manual amount/percentage controls, coupon input, approval requests, and checkout idempotency references. Server calculations are authoritative. A pricing fingerprint prevents charging a stale preview.
- Coupon total/customer limits checked within the checkout transaction. Shared tenant transaction locks serialize competing financial writes. A private-schema PostgreSQL test verifies exactly one of two tills can redeem the last coupon.
- Existing split payments, VAT-inclusive tax extraction, partial/credit settlement, stock deduction and journal posting consume the discounted total.
- Applied rule/coupon records include historical rule snapshots, actual order-line IDs, actor, branch and customer. Editing rules does not rewrite those records.
- Approval requests use the existing inbox; approval consumption is deferred until checkout. Tenant, requester, branch, cart fingerprint, full pricing result and one-use status are rechecked. Deciders respect configured authority limits.
- Persisted receipt mapping includes original subtotal and all allocated discounts. Linked-item refunds are capped by frozen discounted line prices, validate tenant/customer ownership, cap cumulative refund amounts, and serialize quantity checks.
- Accepted quotation conversion preserves already agreed prices through a service-only conversion path.

## Remaining acceptance gaps

The following are unfinished and must not be represented as production-ready:

- New/revised quotations do not yet calculate and freeze new promotion configurations through this engine. Existing quotation conversion terms are preserved.
- Mobile-app/offline POS integration is not implemented. The desktop POS is connected.
- Management editing/duplication and full campaign scheduling/association/budget workflows need complete UI coverage. The APIs cover a larger scope than the current forms. Category/variant/branch selection still uses record references.
- Rule-specific approval requirements, request-changes decisions, and a complete guided pricing/margin preview are not implemented.
- Product/customer detail panels and their discount history are not connected.
- Reporting is basic: overview plus up to 100 rule/kind totals. The complete requested product/category/customer/cashier/salesperson/branch/campaign breakdowns, authorized exports, margin trends and materialized rollups are not implemented. Overview/analytics exclude pending and cancelled orders; they are granted-discount figures, not a net-of-returns discount reconciliation.
- Foreign-currency discount checkout is rejected rather than mixing fixed reward currencies. Tax-inclusive pricing follows the existing ERP; tax-exclusive pricing is not implemented.
- Partially overlapping BOGO buy/reward pools are rejected by the engine; identical or disjoint pools are supported. Reward items must be in the cart.
- Pending-sale discount usage is reserved when created and released on cancellation/rejection/void. Reconciliation of correction history remains to be implemented.
- Existing generic sale correction workflows have not been extended to replace applied-rule snapshots. Historical journal correction remains governed by existing services.
- Responsive/keyboard/browser behavior has not had authenticated visual QA. HTTP 200 checks establish route rendering only.

## Validation

Verified during implementation:

- Engine tests cover all ten types, rounding, allocation, stacking/exclusivity, branch/channel/customer restrictions, scheduling, usage, authority, approval fingerprints, per-product volume counting and large progressive quantities.
- HTTP security tests reject unauthorized mutations before malformed-body validation; approval-context tests reject mismatches and replay.
- Local PostgreSQL checkout tests verify coupon idempotency/history, cross-tenant rejection, split-payment journal balancing, stock movement, original-price refunds and concurrent last-coupon redemption. Tests roll back their data or remove a randomly named private schema.
- The repository authorization sweep passes after tightening preview access to assigned sales/discount grants.
- Frontend type checking and changed-file ESLint pass, with one existing unused-variable warning in `hooks.ts`.
- All 52 frontend unit tests and all 11 design-system tests pass; the design-system checker passes.
- A production build succeeds with local worker permissions. Changed `/sales/discounts`, `/sales/discounts/new`, and `/pos` routes return HTTP 200 using webpack dev mode.
- The final focused PostgreSQL/engine/security/access/multi-currency run passed 95 tests. The broad non-live run reached 679 passes, 7 failures and 1 skip before interruption for a stalled transaction; its discount-permission-matrix and partial-refund regressions were then fixed and passed targeted retests. The remaining five failures concern existing procurement/accounting/operational-permission behavior. Repository-wide Ruff reported 353 findings. Changed discount/backend files pass targeted Ruff checks.

## Migrations and operations

- `c5d1a8e2f973`: initial discount tables, tenant settings and CRUD/approval grants (pre-existing unfinished workspace migration).
- `d6e2b9f4a103`: additional authority grants and usage indexes. This follow-up is separate because the local database already reported the initial migration applied.
- The additive follow-up migration was applied to the local development database. Review/apply migrations through the normal deployment process before serving production APIs. No defaults enable discounts or grant new privileges to existing employees.
- No new dependencies or commits were introduced.
