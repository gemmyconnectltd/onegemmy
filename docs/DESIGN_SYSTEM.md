# Pesaa design system

This is the official UI contract for `website/`, `frontend/` (ERP and desktop POS), and `super-admin/`. Mobile remains a separate project and is outside this migration. Preserve routes, module order, permissions, APIs, business logic, real data and company branding.

## Source of truth

- `design-system/tokens.json`: approved palette, neutral themes, type scale, spacing and button dimensions.
- `design-system/tokens.css`: generated variables. Run `node scripts/generate-design-tokens.mjs` after an approved token change.
- `design-system/button.ts`: one variant/size definition consumed by both existing Base UI Button wrappers. Global CSS declares it as a Tailwind source.
- `design-system/components.css`: shared visual contracts, including forms, table density, headings, website actions, focus and reduced motion.
- `scripts/sync-design-system.mjs` copies these four canonical files into each app’s checked-in `src/design-system/` build artifacts. The token generator refreshes the copies, and `--check` rejects missing/stale/edited copies. Never edit the copies directly.
- All three `src/app/globals.css` files import their local generated copies; Button wrappers and config also import within their own app. Docker builds must not depend on files outside the app build context. Do not redeclare primary tokens in page CSS.
- Existing `frontend/src/lib/appConfig.tsx` and `super-admin/src/lib/appConfig.tsx` apply theme variables. Tenant branding is restored through the existing ERP provider; it is not replaced by a forced color override.

## Colors and themes

Default primary **#16A34A**, hover **#15803D**, active **#166534**, light **#F0FDF4**, border **#BBF7D0**. Use `bg-primary`, `text-accent`, `border-border`, `bg-card`, `bg-surface`, `text-foreground`, `text-muted` and `var(--primary-*)`. Primary and accent are aliases for the same action color. Tenant colors override the same variables, including derived interaction shades.

Light: page #F8FAFC, surface #FFFFFF, muted surface #F1F5F9, text #0F172A, secondary text #64748B, border #E2E8F0. Dark neutrals are in tokens.json. Never force white surfaces in authenticated dark mode.

Green denotes success/paid/completed/approved; red error/overdue/destructive; amber pending/warning/partial payment; gray draft/disabled. Status colors and chart categories are not action themes. Logos, customer branding, product images and captured screenshots retain their original content.

## Typography and spacing

Retain **Geist**, already used by all three apps through Next font loading. It avoids another font dependency and preserves established metrics. The country-flags font only supplies regional indicator glyphs; mono is reserved for code/references.

| Role | Size | Weight |
| --- | --- | --- |
| Operational page title | 24px | 600 |
| Section heading | 18px | 600 |
| Card heading | 16px | 600 |
| Body / button | 14px | 400 / 500 |
| Form label | 13px | 500 |
| Table header / helper | 12px | 600 / 400 |

Use `pesaa-page-title`, `pesaa-section-title`, `pesaa-card-title`. Operational shell h1 headings inherit the title contract. Marketing hero typography remains responsive and larger, with the same font and palette. Spacing: 4, 8, 12, 16, 24, 32px. Avoid arbitrary page-specific sizes in new work.

## Existing components

ERP and admin retain their existing `src/components/ui/Button.tsx`, `Form.tsx`, `Drawer.tsx`, `ConfirmDialog.tsx`, `Toggle.tsx`, `PageLoader.tsx` and `TableScroll.tsx`. Admin also has `Badge.tsx`, `DataTable.tsx`, `PageHeader.tsx`, `TabStrip.tsx`, `EmptyState.tsx`. ERP uses `Table.tsx` / `TableWrap`, domain badges and the existing pagination component. Do not invent a second generic DataTable or Modal; Drawer `side="center"` and ConfirmDialog cover those interactions.

```tsx
<Button onClick={save}>Save changes</Button>
<Button variant="secondary" onClick={cancel}>Cancel</Button>
<Field label="Description" required><Input aria-label="Description" required /></Field>
<TableWrap><table>{/* existing columns and actions */}</table></TableWrap>
```

Primary/default buttons: green, white text. Secondary: neutral surface and border. Ghost: low-priority controls. Danger/destructive: red only for destructive actions. Sizes sm/default/lg = 32/40/44px, radius 8px; existing xs/icon sizes remain for compact operational tools. A section should have one clear primary action.

Public website actions use the existing `landing-button` and `landing-secondary` contracts (44px public CTA targets). Public form controls use `pesaa-control`; keep native accessible elements and existing submission behavior. Do not create duplicate React button/control implementations solely to style links.

Form controls: 40px minimum height, 8px radius, green focus, neutral border; textareas grow by content/rows. Keep native checkbox/radio sizing, date/file semantics, disabled states, required attributes and validation. Labels must identify their controls; an accessible name is required even in compact filters. Preserve existing errors and receipt handling.

## Tables and page layout

Use existing TableScroll boundaries in authenticated apps: 12px semibold header, 14px body, approximately 52px rows, 16px horizontal padding, neutral header, thin separators and subtle hover. Monetary values/quantities align right. Preserve all columns, sorting, selection, bulk actions, row links, exports and pagination. Use existing money/date utilities; never hardcode currencies.

Page layout: title/action → search and relevant filters → table → pagination. Add summary metrics only when useful. Keep horizontal overflow inside the table, never the whole page. Empty/error/loading states retain established behavior and PageLoader; do not add fake data or independent page spinners.

## Navigation, overlays and feedback

Preserve the main and second sidebars. ERP links share `frontend/src/lib/navigation.ts`. Debt and Expense Management remain independent top-level modules. Each sidebar stays predominantly white in light mode. Active rows use a full-width solid primary fill with white text, icons and indicators: no decorative border, shadow, gradient or rounded corners. Inactive rows use muted text and a very light-green hover. An expanded parent yields the solid fill to its route-active child; a collapsed parent can carry it. Use `pesaa-nav-row` with `data-active` for main, secondary and mobile sidebar rows. Horizontal tabs retain green text/underlines. Determine active state from the route so refresh is consistent. Active states use the primary token; keep existing indentation, section order, responsive drawer, POS shortcut and feature/permission gates.

Drawers retain the existing sm/md/lg/xl widths and left/right/center modes. Use consistent 16–24px interior spacing, 16px semibold titles, visible close controls, contained scrolling and accessible focus. Footer actions should be easy to reach on narrow screens. Preserve Escape/backdrop, focus and submission behavior.

Admin Badge preserves its domain tone mapping. ERP debt badges now use the same semantic token contract. Do not use the brand accent for a paid/success status. Success/warning/error notifications preserve their meanings and accessible status/alert roles.

## Responsive and accessibility

Verify at 390px, tablet and desktop. Navigation collapses under 1024px; table regions scroll. Preserve zoom, keyboard navigation, visible focus, dialog names, reduced motion and long/localized text. Neutral text colors are tested for AA normal-text contrast. The explicitly approved #16A34A/white combination is about 3.3:1 (AA for large text, below AA for normal-size text); tests record that limitation rather than claiming full AA compliance. Preserve visible keyboard focus even though active rows have no decorative outlines. Tenant colors remain user-selected; do not silently overwrite them.

## Enforcement and workflow

Each app exposes `npm run design:check`, `npm run design:test`, `npm run typecheck`, `npm run lint`, `npm run build`. Root equivalents:

```
node scripts/check-design-system.mjs
node --test scripts/design-system.test.mjs
node --test frontend/tests/*.test.cjs
```

The checker verifies generated tokens, byte-identical app build artifacts, self-contained relative source imports in all apps, literal color classes, competing action implementations, unapproved fonts, token redefinitions and additional table styling. Semantic utilities and dedicated chart colors are allowed. `design-system/legacy-baseline.json` records existing exceptions by file/rule/count; new files or increases fail. Never regenerate it just to pass. Review/reduce allowances as legacy pages are migrated. Checks are bounded static rules, not proof of visual correctness. CI runs design checks/tests, app lint/typecheck and ERP unit tests. Production builds run from isolated app-only copies with dependencies, so sibling repository files cannot accidentally satisfy missing Docker-context imports.

## Migration status and next stages

Implemented foundation: shared green/default light-dark tokens; tenant-aware ERP theme; shared button sizes/variants, form controls, table boundary density, operational h1 titles; website brand palette/actions/contact controls; admin shared page header and table headers; design guardrails and agent rules.

Remaining review: individual legacy page bodies still contain custom typography/spacing and domain badges; not every raw table uses TableScroll. Existing screenshot/image content is unchanged. The explicit legacy color inventory is not a claim those components have all been migrated. Continue module by module (Sales/Purchases/Inventory, then Accounting/Debts/Expenses, then HR/Manufacturing/Reports/Settings), replacing local patterns with existing shared components and checking behavior. Audit specialized POS separately to preserve speed and receipt layout. Do not claim unreviewed pages are fully standardized.

## Global changes

A page request does not authorize changing global tokens. For an explicitly approved global change, update tokens/components, this document, enforcement tests and representative visual checks together. Both Codex and Claude follow this same document; preserve their existing project instructions.

## Public marketing navbar and mega menus

All public website pages share `website/src/components/marketing/LandingHeader.tsx`, with `Navbar` as the existing wrapper. Product and Solutions use spacious, structured white mega dropdowns with green hover/focus states. Resources is smaller. Maintain one centralized configuration in `website/src/lib/navigation.ts`, consumed by reusable `MegaMenuItem` / `MegaMenuSection` components and the mobile accordions; never maintain separate desktop/mobile link arrays. Every destination must resolve to a real public route and existing anchor. Do not invent documentation/help routes, specialist industry capabilities, or unsupported translations.

The floating desktop mega panel has an approved 16px radius (within the requested 14–18px range); menu items, icons and buttons retain shared 8px corners. Use existing green tokens, Geist, and `landing-button` / `landing-secondary` for actions. Panels overlay content without shifting layout, remain within the content container, and scroll internally on short screens. Keep only one disclosure open, close on navigation/outside/Escape, restore focus appropriately, and support native link tabbing plus arrow/Home/End navigation. At tablet/mobile widths use the native modal drawer with a close button, scrollable accordions, focus containment and accessible persistent actions. Respect reduced motion and preserve the public navbar on every marketing route. Dashboard sidebars are a separate surface and remain unchanged.

### Dynamic mega-menu images

`MenuImagePreview` is the single shared image rail for Product and Solutions. Image metadata belongs to the same unique item ID as its link in `website/src/lib/navigation.ts`: source, meaningful alt, image kind, optional focal point and a redacted fallback. Mouse hover and link focus select the preview; leaving an item retains the last selection. Keep the previous image until the next one loads, use a fixed 8:5 image frame, and respect reduced motion. Photography uses cover with a configurable focal point; product captures use contain. No large preview images are mounted or fetched in mobile accordions. Resources stays text-based.

Marketing product imagery must use cropped, fully redacted real interface details approved for publication, never fabricated screens or unredacted full ERP views. Existing campaign photos are illustrative, not named customer endorsements. Do not substitute an unrelated industry photo when a matching one is unavailable; a properly described, relevant product view is acceptable. Both missing primary images and failed fallback images must degrade safely, ending in a branded unavailable state rather than a broken image.

`website/scripts/navigation-media.mjs` produces `src/lib/navigation-media.generated.ts` from the actual asset bytes. Build-time content hashes version the Next Image source URLs, invalidating optimized-image cache keys when source content changes. The website dev wrapper watches both public media directories and refreshes the manifest for HMR. Change source images or centralized item metadata, not dropdown components or the generated manifest. Do not mark unversioned public image paths immutable. Keep the tooling inside the website build context. Validate media existence, unique IDs, content-version invalidation, keyboard/mouse selection, fallbacks and responsive behavior.
