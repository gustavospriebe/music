-- The original enqueue key records the intended version. Do not derive it from
-- the current number of rows: editing and retries may have advanced that number.
UPDATE generation_jobs
SET payload = jsonb_set(payload, '{targetVersion}', to_jsonb(split_part(idempotency_key, ':', 3)::integer)),
    updated_at = now()
WHERE type = 'generate_lyrics'
  AND jsonb_typeof(payload) = 'object'
  AND NOT (payload ? 'targetVersion')
  AND idempotency_key ~ ('^lyrics:' || order_id::text || ':[1-9][0-9]{0,9}$')
  AND CASE
    WHEN split_part(idempotency_key, ':', 3) ~ '^[1-9][0-9]{0,9}$'
    THEN split_part(idempotency_key, ':', 3)::numeric <= 2147483647
    ELSE false
  END;--> statement-breakpoint

-- Unknown provenance must require an explicit operator decision, never another
-- paid call. Completed/failed history stays intact; only active work is blocked.
WITH blocked_jobs AS (
  UPDATE generation_jobs
  SET status = 'failed', last_error = 'JOB_LEGACY_PROVENANCE',
      locked_at = NULL, locked_by = NULL, lease_token = NULL, lease_expires_at = NULL,
      updated_at = now()
  WHERE type = 'generate_lyrics' AND status IN ('pending', 'processing')
    AND NOT CASE
      WHEN jsonb_typeof(payload) = 'object' AND jsonb_typeof(payload->'targetVersion') = 'number'
      THEN (payload->>'targetVersion')::numeric BETWEEN 1 AND 2147483647
        AND (payload->>'targetVersion')::numeric = trunc((payload->>'targetVersion')::numeric)
      ELSE false
    END
  RETURNING order_id
), blocked_orders AS (
  UPDATE orders SET status = 'failed', updated_at = now()
  WHERE status = 'lyrics_generating' AND id IN (SELECT order_id FROM blocked_jobs)
  RETURNING id
)
INSERT INTO order_events(order_id, type, data)
SELECT id, 'migration_lyrics_provenance_blocked', '{"migration":"0013","reason":"JOB_LEGACY_PROVENANCE"}'::jsonb
FROM blocked_orders;
