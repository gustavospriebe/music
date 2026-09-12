-- Historic webhook payloads do not prove which external namespace emitted them.
ALTER TABLE payment_webhook_events ADD COLUMN environment payment_environment;--> statement-breakpoint

DROP INDEX payment_webhook_provider_event;--> statement-breakpoint
CREATE UNIQUE INDEX payment_webhook_provider_event ON payment_webhook_events(provider, environment, external_event_id);--> statement-breakpoint
CREATE UNIQUE INDEX payment_webhook_provider_event_legacy ON payment_webhook_events(provider, external_event_id) WHERE environment IS NULL;
