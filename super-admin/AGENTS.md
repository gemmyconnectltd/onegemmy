<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared UI contract

Before editing UI, read `../docs/DESIGN_SYSTEM.md` and the root `../AGENTS.md`. This app follows the same mandatory design-system rules, preserves existing shared components and uses the centralized tokens. Run `npm run design:check` and relevant validation.

## Marketing Hub and Traffic (Super Admin)

- **Marketing** is one sidebar entry with eight pages (`MARKETING_NAV`): Overview, Audience, Campaigns, Newsletters, Automations, Templates, Analytics, Settings. **Traffic** is one entry with Website and ERP sections (`TRAFFIC_NAV`, route group `(traffic)`). Add pages to those lists, never as new top-level items.
- Backend lives in `backend/app/modules/marketing/` (and `traffic/`). It is platform marketing only — keep it separate from the tenant ERP `crm` module.
- **One send engine.** Campaigns, newsletter issues and automations all queue `marketing_sends` and are delivered by `engine.py` through `app.core.email.send_email_message`. Never add a second sending path, and never send from a route.
- **Eligibility is enforced in one place** (`contacts.eligibility`) and re-checked at send time: suppressed (unsubscribed, bounced, complained, invalid), test domains (`@prodcopy.test`, `.test`, `example.*`) and — per the consent mode in Settings — contacts without recorded consent are never emailed. Newsletters need an explicit subscription. Consent is recorded, never assumed.
- Outside production, live sends only reach `MARKETING_TEST_RECIPIENTS` (safe mode). Keep it that way; local data must never email real businesses.
- A message is "sent" only when the mail server accepted it. Don't report "delivered", and label opens as approximate. Never fabricate marketing or traffic data; seed scripts (`scripts/seed_*.py`) are local-only and refuse to run elsewhere.
- Reuse `Section`, `StatCard`, `usePeriod`/`PeriodSelect`, `EmailBuilder` and the shared UI components; keep PESAA tokens. Email HTML comes only from `render.py` (escapes content, allow-listed blocks and links).
- Every marketing mutation is audited (`record_audit`) and every route sits behind the superadmin guard. Test changed workflows (`backend/tests/test_marketing_hub.py`).
