CREATE INDEX IF NOT EXISTS "generation_jobs_status_run_at" ON "generation_jobs" ("status", "run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_jobs_order_id" ON "generation_jobs" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_order_id" ON "payments" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_events_order_id" ON "order_events" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revision_requests_order_id" ON "revision_requests" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_notes_order_id" ON "admin_notes" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_files_order_id" ON "stored_files" ("order_id");
