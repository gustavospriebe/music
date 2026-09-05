CREATE TABLE IF NOT EXISTS "album_covers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"reference_asset_id" uuid,
	"cover_asset_id" uuid,
	"provider" varchar(30) DEFAULT 'openrouter' NOT NULL,
	"model" varchar(120) NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_covers_attempt_range" CHECK ("attempt" between 1 and 2),
	CONSTRAINT "album_covers_status_valid" CHECK ("status" in ('pending','processing','completed','failed')),
	CONSTRAINT "album_covers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade,
	CONSTRAINT "album_covers_reference_asset_id_stored_files_id_fk" FOREIGN KEY ("reference_asset_id") REFERENCES "public"."stored_files"("id") ON DELETE set null,
	CONSTRAINT "album_covers_cover_asset_id_stored_files_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."stored_files"("id") ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "album_covers_order_attempt" ON "album_covers" USING btree ("order_id","attempt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_covers_status_updated" ON "album_covers" USING btree ("status","updated_at");
