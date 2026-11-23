# Pesaa website (pesaa.io)

The public marketing site. A self-contained Next.js project: its own `package.json`, build and deployment.
It has **no sign-in, no ERP code and no shared packages**; the customer app (`../frontend`, app.pesaa.io) and
Super Admin (`../super-admin`, admin.pesaa.io) are separate projects.

```bash
cp .env.example .env.local   # then adjust the three URLs
npm install
npm run dev                  # http://localhost:3002
npm run build && npm start
```

- "Sign In" / "Get Started" use `NEXT_PUBLIC_APP_URL` (see `src/lib/site.ts`); `/login`, `/register`, `/dashboard`
  on this domain redirect to the app (see `next.config.ts`).
- Backend use is limited to the public `POST /global/contact` and `GET /global/platform-stats`
  (`NEXT_PUBLIC_API_URL`; the backend CORS list must include this site's origin).
- `NEXT_PUBLIC_*` values are fixed at build time.

## Branding

The site follows the official Pesaa brand pack (see `../docs/DESIGN_SYSTEM.md` → "Official brand pack").

- **Logos:** `public/branding/` — `pesaa-logo-horizontal.svg` (light backgrounds), `pesaa-logo-horizontal-white.svg`
  (green/navy backgrounds), `pesaa-group-logo-horizontal.svg`, `pesaa-mark.svg`, `pesaa-mark-white.svg`. Always render
  them with `BrandLogo` (horizontal logo) or `LogoMark` (star mark) from `src/components/ui/`, which keep the official
  proportions. Never redraw, recolour or stretch the logo.
- **Colours:** green `--primary` (#16A34A), `--brand-navy` (#0F172A), `--brand-mint` (#E2F4E9), white — defined in
  `src/app/globals.css`. Use the tokens, not hex values.
- **Type:** Comfortaa for headings (`h1`–`h3`, `.font-heading`), Geist for body text, forms and tables.
- **Icons and sharing:** favicon and app icons are generated from the official star mark; links share
  `public/branding/pesaa-social-card.jpg`.
- To update the brand, replace the files in `public/branding/` (keeping their names) and adjust the ratio in
  `BrandLogo.tsx` if a logo's proportions change.
