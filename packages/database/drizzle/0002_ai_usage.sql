--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "job_id" uuid,
  "kind" varchar(20) NOT NULL,
  "provider" varchar(30) DEFAULT 'openrouter' NOT NULL,
  "model" varchar(120),
  "external_id" varchar(160),
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "cost_usd" numeric(12, 6),
  "latency_ms" integer,
  "status" varchar(20) NOT NULL,
  "error" text,
  "attempt" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_order_id" ON "ai_usage" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_created_at" ON "ai_usage" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_order_kind_external" ON "ai_usage" ("order_id", "kind", "external_id") WHERE "external_id" IS NOT NULL;
