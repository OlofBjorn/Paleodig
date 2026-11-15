ALTER TABLE "players" DROP CONSTRAINT "players_name_length";--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_name_length" CHECK (char_length("players"."name") between 1 and 20);