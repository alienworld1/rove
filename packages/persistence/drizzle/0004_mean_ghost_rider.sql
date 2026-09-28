ALTER TABLE "domain_events" ADD COLUMN "ordinal" bigserial NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_ordinal_unique" ON "domain_events" USING btree ("ordinal");