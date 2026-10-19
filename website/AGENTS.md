<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared UI contract

Before editing UI, read `../docs/DESIGN_SYSTEM.md` and the root `../AGENTS.md`. This app follows the same mandatory design-system rules, preserves existing shared components and uses the centralized tokens. Run `npm run design:check` and relevant validation.

## Public marketing navigation

Reuse `LandingHeader` / `Navbar` on every public page. Keep the green-and-white brand, existing action classes and typography. Product and Solutions use structured mega dropdowns; Resources stays compact. `src/lib/navigation.ts` is the single source for desktop and mobile links. Reuse `MegaMenuItem` and `MegaMenuSection`, link only to real routes/anchors, and do not advertise unavailable features or translations. Preserve disclosure keyboard controls, Escape/outside dismissal, focus visibility, native modal mobile drawer, responsive accordions and reduced motion. The floating desktop mega panel uses 16px corners as the approved navbar-specific exception; item/action corners retain the existing shared radius. Do not change ERP or Super Admin navigation for marketing work.

### Shared dynamic menu imagery

Product and Solutions must share `MenuImagePreview` and the image metadata nested under each unique navigation item ID in `src/lib/navigation.ts`. Keep meaningful alt text, photo focal positions, screenshot contain behavior and an appropriate redacted fallback. Product previews are cropped, fully redacted interface details, not full product screens or invented UI. Use existing campaign photography for matching industries; use a clearly described real interface when no suitable industry photo exists. Never publish new authenticated captures without explicit approval and complete redaction. Do not add separate per-component image maps or a new CMS/media dashboard. `scripts/navigation-media.mjs` generates content-versioned URLs; prebuild refreshes them and the dev wrapper watches asset updates. Run `media:check`, `test:navigation`, lint, type checks and builds. Preserve focus-driven previews, reduced motion, image-error fallback, fixed aspect ratios and zero desktop image loading in the mobile drawer.

### Product and industry detail pages

Keep `/products/[slug]` and `/industries/[slug]` statically generated from the shared navigation entries. Use `MarketingDetailPage` and `marketing-details.ts` for tailored workflows, appropriate related products, setup caveats and approved cropped imagery. Product and industry menu entries must link to their own dedicated pages rather than unrelated overview anchors. Preserve legacy `/solutions` links for compatibility. Do not invent industry-specific clinical, reservation or regulatory capabilities.
