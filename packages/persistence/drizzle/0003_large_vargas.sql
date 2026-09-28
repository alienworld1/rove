ALTER TABLE "payment_operations" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payment_operations" AS operation SET "created_at" = coalesce(operation."submitted_at", lane."created_at")
FROM "lanes" AS lane WHERE operation."lane_id" = lane."id";--> statement-breakpoint
ALTER TABLE "payment_operations" ALTER COLUMN "created_at" SET NOT NULL;
