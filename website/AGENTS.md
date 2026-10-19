<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared UI contract

Before editing UI, read `../docs/DESIGN_SYSTEM.md` and the root `../AGENTS.md`. This app follows the same mandatory design-system rules, preserves existing shared components and uses the centralized tokens. Run `npm run design:check` and relevant validation.

## Public marketing navigation

Reuse `LandingHeader` / `Navbar` on every public page. Keep the green-and-white brand, existing action classes and typography. Product and Solutions use structured mega dropdowns; Resources stays compact. `src/lib/navigation.ts` is the single source for desktop and mobile links. Reuse `MegaMenuItem` and `MegaMenuSection`, link only to real routes/anchors, and do not advertise unavailable features or translations. Preserve disclosure keyboard controls, Escape/outside dismissal, focus visibility, native modal mobile drawer, responsive accordions and reduced motion. The floating desktop mega panel uses 16px corners as the approved navbar-specific exception; item/action corners retain the existing shared radius. Do not change ERP or Super Admin navigation for marketing work.

### Shared dynamic menu imagery

Product and Solutions must share `MenuImagePreview` and the image metadata nested under each unique navigation item ID in `src/lib/navigation.ts`. Keep meaningful alt text, photo focal positions, screenshot contain behavior and an appropriate redacted fallback. Product mega-menu previews use people-focused business photography via each item’s `menuImage`; product detail heroes use that same people-focused image. Cropped interface assets remain available only for explicitly requested interface previews. Never imply illustrative campaign images are verified customer photographs. Use existing campaign photography for matching industries; use a clearly described real interface when no suitable industry photo exists. Never publish new authenticated captures without explicit approval and complete redaction. Do not add separate per-component image maps or a new CMS/media dashboard. `scripts/navigation-media.mjs` generates content-versioned URLs; prebuild refreshes them and the dev wrapper watches asset updates. Run `media:check`, `test:navigation`, lint, type checks and builds. Preserve focus-driven previews, reduced motion, image-error fallback, fixed aspect ratios and zero desktop image loading in the mobile drawer.

### Product and industry detail pages

Keep `/products/[slug]` and `/industries/[slug]` statically generated from the shared navigation entries. Use `MarketingDetailPage` and `marketing-details.ts` for tailored workflows, appropriate related products, setup caveats and approved cropped imagery. Product and industry menu entries must link to their own dedicated pages rather than unrelated overview anchors. Preserve legacy `/solutions` links for compatibility. Do not invent industry-specific clinical, reservation or regulatory capabilities.

Device campaign images use `BusinessProductImage` and `DesignedProductScreen` with feature-specific illustrated UI inside the tablet. The approved actual screenshot path in `deviceScreen` identifies the feature/reference; the current user-approved marketing treatment renders a designed preview rather than raw screen pixels. Keep screen fitting and photo positioning aligned. The website currently supports English only: show a static language indicator, never a one-option switcher or unsupported translations.

Each product needs its own feature-relevant scene and matching designed UI: POS/catalog, inventory/stock, purchases/receiving, expenses/receipts, debts/balances, customers/profiles, accounting/finance, reports/charts, services/appointments, manufacturing/production, HR/staff, branches/locations. Designed UI must be labeled illustrative and never represented as real records or a live screen.

Resources uses a compact 360px trigger-anchored dropdown with the canonical 8px radius, smaller icons and no repeated Resources heading. Preserve its existing links, keyboard navigation and mobile grouping labels. Product/Solutions retain the larger mega-panel treatment.

Industry imagery uses individual full-resolution sources (at least 1536 × 1024) with responsive Next Image sizes and quality 85. Never enlarge a photo cropped from a reference screenshot for a hero. Keep all 12 showcase industries, real detail links, centered subjects and generous headroom; preserve the Other Businesses destination.
