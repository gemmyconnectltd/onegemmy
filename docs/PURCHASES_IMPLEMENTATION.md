# Purchasing workspace implementation

## Audit and plan

Existing sources: `procurement` purchase orders/items, supplier bills/payments, returns,
requisitions; inventory suppliers/products/variants; accounting purchase/payment journals;
shared tenant/branch authorization, audit logs, document currency and fixed-point line math.

Gaps: order creation/editing uses a drawer; receiving takes every line at once; there is no
receipt entity/history; returns accept arbitrary product IDs and quantities; purchasing home
redirects to requests; bills are exposed through debts rather than a purchasing workspace.

Implementation sequence:
1. Add receipt headers/lines and additive order metadata; backfill received quantities for
   historical Received orders. Keep legacy references/statuses and existing bill posting.
2. Add transactional partial receiving, idempotency, lifecycle actions and strict return
   eligibility using tenant locks and existing catalog row locks. Preserve global stock totals.
3. Add dedicated create/edit/details, goods receipt and bill workspaces using existing hooks
   and components; retain requisitions/supplier routes and contextual links.
4. Add server-backed overview/filtering/export and automated financial/security checks.
5. Run design checks, type/lint/backend tests and production build; report verification limits.

## Inventory and accounting contract

Inventory stores one quantity per product/variant across the business. Branch attribution on
orders/receipts is enforced, but is not a per-warehouse stock balance. Introducing true branch
balances requires coordinated changes to sales, transfers, opening balances and reconciliation;
this purchasing change must not invent branch balances from incomplete history.

Existing policy recognizes a supplier bill and Inventory/AP journal on receipt. Partial receipts
must recognize only the delivered proportion; rounding residue belongs to the final receipt.
Payments continue through the existing supplier-bill settlement/FX service. Order value is a
commitment, never a cash-spending metric. Returns keep original orders/bills immutable.

No screenshot was included with the request. Use the supplied section structure and existing
Pesaa tokens/components; retain shared sidebar behavior and tenant light/dark themes.
