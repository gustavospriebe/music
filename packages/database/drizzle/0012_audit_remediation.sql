-- Append-only schema upgrade. Historical consent and lyric provenance are not inferred.
CREATE TYPE payment_status_next AS ENUM ('creating','unknown','pending','approved','refunded','rejected','cancelled','expired');--> statement-breakpoint
ALTER TABLE payments ALTER COLUMN status TYPE payment_status_next USING status::text::payment_status_next;--> statement-breakpoint
DROP TYPE payment_status;--> statement-breakpoint
ALTER TYPE payment_status_next RENAME TO payment_status;--> statement-breakpoint
CREATE TYPE production_status AS ENUM ('queued','processing','review_required','completed','failed');--> statement-breakpoint
CREATE TYPE production_provenance AS ENUM ('recorded','legacy_unverified');--> statement-breakpoint
CREATE TYPE ai_call_status AS ENUM ('started','completed','rejected','failed','unknown');--> statement-breakpoint
CREATE TYPE ai_cost_source AS ENUM ('reported','estimated','unknown');--> statement-breakpoint
CREATE TYPE consent_kind AS ENUM ('terms','privacy','marketing','reference_image','content_rights');--> statement-breakpoint
ALTER TABLE story_sessions ALTER COLUMN schema_version SET DEFAULT 2;--> statement-breakpoint
ALTER TABLE payments ADD COLUMN attempt integer, ADD COLUMN idempotency_key varchar(180), ADD COLUMN external_reference varchar(160), ADD COLUMN expires_at timestamptz, ADD COLUMN last_reconciled_at timestamptz, ADD COLUMN reconcile_after timestamptz NOT NULL DEFAULT now(), ADD COLUMN paid_at timestamptz, ADD COLUMN refunded_at timestamptz, ADD COLUMN last_error text;--> statement-breakpoint
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY order_id ORDER BY created_at,id)::integer AS attempt FROM payments
)
UPDATE payments p SET attempt=n.attempt, idempotency_key='legacy:' || p.id::text, external_reference=o.public_id
FROM numbered n, orders o WHERE p.id=n.id AND o.id=p.order_id;--> statement-breakpoint
UPDATE payments SET provider='abacatepay' WHERE provider='abacate-pay';--> statement-breakpoint
UPDATE payment_webhook_events SET provider='abacatepay' WHERE provider='abacate-pay';--> statement-breakpoint
ALTER TABLE payments ALTER COLUMN attempt SET NOT NULL, ALTER COLUMN idempotency_key SET NOT NULL, ALTER COLUMN external_reference SET NOT NULL, DROP CONSTRAINT payments_external_payment_id_unique;--> statement-breakpoint
CREATE UNIQUE INDEX payments_provider_external ON payments(provider,external_payment_id);--> statement-breakpoint
CREATE UNIQUE INDEX payments_order_attempt ON payments(order_id,attempt);--> statement-breakpoint
CREATE UNIQUE INDEX payments_idempotency_key ON payments(idempotency_key);--> statement-breakpoint
-- A conflicting active attempt fails the upgrade for review; no financial history is rewritten.
CREATE UNIQUE INDEX payments_active_order ON payments(order_id) WHERE status IN ('creating','unknown','pending');--> statement-breakpoint
CREATE INDEX payments_reconcile_after ON payments(status,reconcile_after);--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_amount_nonnegative CHECK(amount_cents>=0), ADD CONSTRAINT payments_attempt_positive CHECK(attempt>0), ADD CONSTRAINT payments_currency_brl CHECK(currency='BRL');--> statement-breakpoint
ALTER TABLE products ADD CONSTRAINT products_price_nonnegative CHECK(price_cents>=0);--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_price_nonnegative CHECK(price_cents>=0);--> statement-breakpoint
ALTER TABLE lyric_versions ADD CONSTRAINT lyric_versions_number_positive CHECK(number>0);--> statement-breakpoint
ALTER TABLE lyric_versions ADD CONSTRAINT lyric_versions_id_order UNIQUE(id,order_id);--> statement-breakpoint
ALTER TABLE stored_files ADD CONSTRAINT stored_files_id_order UNIQUE(id,order_id);--> statement-breakpoint
ALTER TABLE stored_files ADD CONSTRAINT stored_files_size_nonnegative CHECK(size_bytes>=0);--> statement-breakpoint
CREATE TABLE productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  number integer NOT NULL,
  lyric_version_id uuid,
  status production_status NOT NULL DEFAULT 'queued',
  provenance production_provenance NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT productions_order_id_orders_id_fk FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT productions_number_positive CHECK(number>0),
  CONSTRAINT productions_recorded_lyrics CHECK(provenance<>'recorded' OR lyric_version_id IS NOT NULL),
  CONSTRAINT productions_lyric_order_fk FOREIGN KEY(lyric_version_id,order_id) REFERENCES lyric_versions(id,order_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX productions_order_number ON productions(order_id,number);--> statement-breakpoint
ALTER TABLE productions ADD CONSTRAINT productions_id_order UNIQUE(id,order_id);--> statement-breakpoint
ALTER TABLE orders ADD COLUMN current_production_id uuid;--> statement-breakpoint
INSERT INTO productions(order_id,number,status,provenance,created_at,updated_at)
SELECT o.id,1,
  CASE o.status WHEN 'delivered' THEN 'completed' WHEN 'review_required' THEN 'review_required' WHEN 'audio_generating' THEN 'processing' WHEN 'failed' THEN 'failed' ELSE 'queued' END::production_status,
  'legacy_unverified',o.created_at,o.updated_at
FROM orders o WHERE EXISTS(SELECT 1 FROM audio_generations a WHERE a.order_id=o.id)
  OR EXISTS(SELECT 1 FROM deliveries d WHERE d.order_id=o.id)
  OR EXISTS(SELECT 1 FROM generation_jobs j WHERE j.order_id=o.id AND j.type='generate_audio');--> statement-breakpoint
UPDATE orders o SET current_production_id=p.id FROM productions p WHERE p.order_id=o.id;--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_current_production_id_productions_id_fk FOREIGN KEY(current_production_id) REFERENCES productions(id), ADD CONSTRAINT orders_current_production_order_fk FOREIGN KEY(current_production_id,id) REFERENCES productions(id,order_id);--> statement-breakpoint
ALTER TABLE generation_jobs ADD COLUMN lease_token uuid, ADD COLUMN lease_expires_at timestamptz, ADD CONSTRAINT generation_jobs_attempts_nonnegative CHECK(attempts>=0), ADD CONSTRAINT generation_jobs_max_attempts_positive CHECK(max_attempts>0);--> statement-breakpoint
UPDATE generation_jobs j SET payload=j.payload || jsonb_build_object('productionId',p.id)
FROM productions p WHERE p.order_id=j.order_id AND j.type='generate_audio' AND jsonb_typeof(j.payload)='object';--> statement-breakpoint
ALTER TABLE audio_generations ADD COLUMN production_id uuid, ADD COLUMN job_id uuid, ADD COLUMN lease_token uuid, ADD COLUMN selected boolean NOT NULL DEFAULT false, ADD COLUMN duration_ms integer;--> statement-breakpoint
UPDATE audio_generations a SET production_id=p.id,selected=(a.status='completed' AND a.file_id IS NOT NULL) FROM productions p WHERE p.order_id=a.order_id;--> statement-breakpoint
ALTER TABLE audio_generations ALTER COLUMN production_id SET NOT NULL, DROP CONSTRAINT audio_generations_asset_id_stored_assets_id_fk;--> statement-breakpoint
DROP INDEX audio_order_variant;--> statement-breakpoint
CREATE UNIQUE INDEX audio_production_variant_attempt ON audio_generations(production_id,variant,attempt);--> statement-breakpoint
CREATE UNIQUE INDEX audio_production_variant_selected ON audio_generations(production_id,variant) WHERE selected;--> statement-breakpoint
CREATE INDEX audio_generations_order_id ON audio_generations(order_id);--> statement-breakpoint
ALTER TABLE audio_generations ADD CONSTRAINT audio_generations_job_id_generation_jobs_id_fk FOREIGN KEY(job_id) REFERENCES generation_jobs(id) ON DELETE SET NULL,
  ADD CONSTRAINT audio_generations_production_order_fk FOREIGN KEY(production_id,order_id) REFERENCES productions(id,order_id),
  ADD CONSTRAINT audio_generations_file_order_fk FOREIGN KEY(file_id,order_id) REFERENCES stored_files(id,order_id),
  ADD CONSTRAINT audio_generations_variant_range CHECK(variant IN (1,2)),
  ADD CONSTRAINT audio_generations_attempt_nonnegative CHECK(attempt>=0),
  ADD CONSTRAINT audio_generations_duration_positive CHECK(duration_ms IS NULL OR duration_ms>0),
  ADD CONSTRAINT audio_generations_selected_complete CHECK(NOT selected OR (status='completed' AND file_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN production_id uuid;--> statement-breakpoint
UPDATE deliveries d SET production_id=p.id FROM productions p WHERE p.order_id=d.order_id;--> statement-breakpoint
ALTER TABLE deliveries ADD CONSTRAINT deliveries_production_order_fk FOREIGN KEY(production_id,order_id) REFERENCES productions(id,order_id);--> statement-breakpoint
ALTER TABLE album_covers ADD CONSTRAINT album_covers_id_order UNIQUE(id,order_id);--> statement-breakpoint
ALTER TABLE album_covers ADD CONSTRAINT album_covers_reference_order_fk FOREIGN KEY(reference_file_id,order_id) REFERENCES stored_files(id,order_id), ADD CONSTRAINT album_covers_file_order_fk FOREIGN KEY(cover_file_id,order_id) REFERENCES stored_files(id,order_id);--> statement-breakpoint
CREATE TABLE ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  job_id uuid,
  kind ai_usage_kind NOT NULL,
  provider varchar(30) NOT NULL,
  model varchar(120),
  status ai_call_status NOT NULL DEFAULT 'started',
  lease_token uuid,
  external_id varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT ai_calls_order_id_orders_id_fk FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT ai_calls_job_id_generation_jobs_id_fk FOREIGN KEY(job_id) REFERENCES generation_jobs(id) ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX ai_calls_job_id ON ai_calls(job_id);--> statement-breakpoint
CREATE INDEX ai_calls_order_id ON ai_calls(order_id);--> statement-breakpoint
CREATE INDEX ai_calls_status_created ON ai_calls(status,created_at);--> statement-breakpoint
ALTER TABLE ai_usage ADD COLUMN ai_call_id uuid, ADD COLUMN cost_source ai_cost_source NOT NULL DEFAULT 'unknown', ADD CONSTRAINT ai_usage_ai_call_id_ai_calls_id_fk FOREIGN KEY(ai_call_id) REFERENCES ai_calls(id) ON DELETE RESTRICT;--> statement-breakpoint
-- The previous Google adapter stored a fixed estimate; OpenRouter stored reported usage.cost.
UPDATE ai_usage SET cost_source=CASE WHEN provider='google' THEN 'estimated' ELSE 'reported' END::ai_cost_source WHERE cost_usd IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX ai_usage_call_once ON ai_usage(ai_call_id);--> statement-breakpoint
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_tokens_nonnegative CHECK(input_tokens>=0 AND output_tokens>=0), ADD CONSTRAINT ai_usage_cost_consistent CHECK((cost_source='unknown' AND cost_usd IS NULL) OR (cost_source<>'unknown' AND cost_usd IS NOT NULL AND cost_usd>=0));--> statement-breakpoint
CREATE TABLE order_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  kind consent_kind NOT NULL,
  policy_version varchar(120) NOT NULL,
  accepted boolean NOT NULL,
  cover_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_consents_order_id_orders_id_fk FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT order_consents_cover_id_album_covers_id_fk FOREIGN KEY(cover_id) REFERENCES album_covers(id) ON DELETE SET NULL,
  CONSTRAINT order_consents_policy_nonblank CHECK(length(trim(policy_version))>0),
  CONSTRAINT order_consents_cover_order_fk FOREIGN KEY(cover_id,order_id) REFERENCES album_covers(id,order_id)
);--> statement-breakpoint
CREATE INDEX order_consents_order_kind_recorded ON order_consents(order_id,kind,recorded_at);--> statement-breakpoint
ALTER TABLE admin_users DROP COLUMN password_hash;--> statement-breakpoint
ALTER TABLE story_sessions RENAME CONSTRAINT story_submissions_pkey TO story_sessions_pkey;--> statement-breakpoint
ALTER TABLE lyric_versions RENAME CONSTRAINT lyrics_versions_pkey TO lyric_versions_pkey;--> statement-breakpoint
ALTER TABLE stored_files RENAME CONSTRAINT stored_assets_pkey TO stored_files_pkey;--> statement-breakpoint
-- Reconcile physical constraint names left behind by earlier table/column renames.
ALTER TABLE story_sessions RENAME CONSTRAINT story_submissions_order_id_unique TO story_sessions_order_id_unique;--> statement-breakpoint
ALTER TABLE story_sessions RENAME CONSTRAINT story_submissions_order_id_orders_id_fk TO story_sessions_order_id_orders_id_fk;--> statement-breakpoint
ALTER TABLE lyric_versions RENAME CONSTRAINT lyrics_versions_order_id_orders_id_fk TO lyric_versions_order_id_orders_id_fk;--> statement-breakpoint
ALTER TABLE stored_files RENAME CONSTRAINT stored_assets_storage_key_unique TO stored_files_storage_key_unique;--> statement-breakpoint
ALTER TABLE stored_files RENAME CONSTRAINT stored_assets_order_id_orders_id_fk TO stored_files_order_id_orders_id_fk;--> statement-breakpoint
ALTER TABLE album_covers RENAME CONSTRAINT album_covers_reference_asset_id_stored_files_id_fk TO album_covers_reference_file_id_stored_files_id_fk;--> statement-breakpoint
ALTER TABLE album_covers RENAME CONSTRAINT album_covers_cover_asset_id_stored_files_id_fk TO album_covers_cover_file_id_stored_files_id_fk;
