ALTER TABLE "payment_operations" DROP CONSTRAINT "payment_operation_amount_positive";--> statement-breakpoint
ALTER TABLE "cdrs" ADD COLUMN "raw_text" text;--> statement-breakpoint
ALTER TABLE "cdrs" ADD COLUMN "source_party_id" text;--> statement-breakpoint
ALTER TABLE "cdrs" ADD COLUMN "external_cdr_id" text;--> statement-breakpoint
ALTER TABLE "cdrs" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "cdrs" ADD COLUMN "normalization" jsonb;--> statement-breakpoint
ALTER TABLE "lanes" ADD COLUMN "completion" jsonb;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD COLUMN "comparison" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "cdr_provider_identity_unique" ON "cdrs" USING btree ("source_party_id","external_cdr_id");--> statement-breakpoint
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operation_amount_positive" CHECK ("payment_operations"."requested_amount" > 0 or ("payment_operations"."requested_amount" = 0 and "payment_operations"."operation" = 'close'));