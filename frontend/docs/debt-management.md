# Debt Management

## Structure

The public module has exactly three routes: `/debts`, `/debts/receivables` and `/debts/payables`. It uses the existing ERP shell, shared controls, PageLoader and drawer surface. Detail drawers use Overview / Payment History tabs, with the same right-side payment flow as the supplied visual reference. Debt-specific drawer focus handling keeps keyboard navigation inside the dialog and restores focus on close.

- `frontend/src/lib/debts.ts`: shared domain types and decimal payment validation.
- `frontend/src/lib/api/debts.ts`: HTTP adapters; TanStack Query hooks live in the existing `hooks.ts`.
- `frontend/src/components/debts/`: presentation, filters/table, summary, due list, details and reusable payment form.
- `backend/app/modules/accounting/schemas/debt.py`: validated filter and payment contracts.
- `backend/app/modules/accounting/routes/debt.py`: thin HTTP adapters, mounted under `/api/v1/tenants/debts` and the accounting feature gate.
- `backend/app/modules/accounting/service/debt.py`: permissions, branch resolution and payment orchestration.
- `backend/app/modules/accounting/repository/debt.py`: tenant-scoped source projections, server pagination, aggregates and bounded payment histories.

No database schema changes, parallel debt ledger, contact duplication or new permission resources were introduced.

## Data and behavior

Debt records project the existing completed credit sales and bills from received purchases. Cash-only completed sales are excluded. Credit is recognized by the existing credit amount, unpaid balance, due terms or credit/invoice payment method. Historical fully paid sales with no retained credit indicator cannot reliably be classified as credit debts and are not fabricated as such.

List search, status and due-date filters execute in SQL. Search values are sent in a POST body rather than URLs or access-log query strings. Lists and histories are paginated (25 records per UI page). Totals are aggregated over the entire filtered set, not just the displayed page. The overview returns a bounded list of the next ten dated obligations, without duplicating both debt tables or adding charts.

Amounts in rows and details use the document currency. Summary amounts use the backend's base currency, with frozen document exchange rates. Paid amounts/balances remain backend-owned. Overdue and partially-paid states coexist. A user with only one debt permission sees only authorized totals and records.

All list/detail/history/payment requests use tenant and resolved active/assigned branch scope. Tenant or branch changes remount the view and use separate cache keys that include both tenant and branch. Detail queries deliberately do not carry another document's placeholder data into a new selection. Opening/closing details preserves the list's filters and pagination.

## Payments

The endpoint reuses existing sales/purchasing payment services, financial locks, journal posting and audit records. Partial and full payments are supported; overpayment and dates outside the issue-date/today interval are rejected. A stable retry key is mandatory; changed retry details conflict rather than creating another settlement. Submission is locked synchronously in the form and success is shown only after the real API succeeds.

Supplier payment dates use the existing `paid_at` column and the ledger receives that date and source branch. Optional supplier notes and external references are persisted in the existing immutable audit JSON, alongside the canonical payment reference. Histories distinguish the canonical reference from an optional external reference. Bank-transfer/mobile-money display labels map to the correct existing ledger accounts.

## Source creation and limitations

“Add Receivable” directs authorized users into the existing sales workflow. “Add Payable” lists up to 25 supplier-backed draft purchases per page, scoped to the tenant and permitted branch. Authorized users confirm receipt and an agreed due date to create the existing supplier bill, then open its details and payment form. A shortcut opens the existing new-purchase drawer. Receipt retries open the original bill without receiving stock again. Completing a credit sale or receiving a purchase creates the underlying debt automatically. Creating a second manual receivable/bill for the same transaction is intentionally avoided.

No direct-loan origination/repayment system exists in the repository. No loan records or loan buttons were invented. Direct loans would require a separately approved business and schema design. No verified generic debt reminder flow exists, so no nonfunctional reminder action is shown. Period collection/payment KPI cards are omitted rather than inferred from incomplete history.

## Verification

Rollback-only database tests cover full-set totals versus pagination, filters, tenant/branch isolation, permission restrictions, partial/full settlement, overpayment, retries, supplier payment metadata, ledger date/branch and bank/mobile account routing. No production financial mutations were made during verification.

Browser checks exercise the three routes at desktop, tablet and phone widths, plus search, status filters, detail drawers and client overpayment prevention. Payment-validation tests cover decimal precision, exact balance, invalid/zero/negative input and one-cent overpayments. TypeScript, changed-file lint and the production frontend build are checked.

The broad backend suite excludes tests marked `live` to avoid sending external email. Full-repository ruff currently reports unrelated existing inventory batch and tenant branch issues; changed debt/payment files pass ruff.

Supplier bill numbering ignores imported nonstandard references and serializes allocation with the tenant financial lock. Receipt tests cover branch/tenant isolation, permissions, stock-once retries and the resulting payable balance.

## Recording receivables inline

Add Receivable opens a credit-sale form inside the existing debt drawer. It supports paginated customer/product search, variants and tracked serial selection, quantity, VAT-inclusive unit price, partial payment, due date and notes. It uses the existing sales creation API and a stable retry identifier; no standalone debt or duplicate workflow is introduced. Successful completion refreshes debt data and opens its details. Credit-limit approval holds show a pending-approval message instead of claiming a posted receivable.
