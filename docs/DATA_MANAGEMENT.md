# Super Admin Data Management

Where: **Data Management** in the Super Admin sidebar (pick a business first), or **Businesses → a business → Data Management** (same screen,
already pointed at that business). Code: `backend/app/modules/admin/data_management/`, `super-admin/src/components/data-management/`.

## Who may do what

Platform permissions are separate and **nobody has any until someone grants them**. Give them with:

    cd backend && python -m scripts.grant_data_permissions --email you@example.com --grant view,preview,request,history
    python -m scripts.grant_data_permissions --email other@example.com --grant view,approve,history
    python -m scripts.grant_data_permissions --email you@example.com --show

| Permission | Allows |
|---|---|
| `data:view` | open a business's records, counts and filter options, saved filters |
| `data:preview` | prepare an operation: impact analysis, changes nothing |
| `data:request` | submit a prepared plan, with a reason |
| `data:approve` | decide on **someone else's** request (never your own) |
| `data:execute` | run an approved plan |
| `data:history` | read operation history and per-record results |
| `data:recovery` | open Backups & Recovery |

A business user, even a business owner, can never reach any of it: the routes need a platform administrator (`role=superadmin`, no business).

## What each module supports

An operation the module cannot do safely is shown as unavailable with the reason and what to do instead.

| Module | Archive | Correct | Delete | Clean test data | Notes |
|---|---|---|---|---|---|
| Sales & POS | yes (keeps payments and books) | notes, salesperson, void (reverses) | only never-paid, never-posted sales | same rule as Delete | void needs approval |
| Customers | deactivate | name, email, phone, address, TIN | only if nothing refers to them | same | duplicates are archived, not merged |
| Products & Inventory | deactivate | name, description, barcode, subcategory, minimum stock | only if nothing refers to it, no stock, no variants | same | prices go through Approvals, stock through counts |
| Purchases | - | - | drafts with nothing received | same | |
| Expenses | - | - | rejected or never-approved, unpaid, unreversed | same | |
| Warehouses | deactivate (must be empty, not default) | name, address, description | no | no | |
| Users & Access | deactivate (not the last owner) | no | no | no | |
| Accounting | no | no (reverse from the Ledger) | no | no | **Close a period** (below) |
| Debts, Stock movements, Stock transfers, Manufacturing, HR, Services, Branches | no | no | no | no | records are shown, not changed |

**Delete** and **Clean test data** use the same dependency engine: it reads the database's own foreign keys and blocks a record if *anything*
outside a short list of owned children (a sale's lines, a product's extra pictures, a purchase's lines) points at it. The old services were
not strict enough on their own (deleting a customer silently cut the link from their invoices), so they are only called after these checks pass.
Records are **never** recognised as test data automatically: no table carries a test marker, so the operation is a reviewed selection with an
attestation, and it still cannot remove anything with financial, stock or history references.

## Close a period (the "reset with opening balances" operation)

The books and stock ledger are cumulative, so the opening position of the next period is already what the ledger says. The operation checks
nothing is half-finished (draft journals, approvals waiting, transfers in transit, counts waiting), shows the balances, and then locks the books
through the closing date using the same rule as the business's own period lock. A snapshot of the opening position is kept with the operation.
No journal, payment or stock movement is edited, deleted or re-posted.

## How an operation runs

1. **Prepare** (`data:preview`): the exact records are fixed, eligibility and blockers worked out, plan stored with an expiry (60 minutes).
2. **Submit** (`data:request`): a reason (10+ characters). Delete, Clean test data and Close period always need a second administrator; Archive
   needs one above 50 records; voiding a sale needs one.
3. **Approve** (`data:approve`): a different administrator, for that exact plan (a fingerprint of the records, their versions and settings).
4. **Run** (`data:execute`): re-checks permission, business, eligibility, record versions, plan fingerprint and expiry; destructive operations also
   need the business name and the operation reference typed. Records are handled one at a time through their own services, each with its own
   outcome. A record changed since the preview is skipped. Running a finished operation again returns its result and does nothing.

Limits: up to 5,000 records per operation, run inside the request (progress is the per-record result list, not a live bar).

## History, audit and recovery

Every plan, decision and per-record outcome is kept for good (`data_operations` cannot be deleted from, `data_operation_items` cannot be edited or
deleted, both enforced in the database) and each state change is also written to the append-only audit log on the business's trail.

**There is no backup system in this platform**, so deletions cannot be undone. The Backups & Recovery page says so and shows only what exists:
data exports (not restore points) and a list of past removals. Each removed record's key fields are kept in the operation history as a reference.

## Known hazard: the older "reset business data" button

`POST /admin/tenants/{id}/reset-data` (Super Admin → Business → Actions) predates this feature. It deletes whole tables for a business,
including accounting transactions, with only the business name typed as protection, and any platform administrator can use it. It does not use
Data Management's permissions, dependency checks, approval or history. It was left untouched; retiring it or putting it behind these
permissions is recommended.
