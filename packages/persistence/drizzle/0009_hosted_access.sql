CREATE TABLE "hosted_admissions" (
	"run_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"invite_id" text NOT NULL,
	"compiled" jsonb NOT NULL,
	"funding_reserved" numeric(78, 0) NOT NULL,
	"fees_reserved" numeric(78, 0) NOT NULL,
	"gas_limit" numeric(78, 0) NOT NULL,
	"max_fee_per_gas" numeric(78, 0) NOT NULL,
	"max_transactions" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"max_redemptions" integer NOT NULL,
	"max_runs" integer NOT NULL,
	"runs_per_workspace" integer NOT NULL,
	"funding_budget" numeric(78, 0) NOT NULL,
	"fee_budget" numeric(78, 0) NOT NULL,
	CONSTRAINT "hosted_invites_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "hosted_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"invite_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_submissions" (
	"effect_key" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"lane_id" text NOT NULL,
	"effect_type" text NOT NULL,
	"funding" numeric(78, 0) NOT NULL,
	"fee" numeric(78, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"payment" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hosted_admissions" ADD CONSTRAINT "hosted_admissions_invite_id_hosted_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."hosted_invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_sessions" ADD CONSTRAINT "hosted_sessions_invite_id_hosted_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."hosted_invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_submissions" ADD CONSTRAINT "hosted_submissions_run_id_hosted_admissions_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."hosted_admissions"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_runs" ADD CONSTRAINT "published_runs_run_id_lab_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hosted_admission_workspace_idx" ON "hosted_admissions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "hosted_session_workspace_idx" ON "hosted_sessions" USING btree ("workspace_id");