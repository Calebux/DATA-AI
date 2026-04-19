-- Cron scheduler for DATA-AI workflows
-- Requires: pg_cron and pg_net extensions (enabled in Supabase dashboard under Database > Extensions)
--
-- After running this migration, replace the placeholder values below with your actual project URL
-- and service role key, OR set them as Supabase DB config vars and reference them via
-- current_setting(). The safest approach is to run the SELECT below manually in the SQL editor
-- with real values substituted.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule previous version if re-running
SELECT cron.unschedule('data-ai-cron-runner') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'data-ai-cron-runner'
);

-- Schedule the cron-runner Edge Function to fire every minute.
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with your values,
-- or run this block manually in the Supabase SQL editor.
SELECT cron.schedule(
  'data-ai-cron-runner',
  '* * * * *',
  $$
  SELECT net.http_post(
    url        := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-runner',
    headers    := jsonb_build_object(
                    'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
                    'Content-Type',  'application/json'
                  ),
    body       := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
