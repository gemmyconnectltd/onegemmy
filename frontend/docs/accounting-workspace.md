# Accounting workspace

The ERP shell, primary navigation, business/branch controls, Ask Pesaa AI, POS and user profile remain in place. Accounting has one collapsible secondary navigation and a drawer below desktop width.

## Routes and source mapping

| Accounting navigation | Route | Authoritative source |
| --- | --- | --- |
| Overview | `/accounting` | Posted general ledger aggregates; fiscal-year cards and six-month charts |
| Chart of Accounts | `/accounting/accounts` | Existing accounts, with optional group and parent |
| General Ledger | `/accounting/ledger` | Posted journal lines; drafts reuse existing posting endpoints |
| Accounts Receivable | `/accounting/receivables` | Sales invoices and applied customer payments |
| Accounts Payable | `/accounting/payables` | Received purchase bills and applied supplier payments |
| Cash & Bank | `/accounting/cash-bank` | Existing 10xx cash-equivalent accounts and posted lines |
| Fixed Assets | `/accounting/assets` | Register linked to existing posted acquisitions; depreciation/disposal journals |
| Payroll | `/accounting/payroll` | Existing paid HR payroll records; explicit, retry-safe GL posting |
| Tax Management | `/accounting/tax` | Existing tax calculations and payment register |
| Financial Reports | `/accounting/reports` | Eight report cards and previews in the same workspace |

Existing `/accounting/income`, `/accounting/expenses`, and `/accounting/invoices` remain accessible through contextual links. `/reports/accounting` opens the authoritative financial workspace. No sales, purchasing or inventory module is duplicated in the secondary navigation.

## Reports and exports

P&L, balance sheet, cash flow, changes in equity and trial balance use posted GL lines. Aging uses source documents and applied payments, compared with GL controls 1100/2000. Inventory uses recorded product/variant unit cost, compared with GL 1200.

Generate stores an immutable result header and ordered rows. Preview pages contain 50 rows; exports read all saved rows in batches of 100, without rerunning source calculations. PDF, XLSX and CSV therefore preserve the preview's amounts, scope, period and reconciliation result. Export access rechecks permissions and fixed branch assignment. Source changes require generating a new report.

The ledger is in the business base currency; reports do not invent conversions into another selected display currency. Fiscal start month defaults to January and is configurable by business administrators. Balance sheet/trial balance include history through the as-of date. Branch reports include only attributable journals; legacy entries without a known branch remain visible in All branches.

Cash flow allocates each journal's net cash once across opposite-side noncash lines. Transfers between cash equivalents do not inflate cash flow. Contra-asset accounts reduce assets regardless of their normal balance. Discrepancies stay visible rather than creating balancing journals.

## Supported workflows and limits

- Account imports are atomic, capped at 500 accounts per batch, and validate ownership/type/parent relationships. Posted accounts cannot be regrouped, reparented or deactivated; used accounts cannot be deleted. Names/descriptions can be corrected.
- Invoice drilldowns reuse the existing invoice document and customer-payment drawer. Supplier bill drilldowns call the existing settlement service, with stable retry references, Decimal amounts and serialized writes.
- Cash transfers post balanced journals with retry references. Statement comparisons save the statement and ledger balances and expose their difference. Bank feeds and line matching are not implemented or implied.
- Fixed assets link to existing posted acquisition debits, avoiding duplicate acquisition charges. Depreciation is straight-line, full-month, at calendar month end, beginning in the acquisition month. Depreciation and disposal require journal approval; disposal clears gross cost and accumulated depreciation and posts gain/loss.
- Payroll posting only accepts HR rows already marked Paid with a paid date and reconciled gross/deductions/net. It posts gross salary expense, deductions payable and net cash once. It does not pay employees or add another payroll calculation engine.
- Tax records remain business-wide. A recorded tax payment remains Pending in the existing tax register and does not remit funds or post a cash journal. Existing tax calculation services/rates are reused; this change does not update statutory rules.
- Inventory has no recorded branch quantities or historical stock valuation. The report explicitly supports current, business-wide unit-cost valuation and rejects unsupported branch/historical requests. No FIFO/weighted-average history is fabricated.
- Historical aging rejects legacy documents whose current paid amount cannot be reconstructed from their payment trail. Current aging uses authoritative source balances for these documents. Missing due dates are Current, without invented credit terms. Historical source-document edits/cancellations cannot be reconstructed without a source event ledger; saved snapshots retain the previously generated result.

## Database rollout

Review/apply `c61d2a84e907` followed by `d74b019e2c86` through the normal migration process before enabling these screens. The first adds account grouping/hierarchy, nullable journal branch attribution, supplier due dates, fiscal preferences, snapshot rows, asset and statement-comparison records. Known source branches are attributed from owned source records; amounts and posting dates are unchanged. Unknown branches stay null. The second builds existing-table indexes concurrently and must run outside a wrapping transaction.

Migrations were exercised inside rollback-only test transactions; no migration was applied permanently to the configured database during implementation. Review the source-branch backfill duration on a production-sized copy before rollout. Snapshot retention is intentionally explicit: no financial snapshots are deleted automatically. Plan retention/archival and backups for report rows as usage grows. Live source totals use database aggregation; dedicated materialized rollups remain a future optimization for very large ledgers.

## Verification

- Backend service regressions exercise cash allocation, contra assets, all eight reports, frozen exports, tenant/branch isolation, asset/depreciation/disposal retries, historical payment/reversal aging, supplier settlement retries, payroll posting, fiscal defaults, account hierarchy/import protection, and paginated exports.
- Browser QA uses isolated API fixtures (never writes to real financial records), covering ten routes at 1440/834/390 px, navigation collapse/drawer, eight report cards, Generate, reconciliation preview, CSV download and drawer reset. Separate chart checks verify rendered bar and line series.
- A generated multi-page ledger PDF was rendered with Poppler and visually inspected for wrapping, headings and pagination.
- Frontend type checking, changed-file ESLint and a production build are run. Changed backend modules pass Ruff. Repository-wide Ruff still includes existing violations in unrelated smoke scripts, migrations and tests; no unrelated auto-fixes are applied.

Recorded verification results: full backend suite **351 passed / 7 skipped**; subsequent accounting + multi-currency coverage **36 passed**. The final Accounting-specific suite contains **10 regression tests**. The frontend production build includes every Accounting route. Browser API fixtures are test-only and are not bundled into the application.
