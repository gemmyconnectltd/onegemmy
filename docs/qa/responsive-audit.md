# Pesaa responsive audit — in progress

Scope: authenticated ERP, desktop POS, Super Admin, and route discovery of the separate mobile app. Marketing pages are excluded.

## Verification status

- Frontend TypeScript: passed after the latest page/POS changes.
- ESLint for changed application files: zero errors, 18 warnings (unused imports, hook dependencies, and an existing image warning).
- Local demo business login and dashboard rendering: verified in Chrome.
- Full viewport/page retest: **not completed**. Shared table and navigation edits disappeared during concurrent workspace changes. Do not treat this report as full responsive sign-off.
- No sales, payments, stock mutations, or deletions were performed during browser QA.

## Findings requiring verification or restoration

- ERP and Admin topbar navigation buttons currently receive no-op callbacks.
- Shared table scroll wrapper exists but its application to 63 tables disappeared. Table hints and keyboard scrolling are therefore not verified in the current workspace.
- Table columns hidden by breakpoint classes need inspection to ensure all information stays accessible.
- Topbar business, branch, AI, breadcrumb and search controls compete for space at tablet widths.
- Admin collapsed sidebar reads localStorage in its render initializer, risking hydration mismatch.
- Module layout flex children and horizontal nav need minimum-width constraints.
- Pagination summaries, bulk actions and form controls need wrapping on narrow screens.
- Drawer content needs dynamic viewport height and minimum-height constraints.

## Changes still present at last verification

- Desktop POS uses dynamic viewport height, a scrollable stacked layout below desktop, and separate product/cart space.
- POS header wraps and keeps large session totals for wide screens.
- Product/variant form grids become single-column on narrow screens.
- Application page headers/toolbars wrap; narrow field rows stack.
- Scoped table numeric/vertical-alignment CSS exists, but depends on missing wrapper adoption.

## Discovered routes

Frontend authenticated pages: 79. Separate mobile pages: 31. Frontend table instances: 63.

| Surface | Route | Table instances |
| --- | --- | --- |
| admin | `/admin` | 0 |
| admin | `/admin/plans` | 1 |
| admin | `/admin/settings` | 0 |
| admin | `/admin/tenants` | 1 |
| admin | `/admin/tenants/[id]` | 1 |
| admin | `/admin/usage` | 2 |
| admin | `/admin/users` | 1 |
| erp | `/accounting` | 1 |
| erp | `/accounting/accounts` | 1 |
| erp | `/accounting/expenses` | 1 |
| erp | `/accounting/income` | 1 |
| erp | `/accounting/invoices` | 1 |
| erp | `/accounting/reports` | 3 |
| erp | `/branches` | 1 |
| erp | `/branches/[id]` | 0 |
| erp | `/crm` | 0 |
| erp | `/crm/campaigns` | 1 |
| erp | `/crm/contacts` | 1 |
| erp | `/crm/emails` | 1 |
| erp | `/customers` | 2 |
| erp | `/customers/analytics` | 0 |
| erp | `/customers/loyalty` | 1 |
| erp | `/customers/segments` | 1 |
| erp | `/dashboard` | 1 |
| erp | `/expenses` | 1 |
| erp | `/hr` | 1 |
| erp | `/hr/attendance` | 1 |
| erp | `/hr/departments` | 0 |
| erp | `/hr/leave` | 1 |
| erp | `/hr/payroll` | 1 |
| erp | `/hr/recruiting` | 1 |
| erp | `/inventory` | 1 |
| erp | `/inventory/batches` | 1 |
| erp | `/inventory/brands` | 0 |
| erp | `/inventory/categories` | 0 |
| erp | `/inventory/products` | 1 |
| erp | `/inventory/serials` | 1 |
| erp | `/inventory/suppliers` | 0 |
| erp | `/inventory/transfers` | 0 |
| erp | `/inventory/units` | 0 |
| erp | `/inventory/variants` | 1 |
| erp | `/inventory/warranty` | 1 |
| erp | `/manufacturing` | 1 |
| erp | `/manufacturing/analytics` | 0 |
| erp | `/manufacturing/bom` | 1 |
| erp | `/manufacturing/materials` | 1 |
| erp | `/manufacturing/work-orders` | 1 |
| erp | `/procurement` | 0 |
| erp | `/procurement/orders` | 1 |
| erp | `/procurement/requests` | 1 |
| erp | `/procurement/returns` | 1 |
| erp | `/procurement/suppliers` | 0 |
| erp | `/products` | 1 |
| erp | `/repairs` | 1 |
| erp | `/reports` | 1 |
| erp | `/reports/accounting` | 0 |
| erp | `/reports/customers` | 1 |
| erp | `/reports/inventory` | 1 |
| erp | `/reports/sales` | 1 |
| erp | `/sales` | 1 |
| erp | `/sales/analytics` | 0 |
| erp | `/sales/orders` | 1 |
| erp | `/sales/returns` | 1 |
| erp | `/sales/targets` | 0 |
| erp | `/services` | 0 |
| erp | `/services/appointments` | 1 |
| erp | `/services/calendar` | 0 |
| erp | `/services/catalog` | 1 |
| erp | `/services/staff-commissions` | 1 |
| erp | `/services/walk-ins` | 0 |
| erp | `/settings` | 0 |
| erp | `/settings/appearance` | 0 |
| erp | `/settings/branches` | 0 |
| erp | `/settings/branches/[id]` | 0 |
| erp | `/settings/notifications` | 0 |
| erp | `/settings/profile` | 0 |
| erp | `/settings/security` | 0 |
| erp | `/settings/users` | 1 |
| pos | `/pos` | 0 |

## Separate mobile routes

- `/account/employees`
- `/account/notifications`
- `/account`
- `/account/payments`
- `/account/printer`
- `/account/profile`
- `/account/roles`
- `/account/support`
- `/account/taxes`
- `/settings`
- `/login`
- `/inventory`
- `/products/new`
- `/purchase/new`
- `/restock`
- `/expenses/new`
- `/expenses`
- `/customers/new`
- `/customers`
- `/suppliers/new`
- `/suppliers`
- `/stats`
- `/sales/[id]`
- `/sales`
- `/cart`
- `/held`
- `/payment`
- `/pos`
- `/receipt`
- `/transactions`
- `/`

## Required viewport regression matrix

Test 375×812, 390×844, 768×1024, 1024×768, 1280×800, and 1440×900. Each implemented route must be rendered with appropriate role access; detail routes need real demo IDs. Verify document width does not exceed viewport width, table scroll reaches row actions, filters and pagination work, dialogs remain scrollable with reachable buttons, and charts resize without clipping. Test long country/customer/product names, multi-currency amounts and many columns. Test POS add/remove/quantity and open payment UI without submitting a charge. No backend changes are needed for this responsive audit.

## Table scrolling follow-up

The shared TableScroll is now connected to every one of the 63 table instances across 59 source files. Customer segments previously placed its table directly in an overflow-hidden card; it now has a local scrolling region. ERP and Admin content flex items use min-w-0. The table container uses inline-size containment so its intrinsic table width cannot expand grid/flex ancestors. Overflow hints and keyboard focus appear only when the table is wider than its viewport. TypeScript passes; changed-file ESLint has zero errors (42 warnings). Customer segments returns HTTP 200. Actual pointer/keyboard scrolling across the viewport matrix is still pending; HTTP status does not verify browser interaction.
