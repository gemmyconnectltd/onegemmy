# Sales team, quotations, sales approval and warehouses: gap analysis

Method: read the models, services, routes and pages that carry each requirement and followed the workflow from the UI to the database.
Nothing here is classified from a menu item alone. "Evidence" names the code that was read.

Classes: **Working**, **Partial**, **Disconnected** (exists, not wired to the workflow), **Missing**, **Broken**.

| # | Requirement | Class | Evidence | What is needed |
|---|---|---|---|---|
| 1 | Sales team (six salespeople under one business) | Partial | Users, roles and branch assignment exist (`tenants`). Sales have `created_by` only. | A salesperson on the sale, separate from the entering user |
| 2 | Sale attribution (salesperson vs entered by vs approved by vs payment received by) | Partial | `Order.created_by`, `Order.approved_by`, `OrderPayment.received_by` exist. No salesperson. | `Order.salesperson_id` with audited correction |
| 3 | Individual sales reports | Missing | `reporting/` has overview and breakdown reports; none is grouped by person. | Report by salesperson with real order rows |
| 4 | Consolidated report with drill-down | Partial | Sales report exists but without salesperson comparison or the revenue / cash / outstanding split. | Extend with per-salesperson totals |
| 5 | Sales targets | Partial | `sales_targets` has `assigned_to`, `achieved_value` stored by hand. | Show actual vs target from orders; do not invent targets |
| 6 | Customers | Working | `sales/customers`, CRM module. | None |
| 7 | Quotations | Missing | No model, route or page. | New quotation module (lifecycle, PDF, conversion) |
| 8 | Sales history | Working | Sales orders list, audit log per order. | Filter by salesperson |
| 9 | Approval before payment | Partial | Credit sales over the limit are held in `Awaiting Approval` with nothing posted (`create_order`, `approve_order`, `reject_order`). Only triggered by credit limits. | Per-business policy that holds every sale |
| 10 | Approval listing and review | Partial | `/approvals` page and `ApprovalRequest` exist for price, stock, void, debt. Held sales appear in Sales only. | Pending-sales listing with detail |
| 11 | Product master, categories, brands, units, variants | Working | `inventory/models/product.py` and siblings. | None |
| 12 | Product images | Partial | One `image_url`, upload and delete endpoints. No gallery. | Gallery is a product decision, left open |
| 13 | Product templates | Missing | None. | Needs confirmation of what "template" means before building |
| 14 | Warehouse records | Missing | `warehouses:*` permissions exist in roles; no table, no API. | Warehouse model and API |
| 15 | Stock by warehouse | Missing | `Product.stock` is one business-wide number. `ProductBatch` exists for lots. | Per-location balances (see risk below) |
| 16 | Stock transfers | Broken | `StockTransfer` moves between branches but changes no quantity (see `_apply_stock_movement`). | Real location balances so a transfer moves stock |
| 17 | Stock movement history | Partial | `inventory/service/history.py` composes history from sales, purchases, adjustments per product. | Persisted movement ledger |
| 18 | Roles | Partial | 47 job roles seeded; Warehouse Keeper, Inventory Officer exist. Sales Approver is a permission (`orders:approve`, `approvals:approve`). | Map the eight responsibilities onto existing roles, document |
| 19 | Per-business configuration | Working | `Tenant.approval_rules` (JSONB) with Business Settings screen. | Add `sale_approval` rule, off by default |

## Main risk: stock is one number

Every sale, purchase, return, adjustment and POS checkout reads and writes `Product.stock` and `ProductVariant.stock` directly.
Per-warehouse stock therefore cannot be a bolt-on table: if a second balance is added next to `Product.stock` the two will
drift, which the brief forbids. The safe design is a location-balance table whose sum is the product's stock, with every
quantity change going through one function. Doing that changes the checkout path of every business, so it is delivered
last, behind its own migration and tests, and not mixed into the sales work.

## Build order

1. Salesperson on sales, correction audit, reports (individual and consolidated), target progress.
2. Sales approval policy (`sale_approval` rule, default off) reusing the held-sale mechanism.
3. Quotations.
4. Warehouses and per-warehouse stock with a real transfer lifecycle.
5. Product gallery and templates, once the "template" meaning is confirmed.


---

# Status after implementation

| # | Requirement | Now | Where |
|---|---|---|---|
| 1-2 | Sales team and attribution | Working | `Order.salesperson_id` (backfilled from the person who entered the sale). Salesperson, entered by, approved by and payment received by are four separate fields. Re-crediting a sale is `PATCH /sales/orders/{id}/salesperson`, needs `orders:approve`, requires a reason and is audited. |
| 3-4 | Individual and consolidated reports | Working | `GET /reports/salespeople`, page `/reports/salespeople` ("Team performance" in the Sales menu): per person sales, returns, net, collected, still owed, awaiting approval, with the sales behind every figure, filters and export. |
| 5 | Targets | Working | Targets assigned to a person are shown against what that person really sold this month. Nothing is invented for people without a target. The old global `achieved_value` counter is no longer used for assigned targets. |
| 7 | Quotations | Working | `/sales/quotations`: draft, edit, sent, accepted, rejected, expired, PDF in the business layout, activity trail, one-time conversion into a **Pending** sale (no payment, no stock, no posting). |
| 9-10 | Approval before payment | Working | Business setting `sale_approval`. Held sales appear in Sales History and in Approvals ("Sales waiting for approval"). Approve needs `orders:approve`; reject needs a reason; `sale_no_self_approval` stops approving your own sale. |
| 14-16 | Warehouses, stock by warehouse, transfers, movements | Working | Append-only ledger `inventory_stock_movements`; pages Warehouses, Stock by warehouse, Stock movements, Stock counts; transfers between warehouses (pending, dispatched, received, cancelled). |
| 12 | Product images | Working | Main picture plus up to 8 extra pictures, swap-to-main, remove. |
| 13 | Product templates | **Not built** | Needs a decision: see below. |
| 18 | Roles | Working | New "Sales Approver" role. The other responsibilities already existed: see the mapping below. |

## Responsibilities and the roles that carry them

| Responsibility | Role | Key permissions |
|---|---|---|
| Salesperson | Sales Representative | `orders` create/read/update, `contacts` |
| Sales Manager | Sales Manager | `orders` + approve, `returns` approve |
| Sales Approver | **Sales Approver** (new) | `orders:approve` only; cannot enter sales or change prices |
| Warehouse Manager | Warehouse Manager | `warehouses`, `stock` |
| Warehouse Keeper | Warehouse Keeper | receive, count, move stock |
| Stock Controller | Stock Controller | `stock` incl. approve counts |
| Finance Officer | Finance Manager / Accountant | `accounting` modules |
| Business Administrator | Admin / Owner | everything, including the policies below |

## Business policies (Business Settings, Financial, off by default)

- `sale_approval`: every sale made by someone without `orders:approve` waits for approval. Nothing is paid, taken from stock or booked until approved.
- `sale_no_self_approval`: with the rule above, an approver's own sale also waits for a different approver.
- `own_sales_only`: people without `orders:approve` see only their own sales and quotations.
- `stock_adjustment` (existing, on by default): a stock count waits for approval; switched off, a counter who may adjust stock applies it at once.

Businesses that never switch these on, and never open Warehouses, behave exactly as before.

## How stock stays correct

`Product.stock` / `ProductVariant.stock` are still the single business total and every service still changes them as before. A flush hook
(`inventory/service/stock_ledger.py`) turns each change of that total into ledger movements for businesses that have warehouses, so the
warehouses always add up to the total. A transfer moves ledger quantity only: the total is untouched, and while it is in transit the
stock is in neither warehouse. A sale takes stock from the warehouse of the branch it was made in, then the default, then wherever the
stock really is. The ledger rejects UPDATE and DELETE in the database.

## Decisions still needed from River Trading

1. **Product templates.** Do they mean reusable creation templates (default category, unit, tax) or just standard product records? Not built until confirmed.
2. **Reapproval after edits.** A completed sale can only be changed by the owner's correction flow; that flow does not ask for a second approval. Say if it should.
3. **Reserved stock.** Quotations reserve nothing and there is no reservation concept, so "available" equals "on hand".
4. **Sending quotations by email.** The PDF can be downloaded or shared from the phone; an email endpoint like the invoice one is not built.
5. **Warehouse code and customer VRN** appear on River Trading's sample quotation but the system has neither today.
