UPDATE "story_sessions"
SET "data" = "data" || jsonb_build_object(
	'productType', 'custom_song',
	'safetyConfirmed', true,
	'intention', COALESCE(NULLIF(TRIM("data"->>'intention'), ''), 'livre'),
	'brief', CASE
		WHEN length(TRIM(COALESCE("data"->>'brief', ''))) >= 10 THEN TRIM("data"->>'brief')
		ELSE LEFT(COALESCE(
			NULLIF(TRIM("data"->>'brief'), ''),
			NULLIF(TRIM("data"->>'biggestStory'), ''),
			NULLIF(TRIM("data"->>'mostImportantMemory'), ''),
			NULLIF(TRIM("data"->>'greatestWin'), ''),
			NULLIF(TRIM("data"->>'howMet'), ''),
			NULLIF(TRIM("data"->>'finalMessage'), ''),
			NULLIF(TRIM("data"->>'subjectName'), ''),
			'História migrada para criação livre'
		), 3000)
	END
);--> statement-breakpoint
UPDATE "orders" SET "product_type" = 'custom_song' WHERE "product_type" IS DISTINCT FROM 'custom_song';--> statement-breakpoint
UPDATE "analytics_events" SET "product_type" = 'custom_song'
WHERE "product_type" IS NOT NULL AND "product_type" IS DISTINCT FROM 'custom_song';--> statement-breakpoint
DELETE FROM "products" WHERE "type" <> 'custom_song';--> statement-breakpoint
CREATE TYPE "public"."product_type_new" AS ENUM('custom_song');--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "type" TYPE "public"."product_type_new" USING "type"::text::"public"."product_type_new";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "product_type" TYPE "public"."product_type_new" USING "product_type"::text::"public"."product_type_new";--> statement-breakpoint
ALTER TABLE "analytics_events" ALTER COLUMN "product_type" TYPE "public"."product_type_new" USING "product_type"::text::"public"."product_type_new";--> statement-breakpoint
DROP TYPE "public"."product_type";--> statement-breakpoint
ALTER TYPE "public"."product_type_new" RENAME TO "product_type";--> statement-breakpoint
ALTER TYPE "public"."job_type" RENAME VALUE 'deliver-notify' TO 'deliver_notify';--> statement-breakpoint
ALTER TABLE "audio_generations" RENAME COLUMN "asset_id" TO "file_id";--> statement-breakpoint
ALTER TABLE "album_covers" RENAME COLUMN "reference_asset_id" TO "reference_file_id";--> statement-breakpoint
ALTER TABLE "album_covers" RENAME COLUMN "cover_asset_id" TO "cover_file_id";
