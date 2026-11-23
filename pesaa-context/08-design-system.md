# 08 — Design system

The official contract is `docs/DESIGN_SYSTEM.md`. The source of truth for values is `design-system/tokens.json`, compiled to `design-system/tokens.css` by `scripts/generate-design-tokens.mjs` and **copied** into each app (`frontend/src/design-system/`, `super-admin/src/design-system/`, `website/src/design-system/`) by `scripts/sync-design-system.mjs`. `scripts/check-design-system.mjs` (CI) rejects stale copies, new literal color classes, new fonts and token redefinitions; existing violations are frozen in `design-system/legacy-baseline.json`.

## Colors

### Brand / action (`tokens.json`)

| Token | Hex | Use |
|---|---|---|
| `primary` (= `accent`) | `#16A34A` | Primary buttons, active nav row, links, focus |
| `primaryHover` | `#15803D` | Button hover |
| `primaryActive` | `#166534` | Button pressed |
| `primaryLight` | `#F0FDF4` | Light green fills |
| `primaryBorder` | `#BBF7D0` | Light green borders |

**Tenant branding:** a business can pick its own brand color in Settings → Appearance (`brandColorPresets` in `frontend/src/lib/config.ts`: `#16A34A`, `#B45309`, `#1D4ED8`, `#059669`, `#7C3AED`, `#0E7490`, `#BE123C`, `#0F766E`, or a custom color). `AppConfigProvider` (`frontend/src/lib/appConfig.tsx`) writes it into the same `--primary*` CSS variables at runtime, so every "green" action becomes the tenant's color.

### Neutrals

| Token | Light | Dark |
|---|---|---|
| `background` (page) | `#F8FAFC` | `#0F172A` |
| `surface` (muted fill) | `#F1F5F9` | `#1E293B` |
| `card` | `#FFFFFF` | `#172033` |
| `foreground` (text) | `#0F172A` | `#F8FAFC` |
| `muted` (secondary text) | `#64748B` | `#94A3B8` |
| `border` | `#E2E8F0` | `#334155` |

### Semantic

| Token | Hex | Meaning |
|---|---|---|
| `success` | `#15803D` | paid, completed, approved |
| `warning` | `#B45309` | pending, partial, low stock |
| `error` | `#B91C1C` | overdue, failed, destructive |

Utility classes: `bg-primary`, `text-accent`, `bg-card`, `bg-surface`, `text-foreground`, `text-muted`, `border-border`; badges `pesaa-badge-success|warning|error|neutral` (`design-system/components.css`).

### Charts (`frontend/src/lib/chartColors.ts`)

Light: grid `#E8E4DE`, ticks `#B3B6B7`, tooltip text `#2B2118`, income `#10B981`, expenses `#EF4444`, profit `#16A34A`, **primary/gold `#AF9164`**, blue `#3B82F6`, gray `#6B7280`. Dark: grid `#33333B`, ticks `#A0A2AB`, income `#34D399`, expenses `#F87171`, profit `#E0785A`, primary/gold `#D8B98A`, blue `#7AA2FF`. The gold/brown values are leftovers of an earlier brand and do not follow tenant color. `globals.css` also defines unused shadcn `--chart-1..5` grayscale variables.

## Typography

- **Font:** Geist (variable, `frontend/src/app/fonts/Geist-Variable.ttf`), Geist Mono for codes/references/money in the POS. A "Twemoji Country Flags" font is prepended only to render flag emoji.
- **Public website headings:** Comfortaa (the official brand font; Light/Regular/Bold via `next/font`, token `--font-heading`). Website body text, forms and tables stay Geist. ERP and super-admin are Geist-only (enforced by the design checker).
- **Scale (tokens):** page title 24px/600 (`pesaa-page-title`), section 18px/600 (`pesaa-section-title`), card 16px/600 (`pesaa-card-title`), body/button 14px/400–500, label 13px/500, table header/helper 12px.
- **Phones (<768px):** inputs use 16px text to stop iOS zoom; buttons sm/default/lg = 28/36/40px (32/40/44px from 640px).

## Spacing, radius, shadows

- **Spacing tokens:** 4, 8, 12, 16, 24, 32px (Tailwind `1, 2, 3, 4, 6, 8`). Page padding `px-4 sm:px-8 py-4 sm:py-6` (`(erp)/layout.tsx`).
- **Radius:** base `--radius: 8px`; derived `--radius-sm` 4.8px, `md` 6.4px, `lg` 8px, `xl` 11.2px, `2xl` 14.4px. Buttons/inputs 8px; cards mostly `rounded-xl`; website mega menu 16px.
- **Shadows:** Tailwind defaults (`shadow-sm` most common); no shadow tokens.
- **Controls:** 40px min height inputs/selects; button sizes sm 32 / default 40 / lg 44 px (desktop).

## Theme config and dark mode

- Tokens: `design-system/tokens.json` → `tokens.css`; Tailwind v4 `@theme inline` mapping in each `src/app/globals.css`.
- Runtime theme: `frontend/src/lib/appConfig.tsx` (light/dark, tenant brand color, nav orientation `left | top | big`, locale, currency); same file exists in `super-admin/src/lib/appConfig.tsx`.
- **Dark mode: yes** (ERP, POS and super-admin) via a `.dark` class; printable documents use `pesaa-paper` to stay white. Website is light only [not verified].

## Official brand pack

The source of truth for the Pesaa identity is the "Pesaa Logo" brand pack (16 vector logo variants, colour palette, font sheet, social covers). Colours: green `#16A34A` and navy `#0F172A` (the values in the vector artwork; the palette sheet shows the same colours rounded to `#17A34A` / `#10172A`), mint `#E2F4E9` (light brand tint), white. Brand font: Comfortaa. Brand line on the covers: "Manage smarter. Operate efficiently. Grow confidently."

## Logo and assets

- **Website (pesaa.io):** official logo files in `website/public/branding/` with descriptive names — `pesaa-logo-horizontal.svg` (full colour, light backgrounds), `pesaa-logo-horizontal-white.svg` (green/navy backgrounds), `pesaa-group-logo-horizontal.svg` (company lockup), `pesaa-mark.svg` / `pesaa-mark-white.svg` (star mark alone), `pesaa-social-card.jpg` (1200×630 link preview). Rendered only through `website/src/components/ui/BrandLogo.tsx` (horizontal logo, fixed proportions) and `LogoMark.tsx` (star mark). Favicon and app icons (`src/app/favicon.ico`, `public/icons/`) are generated from the official star mark. Website brand tokens in `website/src/app/globals.css`: `--brand-green` (= `--primary`), `--brand-navy`, `--brand-mint`, `--brand-white`.
- **ERP, super-admin and mobile app:** the same official files are copied to each app's `public/branding/` and rendered by its own `components/ui/BrandLogo.tsx` (horizontal logo; default `auto` shows the full-colour logo in light mode and the white logo in dark mode) and `LogoMark.tsx` (white star mark on the brand-coloured tile, so it follows each business's theme colour). Used on the sign-in, registration and password pages (ERP), the ERP sign-in side panel (white logo), the ERP sidebar and phone top bar when the business has not uploaded a logo, the super-admin sidebar and login, and the mobile sign-in. A business's own uploaded logo still takes precedence in the ERP sidebar, receipts and invoices.
- App icons (all apps): generated from the official star mark — `public/icons/` (72–512px PNG, maskable-safe on white, `icon.svg`, `apple-icon.png`) and `src/app/favicon.ico`.
- Website imagery: `website/public/marketing`, `screenshots`, `verticals`, `certifications`, `flags`.
- Country flags: `frontend/public/flags/`.

## Inconsistencies found (measured in source)

| Issue | Evidence |
|---|---|
| Many raw Tailwind palette colors outside tokens | ERP: `red-*` 565 uses, `amber-*` 255, `emerald-*` 216, `blue-*` 45, `violet-*` 34, `orange-*` 18, plus sky/purple/pink/cyan/indigo. Super-admin: red 219, amber 60, emerald 58, violet 25. Several greens compete with the token green (`emerald-600 #059669`, `#10B981`, `green-*`). |
| 77 distinct hex colors in ERP source, 52 in super-admin | e.g. `#059669`, `#10B981`, `#B3B6B7`, `#2B2118`, `#AF9164`, `#E8E4DE`, `#0284C7`, `#8B5CF6`, `#D97706` |
| Arbitrary font sizes | ERP uses 20 different `text-[Npx]` sizes (`11px` ×338, `12px` ×288, `13px` ×213, `10px` ×53, `12.5px`, `10.5px`, `11.5px`, `13.5px`, `15px`, `17px`, `22px`, `26px` …); super-admin 17 sizes. The token scale has 6. |
| Mixed radii | `rounded-lg` (501) and `rounded-xl` (366) both used for cards/containers; `rounded`, `rounded-md` also common. |
| Chart palette off-brand | gold/brown (`#AF9164`, `#2B2118`, `#E8E4DE`) beside green UI; not tenant-aware. |
| Status color ad hoc | each module defines its own status badges (`StatusBadge`, `StatusPill`, `Pill`, debt badges) instead of `pesaa-badge-*`. |
| Duplicate button variants | `default`≡`primary`, `destructive`≡`danger` in `design-system/button.ts`. |
| Heading styles | dashboard h1 uses `text-xl font-bold` instead of `pesaa-page-title`; many section titles use `text-sm font-bold`. |
| Accessibility note | white on `#16A34A` ≈ 3.3:1 contrast (AA only for large text) — acknowledged in `docs/DESIGN_SYSTEM.md`. |

`docs/DESIGN_SYSTEM.md` says legacy pages are migrated module by module and "not every raw table uses TableScroll"; the counts above are the remaining debt.
