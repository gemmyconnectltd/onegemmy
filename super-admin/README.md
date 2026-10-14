# Pesaa Super Admin (admin.pesaa.io)

Internal platform administration: tenants, users, plans, usage, AI and currency settings. A self-contained
Next.js project with its own `package.json`, build, sign-in and deployment. It shares **no code** with the
customer app (`../frontend`) or the website (`../website`), and ships none of the ERP, POS or AI-chat screens.

```bash
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3003
npm run build && npm start
```

## Access control

- Only platform super admins can hold a session here: after sign-in the account must be `is_superuser`,
  have **no tenant**, and role `superadmin` (the same rule as the backend's `get_current_active_superuser`).
  A customer or tenant-owner account is refused and its tokens are never stored.
- Every page sits behind `app/(portal)/layout.tsx`, which redirects to `/login` unless that check passes.
  This only keeps the UI honest: the real protection is the backend, which re-checks every `/admin/*` request.
- Tokens live on this origin only (separate from `app.pesaa.io`), "Keep me signed in" off by default.
- Security headers and `noindex` are set in `next.config.ts`.

## Backend requirements

- `CORS_ORIGINS` must include this site's origin (e.g. `https://admin.pesaa.io`).
