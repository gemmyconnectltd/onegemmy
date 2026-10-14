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
