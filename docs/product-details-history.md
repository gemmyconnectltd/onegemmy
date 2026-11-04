# Product details and history

Open Inventory → Products and select a product name. The details page at `/inventory/products/{id}` shares the existing ERP shell and product editing, variant and stock adjustment drawers. List search, status, page size, page and date range are preserved in the list URL for Back navigation.

The Overview, Stock, History, Sales, Purchases, Transfers and Adjustments sections use existing tenant records. Sales and purchasing sections are omitted when the user cannot access those modules. History offers category, reference, date, authorized branch and person filters; person filtering is available from an activity's details drawer. Dates are filtered using the existing business-timezone period dependency. Page requests are bounded, counts are server-derived, labels are batch-loaded and history reads do not post stock.

The product row menu offers View Details, Edit Product, Stock History, Transfer Stock, Adjust Stock and Activate/Deactivate. History links select the History tab directly. Transfer links open the existing transfer form with the selected product, and adjustment links start the shared stock drawer in adjustment mode. Deactivation changes status after confirmation; it preserves historical records. Existing secondary restock, variants, request-change and permanent deletion actions remain available according to permissions. The menu uses the installed Base UI accessible menu primitives and a portal, so table boundaries cannot clip it. It is non-modal: the shared Drawer exclusively owns page scroll locking. This prevents opening a drawer from a menu from capturing the menu’s temporary lock and leaving subsequent pages unscrollable. Browser regression checks cover release of the lock after stock/edit drawers and real wheel scrolling after navigation.

## Inventory semantics

- Product/variant stock is a **business-wide balance**. There is no per-branch stock or reservation ledger in the current architecture. Restricted employees and branch workspaces do not receive a stock KPI presented as a branch balance. The UI explains the limitation rather than deriving a fictional branch balance from sales/purchases.
- Total sold is completed order-line quantity less approved customer return quantity in the authorized scope. Cancelled/pending sales do not count. Variant-only lines and returns linked through order items are included.
- A purchase order is a commitment, with ordered and received quantities shown separately. Only immutable goods receipt lines show a receipt movement; their frozen stock conversion factor determines stock units. Missing factors remain unknown.
- Transfers leave business-wide stock unchanged. Source and destination plus current status and recorded completion time are displayed. A restricted user only sees history transfers where both branch endpoints are authorized; other branch information is not exposed.
- Supplier return records retain their actual state and quantity. Legacy stock conversion factors/reversal timestamps are not available there, so their stock impact is not invented.
- Historical order dates and current posting states are displayed as recorded; missing completion/reversal timestamps cannot be reconstructed.

## Audit recording

Product create/import/update, stock restock/adjustment, variant changes and approved price/stock corrections record immutable product audits in the same database transaction. Price/cost events are separate from metadata events. Numeric comparisons avoid recording unchanged decimal prices as changes. Existing purchase receipt audits already contain old/new catalog price snapshots; the history query reads those rather than duplicating them. Legacy product creation timestamps are shown without fabricating initial values or a performer.

Stock edits use the existing product lock before mutation. History and export are read-only: they neither change quantities nor create duplicate postings. Unknown historical before/after balances, actors and prices remain blank. This is traceability over existing records, not a replacement stock ledger or a backfill of lost events.

## Authorization and export

The details/history endpoints retain the inventory router's feature and permission gates, validate the tenant product and workspace branch, apply employee branch restrictions, and exclude sales/procurement sources when the employee or business cannot read those modules. CSV export uses the same filters and authorization and streams SQL batches of 200 rows, with spreadsheet formula protection. The existing authenticated download client handles the response. Source links open the original purchase, sale document or transfer record. Historical entries cannot be edited in this page.

Deploy the additive Alembic revision `d9b7e302a164` for concurrent source-line and product audit indexes. No existing stock is backfilled or changed by this migration.

## Validation

`backend/tests/test_product_history.py` covers posting-state totals, receipts versus commitments, conversion factors, old/new prices, filtering, pagination, audit stock before/after, cross-tenant access, unauthorized branches, disabled sources, linked variant returns and filtered CSV exports. The identifier unit fixtures account for the new audit/locking collaborators. `frontend/tests/browser/product-history.cjs` uses synthetic fixtures for product navigation, list state, responsive layouts, filtering, details, sales and export. Run it against an isolated build using `RESPONSIVE_BASE_URL` and an installed Playwright module via `PLAYWRIGHT_MODULE`.

The broader purchasing regression suite has three failures also reproduced on unchanged HEAD: a pricing test expects a view/edit baseline denial, and two supplier-return settlement paths access expired `updated_at` values during async serialization. Those pre-existing issues are separate from these read-only product-history endpoints.
