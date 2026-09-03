--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "visitor_id" varchar(64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_event_created" ON "analytics_events" ("event", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visitor_created" ON "analytics_events" ("visitor_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_order_public" ON "analytics_events" ("order_public_id");
