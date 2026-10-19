# Purchase history and price changes

Purchase History keeps the existing `/procurement/orders` route. Search, status/date filtering, totals and pagination use the backend, rather than filtering the first page locally. Draft purchases can be edited in the same drawer used for creation.

Each line has an editable supplier unit cost and quantity. Users with `pricing:update` can explicitly request catalog cost and selling-price changes. Saving a draft stores these instructions; receiving the goods applies them atomically with stock and the supplier bill. Received purchases cannot be edited. Existing purchases without price instructions retain their original behavior.

Catalog prices are in the business base currency. Purchase cost converts using the purchase's frozen exchange rate and the product conversion factor. Variant instructions apply to the selected variant. Receipt audit entries include the actor and previous/new catalog values. Conflicting instructions for the same catalog item are rejected.

Migrations `b72c83d94e05` and `c83d94e05f16` add line pricing instructions and concurrent history indexes. Existing values need no backfill. Deployment must apply these migrations before using the updated purchase APIs.

Verification: rollback-only backend pricing tests cover permissions, draft edits, receipt effects, variants, conversion factors, retry rejection and audit values. Browser checks mock mutations and cover purchase search, line controls, both price instructions and responsive drawers.
