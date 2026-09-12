CREATE TYPE "public"."job_type" AS ENUM('generate_lyrics', 'generate_audio', 'generate_cover', 'deliver-notify');--> statement-breakpoint
CREATE TYPE "public"."lyric_kind" AS ENUM('generated', 'edited', 'approved');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."audio_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."album_cover_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_kind" AS ENUM('lyrics', 'audio', 'album_cover');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_status" AS ENUM('ok', 'blocked', 'error', 'rejected');--> statement-breakpoint
CREATE TABLE "order_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(120),
	"marketing_accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_contacts_order_id_unique" UNIQUE("order_id")
);--> statement-breakpoint
ALTER TABLE "order_contacts" ADD CONSTRAINT "order_contacts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "order_contacts" ("order_id", "email", "name", "marketing_accepted")
SELECT s."order_id",
	s."data"->>'buyerEmail',
	NULLIF(s."data"->>'buyerName', ''),
	COALESCE((s."data"->>'marketingAccepted')::boolean, false)
FROM "story_sessions" s
WHERE COALESCE(s."data"->>'buyerEmail', '') <> '';--> statement-breakpoint
UPDATE "story_sessions"
SET "data" = ("data" - 'buyerEmail' - 'buyerName' - 'termsAccepted' - 'marketingAccepted');--> statement-breakpoint
ALTER TABLE "story_sessions" DROP COLUMN IF EXISTS "public_id";--> statement-breakpoint
ALTER TABLE "story_sessions" DROP COLUMN IF EXISTS "access_token_hash";--> statement-breakpoint
ALTER TABLE "story_sessions" DROP COLUMN IF EXISTS "occasion";--> statement-breakpoint
ALTER TABLE "story_sessions" DROP COLUMN IF EXISTS "answers";--> statement-breakpoint
ALTER INDEX IF EXISTS "lyrics_order_number" RENAME TO "lyric_order_number";--> statement-breakpoint
UPDATE "email_deliveries" SET "status" = 'failed'
WHERE "status" NOT IN ('pending', 'sent', 'failed');--> statement-breakpoint
UPDATE "payments" SET "status" = 'pending'
WHERE "status" NOT IN ('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TABLE "lyric_versions" ALTER COLUMN "kind" TYPE "lyric_kind" USING "kind"::"lyric_kind";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "payment_status" USING "status"::"payment_status";--> statement-breakpoint
ALTER TABLE "generation_jobs" ALTER COLUMN "type" TYPE "job_type" USING "type"::"job_type";--> statement-breakpoint
ALTER TABLE "audio_generations" ALTER COLUMN "status" TYPE "audio_status" USING "status"::"audio_status";--> statement-breakpoint
ALTER TABLE "album_covers" DROP CONSTRAINT IF EXISTS "album_covers_status_valid";--> statement-breakpoint
ALTER TABLE "album_covers" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "album_covers" ALTER COLUMN "status" TYPE "album_cover_status" USING "status"::"album_cover_status";--> statement-breakpoint
ALTER TABLE "album_covers" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "ai_usage" ALTER COLUMN "kind" TYPE "ai_usage_kind" USING "kind"::"ai_usage_kind";--> statement-breakpoint
ALTER TABLE "ai_usage" ALTER COLUMN "status" TYPE "ai_usage_status" USING "status"::"ai_usage_status";--> statement-breakpoint
ALTER TABLE "email_deliveries" ALTER COLUMN "status" TYPE "email_delivery_status" USING "status"::"email_delivery_status";--> statement-breakpoint
UPDATE "products" SET "active" = false, "updated_at" = now()
WHERE "type" IN ('friend_roast', 'team_anthem', 'emotional_tribute');--> statement-breakpoint
DROP TABLE IF EXISTS "leads";--> statement-breakpoint
DROP TABLE IF EXISTS "order_items";
