CREATE TYPE payment_environment AS ENUM ('live', 'sandbox', 'local');--> statement-breakpoint

-- Existing attempts have no reliable environment evidence. Do not classify them
-- from today's provider credentials, deployment name or application configuration.
ALTER TABLE payments ADD COLUMN environment payment_environment;--> statement-breakpoint

DROP INDEX payments_provider_external;--> statement-breakpoint
CREATE UNIQUE INDEX payments_provider_external ON payments(provider, environment, external_payment_id);--> statement-breakpoint
CREATE UNIQUE INDEX payments_provider_external_legacy ON payments(provider, external_payment_id) WHERE environment IS NULL;
