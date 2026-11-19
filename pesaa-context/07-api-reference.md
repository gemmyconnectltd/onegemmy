# 07 — API reference

Generated from the running FastAPI app (`backend/app/main.py`, routers wired in `backend/app/api_router.py`). The machine-readable spec is in [`openapi.json`](openapi.json) (582 paths, 779 operations, 286 schemas, title "Pesaa API" v0.1.0).

## Conventions

- **Base path:** everything is under `/api/v1`. Business (tenant) modules are under `/api/v1/tenants/...`; platform console under `/api/v1/admin/...`.
- **Auth:** `Authorization: Bearer <JWT>` (OpenAPI scheme `HTTPBearer`). 760 operations require it; 19 are public (sign-in, public pricing/contact, tracking beacons, payment callbacks).
- **Branch scope:** the ERP sends `X-Branch-Id` on every request (`frontend/src/lib/api/client.ts`); branch-aware endpoints resolve it via the `ActiveBranchId` dependency.
- **Response envelope:** most endpoints return `{"success": true, "message": str, "data": ...}` (`app/core/response.py` → `success_response`). Lists return `paginated_response` → `{success, message, data: {items: [...], total, page, page_size, total_pages, summary?}}`. Paging uses the `PageQuery` dependency (`app/core/pagination.py`): `page` ≥ 1 (default 1), `page_size` 1–500 (default 50). Because routes return the envelope via `JSONResponse`, **most operations do not declare a response model in OpenAPI** — the "Response" column says `envelope` when nothing is declared.
- **Errors:** `AppError` subclasses (`NotFoundError`, `ValidationError`, `ForbiddenError`, …) → `{success:false, message, errors}` with the matching status; Pydantic validation → 422 with `detail[]`.
- **Permission gates (who may call, beyond being signed in):**
  - Module routers mounted with `require_feature(<module>)` (plan/business module switch) **and** `require_module_write(<module>)` (role permission for any non-GET): inventory, sales, accounting, hr, procurement, crm, manufacturing, repairs, services; discounts additionally needs `require_feature("discounts")`.
  - Sensitive endpoints add `require_permission("resource:action")` or an exact rule in `app/core/access.py` (`EXACT`). See [02-user-roles-permissions.md](02-user-roles-permissions.md).
  - Platform admin routes use a superadmin guard; tenant users get 403.

Operations by auth: platform admin: 199, tenant user: 561, public: 19

## Endpoints that feed the ERP dashboard

See [10-screens-inventory.md](10-screens-inventory.md#dashboard) for widget → endpoint mapping.

## Paginated / filterable list endpoints

113 GET endpoints accept `page`/`page_size` (or limit/offset). Filters are the other query params. Sorting params are rare — most lists use a fixed server-side order.

| Method | Path | Filters | Sort |
|---|---|---|---|
| GET | `/api/v1/admin/analytics/recent-tenants` | country, industry, businessType |  |
| GET | `/api/v1/admin/analytics/signup-insights` | dimension, from, to, country, industry, businessType |  |
| GET | `/api/v1/admin/analytics/signup-insights/all` | dimension, from, to, country, industry, businessType |  |
| GET | `/api/v1/admin/audience` | q, plan, country, preferred_contact, status, sort, dir | sort |
| GET | `/api/v1/admin/audit/logs` |  |  |
| GET | `/api/v1/admin/billing/plans/{id}/prices` |  |  |
| GET | `/api/v1/admin/billing/subscriptions/{id}/history` |  |  |
| GET | `/api/v1/admin/billing/{kind}` | q, status, currency, plan_id, invoice_id, tenant_id, payment_id, from_date, to_date |  |
| GET | `/api/v1/admin/currency/exchange-rates` | base, quote |  |
| GET | `/api/v1/admin/data-management/businesses` | search, status, plan, country, sort, descending | sort |
| GET | `/api/v1/admin/data-management/operations` | tenant_id, module, operation, status, requested_by, from_date, to_date, include_drafts |  |
| GET | `/api/v1/admin/data-management/operations/{op_id}/items` | outcome |  |
| GET | `/api/v1/admin/data-management/requests` | tenant_id, module, from_date, to_date |  |
| GET | `/api/v1/admin/marketing/campaigns` | kind, status, q, parent_id |  |
| GET | `/api/v1/admin/marketing/campaigns/{campaign_id}/recipients` | status |  |
| GET | `/api/v1/admin/marketing/contacts` | sort, dir, q, countries, plans, industries, sources, tags, account_status, preferred_conta | sort |
| GET | `/api/v1/admin/marketing/settings/audit` |  |  |
| GET | `/api/v1/admin/marketing/settings/suppressions` | q |  |
| GET | `/api/v1/admin/tenants` | q, status, plan, country, industry, businessType, heardAbout, size, feature, featureState, | sort |
| GET | `/api/v1/admin/tenants/{tenant_id}/branches` |  |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/departments` |  |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/notifications` |  |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/records` | section, q, status, date_from, date_to |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/roles` |  |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/team/users` | search, role_id, is_active |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}/activity` |  |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/users` |  |  |
| GET | `/api/v1/admin/usage/engagement/{category}` | q, status, sort, dir | sort |
| GET | `/api/v1/admin/usage/modules/{key}` | period, q, status |  |
| GET | `/api/v1/admin/usage/sales/{currency}` | period, q |  |
| GET | `/api/v1/admin/users` | search, tenant_id, role, status, created_from, created_to |  |
| GET | `/api/v1/audit/logs` | action, entity_type |  |
| GET | `/api/v1/currency/exchange-rates` | base, quote |  |
| GET | `/api/v1/global/permissions` |  |  |
| GET | `/api/v1/support/conversations` | view, channel, search |  |
| GET | `/api/v1/support/conversations/{conversation_id}/messages` | before |  |
| GET | `/api/v1/support/my/tickets` |  |  |
| GET | `/api/v1/support/tickets` | status, priority, assigned, search |  |
| GET | `/api/v1/tenants/` |  |  |
| GET | `/api/v1/tenants/accounting/accounts` | type |  |
| GET | `/api/v1/tenants/accounting/budgets` | period |  |
| GET | `/api/v1/tenants/accounting/expenses` | status, search |  |
| GET | `/api/v1/tenants/accounting/reports/general-ledger` | account_id, from_date, to_date |  |
| GET | `/api/v1/tenants/accounting/transactions` | type, status |  |
| GET | `/api/v1/tenants/accounting/workspace/accounts` | search, type, active, cash_only |  |
| GET | `/api/v1/tenants/accounting/workspace/income` | from_date, to_date, status |  |
| GET | `/api/v1/tenants/accounting/workspace/records/{view}` | period |  |
| GET | `/api/v1/tenants/accounting/workspace/reports/{snapshot_id}` |  |  |
| GET | `/api/v1/tenants/approvals` | status, kind, mine |  |
| GET | `/api/v1/tenants/billing/{kind}` | q, status, currency, plan_id, invoice_id, tenant_id, payment_id, from_date, to_date |  |
| GET | `/api/v1/tenants/branches` |  |  |
| GET | `/api/v1/tenants/branches/overview` | search, status, sort, dir, from_date, to_date, branch_id | sort |
| GET | `/api/v1/tenants/crm/activities` | customer_id, deal_id, status, search |  |
| GET | `/api/v1/tenants/crm/campaigns` | search, status |  |
| GET | `/api/v1/tenants/crm/contacts` | search, customer_type |  |
| GET | `/api/v1/tenants/crm/emails` | search, status |  |
| GET | `/api/v1/tenants/crm/opportunities` | stage, search |  |
| GET | `/api/v1/tenants/data-management-requests` |  |  |
| GET | `/api/v1/tenants/debts/payable/purchases` |  |  |
| POST | `/api/v1/tenants/debts/{kind}/search` |  |  |
| GET | `/api/v1/tenants/departments` |  |  |
| GET | `/api/v1/tenants/expense-management/categories` | search |  |
| POST | `/api/v1/tenants/expense-management/search` |  |  |
| GET | `/api/v1/tenants/hr/applicants` | stage |  |
| GET | `/api/v1/tenants/hr/attendance` | employee_id, status |  |
| GET | `/api/v1/tenants/hr/employees` | status |  |
| GET | `/api/v1/tenants/hr/leave` | status |  |
| GET | `/api/v1/tenants/hr/payroll` | period, status |  |
| GET | `/api/v1/tenants/inventory/batches` | product_id, expiring_in_days, from_date, to_date |  |
| GET | `/api/v1/tenants/inventory/brands` |  |  |
| GET | `/api/v1/tenants/inventory/categories` |  |  |
| GET | `/api/v1/tenants/inventory/products` | search, is_active, category_id, vat, from_date, to_date |  |
| GET | `/api/v1/tenants/inventory/products/{id}/history` | category, kind, search, actor_id, branch_id, export_csv, from_date, to_date |  |
| GET | `/api/v1/tenants/inventory/reports/valuation` | status |  |
| GET | `/api/v1/tenants/inventory/serials` | product_id, status |  |
| GET | `/api/v1/tenants/inventory/stock-by-warehouse` | warehouse_id, branch_id, search, status |  |
| GET | `/api/v1/tenants/inventory/stock-counts` | status |  |
| GET | `/api/v1/tenants/inventory/stock-movements` | warehouse_id, product_id, movement_type, from_date, to_date |  |
| GET | `/api/v1/tenants/inventory/suppliers` | search |  |
| GET | `/api/v1/tenants/inventory/transfers` | status, from_date, to_date |  |
| GET | `/api/v1/tenants/inventory/units` |  |  |
| GET | `/api/v1/tenants/inventory/variants` |  |  |
| GET | `/api/v1/tenants/inventory/warranty` | status |  |
| GET | `/api/v1/tenants/manufacturing/boms` |  |  |
| GET | `/api/v1/tenants/manufacturing/orders` |  |  |
| GET | `/api/v1/tenants/procurement/goods-receipts` | purchase_order_id |  |
| GET | `/api/v1/tenants/procurement/purchase-orders` | status, search, from_date, to_date, supplier_id, currency_code, sort, direction | sort, direction |
| GET | `/api/v1/tenants/procurement/purchase-orders/{id}/activity` |  |  |
| GET | `/api/v1/tenants/procurement/purchase-returns` | search |  |
| GET | `/api/v1/tenants/procurement/requisitions` | status |  |
| GET | `/api/v1/tenants/procurement/supplier-bills` | status, purchase_order_id |  |
| GET | `/api/v1/tenants/procurement/supplier-bills/{id}/payments` |  |  |
| GET | `/api/v1/tenants/repairs` | status |  |
| GET | `/api/v1/tenants/reports/daily-branches` | from_date, to_date, branch_id |  |
| GET | `/api/v1/tenants/roles` |  |  |
| GET | `/api/v1/tenants/sales/customers` | search, customer_type, status, figures, from_date, to_date |  |
| GET | `/api/v1/tenants/sales/customers/{id}/activity` |  |  |
| GET | `/api/v1/tenants/sales/customers/{id}/records/{section}` |  |  |
| GET | `/api/v1/tenants/sales/deals` | stage |  |
| GET | `/api/v1/tenants/sales/discounts/campaigns` | status, search |  |
| GET | `/api/v1/tenants/sales/discounts/coupons` |  |  |
| GET | `/api/v1/tenants/sales/discounts/rules` | search, status, type |  |
| GET | `/api/v1/tenants/sales/discounts/rules/{id}/usage` |  |  |
| GET | `/api/v1/tenants/sales/orders` | status, search, payment_status, archived, salesperson_id, from_date, to_date |  |
| GET | `/api/v1/tenants/sales/quotations` | status, search, salesperson_id, customer_id |  |
| GET | `/api/v1/tenants/sales/returns` | status, from_date, to_date |  |
| GET | `/api/v1/tenants/sales/targets` | period |  |
| GET | `/api/v1/tenants/services/appointments` | date_from, date_to, status, employee_id, branch_id, search |  |
| GET | `/api/v1/tenants/services/catalog` | search, category_id, is_active |  |
| GET | `/api/v1/tenants/services/categories` |  |  |
| GET | `/api/v1/tenants/users` | search, is_active, role_id |  |
| GET | `/api/v1/tenants/users/access-summary` | search, role_id, branch_id, status, assigned_only |  |
| GET | `/api/v1/tenants/users/{user_id}/activity` |  |  |

## All endpoints by router tag

### (untagged) (1)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/health` | Health |  | object | public |  |

### AI (9)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/ai/actions/{action_id}/cancel` | Cancel Action |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/ai/actions/{action_id}/confirm` | The ONLY place an AI-prepared draft becomes a real record. Re-validates permission, prices and rules. |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/ai/chat` | Chat | ChatRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/ai/conversations` | Conversations |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/ai/conversations/{conversation_id}` | Delete Conversation |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/ai/conversations/{conversation_id}` | Conversation |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/ai/insights` | Dashboard insights: verified calculations only (no model call), cached for a few minutes. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/ai/status` | Status |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/ai/suggestions` | Suggestions | query: module | envelope {success,message,data} | tenant user |  |

### Access (4)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/me/modules/{key}/access` | Which roles can use one module and what changed about it. Visible to anyone who can read roles. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/roles/{role_id}/access` | Role Access |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/users/access-summary` | Access Summary | query: search, role_id, branch_id, status, assigned_only, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/users/{user_id}/access` | User Access |  | envelope {success,message,data} | tenant user |  |

### Accounting - Accounts (6)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/accounting/accounts` | List Accounts | query: type, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/accounting/accounts` | Create Account | AccountCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/accounts/seed` | Seed Accounts |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/accounting/accounts/{id}` | Delete Account |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/accounts/{id}` | Get Account |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/accounting/accounts/{id}` | Update Account | AccountUpdate | envelope {success,message,data} | tenant user |  |

### Accounting - Budgets (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/accounting/budgets` | List Budgets | query: period, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/accounting/budgets` | Create Budget | BudgetCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/accounting/budgets/{id}` | Delete Budget |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/budgets/{id}` | Get Budget |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/accounting/budgets/{id}` | Update Budget | BudgetUpdate | envelope {success,message,data} | tenant user |  |

### Accounting - Expenses (8)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/accounting/expenses` | List Expenses | query: status, search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/accounting/expenses` | Create Expense | ExpenseCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/expenses/bulk` | Bulk Create Expenses | ExpenseBulkCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/accounting/expenses/{id}` | Delete Expense |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/expenses/{id}` | Get Expense |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/accounting/expenses/{id}` | Update Expense | ExpenseUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/expenses/{id}/approve` | Approve Expense |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/expenses/{id}/reject` | Reject Expense |  | envelope {success,message,data} | tenant user |  |

### Accounting - Reports (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/accounting/reports/balance-sheet` | Balance Sheet | query: as_of | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/reports/cash-flow` | Cash Flow | query: from_date, to_date | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/reports/general-ledger` | General Ledger | query: account_id, from_date, to_date, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/accounting/reports/income-statement` | Income Statement | query: from_date, to_date | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/reports/receivables` | Receivables Summary |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/reports/trial-balance` | Trial Balance | query: from_date, to_date | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/reports/{statement}/export` | Export Accounting Report | query: format, from_date, to_date, as_of, account_id | envelope {success,message,data} | tenant user |  |

### Accounting - Tax Management (16)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/tenants/accounting/tax/calculate/consumption` | Calculate consumption tax | object | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/calculate/corporate` | Calculate corporate income tax | object | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/calculate/paye` | Calculate PAYE for a given salary | object | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/calculate/pension` | Calculate pension contributions | object | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/calculate/vat` | Calculate VAT for a given amount | object | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/calculate/withholding` | Calculate withholding tax | object | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/tax/calculations` | List tax calculations | query: tax_type, period, status | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/calculations` | Create a tax calculation record | TaxCalculationCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/tax/configs` | List all tax configurations |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/configs` | Create a tax configuration | TaxConfigCreate | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/accounting/tax/configs/{config_id}` | Update a tax configuration | TaxConfigUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/tax/payments` | List tax payments | query: tax_type, period | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/tax/payments` | Record a tax payment | TaxPaymentCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/tax/rates` | Get reference Rwanda tax rates |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/tax/summary/{period}` | Get tax summary for a period |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/tax/vat-report` | Output VAT by treatment, input VAT, returns and the net VAT position, reconciled to the ledger (tax:read). | query: from, to, branch_id, treatment | envelope {success,message,data} | tenant user |  |

### Accounting - Transactions (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/accounting/transactions` | List Transactions | query: type, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/accounting/transactions` | Create Transaction | TransactionCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/transactions/backfill-sales` | Create accounting transactions for all completed orders that don't have one yet. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/transactions/{id}` | Get Transaction |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/accounting/transactions/{id}` | Update Transaction | TransactionUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/transactions/{id}/post` | Post Transaction |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/transactions/{id}/void` | Void Transaction |  | envelope {success,message,data} | tenant user |  |

### Accounting workspace (26)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/accounting/workspace/accounts` | Accounts | query: search, type, active, cash_only, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/accounting/workspace/accounts/export` | Export Accounts |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/accounts/import` | Import Accounts | AccountImport | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/assets` | Asset | AssetRequest | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/assets/{asset_id}/actions` | Asset Action | AssetAction | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/cash-accounts` | Create Cash Account | CashAccountCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/cash-position/{account_id}` | Cash Position |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/documents/payable/{document_id}/payments` | Supplier Payment | SupplierPaymentCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/documents/{kind}/{document_id}` | Source Document |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/income` | Income | query: from_date, to_date, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/accounting/workspace/income` | Create Income | IncomeReceipt | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/journals/{journal_id}` | Journal |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/overview` | Overview |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/accounting/workspace/payables/{bill_id}/terms` | Bill Terms | DueDateRequest | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/payroll/{payroll_id}/post` | Payroll Post | PayrollPosting | envelope {success,message,data} | tenant user |  |
| PUT | `/api/v1/tenants/accounting/workspace/period-lock` | Period Lock | PeriodLock | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/preferences` | Preferences |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/accounting/workspace/preferences` | Update Preferences | FiscalPreference | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/reconciliation` | Reconciliation |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/reconciliations` | Reconcile | ReconciliationRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/records/{view}` | Records | query: period, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/accounting/workspace/reports` | Generate Report | ReportRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/accounting/workspace/reports/{snapshot_id}` | Report Page | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/accounting/workspace/reports/{snapshot_id}/export` | Report Export | query: format | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/tax-payments` | Tax Payment | TaxPaymentCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/accounting/workspace/transfers` | Transfer | TransferRequest | envelope {success,message,data} | tenant user |  |

### App activity (1)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/activity` | Page-view beacon from the signed-in ERP/POS. Platform staff (no business) and malformed input are ignored. | ActivityIn | envelope {success,message,data} | tenant user |  |

### Approvals (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/approvals` | The inbox. People with approval authority (or approvals:read) see every request; everyone else sees only their own. | query: status, kind, mine, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/approvals` | Create | NewRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/approvals/credit` | Credit sales held because they went over the credit limit. They are decided with the existing order approve / reject actions. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/approvals/summary` | Summary |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/approvals/{request_id}/approve` | Approve | app__modules__approvals__routes__Decision / null | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/approvals/{request_id}/cancel` | Cancel |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/approvals/{request_id}/reject` | Reject | app__modules__approvals__routes__Decision / null | envelope {success,message,data} | tenant user |  |

### Audit (3)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/audit/logs` | Admin List Audit Logs | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/audit/logs` | List Audit Logs | query: action, entity_type, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/audit/logs/{id}` | Get Audit Log |  | envelope {success,message,data} | tenant user |  |

### Billing callbacks (2)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/billing/pawapay/callback` | Callback |  | envelope {success,message,data} | public |  |
| POST | `/api/v1/billing/pawapay/refund-callback` | Refund Callback |  | envelope {success,message,data} | public |  |

### Branches (10)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/branches` | List Branches | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/branches` | Create Branch | BranchCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/branches/overview` | The directory: every branch the person may see with staff and sales for the chosen period, in a handful of grouped queries. | query: search, status, sort, dir, from_date, to_date, branch_id, page, page_size | envelope {success,message,data} | tenant user | yes |
| DELETE | `/api/v1/tenants/branches/{branch_id}` | Delete Branch |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/branches/{branch_id}` | Get Branch |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/branches/{branch_id}` | Update Branch | BranchUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/branches/{branch_id}/activity` | Recorded changes to this branch: created, edited, activated or deactivated, made main, deleted. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/branches/{branch_id}/sales` | One branch's sales for a period against the period before it, with trend, top products, payment methods and recent orders. | query: from_date, to_date | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/branches/{branch_id}/set-main` | Set Main Branch |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/branches/{branch_id}/stats` | Get Branch Stats |  | envelope {success,message,data} | tenant user |  |

### Business Data Management Requests (3)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/data-management-requests` | List Requests | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/data-management-requests` | Create Request | CreateRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/data-management-requests/modules` | Available Modules |  | envelope {success,message,data} | tenant user |  |

### Business performance (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/reports/financial` | Financial Report | query: from_date, to_date, branch_id | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/reports/operations` | Operations Report | query: from_date, to_date, branch_id | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/reports/performance` | KPIs, trend, breakdowns and insights for any period, optionally compared with another period. | query: from_date, to_date, branch_id, compare, compare_from, compare_to | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/reports/sales-breakdown` | Sales Breakdown Report | query: dimension, from_date, to_date, branch_id | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/reports/salespeople` | Sales per salesperson with the orders behind every figure. Without team access you only see yourself. | query: from_date, to_date, branch_id, salesperson_id, customer_id, product_id, category_id, payment_status | envelope {success,message,data} | tenant user |  |

### CRM - Activities (4)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/crm/activities` | List Activities | query: customer_id, deal_id, status, search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/crm/activities` | Create Activity | ActivityCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/crm/activities/{activity_id}` | Delete Activity |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/crm/activities/{activity_id}` | Update Activity | ActivityUpdate | envelope {success,message,data} | tenant user |  |

### CRM - Campaigns (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/crm/campaigns` | List Campaigns | query: search, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/crm/campaigns` | Create Campaign | CampaignCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/crm/campaigns/{id}` | Delete Campaign |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/crm/campaigns/{id}` | Get Campaign |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/crm/campaigns/{id}` | Update Campaign | CampaignUpdate | envelope {success,message,data} | tenant user |  |

### CRM - Contacts (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/crm/contacts` | List Contacts | query: search, customer_type, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/crm/contacts` | Create Contact | CustomerCreateStrict | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/crm/contacts/{contact_id}` | Delete Contact |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/crm/contacts/{contact_id}` | Get Contact |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/crm/contacts/{contact_id}` | Update Contact | CustomerUpdate | envelope {success,message,data} | tenant user |  |

### CRM - Emails (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/crm/emails` | List Emails | query: search, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/crm/emails` | Create Email | EmailLogCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/crm/emails/{id}` | Delete Email |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/crm/emails/{id}` | Get Email |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/crm/emails/{id}` | Update Email | EmailLogUpdate | envelope {success,message,data} | tenant user |  |

### CRM - Opportunities (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/crm/opportunities` | List Opportunities | query: stage, search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/crm/opportunities` | Create Opportunity | DealCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/crm/opportunities/{opportunity_id}` | Delete Opportunity |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/crm/opportunities/{opportunity_id}` | Get Opportunity |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/crm/opportunities/{opportunity_id}` | Update Opportunity | DealUpdate | envelope {success,message,data} | tenant user |  |

### Company billing (11)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/tenants/billing/confirm` | Tenant Confirm | ConfirmRequest | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/billing/invoices/{id}/pay` | Pay | PayRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/billing/invoices/{id}/pdf` | Tenant Pdf | query: receipt | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/billing/overview` | Tenant Overview |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/billing/payment-methods` | Payment Methods |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/billing/payments/{reference}/refresh` | Refresh Payment |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/billing/preview` | Tenant Preview | ChangeRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/billing/refunds/{id}/pdf` | Credit Note |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/billing/subscription` | Tenant Action | SubscriptionAction | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/billing/{kind}` | Records | query: q, status, currency, plan_id, invoice_id, tenant_id, payment_id, from_date, to_date, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/billing/{kind}/{id}` | Get Record |  | envelope {success,message,data} | tenant user |  |

### Currencies (1)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/global/currencies` | List Currencies |  | envelope {success,message,data} | tenant user |  |

### Currency (4)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/currency/exchange-rates` | List Tenant Rates | query: base, quote, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/currency/exchange-rates` | Create Tenant Rate | ExchangeRateCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/currency/exchange-rates/lookup` | The rate a new document would get: `from` → `to` (default: the tenant's base currency), as of `at`. | query: from, to, at | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/currency/settings` | The business's base (accounting) currency and whether it can still be changed — it is frozen |  | envelope {success,message,data} | tenant user |  |

### Daily branch reports (3)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/reports/daily-branches` | Daily | query: from_date, to_date, branch_id, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/reports/daily-branches/day` | One day for one branch (or all the person's branches): sales per item, debt, deposits, stock movement and expenses. | query: day, branch_id | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/reports/daily-branches/export` | Export | query: from_date, to_date, branch_id, format | envelope {success,message,data} | tenant user |  |

### Debt Management (15)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/debts/overview` | Overview |  | object | tenant user |  |
| GET | `/api/v1/tenants/debts/payable/purchases` | Draft Purchases | query: page, page_size | object | tenant user | yes |
| POST | `/api/v1/tenants/debts/payable/purchases/{purchase_id}/receive` | Receive Payable | PayableReceiptRequest | object | tenant user |  |
| POST | `/api/v1/tenants/debts/receivable/remind` | Remind | DebtReminderRequest | object | tenant user |  |
| POST | `/api/v1/tenants/debts/receivable/statement/send` | Send Statement | StatementSendRequest | object | tenant user |  |
| POST | `/api/v1/tenants/debts/{kind}/export` | Export | DebtFilters | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/debts/{kind}/manual` | Create Manual | ManualDebtRequest | object | tenant user |  |
| POST | `/api/v1/tenants/debts/{kind}/search` | Records | DebtFilters | object | tenant user | yes |
| GET | `/api/v1/tenants/debts/{kind}/statement` | Statement | query: party_id, date_from, date_to | object | tenant user |  |
| GET | `/api/v1/tenants/debts/{kind}/statement/export` | Statement Export | query: party_id, format, date_from, date_to | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/debts/{kind}/{document_id}` | Void | DebtReasonRequest | object | tenant user |  |
| GET | `/api/v1/tenants/debts/{kind}/{document_id}` | Detail | query: payment_page | object | tenant user |  |
| PATCH | `/api/v1/tenants/debts/{kind}/{document_id}` | Edit | DebtEditRequest | object | tenant user |  |
| POST | `/api/v1/tenants/debts/{kind}/{document_id}/payments` | Pay | DebtPaymentRequest | object | tenant user |  |
| POST | `/api/v1/tenants/debts/{kind}/{document_id}/write-off` | Write Off | DebtWriteOffRequest | object | tenant user |  |

### Departments (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/departments` | List Departments | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/departments` | Create Department | DepartmentCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/departments/import` | Import Departments | DepartmentImportRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/departments/templates` | Get Department Templates |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/departments/{dept_id}` | Delete Department |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/departments/{dept_id}` | Get Department |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/departments/{dept_id}` | Update Department | DepartmentUpdate | envelope {success,message,data} | tenant user |  |

### Discounts & Promotions (21)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/discounts/analytics` | Analytics | query: start, end | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/discounts/approvals` | Request Approval | ApprovalRequestIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/discounts/campaigns` | Campaigns | query: status, search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/discounts/campaigns` | Create Campaign | app__modules__discounts__schemas__CampaignIn | envelope {success,message,data} | tenant user |  |
| PUT | `/api/v1/tenants/sales/discounts/campaigns/{id}` | Update Campaign | app__modules__discounts__schemas__CampaignIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/discounts/campaigns/{id}/status` | Campaign Status | app__modules__discounts__schemas__StatusIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/discounts/catalog/preview` | Catalog Preview | CatalogPriceIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/discounts/coupons` | Coupons | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/discounts/coupons` | Generate Coupons | CouponGenerate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/discounts/coupons/{id}/status` | Coupon Status | app__modules__discounts__schemas__StatusIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/discounts/overview` | Overview |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/discounts/preview` | Preview | PriceIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/discounts/rules` | Discount rules with optional search (name or code), status and type filters, and each rule's real usage: | query: search, status, type, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/discounts/rules` | Create Rule | RuleIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/discounts/rules/{id}` | One rule with its usage summary and its campaign name. |  | envelope {success,message,data} | tenant user |  |
| PUT | `/api/v1/tenants/sales/discounts/rules/{id}` | Update Rule | RuleIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/discounts/rules/{id}/history` | Created, edited, activated, paused and archived events for this rule, from the audit log. |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/discounts/rules/{id}/status` | Rule Status | app__modules__discounts__schemas__StatusIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/discounts/rules/{id}/usage` | The sales this rule was actually applied to: sale reference, date, branch, customer (with contacts:read) and amount. | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/sales/discounts/settings` | Get Settings |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/discounts/settings` | Update Settings | app__modules__discounts__schemas__SettingsIn | envelope {success,message,data} | tenant user |  |

### Expense Management (21)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/tenants/expense-management` | Create | ExpenseCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/expense-management/categories` | Categories | query: search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/expense-management/categories` | Create Category | ExpenseCategoryInput | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/expense-management/categories/{identity}` | Edit Category | ExpenseCategoryInput | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/overview` | Overview | ExpenseFilters | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/expense-management/recurring` | Recurring List |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/recurring` | Recurring Create | RecurringExpenseInput | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/recurring/run` | Recurring Run |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/recurring/{identity}/toggle` | Recurring Toggle |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/search` | Search | ExpenseFilters | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/expense-management/settings` | Settings Get |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/expense-management/settings` | Settings Save | ExpenseSettings | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/expense-management/{identity}` | Detail | query: history_page | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/expense-management/{identity}` | Edit | ExpenseUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/{identity}/pay` | Pay | ExpensePayment | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/expense-management/{identity}/receipt` | Receipt |  | envelope {success,message,data} | tenant user |  |
| PUT | `/api/v1/tenants/expense-management/{identity}/receipt` | Attach | multipart (Body_attach_api_v1_tenants_expense_management__identity__receipt_put) | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/{identity}/reclassify` | Reclassify | ExpenseReclassify | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/{identity}/refund` | Refund | ExpenseRefund | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/{identity}/reverse` | Reverse | ExpenseReversal | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/expense-management/{identity}/{action}` | Act |  | envelope {success,message,data} | tenant user |  |

### HR - Applicants (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/hr/applicants` | List Applicants | query: stage, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/hr/applicants` | Create Applicant | ApplicantCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/hr/applicants/{id}` | Delete Applicant |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/hr/applicants/{id}` | Get Applicant |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/hr/applicants/{id}` | Update Applicant | ApplicantUpdate | envelope {success,message,data} | tenant user |  |

### HR - Attendance (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/hr/attendance` | List Attendance | query: employee_id, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/hr/attendance` | Create Attendance | AttendanceCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/hr/attendance/{id}` | Delete Attendance |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/hr/attendance/{id}` | Get Attendance |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/hr/attendance/{id}` | Update Attendance | AttendanceUpdate | envelope {success,message,data} | tenant user |  |

### HR - Employees (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/hr/employees` | List Employees | query: status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/hr/employees` | Create Employee | EmployeeCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/hr/employees/{id}` | Delete Employee |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/hr/employees/{id}` | Get Employee |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/hr/employees/{id}` | Update Employee | EmployeeUpdate | envelope {success,message,data} | tenant user |  |

### HR - Leave (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/hr/leave` | List Leave | query: status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/hr/leave` | Create Leave | LeaveCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/hr/leave/{id}` | Delete Leave |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/hr/leave/{id}` | Get Leave |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/hr/leave/{id}` | Update Leave | LeaveUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/hr/leave/{id}/approve` | Approve Leave |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/hr/leave/{id}/reject` | Reject Leave |  | envelope {success,message,data} | tenant user |  |

### HR - Payroll (6)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/hr/payroll` | List Payroll | query: period, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/hr/payroll` | Create Payroll | PayrollCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/hr/payroll/{id}` | Delete Payroll |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/hr/payroll/{id}` | Get Payroll |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/hr/payroll/{id}` | Update Payroll | PayrollUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/hr/payroll/{id}/paid` | Mark Paid |  | envelope {success,message,data} | tenant user |  |

### Imports (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/imports/ai` | Ai Status |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/imports/check` | Check Rows | CheckRequest | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/imports/extract` | Extract | multipart (Body_extract_api_v1_imports_extract_post) | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/imports/sheet-pictures` | Sheet Pictures | multipart (Body_sheet_pictures_api_v1_imports_sheet_pictures_post) | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/imports/suggest-mapping` | Suggest Mapping | MappingRequest | envelope {success,message,data} | tenant user |  |

### Inventory - Batches (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/batches` | List Batches Route | query: product_id, expiring_in_days, page, page_size, from_date, to_date | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/batches` | Create Batch Route | BatchCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/batches/{id}` | Delete Batch Route |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/batches/{id}` | Get Batch Route |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/batches/{id}` | Update Batch Route | BatchUpdate | envelope {success,message,data} | tenant user |  |

### Inventory - Brands (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/brands` | List Brands | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/brands` | Create Brand | BrandCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/brands/{id}` | Delete Brand |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/brands/{id}` | Get Brand |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/brands/{id}` | Update Brand | BrandUpdate | envelope {success,message,data} | tenant user |  |

### Inventory - Categories (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/categories` | List Categories | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/categories` | Create Category | CategoryCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/categories/import` | Import Categories | CategoryImportRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/categories/templates` | Get Category Templates |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/categories/{id}` | Delete Category |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/categories/{id}` | Get Category |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/categories/{id}` | Update Category | CategoryUpdate | envelope {success,message,data} | tenant user |  |

### Inventory - Products (21)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/products` | List Products | query: search, is_active, category_id, vat, page, page_size, from_date, to_date | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/products` | Create Product | ProductCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/attach-sheet-pictures` | Pictures pasted into an import sheet, attached to the products just created from its rows. `rows` is JSON {sheet row: product id}. | multipart (Body_attach_sheet_pictures_api_v1_tenants_inventory_products_attach_sheet_pictures_post) | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/barcode/{code}` | Get Product By Barcode |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/bulk` | Bulk Create Products | ProductBulkCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/import-pictures` | A ZIP of pictures named after each product's SKU or barcode. Pictures that match are attached; the rest are listed with the reason. | multipart (Body_import_product_pictures_api_v1_tenants_inventory_products_import_pictures_post) | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/low-stock` | Low Stock Report |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/vat-classification` | Bulk VAT classification. Needs tax:update (owners and administrators always may). | VatClassification | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/vat-summary` | How many products are in each VAT treatment, including those not reviewed yet. |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/products/{id}` | Delete Product |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/{id}` | Get Product |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/products/{id}` | Update Product | ProductUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/{id}/details` | Product Details |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/{id}/history` | Product History | query: category, kind, search, actor_id, branch_id, export_csv, page, page_size, from_date, to_date | envelope {success,message,data} | tenant user | yes |
| DELETE | `/api/v1/tenants/inventory/products/{id}/image` | Delete Product Image |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{id}/image` | Upload Product Image | multipart (Body_upload_product_image_api_v1_tenants_inventory_products__id__image_post) | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/{id}/images` | Product Gallery |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{id}/images` | Add Product Image | multipart (Body_add_product_image_api_v1_tenants_inventory_products__id__images_post) | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/products/{id}/images/{image_id}` | Remove Product Image |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{id}/images/{image_id}/make-main` | Make Main Product Image |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{id}/restock` | Restock Product | RestockRequest | envelope {success,message,data} | tenant user |  |

### Inventory - Reports (2)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/reports/valuation` | Inventory Valuation | query: status, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/inventory/reports/valuation/export` | Export Inventory Valuation | query: format | envelope {success,message,data} | tenant user |  |

### Inventory - Retail (3)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/markdowns` | Active Markdowns |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{id}/variants/generate` | Generate Variants | GenerateVariantsRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/reports/size-sellout` | Size Sellout | query: product_id, attribute_key | envelope {success,message,data} | tenant user |  |

### Inventory - Serials & Warranty (9)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/serials` | List Serials | query: product_id, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/serials` | Create Serials | SerialBulkCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/serials/{id}` | Delete Serial |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/serials/{id}` | Get Serial |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/serials/{id}` | Update Serial | SerialUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/warranty` | List Warranty Claims | query: status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/warranty` | Create Warranty Claim | WarrantyClaimCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/warranty/{id}` | Get Warranty Claim |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/warranty/{id}` | Update Warranty Claim | WarrantyClaimUpdate | envelope {success,message,data} | tenant user |  |

### Inventory - Stock Transfers (6)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/transfers` | List Transfers | query: status, page, page_size, from_date, to_date | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/transfers` | Create Transfer | StockTransferCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/transfers/destinations` | Every active branch of the business, by name only: a branch-restricted person may send stock TO any branch. |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/transfers/{id}` | Delete Transfer |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/transfers/{id}` | Get Transfer |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/transfers/{id}` | Update Transfer | StockTransferUpdate | envelope {success,message,data} | tenant user |  |

### Inventory - Suppliers (6)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/suppliers` | List Suppliers | query: search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/suppliers` | Create Supplier | SupplierCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/suppliers/bulk` | Bulk Create Suppliers | SupplierBulkCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/suppliers/{id}` | Delete Supplier |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/suppliers/{id}` | Get Supplier |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/suppliers/{id}` | Update Supplier | SupplierUpdate | envelope {success,message,data} | tenant user |  |

### Inventory - Units (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/units` | List Units | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/units` | Create Unit | UnitCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/units/import` | Import Units | UnitImportRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/units/suggestions` | Get Unit Suggestions |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/units/{id}` | Delete Unit |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/units/{id}` | Get Unit |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/units/{id}` | Update Unit | UnitUpdate | envelope {success,message,data} | tenant user |  |

### Inventory - Variants (8)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/products/{product_id}/variants` | List Variants |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{product_id}/variants` | Create Variant | VariantCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/inventory/products/{product_id}/variants/{id}` | Delete Variant |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/products/{product_id}/variants/{id}` | Get Variant |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/products/{product_id}/variants/{id}` | Update Variant | VariantUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{product_id}/variants/{id}/image` | Upload Variant Image | multipart (Body_upload_variant_image_api_v1_tenants_inventory_products__product_id__variants__id__image_post) | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/products/{product_id}/variants/{id}/restock` | Restock Variant | RestockRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/variants` | List All Variants | query: page, page_size | envelope {success,message,data} | tenant user | yes |

### Inventory - Warehouses (15)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/inventory/stock-by-warehouse` | Stock By Warehouse | query: warehouse_id, branch_id, search, status, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/inventory/stock-counts` | List Counts | query: status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/inventory/stock-counts` | Submit Count | CountIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/stock-counts/{id}` | Get Count |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/stock-counts/{id}/approve` | Approve Count | DecisionIn / null | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/stock-counts/{id}/reject` | Reject Count | DecisionIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/inventory/stock-movements` | Stock Movements | query: warehouse_id, product_id, movement_type, from_date, to_date, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/inventory/warehouses` | List Warehouses |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/warehouses` | Create Warehouse | WarehouseIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/warehouses/setup` | Switch warehouses on for the business: creates the Main warehouse holding everything now in stock. |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/inventory/warehouses/{id}` | Update Warehouse | WarehousePatch | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/warehouses/{id}/activate` | Activate |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/warehouses/{id}/deactivate` | Deactivate |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/warehouses/{id}/make-default` | Make Default |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/inventory/warehouses/{id}/receive` | Receive | ReceiptIn | envelope {success,message,data} | tenant user |  |

### Manufacturing - Bill of Materials (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/manufacturing/boms` | List Boms | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/manufacturing/boms` | Create Bom | BomCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/manufacturing/boms/{id}` | Delete Bom |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/manufacturing/boms/{id}` | Get Bom |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/manufacturing/boms/{id}` | Update Bom | BomUpdate | envelope {success,message,data} | tenant user |  |

### Manufacturing - Production Orders (6)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/manufacturing/orders` | List Production Orders | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/manufacturing/orders` | Create Production Order | ProductionOrderCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/manufacturing/orders/{id}` | Delete Production Order |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/manufacturing/orders/{id}` | Get Production Order |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/manufacturing/orders/{id}` | Update Production Order | ProductionOrderUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/manufacturing/orders/{id}/complete` | Complete Production Order |  | envelope {success,message,data} | tenant user |  |

### Marketing tracking (4)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/global/m/c/{token}` | Click |  | envelope {success,message,data} | public |  |
| GET | `/api/v1/global/m/o/{send_id}.gif` | Open Pixel |  | envelope {success,message,data} | public |  |
| GET | `/api/v1/global/m/u/{token}` | Shows a confirm button: merely opening the link (a mail scanner, a preview) never unsubscribes anyone. |  | string | public |  |
| POST | `/api/v1/global/m/u/{token}` | Also the RFC 8058 one-click target (mail apps POST here directly). |  | string | public |  |

### Permissions (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/global/permissions` | List Permissions | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/global/permissions` | Create Permission | PermissionCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/global/permissions/{permission_id}` | Delete Permission |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/global/permissions/{permission_id}` | Get Permission |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/global/permissions/{permission_id}` | Update Permission | PermissionUpdate | envelope {success,message,data} | tenant user |  |

### Platform billing (20)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/admin/billing/enroll-existing` | Move businesses with no subscription onto a plan without charging them (free trial or complimentary). Dry run by | EnrollRequest | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/billing/invoices/{id}/pdf` | Admin Pdf | query: receipt | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/billing/overview` | Admin Overview | query: currency, plan_id, status, from_date, to_date | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/billing/payment-methods` | Payment Methods |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/billing/payments/{reference}/refresh` | Refresh Payment |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/billing/payments/{reference}/refund` | Admin Refund | RefundRequest | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/billing/plans` | Plan Create | PlanInput | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/billing/plans/{id}` | Plan Update | PlanInput | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/billing/plans/{id}/prices` | Price History | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/billing/refunds/{id}/pdf` | Credit Note |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/billing/refunds/{reference}/refresh` | Refresh Refund |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/billing/settings` | Settings Read |  | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/billing/settings` | Settings Update | BillingSettingsInput | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/billing/subscriptions/{id}/history` | Admin History | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/billing/tenants/{tenant_id}` | Company Overview |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/billing/tenants/{tenant_id}/confirm` | Admin Confirm | ConfirmRequest | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/billing/tenants/{tenant_id}/preview` | Admin Preview | ChangeRequest | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/billing/tenants/{tenant_id}/subscription` | Admin Action | SubscriptionAction | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/billing/{kind}` | Records | query: q, status, currency, plan_id, invoice_id, tenant_id, payment_id, from_date, to_date, page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/billing/{kind}/{id}` | Get Record |  | envelope {success,message,data} | platform admin |  |

### Procurement - Purchase Orders (17)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/procurement/goods-receipts` | List Goods Receipts | query: purchase_order_id, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/procurement/overview` | Purchase Overview | query: from_date, to_date, supplier_id, currency_code | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/procurement/purchase-orders` | List Purchase Orders | query: status, search, from_date, to_date, supplier_id, currency_code, sort, direction, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/procurement/purchase-orders` | Create Purchase Order | PurchaseCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/procurement/purchase-orders/export/csv` | Export Purchase Orders | query: status, search, from_date, to_date, supplier_id, currency_code, sort, direction | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/procurement/purchase-orders/{id}` | Delete Purchase Order |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/procurement/purchase-orders/{id}` | Get Purchase Order |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/procurement/purchase-orders/{id}` | Update Purchase Order | PurchaseUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/purchase-orders/{id}/actions/{action}` | Purchase Action |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/procurement/purchase-orders/{id}/activity` | Purchase Activity | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/procurement/purchase-orders/{id}/attachments` | Purchase Attachments |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/purchase-orders/{id}/attachments` | Upload Purchase Attachment | multipart (Body_upload_purchase_attachment_api_v1_tenants_procurement_purchase_orders__id__attachments_post) | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/procurement/purchase-orders/{id}/attachments/{attachment_id}` | Download Purchase Attachment |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/purchase-orders/{id}/cancel` | Cancel Purchase Order |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/procurement/purchase-orders/{id}/pdf` | Purchase Document |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/purchase-orders/{id}/receipts` | Confirm Goods Receipt | ReceiptCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/purchase-orders/{id}/receive` | Receive Purchase Order | ReceiveTerms / null | envelope {success,message,data} | tenant user |  |

### Procurement - Purchase Returns (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/procurement/purchase-returns` | List Purchase Returns | query: search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/procurement/purchase-returns` | Create Purchase Return | PurchaseReturnCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/procurement/purchase-returns/{id}` | Delete Purchase Return |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/purchase-returns/{id}/refund` | Refund Purchase Return | SupplierRefundInput | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/purchase-returns/{id}/replace` | Replace Purchase Return |  | envelope {success,message,data} | tenant user |  |

### Procurement - Requisitions (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/procurement/requisitions` | List Requisitions | query: status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/procurement/requisitions` | Create Requisition | RequisitionCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/procurement/requisitions/{id}` | Delete Requisition |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/requisitions/{id}/approve` | Approve Requisition |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/procurement/requisitions/{id}/reject` | Reject Requisition |  | envelope {success,message,data} | tenant user |  |

### Procurement - Supplier Bills (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/procurement/supplier-bills` | List Supplier Bills | query: status, purchase_order_id, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/procurement/supplier-bills/{id}` | Get Supplier Bill |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/procurement/supplier-bills/{id}` | Update Supplier Invoice | BillMetadataUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/procurement/supplier-bills/{id}/payments` | List Supplier Bill Payments | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/procurement/supplier-bills/{id}/payments` | Record Supplier Payment | SupplierPaymentCreate | envelope {success,message,data} | tenant user |  |

### Public (3)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/global/contact` | Marketing-site contact form. No auth, no DB write — the message is | ContactRequest | envelope {success,message,data} | public |  |
| GET | `/api/v1/global/platform-stats` | Real, safe-to-publish numbers for the marketing site. No auth — this |  | envelope {success,message,data} | public |  |
| GET | `/api/v1/global/unsubscribe` | Target of the unsubscribe link in outgoing marketing email. The signed token IS the authorisation — no login. | query: token | string | public |  |

### Public pricing (1)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/public/pricing` | Active plans with their current prices and entitlements. Public, cached for a couple of minutes. |  | envelope {success,message,data} | public |  |

### Repairs (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/repairs` | List Jobs | query: status, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/repairs` | Create Job | RepairJobCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/repairs/{id}` | Delete Job |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/repairs/{id}` | Get Job |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/repairs/{id}` | Update Job | RepairJobUpdate | envelope {success,message,data} | tenant user |  |

### Roles (10)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/roles` | List Roles | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/roles` | Create Role | RoleCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/roles/review` | Roles that can delete or approve, and how many people hold each, so an owner can decide whether to tighten them. |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/roles/seed-defaults` | Adds the built-in roles this business doesn't have yet (Branch Manager, Cashier ...). Roles it already has are left exactly as they are. |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/roles/{role_id}` | Delete Role |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/roles/{role_id}` | Get Role |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/roles/{role_id}` | Update Role | RoleUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/roles/{role_id}/permissions` | Get Role Permissions |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/roles/{role_id}/permissions` | Assign Role Permissions | RolePermissionAssign | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/roles/{role_id}/tighten` | Owner-initiated: remove delete and approve from the built-in Member role. Never runs automatically. |  | envelope {success,message,data} | tenant user |  |

### Sales - Customers (11)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/customers` | Customers, without archived ones unless asked (status). figures=true adds each customer's orders, completed sales, | query: search, customer_type, status, figures, page, page_size, from_date, to_date | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/customers` | Create Customer | CustomerCreateStrict | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/customers/bulk` | Bulk Create Customers | CustomerBulkCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/sales/customers/{id}` | Permanent deletion: owners/administrators only (enforced by the access layer), and refused while any sale, payment, |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/customers/{id}` | Get Customer |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/customers/{id}` | Update Customer | CustomerUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/customers/{id}/activity` | What happened to this customer record (created, edited, deactivated, archived, reactivated), from the audit log. | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/tenants/sales/customers/{id}/dependencies` | What refers to the customer, so the screen can say why deletion is unavailable before anyone tries. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/customers/{id}/profile` | Customer Profile View |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/customers/{id}/records/{section}` | Customer Records | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/customers/{id}/status` | Deactivate, archive or reactivate (contacts:update). History, debts and journals are never touched. | CustomerStatusIn | envelope {success,message,data} | tenant user |  |

### Sales - Deals (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/deals` | List Deals | query: stage, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/deals` | Create Deal | DealCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/sales/deals/{id}` | Delete Deal |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/deals/{id}` | Get Deal |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/deals/{id}` | Update Deal | DealUpdate | envelope {success,message,data} | tenant user |  |

### Sales - Orders (20)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/orders` | List Orders | query: status, search, payment_status, archived, salesperson_id, page, page_size, from_date, to_date | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/orders` | Create Order | OrderCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/bulk` | Bulk Create Orders | OrderBulkCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/sales/orders/{id}` | Delete Order |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/orders/{id}` | Get Order |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/orders/{id}` | Update Order | OrderUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/approve` | Approve Order | OrderDecision / null | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/archive` | Archive Order | ArchiveReason | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/correct` | Owner/administrator correction of a completed sale: reverses the old books entry and posts a new one. Never edits in place. | OrderCorrection | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/orders/{id}/invoice.pdf` | Download Order Invoice Pdf |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/invoice/email` | Email Order Invoice | InvoiceEmail | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/orders/{id}/receipt.pdf` | The receipt at the paper it will be printed on: 80 mm / 58 mm thermal rolls, or an A4 sheet. | query: paper | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/reject` | Reject Order | OrderDecision / null | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/restore` | Restore Order |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/orders/{id}/salesperson` | Re-credit a sale to another salesperson. Needs approval authority on sales; the reason is audited. | SalespersonChange | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/void` | Owner/administrator: cancel a completed sale that should not exist. Reverses its entries and payments and restores stock; deletes nothing. | VoidReason | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/void-request` | Anyone who can see a sale can ask for it to be voided; an owner or approver decides in Approvals. | VoidReason | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/tax/preview` | VAT for a cart before it is charged, from the same engine the checkout uses (read-only, nothing is stored). | TaxPreviewIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/team` | Active people who can be named as the salesperson on a sale (names only: it needs no access to user administration). |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/vat-rate` | The VAT the business really charges, so the till shows what the server will record (never a hard-coded rate). |  | envelope {success,message,data} | tenant user |  |

### Sales - Payments (3)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/orders/{id}/payments` | List Order Payments |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/orders/{id}/payments` | Record Order Payment | OrderPaymentCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/payments/{payment_id}/reverse` | Reverse Order Payment | OrderPaymentReverse | envelope {success,message,data} | tenant user |  |

### Sales - Quotations (10)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/quotations` | List Quotations | query: status, search, salesperson_id, customer_id, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/quotations` | Create Quotation | QuotationCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/quotations/{id}` | Get Quotation |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/quotations/{id}` | Update Quotation | QuotationUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/quotations/{id}/accept` | Accept Quotation |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/quotations/{id}/activity` | Quotation Activity |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/quotations/{id}/convert` | Accepted quotation -> one Pending sale. Repeating the call returns the same sale. Takes no payment and moves no stock. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/quotations/{id}/quotation.pdf` | Quotation Pdf |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/quotations/{id}/reject` | Reject Quotation | QuotationReject | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/sales/quotations/{id}/send` | Send Quotation |  | envelope {success,message,data} | tenant user |  |

### Sales - Returns (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/returns` | List Returns | query: status, page, page_size, from_date, to_date | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/returns` | Create Return | ReturnCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/sales/returns/{id}` | Delete Return |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/returns/{id}` | Get Return |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/returns/{id}` | Update Return | ReturnUpdate | envelope {success,message,data} | tenant user |  |

### Sales - Targets (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/sales/targets` | List Targets | query: period, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/sales/targets` | Create Target | TargetCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/sales/targets/{id}` | Delete Target |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/sales/targets/{id}` | Get Target |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/sales/targets/{id}` | Update Target | TargetUpdate | envelope {success,message,data} | tenant user |  |

### Services - Appointments (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/services/appointments` | List Appointments | query: date_from, date_to, status, employee_id, branch_id, search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/services/appointments` | Create Appointment | AppointmentCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/services/appointments/{id}` | Delete Appointment |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/services/appointments/{id}` | Get Appointment |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/services/appointments/{id}` | Update Appointment | AppointmentUpdate | envelope {success,message,data} | tenant user |  |

### Services - Catalog (8)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/services/catalog` | List Services | query: search, category_id, is_active, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/services/catalog` | Create Service | ServiceCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/services/catalog/all` | List All Services |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/services/catalog/import` | Import Services | ServiceImportRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/services/catalog/templates` | Get Service Templates |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/services/catalog/{id}` | Delete Service |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/services/catalog/{id}` | Get Service |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/services/catalog/{id}` | Update Service | ServiceUpdate | envelope {success,message,data} | tenant user |  |

### Services - Categories (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/services/categories` | List Service Categories | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/services/categories` | Create Service Category | ServiceCategoryCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/services/categories/{id}` | Delete Service Category |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/services/categories/{id}` | Get Service Category |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/services/categories/{id}` | Update Service Category | ServiceCategoryUpdate | envelope {success,message,data} | tenant user |  |

### Services - Staff & Commissions (5)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/services/staff-commissions` | List Employee Services |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/services/staff-commissions` | Create Employee Service | EmployeeServiceCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/services/staff-commissions/employee/{employee_id}` | List Employee Services For Employee |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/services/staff-commissions/{id}` | Delete Employee Service |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/services/staff-commissions/{id}` | Update Employee Service | EmployeeServiceUpdate | envelope {success,message,data} | tenant user |  |

### Services - Walk-in Queue (4)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/services/queue` | List Queue Entries | query: status | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/services/queue` | Create Queue Entry | QueueEntryCreate | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/services/queue/{id}` | Delete Queue Entry |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/services/queue/{id}` | Update Queue Entry | QueueEntryUpdate | envelope {success,message,data} | tenant user |  |

### Super Admin (69)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/audience` | Contactable businesses for marketing: one row per business with its owner's name/email and the business phone. | query: q, plan, country, preferred_contact, status, sort, dir, page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/feature-usage` | How much each core module is actually being used, for all businesses or for the group the filters select: | query: q, status, plan, country, industry, businessType, heardAbout, size, created_from, created_to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/features` | Admin List Features |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/features/directory` | Feature Directory | query: industry, size, country, business_type, plan | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/features/{key}` | Edit a catalogue entry. The key never changes and nothing a business has recorded is touched. | FeaturePatch | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/features/{key}/detail` | Feature Detail |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/stats` | Admin Stats |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenant-analytics` | Breakdown charts: country, industry, business_type, heard_about, status, plan, monthly signups. |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants` | Admin List Tenants | query: q, status, plan, country, industry, businessType, heardAbout, size, feature, featureState, sort, dir, c | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/tenants` | Admin Create Tenant | AdminTenantCreate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/filter-options` | Every value a business can be filtered by, with how many businesses have it. |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/summary` | Market-research figures for the businesses the filters select: how many, how fast they join, what they are like, and whether they use the product. | query: q, status, plan, country, industry, businessType, heardAbout, size, feature, featureState, created_from | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}` | Admin Get Tenant |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/tenants/{tenant_id}` | Admin Update Tenant | TenantUpdate | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/activate` | Reactivate Tenant | ReactivateRequest / null | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/branches` | Admin List Tenant Branches | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/tenants/{tenant_id}/branches` | Admin Create Tenant Branch | BranchCreate | envelope {success,message,data} | platform admin |  |
| DELETE | `/api/v1/admin/tenants/{tenant_id}/branches/{branch_id}` | Admin Delete Tenant Branch |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/deletion-requests` | List Archive Requests |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/deletion-requests` | Request Archive | DeletionRequest | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/deletion-requests/{request_id}/approve` | Approve Archive | DecisionRequest | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/deletion-requests/{request_id}/cancel` | Cancel Archive |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/deletion-requests/{request_id}/reject` | Reject Archive | DecisionRequest | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/departments` | Admin List Tenant Departments | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/tenants/{tenant_id}/departments` | Admin Create Tenant Department | DepartmentCreate | envelope {success,message,data} | platform admin |  |
| DELETE | `/api/v1/admin/tenants/{tenant_id}/departments/{department_id}` | Admin Delete Tenant Department |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/exports` | List Exports |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/exports` | Request Export | ExportRequest | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/exports/{export_id}/download` | Download Export | query: token | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/features` | Admin Get Tenant Features |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/tenants/{tenant_id}/features` | Admin Set Tenant Features | FeatureOverrideUpdate | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/features/reset` | Admin Reset Tenant Features |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/invite` | Admin Invite User | InviteUserPayload | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/limits` | Admin Get Tenant Limits |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/tenants/{tenant_id}/limits` | Admin Set Tenant Limits | TenantLimitsUpdate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/locations` | Admin Tenant Locations |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/notifications` | List Notifications | query: limit | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/tenants/{tenant_id}/notifications` | Send Notification | NotificationRequest | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/records` | Read-only, paginated business records for the selected tenant. | query: section, q, status, date_from, date_to, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/tenants/{tenant_id}/reset-data` | Admin Reset Tenant Data |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/roles` | Admin List Tenant Roles | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/tenants/{tenant_id}/roles` | Admin Create Tenant Role | RoleCreate | envelope {success,message,data} | platform admin |  |
| DELETE | `/api/v1/admin/tenants/{tenant_id}/roles/{role_id}` | Admin Delete Tenant Role |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/stats` | Admin Tenant Stats |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/suspend` | Suspend Tenant | SuspendRequest | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/team/invite` | Admin Team Invite | UserCreate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/team/roles/{role_id}/permissions` | Admin Team Role Permissions |  | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/tenants/{tenant_id}/team/roles/{role_id}/permissions` | Admin Team Role Save | TeamRolePermissionsUpdate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/team/users` | Admin Team Users | query: search, role_id, is_active, page, page_size | envelope {success,message,data} | platform admin | yes |
| DELETE | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}` | Admin Team Remove |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}` | Admin Team User |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}` | Admin Team Update | UserUpdate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}/activity` | Admin Team Activity | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}/permissions` | Admin Team Permissions |  | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}/permissions` | Admin Team Save Permissions | EmployeePermissionsUpdate | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/tenants/{tenant_id}/team/users/{user_id}/status` | Admin Team Status | EmployeeStatusUpdate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/users` | Admin List Tenant Users | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| DELETE | `/api/v1/admin/tenants/{tenant_id}/users/{user_id}` | Admin Delete Tenant User |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/tenants/{tenant_id}/users/{user_id}/access` | Admin Employee Access |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/tenants/{tenant_id}/users/{user_id}/access/{module}` | Admin Employee Feature | EmployeeFeatureUpdate | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/users/{user_id}/recovery-link` | Email the user a time-limited reset link. The admin never sees a password or the link. |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/tenants/{tenant_id}/users/{user_id}/set-password` | Give any user in any business a password you choose (a default for them to sign in with). By default they must choose their own | SetPasswordRequest | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/usage-breakdown` | Deep-dive into how tenants actually use the platform: engagement tiers |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/usage/engagement/{category}` | Engagement List | query: q, status, sort, dir, page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/usage/modules/{key}` | Module Usage | query: period, q, status, page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/usage/sales/{currency}` | Currency Sales | query: period, q, page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/usage/tenants/{tenant_id}` | Tenant Usage |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/users` | Admin List All Users | query: search, tenant_id, role, status, created_from, created_to, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/users/export` | Superadmin-only (enforced by the `SuperUser` dependency server-side, | AdminUserExportRequest | envelope {success,message,data} | platform admin |  |

### Super Admin - AI (3)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/ai/settings` | Get Settings |  | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/ai/settings` | Feature switch + usage limits. The provider and its API key are deployment configuration | AiSettingsUpdate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/ai/usage` | Usage | query: days | envelope {success,message,data} | platform admin |  |

### Super Admin - Analytics (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/analytics/filter-options` | Values for the Country / Industry / Business Type dropdowns, straight | query: country, industry, businessType | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/growth` | New vs running-total tenants or users per bucket. Honours the date range | query: metric, groupBy, from, to, country, industry, businessType | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/overview` | The four headline KPIs with a previous-period comparison. Honours the | query: from, to, country, industry, businessType | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/platform-status` | Tenant status mix right now (tenant filters apply; the date range does | query: from, to, country, industry, businessType | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/recent-tenants` | The newest registrations. Honours the tenant filters; not the date range — | query: limit, country, industry, businessType | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/analytics/signup-insights` | Top categories (+ rolled-up "Other") of one signup dimension among | query: dimension, limit, from, to, country, industry, businessType | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/analytics/signup-insights/all` | 'View all' drill-down: the full, paginated category list for one dimension. | query: dimension, page, page_size, from, to, country, industry, businessType | envelope {success,message,data} | platform admin | yes |

### Super Admin - Currency (4)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/currency/exchange-rates` | List Platform Rates | query: base, quote, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/currency/exchange-rates` | Create Platform Rate | ExchangeRateCreate | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/currency/settings` | Get Platform Currency Settings |  | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/currency/settings/reporting-currency` | Changes how cross-tenant analytics are presented. Does not touch any tenant's base currency. | ReportingCurrencyUpdate | envelope {success,message,data} | platform admin |  |

### Super Admin - Data Management (33)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/data-management/businesses` | Businesses to choose from, filtered, sorted and paged on the server. Nothing about a business's records is shown until it is chosen. | query: search, status, plan, country, sort, descending, page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/data-management/businesses/facets` | Business Facets |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/businesses/{tenant_id}` | Business |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/businesses/{tenant_id}/day-activity` | What the business recorded on one calendar day (in its own time zone), module by module: the starting point of Reset Business Day. | query: date | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/businesses/{tenant_id}/modules` | Modules |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/businesses/{tenant_id}/modules/{module}/filter-options` | Filter Options |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/businesses/{tenant_id}/modules/{module}/records` | Records | Query_ | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/businesses/{tenant_id}/modules/{module}/records/{record_id}` | Record |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/businesses/{tenant_id}/operations` | Stage A: work out exactly what the operation would do. Changes nothing. | Prepare | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/businesses/{tenant_id}/recovery` | What can really be recovered. There is no backup system in this platform, so this says so rather than listing restore points that do not exist. |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/businesses/{tenant_id}/reset-options` | The checklist of Reset Business Data: every data group with its live record count for this business, the presets and what is always kept. |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/me` | My Permissions |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/meta` | Meta |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/modules/{module}` | Module Description |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/operations` | Operations | query: tenant_id, module, operation, status, requested_by, from_date, to_date, include_drafts, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/data-management/operations/approve-and-run-batch` | Approve And Run Batch | ApproveAndRunBatch | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/operations/{op_id}` | Operation |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/operations/{op_id}/approve-and-run` | Submit, approve and run in one step for the requester, while the platform allows self-approval. Everything is checked again before it runs. | ApproveAndRun | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/operations/{op_id}/cancel` | Cancel |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/operations/{op_id}/decision` | Decision | app__modules__admin__data_management__routes__Decision | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/operations/{op_id}/execute` | Stage B: re-check everything and run. Running an operation that already ran returns its result and does nothing more. | Execute | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/operations/{op_id}/export-link` | A short-lived download link for the backup a data reset took before it deleted anything. |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/operations/{op_id}/items` | Operation Items | query: outcome, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/data-management/operations/{op_id}/submit` | Submit | Submit | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/requests` | Business Requests | query: tenant_id, module, from_date, to_date, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/data-management/requests/{request_id}/prepare` | Prepare Business Request |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/requests/{request_id}/reject` | Reject Business Request | RejectRequest | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/saved-filters` | Saved Filters | query: module | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/data-management/saved-filters` | Save Filter | SaveFilter | envelope {success,message,data} | platform admin |  |
| DELETE | `/api/v1/admin/data-management/saved-filters/{filter_id}` | Delete Filter |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/settings` | Data Settings |  | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/data-management/settings` | Whether the administrator who requested an operation may also approve it. Changing it needs the approval permission and is audited. | PlatformDataSettings | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/data-management/summary` | Real numbers for the Data Management overview. A figure that cannot be worked out is null, never invented. |  | envelope {success,message,data} | platform admin |  |

### Super Admin - Marketing (51)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/marketing/analytics` | Performance | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/automations` | List Automations |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/automations` | Create Automation | AutomationIn | envelope {success,message,data} | platform admin |  |
| DELETE | `/api/v1/admin/marketing/automations/{automation_id}` | Delete Automation |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/marketing/automations/{automation_id}` | Update Automation | AutomationIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/automations/{automation_id}/history` | Automation History |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/automations/{automation_id}/{action}` | Automation Action |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/campaigns` | List Campaigns | query: kind, status, q, parent_id, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/marketing/campaigns` | Create Campaign | app__modules__marketing__routes__CampaignIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/campaigns/{campaign_id}` | Get Campaign |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/marketing/campaigns/{campaign_id}` | Update Campaign | app__modules__marketing__routes__CampaignIn | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/activate` | Activate Newsletter |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/duplicate` | Duplicate Campaign |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/publish-issue` | Publish Issue | SendIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/campaigns/{campaign_id}/readiness` | Campaign Readiness |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/campaigns/{campaign_id}/recipients` | Campaign Recipients | query: status, page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/marketing/campaigns/{campaign_id}/results` | Campaign Results |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/schedule` | Schedule Campaign | ScheduleIn | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/send` | Send Campaign | SendIn | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/test` | Test Campaign | TestIn | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/unschedule` | Unschedule Campaign |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/campaigns/{campaign_id}/{action}` | Campaign Action |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/contacts` | Contact directory. Syncs businesses into contacts first, so it always reflects the current tenant list. | query: sort, dir, page, page_size, q, countries, plans, industries, sources, tags, account_status, preferred_c | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/marketing/contacts` | Add Contact | ContactIn | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/contacts/bulk` | Bulk Contacts | BulkIn | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/contacts/import` | Import Contacts | ImportIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/contacts/options` | Values for the filter drop-downs: only what exists in the data. |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/contacts/summary` | Contacts Summary | Filters | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/contacts/{contact_id}` | A contact's profile: the business, its authorised recipient, preferences and message history. |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/marketing/contacts/{contact_id}` | Edit Contact | ContactPatch | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/overview` | Overview | query: from, to | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/render` | The exact HTML and plain text recipients get, with sample data in the variables. | RenderIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/segments` | List Segments |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/segments` | Create Segment | SegmentIn | envelope {success,message,data} | platform admin |  |
| DELETE | `/api/v1/admin/marketing/segments/{segment_id}` | Delete Segment |  | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/marketing/segments/{segment_id}` | Update Segment | SegmentIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/settings` | Get Settings |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/settings/audit` | Audit History | query: page, page_size | envelope {success,message,data} | platform admin | yes |
| GET | `/api/v1/admin/marketing/settings/domain` | Check Domain | query: domain | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/settings/suppressions` | Suppressions | query: q, page, page_size | envelope {success,message,data} | platform admin | yes |
| POST | `/api/v1/admin/marketing/settings/test-connection` | Signs in to the SMTP server without sending anything. |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/settings/test-send` | Settings Test Send | TestIn | envelope {success,message,data} | platform admin |  |
| PUT | `/api/v1/admin/marketing/settings/{section}` | Save Settings | app__modules__marketing__routes__SettingsIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/templates` | List Templates | query: q, category, status | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/templates` | Create Template | TemplateIn | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/marketing/templates/{template_id}` | Get Template |  | envelope {success,message,data} | platform admin |  |
| PATCH | `/api/v1/admin/marketing/templates/{template_id}` | Update Template | TemplateIn | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/templates/{template_id}/archive` | Archive Template |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/templates/{template_id}/duplicate` | Duplicate Template |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/templates/{template_id}/restore` | Restore Template |  | envelope {success,message,data} | platform admin |  |
| POST | `/api/v1/admin/marketing/uploads` | Stores an email image in the shared uploads folder (served at /uploads) after verifying it really is an image. | multipart (Body_upload_image_api_v1_admin_marketing_uploads_post) | envelope {success,message,data} | platform admin |  |

### Super Admin - Website Traffic (11)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/analytics/erp-traffic` | How businesses use the ERP: active users/businesses, sessions, modules, most active and quiet businesses. | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/erp-traffic/businesses` | Erp Traffic Businesses | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/erp-traffic/devices` | Erp Traffic Devices | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/erp-traffic/engagement` | Erp Traffic Engagement | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/erp-traffic/modules` | Erp Traffic Modules | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/erp-traffic/realtime` | Erp Traffic Realtime |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/traffic` | Acquisition dashboard: visitors → signups → activated → paying, with sources, pages and campaigns. | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/traffic/campaigns` | Every UTM campaign with its source/medium breakdown, signups and paying customers. | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/traffic/pages` | Every tracked page (up to 500) with visitors, views and the signups credited to it as a landing page. | query: from, to | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/traffic/realtime` | Visitors on the website right now (last 30 minutes) and the last 48 hours, hour by hour. Superadmin only. |  | envelope {success,message,data} | platform admin |  |
| GET | `/api/v1/admin/analytics/traffic/sources` | Every channel with views, signups and conversion, a per-channel trend, and the top referring sites. | query: from, to | envelope {success,message,data} | platform admin |  |

### Support (39)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/support/attachments/{message_id}/{attachment_id}` | Staff can open attachments of conversations they may see; a business user only attachments on THEIR OWN tickets. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/channels` | Channel status for the Settings page. Only non-secret state — never keys, tokens or session data. |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/channels/email/sync` | Email Sync |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/channels/email/test-connection` | Signs in to SMTP and Graph without sending anything. Reports ok/error per direction — never credentials. |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/channels/email/test-send` | Email Test Send | TestEmailIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/channels/whatsapp/connect` | Whatsapp Connect |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/channels/whatsapp/disconnect` | Whatsapp Disconnect |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/channels/whatsapp/qr` | Whatsapp Qr |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/conversations` | List Conversations | query: view, channel, search, page, page_size | envelope {success,message,data} | tenant user | yes |
| GET | `/api/v1/support/conversations/{conversation_id}` | Get Conversation |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/conversations/{conversation_id}/assign` | Assign | AssignIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/conversations/{conversation_id}/messages` | List Messages | query: before, limit | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/support/conversations/{conversation_id}/messages/{message_id}/retry` | Retry |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/conversations/{conversation_id}/notes` | Add Note | NoteIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/conversations/{conversation_id}/priority` | Set Priority | PriorityIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/conversations/{conversation_id}/read` | Mark Read |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/conversations/{conversation_id}/related` | Right-hand customer panel: previous conversations with the same person and their tickets. |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/conversations/{conversation_id}/reply` | Reply | ReplyIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/conversations/{conversation_id}/status` | Set Status | app__modules__support__schemas__StatusIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/conversations/{conversation_id}/ticket` | Convert To Ticket |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/maintenance/purge` | Purge |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/my/tickets` | My Tickets | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/support/my/tickets` | My Create Ticket | TicketCreateIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/my/tickets/{ticket_id}` | My Ticket |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/my/tickets/{ticket_id}/reply` | My Reply | NoteIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/outreach` | Starts a separate conversation with each chosen business and sends the message on the chosen channel. | OutreachIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/settings` | Get Settings |  | envelope {success,message,data} | tenant user |  |
| PUT | `/api/v1/support/settings` | Put Settings | SupportSettingsIO | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/stream` | Server-Sent Events: instant 'something changed' nudges for the open inbox (no polling). |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/summary` | Summary |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/team` | Team |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/team` | Add Member | StaffCreateIn | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/support/team/{user_id}` | Update Member | StaffUpdateIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/tickets` | List Tickets | query: status, priority, assigned, search, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/support/tickets` | Create Ticket | TicketCreateIn | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/support/tickets/{ticket_id}` | Get Ticket |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/support/tickets/{ticket_id}` | Update Ticket | TicketUpdateIn | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/uploads` | Upload | multipart (Body_upload_api_v1_support_uploads_post) | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/support/webhooks/openwa` | Openwa Webhook |  | envelope {success,message,data} | public |  |

### Tenants (10)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/` | List Tenants | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/` | Create Tenant | TenantCreate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/me/current` | Get Current Tenant |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/me/entitlements` | Effective feature flags + usage limits for the current tenant. |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/me/modules` | The plan and every module's state for the signed-in business (see service.resolve_modules). |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/me/modules/{key}` | The business administrator turns a module their plan includes on or off. Data is never deleted. | ModuleActivation | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/{tenant_id}` | Delete Tenant |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/{tenant_id}` | Get Tenant |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/{tenant_id}` | Update Tenant | TenantUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/{tenant_id}/logo` | Upload Logo | multipart (Body_upload_logo_api_v1_tenants__tenant_id__logo_post) | envelope {success,message,data} | tenant user |  |

### Users (13)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/users` | List Users | query: search, is_active, role_id, page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/users` | Create User | UserCreate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/users/change-password` | Self-service. Deliberately ungated by `users:update` — every user | ChangePasswordRequest | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/users/me` | Read Current User |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/users/me` | Self-service. Ungated so any signed-in user can fix their own name and | MyProfileUpdate | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/users/me/permissions` | Get My Permissions |  | envelope {success,message,data} | tenant user |  |
| DELETE | `/api/v1/tenants/users/{user_id}` | Delete User |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/users/{user_id}` | Read User |  | envelope {success,message,data} | tenant user |  |
| PATCH | `/api/v1/tenants/users/{user_id}` | Update User | UserUpdate | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/users/{user_id}/activate` | Activate User |  | envelope {success,message,data} | tenant user |  |
| GET | `/api/v1/tenants/users/{user_id}/activity` | Audit trail for one user: the actions they performed plus every admin | query: page, page_size | envelope {success,message,data} | tenant user | yes |
| POST | `/api/v1/tenants/users/{user_id}/deactivate` | Deactivate User |  | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/tenants/users/{user_id}/reset-password` | Sets the password the administrator chose, or generates one, and emails it to the user. A generated value is | AdminResetPasswordRequest | envelope {success,message,data} | tenant user |  |

### Website tracking (1)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/public/visits` | Anonymous page-view beacon from the marketing website. Invalid or bot traffic is ignored silently. | VisitIn | envelope {success,message,data} | public |  |

### auth (7)

| Method | Path | Purpose | Request | Response | Auth | Paged |
|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/change-password` | Change Password | ChangePasswordRequest | envelope {success,message,data} | tenant user |  |
| POST | `/api/v1/auth/forgot-password` | Forgot Password | ForgotPasswordRequest | envelope {success,message,data} | public |  |
| POST | `/api/v1/auth/login` | Login | LoginRequest | envelope {success,message,data} | public |  |
| POST | `/api/v1/auth/refresh` | Refresh | RefreshRequest | envelope {success,message,data} | public |  |
| POST | `/api/v1/auth/register` | Register | RegisterRequest | envelope {success,message,data} | public |  |
| POST | `/api/v1/auth/reset-password` | Reset Password | ResetPasswordRequest | envelope {success,message,data} | public |  |
| POST | `/api/v1/auth/token` | Token | Body_token_api_v1_auth_token_post | envelope {success,message,data} | public |  |
