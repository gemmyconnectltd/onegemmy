# 05 — Folder structure

Trees are 3 levels deep, generated from the working copy (`node_modules`, `__pycache__`, `.next`, uploads, fonts/flags/icons folders skipped; long file lists truncated with "… (+N files)").

## Repository root

| Path | Purpose |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | Engineering and design-system rules for AI agents and contributors |
| `backend/` | FastAPI API (all apps talk to it) |
| `frontend/` | ERP web app + desktop POS (app.pesaa.io) |
| `super-admin/` | Platform admin console (admin.pesaa.io) |
| `website/` | Marketing site (pesaa.io) |
| `mobile/` | Separate offline-capable mobile web app (own `package.json`) |
| `flutter_app/` | Flutter project [UNCLEAR status] |
| `design-system/` | Canonical `tokens.json`, generated `tokens.css`, `button.ts`, `components.css`, `legacy-baseline.json` |
| `docs/` | Product/engineering notes: PRD, ERD, DESIGN_SYSTEM, ROLES, access policy, implementation notes |
| `scripts/` | `generate-design-tokens.mjs`, `sync-design-system.mjs`, `check-design-system.mjs` and tests |
| `deploy/openwa/` | Example compose override for the WhatsApp gateway |
| `.github/workflows/design-system.yml` | Frontend CI |

## Backend (`backend/`)

| Path | Purpose |
|---|---|
| `app/main.py` | App factory: middleware (request logging, error handler, CORS), static mounts (`/uploads`, `/static`), router, startup background tasks |
| `app/api_router.py` | Mounts every module router under `/api/v1`; tenant modules under `/tenants` with `require_feature` + `require_module_write` gates |
| `app/core/` | Cross-cutting: `config.py` (settings), `database.py` (engine, `Base`), `deps.py` (`DbSession`, `CurrentUser`, `SuperUser`, `ActiveBranchId`, `require_permission`, `require_feature`), `access.py` (module → resources map, write rules), `permission_policy.py` (baseline grants), `security.py` (JWT, hashing), `response.py`, `pagination.py`, `exceptions.py`, `repository.py` (`BaseRepository`), `email.py`, `brand_pdf.py`, `currency.py`, `rate_limit.py`, `logging.py`, `middleware.py` |
| `app/modules/<module>/` | One package per domain. **Layered** modules (accounting, audit, crm, currency, hr, inventory, manufacturing, procurement, repairs, reporting, sales, services, tenants) have `models/ routes/ schemas/ service/ repository/` sub-packages. **Flat** modules (admin, ai, approvals, auth, billing, discounts, imports, marketing, support, tax, traffic) use single files (`models.py`, `routes.py`, `service.py`, …). |
| `app/integrations/storage/` | Local file storage + protected uploads static handler |
| `app/shared/` | Tiny shared schemas/utils |
| `app/static/` | Bundled assets (per-industry default product images) |
| `alembic/versions/` | Migrations (every schema change) |
| `scripts/` | `seed.py` (demo data), `seed_standard_roles.py`, `grant_data_permissions.py`, `repair_role_access.py`, traffic/marketing seeders (local only), maintenance scripts |
| `tests/` | 81 pytest files (access control sweeps, sales/POS, accounting, billing, imports, …) |

Module sizes (lines of Python): accounting 9.6k · inventory 7.4k · admin 6.3k · sales 6.0k · tenants 4.9k · billing 3.3k · procurement 2.9k · marketing 2.9k · ai 2.8k · support 2.8k · discounts 2.7k · services 2.0k · hr 1.3k · crm 1.2k · traffic 1.1k · reporting 1.0k · manufacturing 0.9k · currency 0.6k · auth 0.5k · imports 0.5k · approvals 0.5k · repairs 0.4k · tax 0.4k · audit 0.3k.

```text
backend/app
├── core/
│   ├── __init__.py
│   ├── access.py
│   ├── branches.py
│   ├── brand_pdf.py
│   ├── cache.py
│   ├── config.py
│   ├── currency.py
│   ├── currency_data.py
│   ├── database.py
│   ├── deps.py
│   ├── email.py
│   ├── exceptions.py
│   ├── filenames.py
│   ├── logging.py
│   ├── middleware.py
│   ├── models.py
│   ├── pagination.py
│   ├── period.py
│   ├── permission_policy.py
│   ├── rate_limit.py
│   ├── repository.py
│   ├── response.py
│   ├── security.py
│   └── stock_context.py
├── integrations/
│   └── storage/
│       ├── __init__.py
│       ├── local.py
│       └── protected.py
├── modules/
│   ├── accounting/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── admin/
│   │   ├── data_management/
│   │   ├── __init__.py
│   │   ├── analytics.py
│   │   ├── export.py
│   │   ├── features.py
│   │   ├── lifecycle.py
│   │   ├── models.py
│   │   └── … (+6 files)
│   ├── ai/
│   │   ├── knowledge/
│   │   ├── __init__.py
│   │   ├── drafts.py
│   │   ├── knowledge.py
│   │   ├── models.py
│   │   ├── providers.py
│   │   ├── routes.py
│   │   └── … (+4 files)
│   ├── approvals/
│   │   ├── __init__.py
│   │   ├── models.py
│   │   ├── routes.py
│   │   └── service.py
│   ├── audit/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   └── service/
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── routes.py
│   │   ├── schemas.py
│   │   └── service.py
│   ├── billing/
│   │   ├── __init__.py
│   │   ├── access.py
│   │   ├── enrollment.py
│   │   ├── models.py
│   │   ├── money.py
│   │   ├── payments.py
│   │   └── … (+9 files)
│   ├── crm/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── currency/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   ├── __init__.py
│   │   └── reporting.py
│   ├── discounts/
│   │   ├── __init__.py
│   │   ├── catalog.py
│   │   ├── engine.py
│   │   ├── management.py
│   │   ├── models.py
│   │   ├── reporting.py
│   │   └── … (+5 files)
│   ├── hr/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   └── service/
│   ├── imports/
│   │   ├── __init__.py
│   │   ├── routes.py
│   │   └── service.py
│   ├── inventory/
│   │   ├── data/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── manufacturing/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── marketing/
│   │   ├── __init__.py
│   │   ├── analytics.py
│   │   ├── automations.py
│   │   ├── background.py
│   │   ├── campaigns.py
│   │   ├── contacts.py
│   │   └── … (+7 files)
│   ├── procurement/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── repairs/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── reporting/
│   │   ├── repository/
│   │   ├── routes/
│   │   └── service/
│   ├── sales/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── services/
│   │   ├── data/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   └── __init__.py
│   ├── support/
│   │   ├── __init__.py
│   │   ├── background.py
│   │   ├── deps.py
│   │   ├── email_imap.py
│   │   ├── email_inbound.py
│   │   ├── hub.py
│   │   └── … (+7 files)
│   ├── tax/
│   │   ├── engine.py
│   │   ├── report.py
│   │   └── service.py
│   ├── tenants/
│   │   ├── data/
│   │   ├── models/
│   │   ├── repository/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── service/
│   │   ├── __init__.py
│   │   └── slug.py
│   ├── traffic/
│   │   ├── __init__.py
│   │   ├── classify.py
│   │   ├── erp_service.py
│   │   ├── models.py
│   │   ├── routes.py
│   │   └── service.py
│   └── __init__.py
├── shared/
│   ├── __init__.py
│   ├── schemas.py
│   └── utils.py
├── static/
│   └── product-defaults/
│       ├── agriculture.svg
│       ├── construction.svg
│       ├── education.svg
│       ├── healthcare.svg
│       ├── hospitality.svg
│       ├── manufacturing.svg
│       └── … (+5 files)
├── __init__.py
├── api_router.py
└── main.py
```

## Frontend (`frontend/src/`)

| Path | Purpose |
|---|---|
| `app/(auth)/` | login, register (2-step signup), forgot-password, reset-password — no shell |
| `app/(erp)/` | Every ERP page inside the shell (`layout.tsx`); one folder per module |
| `app/(pos)/pos/` | Full-screen desktop POS |
| `app/api/translate/` | Next route handler used for runtime UI translation |
| `app/globals.css` | Imports generated design tokens; global utilities (`pesaa-*` classes) |
| `components/ui/` | Shared primitives (Button, Form, Drawer, ConfirmDialog, TableScroll, Pagination, PageLoader, CsvImportDrawer, …) |
| `components/dashboard/` | Shell: Sidebar, SecondSidebar, Topbar, ModuleLayout, BranchSwitcher, NavigationSearch, SupportFab |
| `components/<domain>/` | Domain components: pos, sales, inventory, accounting, debts, expenses, procurement, reports, services, users, branches, settings, billing, ai, tour, … |
| `lib/api/` | `client.ts` (fetch wrapper, tokens, refresh), one file per API area (`sales.ts`, `inventory.ts`, …), `hooks.ts` (all TanStack Query hooks) |
| `lib/` | `auth.tsx`, `appConfig.tsx` (theme/locale/currency), `navigation.ts` (menus), `config.ts`, money/date/period helpers, `orders.ts`, import engine, `pos/` print helpers |
| `design-system/` | Generated copy of `/design-system` (never edit directly) |
| `proxy.ts` | Redirects mobile hosts to the separate mobile app |
| `entities/ features/ processes/ shared/ widgets/` | Empty placeholders (only an `index.ts`) |

```text
frontend/src
├── app/
│   ├── (auth)/
│   │   ├── forgot-password/
│   │   ├── login/
│   │   ├── register/
│   │   └── reset-password/
│   ├── (erp)/
│   │   ├── accounting/
│   │   ├── approvals/
│   │   ├── branches/
│   │   ├── crm/
│   │   ├── customers/
│   │   ├── dashboard/
│   │   ├── debts/
│   │   ├── expenses/
│   │   ├── hr/
│   │   ├── inventory/
│   │   ├── manufacturing/
│   │   ├── procurement/
│   │   ├── products/
│   │   ├── profile/
│   │   ├── repairs/
│   │   ├── reports/
│   │   ├── sales/
│   │   ├── services/
│   │   ├── settings/
│   │   ├── support/
│   │   ├── layout.tsx
│   │   └── loading.tsx
│   ├── (pos)/
│   │   ├── pos/
│   │   ├── layout.tsx
│   │   └── loading.tsx
│   ├── api/
│   │   └── translate/
│   ├── manifest.json/
│   │   └── route.ts
│   ├── error.tsx
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── not-found.tsx
│   ├── page.tsx
│   └── providers.tsx
├── components/
│   ├── accounting/
│   │   ├── AccountManagement.tsx
│   │   ├── AccountingChart.tsx
│   │   ├── CashBalanceWarning.tsx
│   │   ├── FinancialOperations.tsx
│   │   ├── FinancialReports.tsx
│   │   ├── FinancialShared.tsx
│   │   └── … (+7 files)
│   ├── ai/
│   │   ├── AiActionCard.tsx
│   │   ├── AiBlocks.tsx
│   │   ├── AiComposer.tsx
│   │   ├── AiHistory.tsx
│   │   ├── AiMessage.tsx
│   │   ├── AiWelcome.tsx
│   │   └── … (+1 files)
│   ├── auth/
│   │   ├── AuthBrandingPanel.tsx
│   │   ├── CountrySelect.tsx
│   │   ├── ModuleAvailabilityGuard.tsx
│   │   └── PermissionGuard.tsx
│   ├── billing/
│   │   ├── BillingShared.tsx
│   │   └── TenantBilling.tsx
│   ├── branches/
│   │   ├── BranchActivityTab.tsx
│   │   ├── BranchForm.tsx
│   │   ├── BranchInventoryTab.tsx
│   │   ├── BranchOverviewTab.tsx
│   │   ├── BranchSalesTab.tsx
│   │   ├── BranchSettingsTab.tsx
│   │   └── … (+2 files)
│   ├── charts/
│   │   ├── BreakdownCard.tsx
│   │   └── lazy.tsx
│   ├── currency/
│   │   ├── DocMoney.tsx
│   │   └── ExchangeRatesPanel.tsx
│   ├── customers/
│   │   ├── CustomerActionsMenu.tsx
│   │   └── CustomerProfile.tsx
│   ├── dashboard/
│   │   ├── ActivityTracker.tsx
│   │   ├── BranchSwitcher.tsx
│   │   ├── FeatureLink.tsx
│   │   ├── ModuleLayout.tsx
│   │   ├── NavigationSearch.tsx
│   │   ├── SecondSidebar.tsx
│   │   └── … (+4 files)
│   ├── debts/
│   │   ├── DebtActionDialog.tsx
│   │   ├── DebtDetails.tsx
│   │   ├── DebtDrawer.tsx
│   │   ├── DebtPaymentForm.tsx
│   │   ├── DebtShared.tsx
│   │   ├── DebtStatement.tsx
│   │   └── … (+8 files)
│   ├── discounts/
│   │   ├── Workspace.tsx
│   │   └── shared.tsx
│   ├── expenses/
│   │   ├── ExpenseCategories.tsx
│   │   ├── ExpenseDetails.tsx
│   │   ├── ExpenseEditor.tsx
│   │   ├── ExpenseList.tsx
│   │   ├── ExpenseOverview.tsx
│   │   ├── ExpenseRules.tsx
│   │   └── … (+1 files)
│   ├── hr/
│   │   └── State.tsx
│   ├── inventory/
│   │   ├── BatchesManager.tsx
│   │   ├── BrandsManager.tsx
│   │   ├── CategoriesManager.tsx
│   │   ├── CountDrawers.tsx
│   │   ├── ImportPicturesDrawer.tsx
│   │   ├── ImportTemplatesModal.tsx
│   │   └── … (+15 files)
│   ├── mobile/
│   │   ├── BottomNav.tsx
│   │   ├── MobilePosProvider.tsx
│   │   ├── PageHeader.tsx
│   │   ├── PeriodSelector.tsx
│   │   └── Toggle.tsx
│   ├── pos/
│   │   ├── BarcodeScanner.tsx
│   │   ├── BarcodeStripe.tsx
│   │   ├── BusinessPicker.tsx
│   │   ├── CartPanel.tsx
│   │   ├── ConfirmSaleDialog.tsx
│   │   ├── HeldSalesDrawer.tsx
│   │   └── … (+14 files)
│   ├── procurement/
│   │   ├── PurchaseDetails.tsx
│   │   ├── PurchaseDocuments.tsx
│   │   ├── PurchaseEditor.tsx
│   │   ├── PurchaseShared.tsx
│   │   └── ReceivePurchase.tsx
│   ├── reports/
│   │   ├── FinancialSummary.tsx
│   │   ├── OperationsReport.tsx
│   │   ├── PerformanceOverview.tsx
│   │   ├── ReportFilterBar.tsx
│   │   ├── SalesProfitability.tsx
│   │   ├── SalespeopleReport.tsx
│   │   └── … (+1 files)
│   ├── sales/
│   │   ├── ChangeSalespersonDialog.tsx
│   │   ├── PendingSales.tsx
│   │   ├── QuotationDetails.tsx
│   │   ├── QuotationEditor.tsx
│   │   ├── SaleDocumentDrawer.tsx
│   │   └── ShareInvoice.tsx
│   ├── services/
│   │   ├── ImportServiceTemplatesModal.tsx
│   │   ├── NewAppointmentDrawer.tsx
│   │   └── NewWalkInDrawer.tsx
│   ├── settings/
│   │   ├── FinancialSettings.tsx
│   │   ├── SettingsShell.tsx
│   │   └── parts.tsx
│   ├── support/
│   │   └── ticketStatus.ts
│   ├── tour/
│   │   └── ProductTour.tsx
│   ├── ui/
│   │   ├── BulkActionBar.tsx
│   │   ├── Button.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── CsvImportDrawer.tsx
│   │   ├── Drawer.tsx
│   │   ├── ExportButton.tsx
│   │   └── … (+16 files)
│   └── users/
│       ├── AccessParts.tsx
│       └── ProfileDetails.tsx
├── design-system/
│   ├── button.ts
│   ├── components.css
│   ├── tokens.css
│   └── tokens.json
├── entities/
│   └── index.ts
├── features/
│   └── index.ts
├── lib/
│   ├── api/
│   │   ├── access.ts
│   │   ├── accounting.ts
│   │   ├── admin.ts
│   │   ├── ai.ts
│   │   ├── approvals.ts
│   │   ├── auth.ts
│   │   └── … (+33 files)
│   ├── pos/
│   │   ├── printPdf.ts
│   │   └── printReceipt.ts
│   ├── accessView.ts
│   ├── api.ts
│   ├── appConfig.tsx
│   ├── auth.tsx
│   ├── baseMoney.ts
│   ├── branchView.ts
│   ├── can.ts
│   ├── chartColors.ts
│   ├── config.ts
│   ├── date.ts
│   ├── debts.ts
│   ├── exportTable.ts
│   ├── importEngine.ts
│   ├── importValues.ts
│   ├── invoices.ts
│   ├── links.ts
│   ├── mobileHost.ts
│   ├── mobileSettings.ts
│   ├── moduleAvailability.ts
│   ├── money.ts
│   ├── moneyInput.ts
│   ├── navigation.ts
│   ├── orders.ts
│   ├── pageTitles.ts
│   ├── period.ts
│   ├── purchaseAmounts.ts
│   ├── purchases.ts
│   ├── reportFilters.ts
│   ├── roles.ts
│   ├── saleDocument.ts
│   ├── sessionAccess.ts
│   ├── sidebarNavigation.ts
│   ├── stockMovements.ts
│   ├── support.ts
│   ├── unsavedChanges.ts
│   ├── useBulkSelection.ts
│   ├── useDebouncedValue.ts
│   ├── useMediaQuery.ts
│   ├── useWorkInBranch.ts
│   └── utils.ts
├── processes/
│   └── index.ts
├── shared/
│   └── index.ts
├── types/
│   └── index.ts
├── widgets/
│   └── index.ts
└── proxy.ts
```

## Super-admin (`super-admin/src/`)

```text
super-admin/src
├── app/
│   ├── (portal)/
│   │   ├── (billing)/
│   │   ├── (traffic)/
│   │   ├── audience/
│   │   ├── data-management/
│   │   ├── features/
│   │   ├── marketing/
│   │   ├── settings/
│   │   ├── support/
│   │   ├── tenants/
│   │   ├── usage/
│   │   ├── users/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── login/
│   │   └── page.tsx
│   ├── error.tsx
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   ├── not-found.tsx
│   └── providers.tsx
├── components/
│   ├── admin/
│   │   ├── AiSettings.tsx
│   │   ├── AiUsagePanel.tsx
│   │   ├── CountriesAnalytics.tsx
│   │   ├── DataManagementSettings.tsx
│   │   ├── GeographicMap.tsx
│   │   ├── GeographicSummary.tsx
│   │   └── … (+3 files)
│   ├── billing/
│   │   ├── BillingShared.tsx
│   │   ├── LiveBilling.tsx
│   │   ├── SubNav.tsx
│   │   └── ui.tsx
│   ├── business/
│   │   ├── BusinessShell.tsx
│   │   ├── ControlCenter.tsx
│   │   ├── DiscountsPanel.tsx
│   │   ├── LocationsPanel.tsx
│   │   └── ProfileTab.tsx
│   ├── charts/
│   │   ├── BrandMark.tsx
│   │   ├── BreakdownCard.tsx
│   │   ├── TrafficCharts.tsx
│   │   ├── lazy.tsx
│   │   └── lazyTraffic.tsx
│   ├── currency/
│   │   └── ExchangeRatesPanel.tsx
│   ├── data-management/
│   │   ├── ApproveRunDialog.tsx
│   │   ├── BusinessDirectory.tsx
│   │   ├── BusinessPicker.tsx
│   │   ├── BusinessRequestQueue.tsx
│   │   ├── CloseWizard.tsx
│   │   ├── DataManagementHome.tsx
│   │   └── … (+13 files)
│   ├── marketing/
│   │   ├── AudienceFilters.tsx
│   │   ├── CampaignResults.tsx
│   │   ├── CampaignWizard.tsx
│   │   ├── ContactDrawer.tsx
│   │   ├── EmailBuilder.tsx
│   │   ├── ImportDrawer.tsx
│   │   └── … (+1 files)
│   ├── shell/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── nav.ts
│   ├── support/
│   │   ├── ConversationList.tsx
│   │   ├── ConversationThread.tsx
│   │   ├── CustomerPanel.tsx
│   │   ├── OutreachDrawer.tsx
│   │   ├── Toasts.tsx
│   │   └── parts.tsx
│   ├── tenants/
│   │   ├── ActionMenu.tsx
│   │   ├── ContactBadge.tsx
│   │   └── StatusBadge.tsx
│   ├── traffic/
│   │   ├── shared.tsx
│   │   └── usePeriod.tsx
│   ├── ui/
│   │   ├── Badge.tsx
│   │   ├── BulkActionBar.tsx
│   │   ├── Button.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── DataTable.tsx
│   │   ├── Drawer.tsx
│   │   └── … (+10 files)
│   └── usage/
│       └── UsageShared.tsx
├── design-system/
│   ├── button.ts
│   ├── components.css
│   ├── tokens.css
│   └── tokens.json
└── lib/
    ├── api/
    │   ├── admin.ts
    │   ├── ai.ts
    │   ├── auth.ts
    │   ├── billing.ts
    │   ├── client.ts
    │   ├── currency.ts
    │   └── … (+7 files)
    ├── billing/
    │   ├── logic.ts
    │   ├── modules.ts
    │   ├── money.ts
    │   └── types.ts
    ├── marketing/
    │   └── hooks.ts
    ├── support/
    │   ├── hooks.ts
    │   └── stream.ts
    ├── adminAnalytics.ts
    ├── api.ts
    ├── appConfig.tsx
    ├── auth.tsx
    ├── chartColors.ts
    ├── config.ts
    ├── countries.ts
    ├── date.ts
    ├── money.ts
    ├── pageTitles.ts
    ├── useBulkSelection.ts
    └── utils.ts
```

## Where to put new code (existing conventions)

**Backend — a new endpoint in an existing layered module (e.g. sales):**

1. Model: `app/modules/sales/models/<entity>.py` — inherit `UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base`; add `(tenant_id, …)` indexes in `__table_args__`; export in `models/__init__.py`.
2. Migration: `cd backend && alembic revision --autogenerate -m "..."`, review, commit with the model.
3. Schemas: `schemas/<entity>.py` — `XCreate`, `XUpdate` (all optional), `XRead` (`from_attributes=True`); export in `schemas/__init__.py`.
4. Repository: `repository/<entity>.py` — subclass `BaseRepository[X]` with `get_by_id_for_tenant`, `list_for_tenant`, `count_for_tenant`.
5. Service: `service/<entity>.py` — async functions taking `(db, tenant_id, …)`, raising `NotFoundError`/`ValidationError`, committing; export in `service/__init__.py`.
6. Route: `routes/<entity>.py` — `APIRouter(tags=["Sales - X"])`, thin handlers using `DbSession`, `CurrentUser`, `PageQuery`; return `success_response` / `paginated_response`; include it in `routes/__init__.py`. The module router is already gated in `app/api_router.py`. Sensitive actions: add `dependencies=[Depends(require_permission("resource:action"))]` or an `EXACT` rule in `app/core/access.py`.
7. Tests: `backend/tests/test_<feature>.py`; `tests/test_authz_sweep.py` will fail if a write endpoint is reachable without permission.

**New backend module:** create the package, then mount it in `app/api_router.py` with `require_feature("<module>")` and `require_module_write("<module>")`, and add the module → resources entry in `MODULE_RESOURCES` (`app/core/access.py`) and its mirror in `frontend/src/lib/auth.tsx`.

**Frontend — a new ERP page:**

1. API function in `src/lib/api/<area>.ts` (on the `xApi` object) + types.
2. Hook in `src/lib/api/hooks.ts`: queries via `useQ([...KEY, …], () => xApi.fn(), r => r.data)`, mutations via `mutation(fn, [[...KEY]])`.
3. Page: `src/app/(erp)/<module>/<page>/page.tsx` (`"use client"`), layout: title/action → filters → `TableScroll` table or `TableState` → `Pagination`. Forms in a `Drawer`.
4. Domain components in `src/components/<module>/`; shared primitives only from `src/components/ui/`.
5. Menu entry in `src/lib/navigation.ts` (`MODULE_NAV` or `PRIMARY_NAV_GROUPS`) with `requires`/`feature`; page title in `src/lib/pageTitles.ts`.
6. Run `npm run design:check`, `npm run typecheck`, `npm run lint`, `node --test tests/*.test.cjs`.

**Super-admin:** same pattern under `super-admin/src/app/(portal)/…`, API in `super-admin/src/lib/api/admin.ts`, hooks in `super-admin/src/lib/api/hooks.ts`, menu in `super-admin/src/components/shell/nav.ts`.
