-- STAGING ONLY. Review with your DBA and take a backup first. This file is NOT run by migrations.
-- Execute with psql -v ON_ERROR_STOP=1 -v staging_confirm=pesaa-staging -f scripts/cleanup_staging_qa.sql
-- Defaults to ROLLBACK. Replace the final ROLLBACK with COMMIT only after reviewing RETURNING output.
\if :{?staging_confirm}
SELECT :'staging_confirm' = 'pesaa-staging' AS staging_allowed \gset
\else
\echo 'Missing -v staging_confirm=pesaa-staging; no changes made.'
\quit
\endif
\if :staging_allowed
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Guard the exact known ID AND name. A renamed or repurposed tenant is never removed accidentally.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE id='5acdd056-5d41-480e-9308-ab6b9799751a'
             AND btrim(name) <> 'QA Test Shop & CoQA Test Shop') THEN
    RAISE EXCEPTION 'QA tenant name no longer matches; refusing cleanup';
  END IF;
  IF EXISTS (SELECT 1 FROM billing_subscriptions WHERE tenant_id='5acdd056-5d41-480e-9308-ab6b9799751a') THEN
    RAISE EXCEPTION 'QA tenant has billing history; retain and archive through the admin UI';
  END IF;
END $$;
-- Remove the ticket's conversation too, including its messages via existing ON DELETE CASCADE.
DELETE FROM support_conversations WHERE id IN (
  SELECT conversation_id FROM support_tickets WHERE reference='PES-000001'
) RETURNING id;
-- Preserve immutable audit records. Existing FK protections refuse deletion if financial references remain.
DELETE FROM tenants WHERE id='5acdd056-5d41-480e-9308-ab6b9799751a'
  AND btrim(name)='QA Test Shop & CoQA Test Shop' RETURNING id, name, slug;
ROLLBACK;
\else
\echo 'Confirmation must equal pesaa-staging; no changes made.'
\endif
