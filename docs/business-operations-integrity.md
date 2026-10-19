# Business operations integrity — implementation and verification

## Implemented

- Inventory valuation accepts fractional quantities, normalizes missing optional values, includes every active variant in category totals, and omits empty variant parents. Monetary line calculations use Decimal rounding. The ERP receives bounded pages (maximum 100 lines); exports retain the complete report. Product reads use bounded keyset batches instead of a silent 100,000-product cutoff.
- Existing Admin, Member, Viewer and custom role grants remain intact. Re-seeding never restores revoked permissions. Configurable Owner/CEO, General Manager, Branch Manager and Factory Manager templates are created when needed. Settings → Users exposes role creation, permission editing and branch assignments. Delegated administrators cannot grant permissions they do not hold. Permission changes are audited.
- Optional `users.branch_ids` supports selected branches. Null preserves the legacy single-branch/unrestricted interpretation; an empty list grants no branches. Assignments are tenant-validated in a batch. Current-user authentication reads permissions and assignments from the database, so direct API requests do not rely on stale JWT grants. Sales lists/documents/payments, production, financial document guards and the daily report enforce the applicable scope.
- Inventory viewing and direct stock changes have separate permission checks, including variants and bulk inputs. Because inventory balances remain company-wide, limited accounts cannot perform company-wide corrections or stock transfers directly. Their authorized branch sales and purchase workflows remain available.
- Reports → Daily branch activity aggregates posted sales, new credit, customer collections/deposits and approved expenses in the tenant's currency and timezone. It supports date/branch filters, consolidated authorized branches, pagination, CSV and PDF. Manufacturing metrics appear only with the enabled feature and manufacturing read access. The current outstanding customer balance is explicitly separate from date-filtered credit activity.
- “Deposits” means payments applied to customer sales. Collections are not added to sales revenue. Bank transfers are not revenue. Wastage is included in raw-material consumption and is not added a second time.
- The tenant's daily credit limit remains configurable in Financial Settings. Customer records support an override. Customer null inherits the business default; business null means unlimited; zero requires approval for any positive credit. Policy checks use the current business calendar day, across all branches, and a separate grant timestamp prevents backdated sales from obtaining another allowance. Repayments do not replenish the daily allowance.
- Tenant transaction locks serialize sale numbering, retry lookup, cumulative credit decisions, draft completion and approval/rejection. Bulk import no longer disables credit checks. Posted/rejected sales cannot be repriced or reopened through generic edits. Approval preserves requester, decision actor/time/note, stock, VAT and accounting behavior. Held serialized sales retain their requested serial IDs for completion.
- Manufacturing remains behind its existing tenant entitlement. Completion locks the production order and inventory rows, aggregates repeated materials before checking availability, consumes additional wastage, adds finished goods once, and prevents completed-record edits. Completing a name-only material or an unsupported variant/serialized production flow gives explicit guidance rather than silently posting incorrect stock.

## Migration and deployment

1. Deploy the backend with both migrations and run `alembic upgrade head` before exposing the new frontend.
2. `d94e05f16a27` adds optional customer limits, branch assignments, credit grant timestamps, requested serial IDs, production branch metadata and wastage. It retains existing roles, transactions, stock and tenant limits. Existing businesses retain UTC until their timezone is configured; no location is guessed.
3. `e05f16a27b38` adds report lookup indexes concurrently. Run it outside an enclosing deployment transaction, as required by PostgreSQL concurrent index creation.
4. Both migrations were applied successfully to the local development database. No remote deployment was performed.
5. Refresh staff sessions after changing grants to update client navigation; backend enforcement already uses current database permissions.

## Validation

- Full backend suite: **382 passed, 10 deselected**. Live external integrations are excluded.
- Meaningful regressions cover fractional valuation, variants, empty inventory, tenant isolation, PDF/CSV generation, denied direct stock edits, branch filtering, feature gating, template revocations, limits below/at/above policy, customer overrides, zero/unset policies, backdating, timezone boundaries, draft completion, concurrent credit requests and concurrent approval attempts, approval/rejection, manufacturing shortages, wastage and repeated completion.
- The concurrency test uses two independent transactions in a private, randomly named database schema that is dropped in `finally`. Other database tests use rollback-only fixtures.
- Changed Python files pass Ruff. Changed frontend files pass ESLint. TypeScript and an isolated app-only production build pass. The ten design-system tests and design-token validation pass.
- Read-only Chrome workflows pass on desktop and mobile: all six valuation/daily-report endpoints return HTTP 200; PDF responses have valid signatures; the report, timezone field and role manager render; no page-level mobile overflow or JavaScript errors was observed. Financial browser submissions were not exercised against existing business records.
- Repository-wide Ruff still reports pre-existing violations outside the changed-file checks; it is not reported as passing.

## Remaining limitations — do not treat these as implemented

- Product/variant stock is still stored as a company-wide balance. There is no reliable historical branch opening-balance ledger to reconstruct branch stock valuation. Existing balances were not redistributed or fabricated. A complete branch-stock ledger with reconciled opening balances remains separate work.
- Daily purchased/sold quantities are document units, not a complete stock movement reconciliation. Manual corrections, returns and transfers are excluded from those columns; production/material/wastage quantities are separate. Historical data without a branch stays explicitly unassigned.
- Current customer debt is a live balance. This does not claim historical end-of-day receivables reconstruction or bank-deposit reconciliation.
- Manufacturing currently uses its existing whole-unit quantities. Variant/serialized production and fractional raw-material workflows are not implemented by this change.
- The reports are bounded SQL aggregations and valuation reads are batched, but there are no new materialized daily rollups or large-volume performance benchmarks. Large historical export performance has not been certified.
- Module availability continues to use existing subscription entitlements and administrative feature controls. This change does not give every business manufacturing access or add unrestricted self-service module activation.
