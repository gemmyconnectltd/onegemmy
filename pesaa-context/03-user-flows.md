# 03 — User flows (as implemented)

All endpoints are under `/api/v1`. "Clunky / incomplete" notes come from reading the code and from issues observed while testing it; they describe the current state, not opinions about the design direction.

## 1. Sign up and onboarding

| Step | Screen | Endpoint |
|---|---|---|
| 1 | `/register` step 1 "Personal information" (name, email, phone, password, gender) — `frontend/src/app/(auth)/register/page.tsx` | — |
| 2 | Step 2 "Business information" (business name, type/industry, category, employees, location, how you heard, currency/country) | — |
| 3 | Submit | `POST /auth/register` (rate-limited 5/hour/IP) — creates the `tenants` row (`is_active=false`, `subscription_status="pending"`), the owner user (`role="owner"`, `is_superuser=true`), default departments, the 55 role templates and the main branch; emails the owner "registration received" and notifies platform super-admins |
| 4 | "Pending approval — we'll email {email} once it's approved" screen | — |
| 5 | Pesaa staff activate the business in the super-admin console (Tenants) | `POST /admin/tenants/{tenant_id}/activate` |
| 6 | Owner signs in at `/login` | `POST /auth/login` → access + refresh tokens; then `GET /tenants/me/current`, `GET /tenants/users/me`, `GET /tenants/me/entitlements` |
| 7 | First visit: `ProductTour` overlay; lands on the first allowed page (`firstAllowedHref`) | — |

Clunky / incomplete:
- **Gender is collected but discarded** ("UI-only" comment in the register page).
- **No self-serve activation:** the business can't use the product until a platform admin activates it (the owner gets a "registration received" email and waits).
- No guided setup (products, VAT, branches) after first login beyond the tour; "Restore defaults" and seeding scripts exist for roles.
- If the site is visited on a mobile host it redirects to the separate mobile app (`proxy.ts`).

## 2. Create a business / branches

There is no "create another business" flow: one identity = one business. Branches: `/branches` → "New branch" drawer → `POST /tenants/branches`; staff are assigned branches in Team & Access. The Topbar `BranchSwitcher` sets `X-Branch-Id` for all later calls.

## 3. Add a product

| Step | Screen | Endpoint |
|---|---|---|
| 1 | Inventory → Products `/inventory/products` | `GET /tenants/inventory/products`, categories/brands/units, `GET /tenants/sales/vat-rate` |
| 2 | "Add Product" drawer: name, SKU/barcode, category, brand, unit, cost, selling price, stock, min stock, VAT treatment, image, variants | — |
| 3 | Save | `POST /tenants/inventory/products` (+ `POST …/{id}/variants` for each variant) |
| 4 | Later: restock / adjust | `POST /tenants/inventory/products/{id}/restock` (or `…/variants/{id}/restock`) |
| Bulk | "Import" → `CsvImportDrawer` 3 steps Upload → Review & Fix → Import (Excel/CSV, AI reading of photos/PDFs) | `POST /imports/check`, `POST /imports/extract`, `POST /tenants/inventory/products/bulk`, `POST /tenants/inventory/products/attach-sheet-pictures` |

Clunky / incomplete:
- A second, older **`/products` page uses hardcoded `mockProducts`** and saves nothing; it is not in the menu but the route still exists.
- Product settings (categories, brands, units, variants) moved under `/inventory/products/settings`; the old URLs redirect.

## 4. Make a sale (desktop POS)

| Step | Screen | Endpoint |
|---|---|---|
| 1 | `/pos` loads catalogue, categories, customers (first 500), VAT rate, discount settings | `GET /tenants/inventory/products`, `/inventory/categories`, `/sales/customers?page_size=500&status=active`, `/sales/vat-rate`, `/sales/discounts/settings` |
| 2 | Click/scan products → cart (`CartPanel`); live price check per cart change | `POST /tenants/sales/discounts/preview` (and `catalog/preview`, `POST /tenants/sales/tax/preview`) |
| 3 | Optional: pick/add customer, note, sale date, coupon/manual discount (may need approval → `POST /tenants/sales/discounts/approvals`) | `POST /tenants/sales/customers`, `PATCH …/customers/{id}` |
| 4 | `PaymentPanel`: arrangement Full / Partial / On credit; method Cash / Mobile money / Card / Split; amount received | — |
| 5 | Complete Sale (review dialog for non-simple payments) | `POST /tenants/sales/orders` (idempotent via `client_order_id`; server reprices; may return status `Awaiting Approval`) |
| 6 | Receipt: print (58/80mm/A4), download PDF, share (WhatsApp/email/device), view invoice | `GET …/orders/{id}/receipt.pdf`, `…/invoice.pdf`, `POST …/orders/{id}/invoice/email`, `GET …/orders/{id}` |
| Side | Hold sale (kept in browser memory), Quote (saves cart as quotation) | `POST /tenants/sales/quotations` |

Clunky / incomplete:
- **Payment method is also stamped into the order notes** (`"POS — cash — …"`) and parsed back for reports — fragile parallel source of truth.
- **Held sales live only in the browser tab** (lost on refresh, not shared across devices).
- Customer list is capped at 500 for the picker; products are paged client-side.
- Card and bank payments require a reference; mobile money does not (recent change).
- iPhone/iPad printing opens the server PDF (Safari can't print part of a page).
- No offline mode in the desktop POS (only the separate `mobile/` app has offline queueing).

## 5. Create an invoice

There is **no separate invoice entity**: every sale (`sales_orders`) is the invoice. Ways to create one:
- POS sale (flow 4), or Sales → Sales History `/sales/orders` → "New sale" form → `POST /tenants/sales/orders` (status Completed/Pending, optional due date for credit).
- Quotation → accepted → **Convert to sale** (`POST /tenants/sales/quotations/{id}/convert`) → a Pending sale.
- View/print/share: `SaleDocumentDrawer` (Invoice A4 or Receipt) → `GET …/orders/{id}/invoice.pdf`, `POST …/invoice/email`.
- Accounting → `/accounting/invoices` lists the same orders (first 200, client-side filters).

Clunky / incomplete:
- Quotation **"Mark as sent" does not email anything** — sharing is a separate Share/PDF action.
- A converted quotation becomes a *Pending* sale; completing it and taking payment are further steps on Sales History.
- `/accounting/invoices` loads 200 orders and filters in the browser.

## 6. Record a payment (money received after the sale)

| Where | Screen | Endpoint |
|---|---|---|
| Sales History / Accounting invoices / Customers | "Record Payment" (`components/accounting/RecordPaymentDrawer.tsx`), shown only when the sale has an outstanding balance | `POST /tenants/sales/orders/{id}/payments`; reverse: `POST /tenants/sales/payments/{payment_id}/reverse` |
| Debt Management | Receivables/Payables → record payment (`components/debts/DebtPaymentForm.tsx`) | `POST /tenants/debts/{kind}/{document_id}/payments` |
| Supplier bills | Purchases → Supplier Bills | `POST /tenants/procurement/supplier-bills/{id}/payments` |

Clunky / incomplete: three entry points for "money in" with slightly different forms; payments post to the ledger automatically, but the user has to know which screen applies to which document.

## 7. Add an employee

| Step | Screen | Endpoint |
|---|---|---|
| 1 | HR → Employees `/hr` | `GET /tenants/hr/employees`, `GET /tenants/departments` |
| 2 | "Add employee" drawer: code, first/last name, email, phone, job title, department, status, hire date, salary | `POST /tenants/hr/employees` |

Clunky / incomplete:
- **An HR employee is not a system user.** Giving someone access is a separate flow (Team & Access → invite: `POST /tenants/users`, with role, branches and an optional password the owner can set and copy). The two records are not linked (`hr_employees` has no `user_id`).
- No branch on employees; no documents, contracts or emergency contacts.

## 8. Run payroll

| Step | Screen | Endpoint |
|---|---|---|
| 1 | HR → Payroll `/hr/payroll` | `GET /tenants/hr/payroll?period=YYYY-MM` |
| 2 | Add a payroll row per employee: period, base salary, bonus, deductions | `POST /tenants/hr/payroll` — server computes `net_pay = base + bonus − deductions` |
| 3 | Mark paid | `POST /tenants/hr/payroll/{id}/paid` |

Clunky / incomplete [PARTIAL]:
- **One row at a time**; no "run payroll for everyone" batch, no payslips.
- **No statutory deductions** (PAYE, pension, etc.) and **no posting to accounting** from HR payroll.
- Accounting has its own `/accounting/payroll` workspace view [UNCLEAR how it relates to HR payroll rows].

## 9. Add a customer

| Where | Endpoint |
|---|---|
| Customers `/customers` → "Add customer" drawer (individual/business, name, phone, email, address, TIN, credit settings) | `POST /tenants/sales/customers` |
| From the POS cart ("+ New") | same endpoint; customer is selected for the sale |
| Bulk import (`CsvImportDrawer`) | `POST /tenants/sales/customers/bulk` |
| Edit / archive / status | `PATCH /tenants/sales/customers/{id}`, `POST …/{id}/status`, `DELETE …/{id}` (owners/admins) |

Clunky / incomplete: the Customers page loads 500 orders to compute figures in the browser; Segments, Loyalty and Analytics tabs show **fake data**.

## 10. Invite a team member (related)

Team & Access `/settings/users` → "Add user": name, email, phone, role, department, branches, optional password (Generate) → `POST /tenants/users`. The reply says whether the email was sent; the owner sees copyable sign-in details. Reset: `POST /tenants/users/{id}/reset-password` (set a password or email one). Per-user permissions: `/settings/users/access` (and in super-admin: Tenants → user → Permissions / Point of sale tabs).
