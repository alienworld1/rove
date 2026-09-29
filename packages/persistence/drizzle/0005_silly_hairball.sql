ALTER TABLE "lab_run_events" ADD COLUMN "scenario_event_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "event_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "lane_key" text;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "lane_id" text;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "trace_offset_ms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "command_id" text;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "reason_code" text;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "trace_offset_ms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "speed" numeric(4, 2) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "scenario_digest" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "compiled_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "corridor_id" text;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "lane_bindings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "replay_of_run_id" text;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "awaiting" jsonb;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "lab_scenarios" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_scenarios" ADD COLUMN "compiler_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_scenarios" ADD COLUMN "digest" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_scenarios" ADD COLUMN "validation_status" text DEFAULT 'valid' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_scenarios" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "lab_run_events" SET "scenario_event_id" = "id" WHERE "scenario_event_id" = '';--> statement-breakpoint
CREATE UNIQUE INDEX "lab_run_event_identity_unique" ON "lab_run_events" USING btree ("run_id","scenario_event_id");--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD CONSTRAINT "lab_event_trace_nonnegative" CHECK ("lab_run_events"."trace_offset_ms" >= 0);--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD CONSTRAINT "lab_event_status_valid" CHECK ("lab_run_events"."status" in ('pending', 'dispatching', 'completed', 'rejected', 'blocked', 'awaiting_chain', 'failed'));--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_run_version_nonnegative" CHECK ("lab_runs"."version" >= 0);--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_run_trace_nonnegative" CHECK ("lab_runs"."trace_offset_ms" >= 0);--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_run_speed_valid" CHECK ("lab_runs"."speed" in (0.25, 0.5, 1, 2, 4));--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_run_status_valid" CHECK ("lab_runs"."status" in ('initializing', 'ready', 'running', 'paused', 'awaiting_chain', 'completed', 'failed'));
