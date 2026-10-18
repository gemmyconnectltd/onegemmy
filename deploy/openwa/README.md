# OpenWA (WhatsApp gateway) for Pesaa Customer Support

Pesaa's support inbox talks to WhatsApp through **OpenWA** — https://github.com/rmyndharis/OpenWA (MIT, self-hosted).
It is *not* `@open-wa/wa-automate`. OpenWA drives WhatsApp Web with a reverse-engineered client, so WhatsApp can
restrict the linked number. Use it for **customer-initiated support conversations only** — never bulk or unsolicited
messages. Keep the code in `backend/app/modules/support/openwa.py` as the only OpenWA-specific file, so moving to the
official WhatsApp Business Platform later means replacing that one adapter.

## What runs where

```
WhatsApp customer ⇄ OpenWA (private network only) ⇄ Pesaa backend ⇄ Super Admin inbox
```

* OpenWA is reachable **only from the backend** over a private Docker network. Do **not** add an Nginx `location`
  for it and do **not** publish port 2785. Its upstream compose binds `127.0.0.1:2785`; keep it that way.
* The OpenWA dashboard (same port) is for the operator: reach it with an SSH tunnel
  (`ssh -L 2785:127.0.0.1:2785 server`), never through a public hostname.
* The browser never sees the OpenWA API key, the webhook secret, or WhatsApp session data.

## Install (staging first)

1. **Pin a version.** `git clone https://github.com/rmyndharis/OpenWA.git /opt/openwa && cd /opt/openwa && git checkout <release-tag-or-commit>`
   and write that tag in this file's changelog. There is no published image, the compose file builds from source.
   Record `git rev-parse HEAD` — support behaviour was verified against the docs of the `main` branch, not a specific tag.
2. Create `/opt/openwa/.env` (never commit it):
   ```
   API_MASTER_KEY=<long random>      # OpenWA admin key — becomes OPENWA_API_KEY for the Pesaa backend
   API_KEY_PEPPER=<long random>
   TZ=Africa/Kigali
   ```
3. `docker compose up -d` (production compose; healthcheck `GET /api/health/ready`, `restart: unless-stopped`,
   data in the named volume `openwa-data`, which holds the **WhatsApp session** — include it in backups, treat it as a secret).
4. Join OpenWA to the same private network as the Pesaa backend (see `docker-compose.override.example.yml`) so the
   backend reaches it at `http://openwa-api:2785/api`.
5. Add to the **backend** environment (server-only file, same place as the other secrets):
   ```
   OPENWA_BASE_URL=http://openwa-api:2785/api
   OPENWA_API_KEY=<the API_MASTER_KEY above>
   OPENWA_WEBHOOK_SECRET=<another long random string>
   OPENWA_WEBHOOK_TARGET=http://backend:8000        # how OpenWA reaches the Pesaa backend, private address
   ```
   Restart the backend (`alembic upgrade head` first — the support tables are migration `d7e2b9c41a55`).
6. In **admin.pesaa.io → Customer Support → Settings → WhatsApp** click *Connect WhatsApp*, scan the QR with the
   support phone, and confirm the status turns *Connected*.

## Before relying on it (not yet verified here)

The integration was built from OpenWA's documentation and unit-tested with simulated payloads. It has **not** been run
against a live OpenWA instance. With a spare test number, check:

* [ ] QR connect → status *Connected*; disconnect and reconnect work.
* [ ] An incoming message creates a conversation; the **webhook JSON envelope matches** what
      `parse_webhook` expects (the docs excerpt used did not show it — adjust the parser if it differs).
* [ ] A reply from the inbox arrives on the phone; ticks update (sent → delivered → read).
* [ ] Restarting OpenWA or the backend recovers without a new QR; a forced logout shows the alert and needs a rescan.
* [ ] An attachment sent by a customer appears; one sent by an agent arrives.
* [ ] Duplicate deliveries (kill the backend mid-webhook) don't create duplicate messages.

## Email

Replies are sent through Pesaa's existing SMTP account (`SMTP_HOST`, `SUPPORT_SMTP_USER/PASSWORD/EMAIL_FROM`; for
Outlook use `SMTP_HOST=smtp.office365.com`). **Receiving** mail needs Microsoft Graph, which is not configured in this
repo: create an Entra app registration with the *Mail.ReadWrite* application permission, restrict it to the support
mailbox with an Application Access Policy, then set `SUPPORT_MAILBOX`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`,
`GRAPH_CLIENT_SECRET`. Until then the inbox works for WhatsApp and Help & Support tickets, and email is send-only.
