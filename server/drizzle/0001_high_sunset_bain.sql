ALTER TABLE "dig_sites" ADD COLUMN "image" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "specimens" ADD COLUMN "found_site_id" integer;--> statement-breakpoint
ALTER TABLE "specimens" ADD CONSTRAINT "specimens_found_site_id_dig_sites_id_fk" FOREIGN KEY ("found_site_id") REFERENCES "public"."dig_sites"("id") ON DELETE no action ON UPDATE no action;