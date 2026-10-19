# Expense Management

The single expense workspace is `/expenses` (Overview), `/expenses/list` and `/expenses/categories`. Record Expense and Edit Expense open the same right-side drawer over the Expenses list. `/expenses/new` redirects to that list and opens the drawer; both sidebars remain visible. The existing `/accounting/expenses` URL redirects to the list. Debt Management is independent. This checkout had no top-level expense sidebar entry; one was added beside Accounting without reordering existing items.

All screens use the existing design tokens, shared ModuleLayout/SecondSidebar, table, pagination, drawer, confirm, import and PageLoader components. Existing accounting expense records, approval, rejection, deletion, imports and journal services remain the source of truth; no mock expense data or parallel ledger remains. A pending expense can be edited using the same drawer form.

## Approved backend extension

Migration `a61b72c83d94` adds expense-only categories seeded from existing classifications, branch/supplier/payment context, retry keys, receipt metadata, indexes and `expenses:read/create/update/delete` permissions. Existing budgeting role assignments map to the equivalent expense permission; default role setup now includes expenses. Approval/rejection require update permission. Legacy API routes enforce the same workspace permissions and branch scope.

Search filters and aggregates execute on the server. Lists contain 25 records; category lists and selectors are paginated or searched in bounded batches. Overview totals/counts cover the selected period and exclude rejected expenses; recent expenses show their statuses. Category breakdown shows the leading 20 categories and a remainder when applicable. Totals use stored base-currency Decimal values. Approval routes payments to the selected payment account and posts the expense's date and branch. No project/department picker is exposed because expense allocation to those domains is not supported.

Category names can be renamed; existing expense classifications update together and the category change is audited. Categories are archived rather than deleting historical classifications. Pending expenses accept private receipt uploads (PDF/JPEG/PNG, maximum 5 MB). Receipt types are checked by content signature, not filename alone. Downloads require expense read permission and matching tenant/branch. Files are served as authenticated attachments with no-store and nosniff headers, not through public `/uploads`.

Creation uses a tenant-scoped stable retry key. If receipt upload fails after creation, the form retains the saved expense ID and retries the attachment without creating another expense. Editing and receipt changes are limited to pending expenses; approved amounts cannot be changed through the form.

## Operations

Run `alembic upgrade head` before deploying the updated backend. Review the migration's index creation against production table volume and schedule appropriately; it has only been applied to the local development database. Back up `EXPENSE_RECEIPT_DIR` (default `backend/private/expense-receipts` when started from backend) alongside database backups. Keep this directory outside public uploads and do not commit it. Restore both metadata and files together; missing files produce a readable 404. Existing historical expenses with no known branch remain unassigned and are visible in All branches, rather than being assigned arbitrarily.

## Verification

Rollback-only backend tests cover selected-period totals beyond a page, filters, branch/tenant and permission isolation, stable creation retries, category rename/archive, private receipt access, editing, auditing and approval journal date/branch/payment account. Browser checks cover all four routes at desktop and phone sizes, creation in a drawer inside the ERP shell, the Record Expense shortcut and a mocked failed receipt upload followed by a successful retry with exactly one expense creation. No browser verification writes financial records. TypeScript, changed-file ESLint/ruff and the production build are checked. The full backend suite excludes `live` external integration tests.
