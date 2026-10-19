# Current product screenshots

Captured 19 October 2026 from the running local Pesaa apps using the built-in demo login. These are browser screenshots of the current interfaces, not generated mockups.

Desktop viewport: 1440 × 900, captured at 2× and optimized to 1920 × 1200 WebP. Mobile viewport: 390 × 844, captured at 2× and saved as 780 × 1688 WebP.

| Asset | App route |
| --- | --- |
| dashboard-current.webp | ERP /dashboard |
| pos-current.webp | ERP /pos |
| inventory-current.webp | ERP /inventory |
| accounting-current.webp | ERP /accounting |
| crm-current.webp | ERP /crm |
| hr-current.webp | ERP /hr |
| purchases-current.webp | ERP /procurement |
| manufacturing-current.webp | ERP /manufacturing |
| mobile-home-current.webp | Mobile / |
| mobile-pos-current.webp | Mobile /pos |
| mobile-reports-current.webp | Mobile /stats |
| mobile-transactions-current.webp | Mobile /transactions |

HR employee names and salaries are masked in the browser capture. Development indicators are hidden. All other UI and values are as rendered by the apps. The POS cart contains an unsubmitted selection; no sale, purchase, payroll or inventory mutation was submitted during capture. Accounts and financial records were not modified.

The homepage, module previews and demo tabs reference the new WebP filenames so cached legacy PNGs are not reused. Original PNG assets are retained as historical source assets and are no longer referenced by the website.

## Cropped navigation previews

The `*-menu-current.webp` assets were captured from the local demo ERP on 19 October 2026 with explicit user approval for fully redacted, cropped previews. They expose a focused interface detail, not the full ERP shell. Routes: `/pos`, `/inventory`, `/procurement`, `/expenses/list`, `/debts`, `/customers`, `/accounting`, `/reports/daily`, `/services/catalog`, `/manufacturing`, `/hr`, and `/branches`.

Every text node outside a strict allowlist of static UI labels was masked before capture. All table-body text was masked regardless of whether it resembled a generic UI label. Input/select contents, images, charts and canvas content were hidden; shell identity and navigation were excluded by the crop. Redaction was checked in the capture DOM before encoding. No authenticated HTML, tokens, raw captures or financial/customer values are included in these image assets. No business mutations were performed. Image dimensions are 1280 × 800 WebP; the actual rendered UI was cropped and redacted, not fabricated or redesigned.

Mega-menu image references live alongside their navigation items in `src/lib/navigation.ts`. `npm run media:sync` refreshes content-hashed URLs; builds do this automatically, and `npm run dev` watches the marketing/screenshot asset directories. Do not replace these crops with full unredacted screens.
