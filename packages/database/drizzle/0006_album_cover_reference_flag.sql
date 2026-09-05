ALTER TABLE "album_covers" ADD COLUMN IF NOT EXISTS "had_reference" boolean DEFAULT false NOT NULL;
