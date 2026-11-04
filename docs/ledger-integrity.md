# Ledger integrity rules

How operational events reach the general ledger. All postings go through `accounting/service/transaction.py`.

- **Posting date** – a sale posts on the sale's own date (`ordered_at`), not the day it was keyed in. Reversals post on the day they are made.
- **No silent skips** – a missing or inactive account (`_posting_account`) stops the business action with a message naming the account. Expenses must resolve to an expense account (chosen, or mapped from Rent/Utilities/Salaries/Supplies); nothing defaults to "Other Expense".
- **One event, one journal** – `post_journal` is the shared writer for new postings: it requires balanced lines, valid tenant accounts, and honours a `client_reference` so retries return the existing journal. Sales are guarded by (tenant, order, type).
- **Write-offs** – Dr Bad Debt Expense (5600) / Cr Accounts Receivable (1100) for customers; Dr Accounts Payable / Cr Other Income (4910) for suppliers. Partial or full, needs the `approve` permission, serialised by the tenant lock.
- **Returns** – reverse revenue (net) and VAT for the refunded share, credit receivables, and put cost back: Dr Inventory / Cr COGS at the cost recorded when sold. Refund cash settlement is still a separate customer-payment step.
- **Stock adjustments** – manual adjust/restock posts Dr/Cr Inventory (1200) against Inventory Adjustment (5800) at the item's cost.
- **Expense reversal** – approved expenses are reversed by a linked reversing journal with a mandatory reason; the original journal is never edited.
- **Closed periods** – `accounting_preferences.locked_through`; any new journal dated on/before it is refused. Reopening needs a reason and is audited.
- **Audit log** – database trigger rejects edits to audit rows (clearing the actor when a user is deleted is allowed).
- **Reconciliation** – `GET /accounting/reconciliation` is read-only and lists sales/expenses/returns/write-offs without journals and wrongly dated sale journals. It repairs nothing.

Known limits: dates use UTC; income statement sections still key off account-code prefixes (41xx service revenue, 49xx other income, 59xx other expenses); returns do not yet post the cash/bank refund leg; warehouse transfers and purchase journals keep today's date.
