ALTER TABLE "published_runs" DROP CONSTRAINT "published_runs_run_id_lab_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "hosted_sessions" ADD COLUMN "capabilities" jsonb DEFAULT '["inspect_owned","execute_preset","control_owned"]'::jsonb NOT NULL;