# Deploying the split: website · app · admin

| Site | Domain | Folder | Container port (host, localhost only) |
|---|---|---|---|
| Website | `pesaa.io` | `website/` | 3002 |
| Customer app (ERP/POS) | `app.pesaa.io` | `frontend/` | its existing port |
| Super Admin | `admin.pesaa.io` | `super-admin/` | 3003 |
| API | `api.pesaa.io` | `backend/` | unchanged |

Staging: `staging.pesaa.io` (website, 3012), `staging-app.pesaa.io` (app), `staging-admin.pesaa.io` (admin, 3013), `api-staging.pesaa.io` (API).
The mobile app is not part of this rollout (`deploy.sh` no longer builds it).

Files here: `deploy.sh` (proposed replacement for the server's script), `nginx/sites.conf.example` (examples only).
Each site folder has its own `Dockerfile`, `docker-compose.prod.yml` and `docker-compose.staging.yml`.
Nothing in this repo is applied automatically; every step below is run by a person on the server.

## 0. Before touching anything
1. **DNS** (A records to the VPS): `app`, `admin`, `staging-app`, `staging-admin` (the `@`, `www`, `staging` and `api*` records already exist).
2. **Backend `.env.production` and `.env.staging`**, then redeploy the backend only (`./deploy.sh backend`):
   `CORS_ORIGINS=https://pesaa.io,https://www.pesaa.io,https://app.pesaa.io,https://admin.pesaa.io` (staging: the `staging*` equivalents) and `FRONTEND_URL=https://app.pesaa.io`.
3. **Find the port the existing frontend container publishes**: `grep -R "proxy_pass" /etc/nginx/sites-enabled` (the one `pesaa.io` uses today). It becomes the app's port.
4. **Install the new script** (keeps a dated backup): `cd ~/apps/onegemmy && git pull origin main && cp deploy.sh deploy.sh.backup_$(date +%Y%m%d_%H%M%S) && cp deploy/deploy.sh deploy.sh && chmod +x deploy.sh`

## 1. Staging first
`./deploy.sh staging-website`, `./deploy.sh staging-admin`, then `./deploy.sh staging-app`, with Nginx server blocks (see the example) and certbot certificates for each staging name.
Check: website loads, "Sign In" opens `staging-app`, a customer account signs in there, a customer account is **refused** on `staging-admin`, the platform admin signs in on `staging-admin`.

## 2. Production, in this order (no downtime for the marketing site)
1. `./deploy.sh admin` — a brand-new domain, nothing existing is affected. Add its Nginx block (with an IP allowlist or password) and certificate.
2. `./deploy.sh website` — starts on port 3002, still not public. Check it locally: `curl -s -H "Host: pesaa.io" http://127.0.0.1:3002/ | head -c 200`
3. **Switch Nginx**: `app.pesaa.io` → the existing frontend port (the old container still serves the ERP at `/login`), then `pesaa.io` → `127.0.0.1:3002`. Test with `sudo nginx -t`, reload, and open both sites.
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
