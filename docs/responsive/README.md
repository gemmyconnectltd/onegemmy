# ERP responsive audit and implementation

Scope: the existing ERP and desktop POS in `frontend/`. The separately deployed `mobile/` project keeps its own screens, navigation, and offline behavior. No backend permissions, money calculations, APIs, or tenant ownership rules were changed.

## Audit and implementation sequence

1. Inventory every ERP/POS page and shared component. Review navigation, branch authorization, table boundaries, forms, overlays, fixed widths, and breakpoints.
2. Fix the shared shell and header, then permission-aware compact navigation, safe-area clearance, and support actions.
3. Replace the old branch-only dropdown with a responsive workspace selector using the existing authorized branch API.
4. Standardize overlays, touch controls, form labels, dirty-state handling, table boundaries, and pagination.
5. Apply wrapped page actions and filters across the operational modules; add workflow-specific phone cards and opt-in compact directory tables.
6. Verify the production build, source inventory, synthetic-data browser layouts, and focused interactions.

`route-audit.json` inventories 119 ERP/POS routes and 156 supporting source files. It is a static source audit, including redirect routes; it is not a claim that every business action was executed against a live database. Regenerate it with `node scripts/audit-responsive.mjs`; `--check` detects a stale inventory. No working data table remains outside a shared TableScroll/TableWrap boundary. The printable POS receipt intentionally keeps its own fixed-layout table.

## Shared improvements

- CSS controls the 1024px shell breakpoint on the first render, avoiding the previous post-hydration sidebar margin jump. Module padding and compact navigation share bottom safe-area clearance.
- The phone header contains the business/branch selector, page search, notifications entry point, and account menu. Long names truncate; theme and language actions move into the account menu. Search is functional and supports Command/Ctrl+K. Notifications link to existing support and approval workflows; no unread counts or notification feed are invented.
- Compact quick navigation prioritizes Home (where authorized), Sales, Inventory, Purchases, and More. All primary and secondary menus filter unauthorized links using the existing permission configuration. Desktop menus now use the same enabled-feature and permission filters. Page and API guards remain authoritative.
- Workspace selection uses an anchored Base UI popover on desktop and the existing Drawer as a bottom sheet on phones. Branches come from the tenant-scoped endpoint and paginate in groups of 20. Current/fixed branches, loading, retry, unchanged selections, and management permissions are handled. Switching clears branch-scoped query state and confirms unsaved edits.
- Drawer now names dialogs, contains and restores focus, handles nested scroll locks and Escape, supports bottom sheets, respects the visual viewport, and reserves footer safe-area padding. Edit controls are tracked even when they sit outside a footer's form. Cancel/close confirmation preserves input; internal links and browser unload also protect tracked edits. Successful form mutations clear their corresponding tracked state.
- Field keeps its label linked to the control even when validation text is rendered alongside it. Inputs use 16px text on phones; action targets increase to 44px without stretching switch tracks. Form grids and line editors adapt to narrow screens.
- Products, customers, and sales have dedicated phone cards with selection and existing actions. Explicit compact-record tables cover purchases, employees, contacts, campaigns, work orders, repairs, service records, and selected stock directories. Sorting/selection controls remain available. Financial reports, debt statements, permission matrices, document lines, and ledgers retain scrollable columns.
- Filter and action rows wrap across inventory, sales, CRM, services, manufacturing, purchases, HR, expenses, and related settings. Pagination and bulk action bars wrap. Supplier editing and sale line editing adapt to small screens. Phone support actions use one sheet, preserving both AI and WhatsApp access.

## Verification

See `verification.json` for recorded browser results and limitations. Browser tests use synthetic records, empty responses, and missing/unavailable-record states; they never charge a sale or modify production data.

- `node --test frontend/tests/*.test.cjs`
- `node --test scripts/design-system.test.mjs`
- `node scripts/check-design-system.mjs`
- `npx tsc --noEmit` and ESLint on changed frontend source
- `next build --webpack` in an isolated source copy
- `PLAYWRIGHT_MODULE=/path/to/playwright node frontend/tests/browser/responsive.cjs`
- Full route smoke: set `RESPONSIVE_ALL_ROUTES=1 RESPONSIVE_SMOKE_ONLY=1 RESPONSIVE_WIDTHS=320,820,1440`. Set `RESPONSIVE_BASE_URL` to the isolated local app. Chrome can be selected with `CHROME_PATH`. No browser dependency was added to the application.

## Remaining verification and product constraints

An account currently has one globally unique email and one tenant membership. The selector therefore offers the current business and its authorized branches. Cross-business membership and switching require a separate identity/backend feature; this change does not infer authorization from email or fabricate a business list.

Headless Chromium verifies layout, focus, branch-header refetching, dirty-state prompts, and permission-filtered menus. It does not replace physical iOS/Android keyboard testing, Safari/Firefox coverage, screen-reader testing, or populated live-data acceptance of every financial, stock, payroll, export, and report workflow. Report and missing-record states in the broad route sweep do not establish populated-chart or detail-flow coverage. Desktop POS's existing retry and payment logic was preserved, rather than exercised with real charges.

These changes are local until committed and deployed. No production deployment or migration is part of this work.

## Subsequent feature-visibility correction

All menu surfaces now omit disabled or unauthorized destinations, including desktop navigation, secondary links, search, POS and dashboard shortcuts. Disabled direct URLs redirect to allowed work instead of rendering a lock page. `frontend/tests/browser/feature-navigation.cjs` covers these behaviors with synthetic accounts. The earlier broad responsive smoke results in verification.json remain historical layout checks, not a re-run of every workflow after this visibility correction.
