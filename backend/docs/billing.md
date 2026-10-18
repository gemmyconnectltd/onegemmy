# Pesaa platform billing

This module is authoritative for **Pesaa subscription fees**, not tenants' ERP sales, POS payments,
accounting invoices, or supplier bills. Tenant ERP and Super Admin use the same tables, authentication,
permissions, and audit trail. Browser billing demo persistence has been removed.

## Rollout

1. Back up PostgreSQL with the deployment's existing backup mechanism, including `alembic_version`.
   Billing records and the encryption secret must be restored together; never restore financial tables
   independently of payments, operations, refunds, invoices, subscriptions and audit records.
2. Review/apply Alembic through `8fd4b31c9e20` (`alembic upgrade head`). The main migration is additive;
   the branch lookup index is a separate concurrent migration. Migration generation intentionally removed
   unrelated drift reported by autogenerate. No prices or subscriptions are seeded.
3. Start `python -m app.modules.billing.worker` from `backend/` under the deployment supervisor.
   Configure restart-on-failure. Workers poll persisted queues; no financial job exists only in memory.
   Multiple workers serialize changes with PostgreSQL tenant/advisory locks and unique source keys.
4. Sign in again if using an existing tenant Admin role so the browser refreshes its permission claims.
5. Create real plans in Super Admin. Configure each currency, monthly/yearly base price, optional active
   user seat pricing, active branch pricing, tax basis points, trial and resource/module allowances.
6. Optionally enable **Require a plan for new businesses** after publishing plans. The additive tenant
   `billing_required` flag preserves pre-migration businesses. With this policy enabled, businesses created
   since billing was installed can log in and read/browse plans, but must choose a plan before ERP writes.
   No account re-registration or client-selected tenant is involved. Support and billing remain accessible.
7. Assign existing businesses from their Subscription tab or the Subscriptions screen, reviewing the
   server quote first. **Legacy businesses are not silently enrolled, repriced or charged.** Their existing
   access remains unchanged until an explicit assignment. Registration continues using the existing
   tenant/account process; owners can enroll from Settings -> Plans & Billing after approval.
8. Complete the provider sandbox checklist below before enabling production payments.

A suggested systemd service command is:

```
WorkingDirectory=/srv/pesaa/backend
EnvironmentFile=/srv/pesaa/backend/.env
ExecStart=/srv/pesaa/backend/.venv/bin/python -m app.modules.billing.worker
Restart=on-failure
```

Do not downgrade a live financial ledger to roll back an application release. Restore the previous app
release while retaining additive billing tables; suspend the worker if necessary. Test a full database
restore into an isolated database before disaster recovery. Include billing tables in existing scheduled
backups and monitor backup freshness, worker uptime, oldest pending transactions and unsent notices.

## Financial policy

- All authoritative amounts are integer ISO currency minor units. The API uses minor units and admin forms convert decimal currency input into integers;
  zero-decimal RWF is never divided by 100. The existing currency catalogue supplies decimal precision.
- Each plan edit appends a price **and entitlement** version. A subscription adopts that immutable version;
  later edits do not change its agreement. Concurrent plan edits use expected-version checks.
- A configured seat model bills all active users attached to the tenant, including owners, admins and
  accounts with temporary/invited credentials. Disabled users and platform users without that tenant are
  excluded. There is no separate invitation state in the existing user model. Seats are not charged twice.
- Extra seat/branch prices are monthly, multiplied by 12 for an annual agreement. Annual base pricing is
  explicitly configured rather than inferred from a hardcoded percentage discount. Active branches count.
- Subscription prices are base fees **before platform subscription tax**, as labeled in the plan UI.
  `tax_bps` is explicit per immutable price version; zero means no subscription tax. This is separate from
  the tenant's Ghana VAT-inclusive ERP sales policy. ERP VAT calculations are not changed.
- Amount = configured cycle fee + excess-seat/branch fees, less approved discount, plus configured tax.
  Decimal HALF_UP rounding is applied at minor-unit boundaries. Financial amounts exceeding JavaScript's
  safe integer range are rejected before issuance; no floating-point calculation authorizes a charge.
- Same-cycle changes prorate the remaining period by integer microseconds. A cycle change credits unused
  old service and charges the new cycle. Currency changes on an existing subscription require reviewed
  migration; no exchange conversion is invented. Quotes expire after ten minutes and are checked for actor,
  tenant, usage, price version, subscription revision and outstanding invoices on confirmation.
- User/branch changes reconcile usage **in the same transaction** as the change. The worker also reconciles
  it as a recovery check. Reductions issue account credit; additions issue a prorated invoice. Credits apply
  as a paid balance against a new invoice and preserve its original taxable subtotal/tax/total.
- Discounts approved during a trial apply to its first invoice. Discounts approved during paid service are
  scheduled for the next cycle and never rewrite finalized invoices or the already-paid proration baseline.
- Monthly/annual renewal uses calendar months and a preserved billing anchor day, including month ends
  and leap years. Trial cycle changes do not extend the original trial.
- Invoice references use a PostgreSQL sequence; gaps after rollback are expected. Invoice amounts,
  currency precision, billing name, lines and dates are frozen. Database triggers protect finalized
  identities/amounts and verified payment history. Companies with billing history must be archived.
- Refunds are separate credit-note/cash-return records against verified deposits. Pending refunds reserve
  the available balance; concurrent or repeated requests cannot over-refund. Original invoice and payment
  history remains unchanged. Refund tax uses cumulative rounding. A refund does **not** cancel service;
  cancellation is a separate audited administrative action. Credit notes download after verified completion.

## Lifecycle and access

Trial -> active (free or verified paid invoice); at renewal an invoice is generated exactly once. Unpaid
renewals enter past_due, then suspended after the invoice due date plus configured grace. Scheduled
cancellation takes effect at period end. Repeated job runs use stable source keys. Initial or changed paid
plans require settlement before ERP writes are allowed. Existing issued invoices remain collectible.

Expired/canceled/suspended subscriptions preserve authenticated read access to their plan's historical ERP
records, downloads and billing/renewal endpoints. They do not change `Tenant.is_active` or prevent login.
Tenant account suspension remains the separate existing platform-security control. Write restrictions are
also checked during authentication, so worker delays cannot grant indefinite expired access.

For managed subscriptions the plan explicitly grants active catalog modules, subject to tenant opt-outs
and role permissions. Catalog default-enabled values remain the fallback for legacy businesses. An override can restrict a plan
but cannot grant a module or allowance beyond the paid agreement. Limits are checked under the tenant
lock; active user/branch quotas are recounted after acquiring it. `billing:read` and `billing:update` gate
billing services; global admin endpoints additionally require a platform superadmin, never a tenant admin.

## pawaPay setup and verification

Reference: [pawaPay V2 deposits](https://docs.pawapay.io/v2/api-reference/deposits/initiate-deposit),
[status verification](https://docs.pawapay.io/v2/api-reference/deposits/check-deposit-status),
[refunds](https://docs.pawapay.io/v2/api-reference/refunds/initiate-refund), and
[request signatures](https://docs.pawapay.io/v2/docs/signatures).

Server environment (never put these in NEXT_PUBLIC variables):

```
PAWAPAY_API_TOKEN=<sandbox token from your pawaPay dashboard>
PAWAPAY_ENVIRONMENT=sandbox
PAWAPAY_LIVE_ENABLED=false
# Optional; required when the pawaPay account accepts signed requests only:
PAWAPAY_SIGNING_PRIVATE_KEY=<RSA PEM, securely configured as a multiline env value>
PAWAPAY_SIGNING_KEY_ID=<matching uploaded public-key ID>
```

The adapter signs initiation requests with RSA-PSS SHA-512 when keys are configured. Provider/currency
choices and transaction limits come from `/v2/active-conf`, not a hardcoded list. This UI supports
**PROVIDER_AUTH mobile-money PIN prompts**. PREAUTH and REDIRECT_AUTH methods are intentionally not
advertised until those distinct authorization UIs exist. Saved cards, bank transfers, and automatic wallet
charges are not offered. Refunds are offered only where active configuration includes REFUND.

Configure callbacks in the existing pawaPay merchant dashboard:

- Deposits: `https://<api-host>/api/v1/billing/pawapay/callback`
- Refunds: `https://<api-host>/api/v1/billing/pawapay/refund-callback`

Callbacks accept only a bounded payload and treat its reference as an **untrusted notification**. They
never trust its claimed status, amount or payer, and return only an acknowledgment. The server verifies
status using an authenticated provider GET over TLS and matches the deposit/refund ID, amount, currency
and original deposit where relevant before settlement. This read-back is the verification authority;
callback signature headers are not used as proof of payment. Rate limiting reuses the existing auth
limiter; at multiple API replicas also enforce gateway/shared-store limits.

The provider UUID and operation result persist **before** initiation. Ambiguous network responses remain
pending; workers query status and safely resubmit a missing deposit with the same UUID. The temporarily
needed phone/provider payload is encrypted at rest with Fernet derived from the existing application
secret, omitted from API/audit responses, and removed after acceptance or terminal failure. Preserve that
secret when recovering pending requests; drain pending payloads before secret rotation. Customer-confirmed
failed requests require a new payment attempt; the worker never repeatedly debits a wallet automatically.

Before production, run actual pawaPay sandbox cases with approved test MSISDNs:

- Supported country/currency/provider and deposit amount limits.
- PIN prompt accepted -> processing -> verified completed; invoice settled once.
- Failed and rejected deposits; NOT_FOUND after a simulated initiation timeout; stable-UUID resubmission.
- Repeated/reordered callbacks and mismatched reference, currency or amount (no false settlement).
- Partial and full refunds, duplicate refunds, over-refund rejection and verified credit-note download.
- Signed-request mode against the uploaded RSA public key, when enabled on the merchant account.
- Worker downtime/restart, reminder delivery and SMTP failure/retry using the existing accounts sender.

Only then configure the production token/environment and explicitly set `PAWAPAY_LIVE_ENABLED=true`.
No sandbox/live transaction has been claimed based on mocked provider tests. No deployment or migration
was applied outside the rollback-only integration-test transactions during implementation.

## Notifications and reports

Billing notices use the existing Outlook/SMTP accounts sender and branded template; no email account is
reconfigured. Notices are persisted with a unique event key in the same transaction as the event. Delivery
retries with exponential backoff (up to ten attempts). SMTP is at-least-once: monitor exhausted rows and
avoid promising exactly-once delivery across a process crash after SMTP acceptance.

The supervised worker generates invoices, reconciles pending deposits/refunds, enforces grace, sends
trial/renewal reminders, and prepares current subscription metrics and daily financial rollups. Overview
requests read rollups rather than computing whole-ledger totals. Currency amounts are always separate.
MRR excludes tax and uses current active agreements. Date filters affect invoices issued and payments
initiated in the selected dates (UTC, this month by default), grouped by current plan/status. Outstanding
balances shown for a date range mean outstanding invoices **issued in that range**, not all-time debt.
The tenant overview shows its full outstanding balance per currency. The worker refreshes reports after
finishing a bounded pass of subscriptions; the UI displays the snapshot timestamp.

## Verification commands

```
DEBUG=false .venv/bin/ruff check
DEBUG=false .venv/bin/pytest -m 'not live'
# In frontend/ and super-admin/:
npx tsc --noEmit
npx eslint <changed files>
```

Database tests use existing savepoint fixtures and roll back schema/data writes. They exercise tenant
isolation, quote revisions/idempotency, price versions, taxes/credits, month-end anchors, renewal
idempotency, read-only access, refunds, encryption, request signing and callback distrust. Live email and
provider tests require explicit deployment credentials and are excluded from the ordinary local suite.
