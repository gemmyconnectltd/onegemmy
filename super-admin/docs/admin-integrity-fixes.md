# Super Admin integrity and workflow fixes

Changes preserve the live billing work already present in the workspace. This task does not restore or replace its architecture, seed plans, charge wallets, deploy staging, or execute the cleanup script.

| Request | Result / implementation |
| --- | --- |
| 1 | Input text is trimmed before validation on tenant/user/registration/support schemas and before JSON submission through the admin request client. Passwords/tokens retain their bytes. The identity migration trims existing tenant/user text. |
| 2 | Admin creation, self-signup and editing share a serialized lowercase kebab slug allocator, with `-2`, `-3` suffixes. Prior slugs remain reserved aliases, resolved by the existing repository lookup used at login. The migration preserves TEN-* values as aliases. UUID foreign keys stay unchanged. |
| 3 | Overview and Usage display original sales grouped by currency. Their all-time totals share the same cached completed-order query; plan and top-tenant sales use the same completed/base-total definition. Draft orders and unrelated ledger entries are excluded. Legacy converted fields remain for API compatibility and are not presented as combined revenue. |
| 4 | Tenant owners display as Owner, including CSV/XLSX exports. Filters use actual persisted roles. Platform access requires all three: `is_superuser`, no tenant, and role `superadmin`; tenant owners fail this guard, including orphaned owners. Owner tenant-wide permissions are intentional. |
| 5 | Assignment/change uses the existing quote/confirmation API and price-version entitlements, with refreshed tenant limits after confirmation. The Subscription tab exposes the plan and limits editor. No guessed hardcoded tier limits. |
| 6 | Edit business drawer PATCHes name, slug, phone, city, country and contact preference; text/length validation is server-side. |
| 7 | Delete tenant archives the row using `archived_at`, disables access, and retains financial/history/user identities. It requires typing the name in the UI and records Activity. Archived rows remain visible to staff with an Archived badge; activation is refused. |
| 8 | Onboarding requires owner full name/email. Business, default branch/departments, owner with a real Admin permission role, and audit entry are created atomically. Invitation uses the existing account email sender after commit. Country uses the same country dataset as filters. Active catalog plans can be selected and quoted in the same drawer after creation. |
| 9 | Owner is an invite option. API roles are restricted to owner/admin/member/viewer; no platform role can be submitted. |
| 10 | Menu Suspend opens the confirmation directly; inactive businesses show Activate business. This behavior was already wired in the current source and is exercised in browser QA. |
| 11 | Both onboarding and subscription management use the existing active billing plan catalog, including custom plans and pagination. |
| 12 | Closing or cancelling onboarding clears fields, notices and plan selection. |
| 13 | Drawers render through body portals with nested stacking levels, preventing ancestor overlays from intercepting real clicks. Plan confirmation is exercised through Playwright mouse clicks. |
| 14 | Feature usage explicitly means share of tenants using each module. The misleading compositional donut is replaced by the tenant-count indicator. Counts invalidate after mutations. |
| 15 | Trial/Cancelled cards query all tenants; both are available as server-side status filters. |
| 16 | Initials and business sorting trim names defensively. Sorting happens before pagination. |
| 17 | Missing answers are returned as Not specified and always remain an explicit chart slice. Aggregated small categories are named Other (small), distinct from a stored Other answer. |
| 18 | The current payments table already renders a single currency-aware amount without appending a duplicate currency suffix; this is retained. |
| 19 | The exclusive `couponStatus` helper implements Expired > Exhausted > Inactive > Active. **The requested SAVE10USD badge/filter cannot be exercised:** the workspace's previous billing integration has replaced the old demo coupon screen/data with Approved discounts. No coupon records or coupon filter screen exist to update. The demo architecture is not recreated by this task. |
| 20 | New ticket includes an optional searchable, paginated business picker. `ticket.created` produces “Ticket PES-… created”; the associated conversation event is suppressed as a duplicate toast. Invalid tenant references get a normal Not Found response. |
| 21 | Support Team already displays email below each display name; retained. |
| 22 | Plan, priority and billing status options use proper-case labels while preserving machine values. Users has only All/Active/Inactive status choices; no stray dash. |
| 23 | Tenant sort key/direction persist in URL and restore on reload. Query filters and sort execute before server pagination. |
| 24 | New currency prices default to 18% tax in the plan form. Billing Settings explicitly links to per-price tax/limits configuration. Existing contracts and tax rates are unchanged. |
| 25 | `backend/scripts/cleanup_staging_qa.sql` targets the supplied tenant ID/name and ticket reference. It requires a staging confirmation variable, refuses mismatched identities/billing history, uses a transaction, and defaults to ROLLBACK. **Not executed.** |

## Data and rollout

Apply `backend/alembic/versions/a92d6017bc34_normalize_tenant_identity.py` together with the application's pending migration chain before deploying this code. The normalization preserves all IDs and old slug aliases. Upgrade is idempotent; downgrade deliberately retains the additive alias/archive data and normalized values, so rollback does not destroy links or reactivate archived businesses. The database uniqueness constraints remain authoritative. If existing email whitespace creates a uniqueness conflict, the migration rolls back rather than merge accounts; resolve conflicting identities before retrying.

Usage platform totals cover every registered business, including archived businesses' historical activity. Directory filters affect only the directory and are labeled accordingly; all pages use server pagination rather than partial browser scans. Staff can still inspect archived businesses, but their users cannot authenticate or refresh access.

Verification details are reported with the task outcome. No credentials are written or exposed. No staging/production migration or QA cleanup is performed by this change.

## Main files

- Backend: `backend/app/modules/admin/{routes,analytics,repository,service}.py`, tenant/auth/support schemas and tenant service/repository, `backend/app/modules/tenants/slug.py`, `backend/app/shared/schemas.py`.
- Migration: `backend/alembic/versions/a92d6017bc34_normalize_tenant_identity.py`.
- Admin UI: `super-admin/src/app/(portal)/{page.tsx,tenants/page.tsx,tenants/[id]/page.tsx,tenants/[id]/TenantPanels.tsx,users/page.tsx,usage/page.tsx,support/tickets/page.tsx}`; shared drawer/confirmation, status/avatar, support toast, API client/hooks, and the noted billing labels/defaults.
- Tests: `backend/tests/test_admin_integrity.py`, `super-admin/tests/admin-integrity.test.mjs`.
- Cleanup: `backend/scripts/cleanup_staging_qa.sql` (not run).

## Verification

The full non-live backend suite passed 337 tests before the final archive-PATCH guard and plan-label addition; the focused integrity/analytics/export suite passed 56 tests after those final changes, including a custom plan label and more-than-one-page status filtering. Two Node tests cover coupon-state precedence and credential-preserving request normalization. Super Admin TypeScript and ESLint pass. Changed Python files pass Ruff. Repository-wide Ruff still reports 160 existing violations in unrelated scripts/modules/tests; these are not mass-reformatted by this task. Browser QA uses mocked API fixtures, real Chrome mouse clicks and explicit page-content assertions at widths 1440, 834 and 390. It does not authenticate against staging or change staging data.
