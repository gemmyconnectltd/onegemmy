# 01 — Product overview

## What Pesaa is

Pesaa (repo name "OneGemmy") is a multi-tenant cloud business-management platform for small and medium businesses in East Africa (currencies and examples use RWF and TSh; UI languages English, Kinyarwanda, Kiswahili). A business signs up, a platform admin activates it, and its owner and staff then run day-to-day operations in one web app: a desktop **point of sale**, **sales** (orders/invoices, quotations, returns, credit), **inventory** (products, variants, warehouses, stock movements), **purchases**, **expenses**, **debts**, double-entry **accounting** with VAT, **HR**, **CRM**, **services/appointments**, **manufacturing** and **repairs**, plus reports and an AI assistant. A separate super-admin console runs the platform (tenants, plans and billing, data management, support, marketing, traffic). A marketing website and a separate offline-capable mobile app complete the product.

## Apps

| App | Users | Folder |
|---|---|---|
| ERP web app + desktop POS (app.pesaa.io) | business owners and staff | `frontend/` |
| Super-admin console (admin.pesaa.io) | Pesaa staff | `super-admin/` |
| Marketing website (pesaa.io) | prospects | `website/` |
| Mobile web app (offline POS) | cashiers on phones | `mobile/` (not analyzed here) |
| API | all of the above | `backend/` |

## Modules (ERP)

Status legend: **complete** = real data end to end with create/edit flows, permissions and tests; **partial** = works but thin or with known gaps; **stub** = UI only / fake data / no backend.

| Module | Purpose | Main screens (routes) | Main actions | Status |
|---|---|---|---|---|
| **Dashboard** | Owner's business overview | `/dashboard` | Pick a period; see KPIs, charts, recent sales, low stock, quick actions | partial — several widgets compute from capped samples or ignore the period (see 10) |
| **Point of Sale** | Fast desktop till | `/pos` | Search/scan products, cart, customer, discounts/coupons, full/partial/credit/split payment, hold sales, quotations, receipts (print/PDF/share), invoices | complete |
| **Sales** | Orders (a sale is also the invoice), deals, quotations, returns, targets | `/sales/orders`, `/sales/deals`, `/sales/quotations`, `/sales/returns`, `/sales/targets`, `/reports/salespeople` | Create/edit/approve/void/archive sales, record payments, change salesperson, quotations → convert to sale, returns with restock, targets | complete (deals/targets thinner) |
| **Discounts & Promotions** | Rules, campaigns, coupons, approvals | `/sales/discounts/*` | Create rules/coupons, apply at checkout, approve over-limit discounts, analytics | complete |
| **Customers** | Customer directory and profiles | `/customers` (+ `/customers/segments`, `/loyalty`, `/analytics`) | Add/import/edit/archive customers, view profile & balance | directory complete; **segments, loyalty, analytics are stubs with hardcoded fake data** |
| **Inventory** | Products and stock | `/inventory`, `/inventory/products` (+ settings: categories, brands, units, variants), `/inventory/stock`, `/transfers`, `/warehouses`, `/stock-by-warehouse`, `/movements`, `/counts`, `/warranty` | Products with variants/serials/batches, restock, transfers between branches/warehouses, stock counts, movements ledger, imports | complete |
| **Purchases (Procurement)** | Buying from suppliers | `/procurement`, `/orders`, `/receipts`, `/bills`, `/returns`, `/requests`, `/suppliers` | Purchase orders, goods receipt, supplier bills, purchase returns, requisitions | complete (requests thinner) |
| **Expenses** | Business spending | `/expenses/list`, `/expenses/new`, `/expenses/categories` | Record/approve/pay/refund/reverse expenses, receipts, recurring expenses, categories | complete |
| **Debt Management** | Who owes whom | `/debts/receivables`, `/debts/payables`, `/debts/statements` | Track customer and supplier balances, manual debts, payments, statements, reminders | complete |
| **Accounting** | Double-entry books | `/accounting/accounts`, `/ledger`, `/receivables`, `/payables`, `/cash-bank`, `/assets`, `/payroll`, `/tax`, `/accounting/reports` | Chart of accounts, journals, bank reconciliation, fixed assets, VAT, income statement/balance sheet/cash flow, period close | complete (payroll view [UNCLEAR] vs HR payroll) |
| **HR** | Staff records | `/hr`, `/hr/departments`, `/attendance`, `/leave`, `/payroll`, `/recruiting` | Employees, departments, attendance, leave requests, payroll rows, applicants | partial — simple CRUD; payroll = base + bonus − deductions, no tax, not posted to accounting; employees are not linked to user accounts |
| **CRM** | Leads/contacts and campaigns | `/crm`, `/crm/contacts`, `/opportunities`, `/activities`, `/campaigns`, `/emails` | Contacts, opportunities, activities, campaigns, email records | partial — campaigns store counts; tenant email sending [UNCLEAR] |
| **Services** | Appointment businesses (salons, clinics) | `/services/appointments`, `/walk-ins`, `/calendar`, `/catalog`, `/staff-commissions` | Book appointments, walk-in queue, service catalog, staff commissions | complete for its scope |
| **Manufacturing** | Simple production | `/manufacturing/work-orders`, `/materials`, `/bom`, `/analytics` | Bills of materials, production orders | partial — BOM + production orders only; routing/MRP/shop-floor/quality/costing exist as permission names only |
| **Repairs** | Device repair jobs | `/repairs` | Job intake (device, IMEI, issue), diagnosis, cost, status | partial — single page; **not in the main menu** (reachable by URL) |
| **Reports** | Business reports | `/reports`, `/reports/sales`, `/operations`, `/finance`, `/daily`, `/salespeople` | Sales & profitability, operations, finance overview, daily branch reports | partial — many older report URLs are now redirects |
| **Approvals** | Central approval inbox | `/approvals` | Approve/reject sales, discounts, credit, data requests | complete |
| **Team & Access** | Users and roles | `/settings/users`, `/settings/users/access` | Invite users (set or email password), roles, per-user permissions/modules, activity | complete |
| **Branches** | Multi-branch | `/branches`, `/branches/[id]` | Create branches, assign staff, branch workspace | complete |
| **Business Settings** | Company profile, VAT, appearance, security | `/settings`, `/settings/financial`, `/appearance`, `/security`, `/profile`, `/data-management` | Business details, currency/VAT, brand color & logo, change password, data requests | complete; `/settings/notifications` is a stub ("not built yet"); `/settings/billing` exists but is hidden from the menu |
| **AI assistant** | "Ask Pesaa AI" | Topbar + floating button | Questions over the business's own data; AI-assisted imports from photos/PDFs | partial — default provider is `mock` |
| **Help & Support** | Tickets to Pesaa | `/support`, `/support/[id]` | Open and follow support tickets, WhatsApp link | complete |

### Super-admin console modules

Overview & Usage, Tenants (approve/suspend businesses, users, roles, per-user POS controls, sign-in details), Features (per-business module switches), Data Management (reset/cleanup with approval workflow and recovery), Plans & Billing (plans, subscriptions, payments via pawaPay, invoices, coupons), Traffic (website and ERP usage analytics), Marketing (audience, campaigns, newsletters, automations, templates), Customer Support (inbox across email/WhatsApp, tickets, team), Settings.

## Multi-tenancy

- **One database, shared tables.** Every business is a `tenants` row; business data rows carry `tenant_id` (FK, cascade delete). There is no schema-per-tenant and no Postgres row-level security.
- **Who belongs where:** each user has one `tenant_id` (an identity belongs to one business; platform admins have `tenant_id = NULL`). The JWT carries `tenant_id`; `get_current_user` loads the user within that tenant.
- **Isolation in code:** repositories expose `get_by_id_for_tenant`, `list_for_tenant`, `count_for_tenant`; services take `tenant_id` from the authenticated user, never from the request body. Child line tables (order items, purchase items, journal lines, variants) are reached through their tenant-scoped parent.
- **Branches inside a business:** `branches` rows; users are limited to `branch_id`/`branch_ids`; the ERP sends `X-Branch-Id` and branch-aware endpoints validate it (`ActiveBranchId`). Warehouses belong to branches.
- **Per-business configuration** lives on `tenants`: currency, VAT settings (`vat_enabled`, `vat_pricing_mode`), timezone, brand color/logo, `features` / `module_activation` / `limits` (plan entitlements), `approval_rules`, `discount_settings`, credit limits.
- **Lifecycle:** new signups are `is_active=false, subscription_status="pending"` until activated in the super-admin console; businesses can be suspended/archived.
- **Tests:** several test files check cross-tenant access (`tests/test_access_control.py`, `test_billing.py`, …) and an authorization sweep runs over every write endpoint. One gap found in code review is listed in 11 (returns restock).
