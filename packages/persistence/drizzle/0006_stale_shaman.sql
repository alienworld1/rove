ALTER TABLE "lab_run_events" ADD COLUMN "expected_lane_version" integer;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "lease_until" timestamp with time zone;