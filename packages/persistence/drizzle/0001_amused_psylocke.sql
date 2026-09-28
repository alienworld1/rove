CREATE TABLE "payment_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"lane_id" text NOT NULL,
	"channel_id" text,
	"operation" text NOT NULL,
	"requested_amount" numeric(78, 0) NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"tx_hash" text,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"last_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_operation_amount_positive" CHECK ("payment_operations"."requested_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "lanes" ADD COLUMN "reserve_policy_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "lanes" ADD COLUMN "settlement_policy_snapshot" jsonb;--> statement-breakpoint
UPDATE "lanes" AS lane SET
  "reserve_policy_snapshot" = corridor."reserve_policy",
  "settlement_policy_snapshot" = corridor."settlement_policy" || jsonb_build_object('minimumUnsettledProtectedValue', '1')
FROM "corridors" AS corridor WHERE lane."corridor_id" = corridor."id";--> statement-breakpoint
ALTER TABLE "lanes" ALTER COLUMN "reserve_policy_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lanes" ALTER COLUMN "settlement_policy_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tempo_channels" ADD COLUMN "descriptor" jsonb;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ADD COLUMN "digest" text;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ADD COLUMN "signature" text;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_operation_key_unique" ON "payment_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_operation_hash_unique" ON "payment_operations" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "payment_operation_lane_idx" ON "payment_operations" USING btree ("lane_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tempo_voucher_channel_amount_unique" ON "tempo_vouchers" USING btree ("channel_id","cumulative_amount");--> statement-breakpoint
CREATE UNIQUE INDEX "tempo_voucher_digest_unique" ON "tempo_vouchers" USING btree ("digest");
