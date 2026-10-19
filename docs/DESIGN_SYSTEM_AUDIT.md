# Design-system implementation audit — 2026-10-19

Scope: website, ERP/desktop POS frontend and super-admin. No backend, database or API changes were made for this standardization.

## Inspection

All three apps use Next.js 16, React 19, Tailwind 4, lucide icons and Geist. ERP/admin already use Base UI buttons, TanStack Query, native form wrappers, Drawer/ConfirmDialog and TableScroll. Admin has an additional DataTable helper and Badge; the website uses shared landing action classes and native links. Existing problems included independent green/warm-neutral defaults, inconsistent button heights, local brand hex values, table density and title sizes.

## Implemented

- One token source and generated CSS, imported by all three apps.
- One shared Button variant configuration, consumed by the two existing Base UI wrappers.
- Shared form visuals, label/control associations and helper descriptions; website contact controls use the same visual contract.
- Shared table boundary density, typography and hover; operational heading hierarchy, drawer titles/close controls and selected semantic badges.
- Website palette migration for its home, marketing pages, header/footer, product showcase and CTAs, preserving images and content.
- Existing tenant branding and dark mode retained. Green (#16A34A) is the fallback/default; previously saved tenant colors still override it.
- Root and nested Codex/Claude instructions point to DESIGN_SYSTEM.md.
- Design checks, tests, per-app scripts and a three-app CI workflow.

## Verification

- `design:check`: passed; generated tokens are current, imports shared and no new tracked style violations.
- Design-system tests: 8 passed, including the explicit green token contract, contrast limits, shared solid sidebar rows and rejection of competing blue link actions.
- Existing frontend unit tests: 10 passed (18 tests total).
- Type checks and production builds: passed for all three apps.
- Full lint: no errors; website/admin clean, ERP has 42 existing warnings.
- Browser: four website routes at desktop/mobile, 15 representative ERP routes, operational 24px title and 40px primary action, existing tenant branding, browser-only alternate-color preview, admin login and an authenticated admin fixture at desktop/mobile, its drawer and dark mode.
- Admin data was isolated in intercepted browser fixtures; no financial/business writes were made. These checks validate layout, not backend authorization or financial behavior.
- `git diff --check`: passed.

## Remaining stages

This is the global foundation migration, not a complete rewrite of every page. Some legacy page typography/spacing, domain-specific badges and raw tables still require individual review. The baseline records the remaining literal-color/table-style exceptions and prevents their count from increasing; it does not certify all existing visual patterns. Existing images/screenshots retain their original colors.

Continue with Sales/Purchases/Inventory, Accounting/Debts/Expenses, then HR/Manufacturing/Reports/Settings. Reuse existing shared wrappers while preserving filtering, sorting, pagination, permissions, exports and row actions. Audit specialized POS controls separately. Each stage must reduce the baseline when applicable and record its functional/responsive verification.

## Green theme and active-sidebar update

The approved default is now #16A34A, hover #15803D, light #F0FDF4. Main and secondary ERP/admin navigation shares `pesaa-nav-row` with route-derived `data-active`. A selected row fills the navigation width, with white text/icons, square corners, no decorative border, gradient or shadow. Expanded parents yield the solid fill to the active child. Mobile menus reuse the same row contract; horizontal tabs keep green underlines.

Final validation passed: lint, type checks and production builds for frontend, super-admin and website (which shares the central tokens); 18 tests; design guardrails; desktop/mobile browser checks of row fill, text/icon colors, one visible active row, parent expansion/collapse, collapsed icons, refresh and secondary navigation. Admin API data and the green ERP branding preview were mocked only in the isolated test browser. Existing ERP business records were read normally. No business writes were made by those tests.

The current ERP tenant has saved #2563EB branding. The default-theme change does not overwrite this stored company setting; a browser-only green preview was used to verify the default design. Tenant-specific branding remains supported. The prescribed green/white combination has approximately 3.3:1 contrast; it is not claimed to meet AA for normal-size text.
