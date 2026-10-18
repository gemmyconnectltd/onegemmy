# Accounting QA corrections

These changes address the Depot Technologies QA report without changing its posted records, old references, cash balances or historical due dates. QA database tests use isolated fixtures rolled back after each test. Browser tests use local mock APIs; they do not log into Depot Technologies or create staging records.

| Finding | Correction |
| --- | --- |
| Income list capped at 50 | Server pagination and full-period server aggregates. Defaults match Overview's fiscal dates and branch. Status filtering does not truncate summary totals. |
| Journal credits counted as revenue | Only Revenue-account credits less debits are included. VAT, liabilities, cash transfers and other credits do not inflate revenue. Revenue reversals are included. |
| Negative cash | Current negative balances are visibly flagged in Overview, Expenses and Cash & Bank. Transfers and new asset purchases show the selected account's projected balance, using an account-specific server lookup. Expense approval explicitly asks the operator to verify funding. This is a warning policy, not a hard overdraft block; no existing balances are rewritten. |
| Missing fixed-asset defaults | The asset page offers additive setup of missing accounts. Existing accounts (including QA-created codes) are preserved. |
| No asset paid-from choice | Choose an existing posted acquisition, or record a new paid purchase with a paid-from account. The latter posts and registers atomically, requires journal approval, and is safe to retry. |
| Raw summary labels | Asset/payroll/tax totals have readable labels. |
| Raw manual journal references | New display references use atomic tenant sequences (`TXN-0356` style). Retry keys are stored separately. Existing references remain unchanged and their retry keys continue to resolve. |
| Rigid Add Income form | Choose cash/bank/Mobile Money, Revenue account, branch, and optional VAT liability account. VAT-inclusive extraction reuses the configured tax service. Zero/negative inputs are rejected in the form and API. |
| Filtered ledger appears unbalanced | Account/search/cash-only results show net movement rather than a reconciliation failure. Exports use neutral filtered-movement wording. Full ledger reconciliation remains available with filters cleared. |
| Missing supplier due dates | Receive Purchase now captures the due date from agreed terms. Existing bills can be corrected using Set due date. Unknown terms stay explicitly labelled No due date; no arbitrary dates are backfilled. |
| Due date before invoice date | New invoices and due-date edits reject dates before issue. Existing invalid dates are flagged for review, without silently changing them. |
| Picker counts/filters | Cash-only filtering happens on the server before counting and pagination. Cash Transactions also uses this scope. |
| Reconciliation account absent | Each comparison row includes account code/name. |
| Transfer error out of view | Operation errors remain sticky in the scrolling drawer. |
| Post without confirmation | Income and draft-ledger posting require confirmation. |
| Thin chart | Additive defaults include input VAT, fixed assets, accumulated depreciation, depreciation expense, salary expense, generic payroll deductions, PAYE, social security and retained earnings. No statutory calculation rules are changed. |
| Stale journal details | Journal queries refresh cached relationships so newly saved draft lines are immediately visible and validated on posting/retry. |
| Pagination blocked by support button | Accounting pagination reserves space beside floating support controls. |

## Rollout

Apply `e49c207f8a61` (nullable retry key and tenant journal-sequence table), then `f50d318a9b72` (concurrent unique retry-key index), after the preceding Accounting migrations. The sequence initializes from existing numbered TXN references and allocates atomically. Old display references are not renumbered. The concurrent index migration must run without an enclosing transaction.

No migrations were applied permanently to the configured database during development. Use the normal migration/deployment process, then re-test the existing Depot Technologies records. The outage and deployment-related navigation changes were not reproduced locally; staging availability requires the actual website URL.

## Verification

Backend regressions cover 60+ revenue entries, VAT exclusion, reversals, branch isolation, receipt-account choices, sequence initialization, retries/conflicts, zero/negative input, cash-only counts, reconciliation account labels, filtered ledger scope, new asset purchases and due-date capture/validation. Full suite: **356 passed, 7 skipped**. Frontend type check, changed-file ESLint and production build pass. Local browser checks exercise the real form interactions against test-only API fixtures.
