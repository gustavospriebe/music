ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "creation_key_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_creation_key_hash_unique" ON "orders" ("creation_key_hash");
