# Deploying the split: website · app · admin

| Site | Domain | Folder | Container port (host, localhost only) |
|---|---|---|---|
| Website | `pesaa.io` | `website/` | 3004 |
| Customer app (ERP/POS) | `app.pesaa.io` | `frontend/` | 3000 (existing container, host network) |
| Super Admin | `admin.pesaa.io` | `super-admin/` | 3005 |
| API | `api.pesaa.io` | `backend/` | unchanged |

Staging: `staging.pesaa.io` (website, 3014), `staging-app.pesaa.io` (app, existing staging container on 3002), `staging-admin.pesaa.io` (admin, 3015), `api-staging.pesaa.io` (API).
Ports already in use on the server: 3000 frontend, 3001 mobile (no longer routed), 3002 staging frontend, 8000 / 8001 APIs.
The mobile app is not part of this rollout (`deploy.sh` no longer builds it).

Files here: `deploy.sh` (proposed replacement for the server's script) and `nginx/` (ready-to-use replacements for your current site files; each says how to back up and apply it).
Each site folder has its own `Dockerfile`, `docker-compose.prod.yml` and `docker-compose.staging.yml`.
Nothing in this repo is applied automatically; every step below is run by a person on the server.

## 0. Before touching anything
1. **DNS** (A records to the VPS): `app`, `admin`, `staging-app`, `staging-admin` (the `@`, `www`, `staging` and `api*` records already exist).
2. **Backend `.env.production` and `.env.staging`**, then redeploy the backend only (`./deploy.sh backend`):
   `CORS_ORIGINS=https://pesaa.io,https://www.pesaa.io,https://app.pesaa.io,https://admin.pesaa.io` (staging: the `staging*` equivalents) and `FRONTEND_URL=https://app.pesaa.io`.
3. **Frontend build settings (server-only files, not in git).** `frontend/.env.production` must contain `NEXT_PUBLIC_APP_URL=https://app.pesaa.io`, `NEXT_PUBLIC_SITE_URL=https://pesaa.io`, `NEXT_PUBLIC_ADMIN_URL=https://admin.pesaa.io` (next to the existing `NEXT_PUBLIC_API_URL`). For staging, edit `frontend/docker-compose.staging.yml` (build args) and `frontend/Dockerfile.staging` (an `ARG` for each new variable): app `https://staging-app.pesaa.io`, site `https://staging.pesaa.io`, admin `https://staging-admin.pesaa.io`.
4. **Install the new script** (keeps a dated backup): `cd ~/apps/onegemmy && git pull origin main && cp deploy.sh deploy.sh.backup_$(date +%Y%m%d_%H%M%S) && cp deploy/deploy.sh deploy.sh && chmod +x deploy.sh`

## 1. Staging first
`./deploy.sh staging-website`, `./deploy.sh staging-admin`, then `./deploy.sh staging-app`, using `nginx/pesaa-staging` (it explains the DNS and certbot commands for the two new staging names).
Check: website loads, "Sign In" opens `staging-app`, a customer account signs in there, a customer account is **refused** on `staging-admin`, the platform admin signs in on `staging-admin`.

## 2. Production, in this order (no downtime for the marketing site)
1. `./deploy.sh admin` — a brand-new domain, nothing existing is affected. Add `nginx/pesaa-admin` (with an IP allowlist or password) and run certbot for `admin.pesaa.io`.
2. `./deploy.sh website` — starts on port 3004, still not public. Check it locally: `curl -s http://127.0.0.1:3004/ | head -c 200`
3. **Switch Nginx in one reload** using `nginx/onegemmy-frontend`: `pesaa.io` goes to 3004 (website) and `app.pesaa.io` goes to 3000 (the existing frontend container, which still serves the ERP at `/login`). Test with `sudo nginx -t`, reload, and open both sites.
4. `./deploy.sh app` — rebuilds `frontend/` from the cleaned code (the root now redirects to the dashboard/login). Anyone using the old `pesaa.io/login` is redirected by the website to `app.pesaa.io/login`.
5. Verify (below). The mobile app keeps running wherever it runs now, but its domain is no longer `app.pesaa.io`; move or retire it when you decide.

## 3. Verify
- `pesaa.io` shows the website, "Sign In"/"Get Started" open `app.pesaa.io`; `pesaa.io/login` redirects there.
- `app.pesaa.io` goes to `/login`; a normal user reaches the dashboard.
- `admin.pesaa.io/login` accepts only the platform admin; a customer account gets "This portal is for Pesaa platform administrators only".
- Contact form on the website works (needs the CORS origin above).

## Rollback
- Point the Nginx blocks back where they were (keep `.bak` copies of the files you edit) and reload.
- To go back to the old combined frontend, redeploy an earlier commit of `frontend/`.
- Database: nothing in this split changes the database.

## Keeping the separate GitHub repos in sync
`website/` and `super-admin/` live in this repo and are mirrored to `pesaa-website` and `pesaa-admin-portal`.
Edit here, commit here, then run `./mirror-repos.sh` (from the repo root, on your computer).
