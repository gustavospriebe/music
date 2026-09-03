-- Phase 2 keeps historical records while aligning physical names with the public model.
ALTER TABLE "story_submissions" RENAME TO "story_sessions";--> statement-breakpoint
ALTER TABLE "lyrics_versions" RENAME TO "lyric_versions";--> statement-breakpoint
ALTER TABLE "stored_assets" RENAME TO "stored_files";--> statement-breakpoint
ALTER INDEX "lyrics_order_number" RENAME TO "lyric_order_number";--> statement-breakpoint
ALTER TABLE "story_sessions" ADD COLUMN IF NOT EXISTS "public_id" varchar(32);--> statement-breakpoint
ALTER TABLE "story_sessions" ADD COLUMN IF NOT EXISTS "access_token_hash" text;--> statement-breakpoint
ALTER TABLE "story_sessions" ADD COLUMN IF NOT EXISTS "occasion" varchar(240);--> statement-breakpoint
ALTER TABLE "story_sessions" ADD COLUMN IF NOT EXISTS "answers" jsonb;--> statement-breakpoint
UPDATE "story_sessions" SET "answers" = "data" WHERE "answers" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL, "name" varchar(120), "whatsapp" varchar(32),
  "marketing_accepted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "order_id" uuid NOT NULL,
  "sku" varchar(80) NOT NULL, "name" varchar(160) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL, "unit_price_cents" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "provider" varchar(30) NOT NULL,
  "external_event_id" varchar(160) NOT NULL, "payment_id" uuid, "payload" jsonb NOT NULL,
  "processed_at" timestamp with time zone, "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "order_id" uuid NOT NULL,
  "token_hash" text NOT NULL, "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone, "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_provider_event" ON "payment_webhook_events" ("provider", "external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_order_id" ON "deliveries" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_token_hash" ON "deliveries" ("token_hash");
