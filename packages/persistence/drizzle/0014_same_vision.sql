CREATE TABLE "hosted_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"digest" text NOT NULL,
	"compiled" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hosted_scenarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "hosted_scenario_workspace_idx" ON "hosted_scenarios" USING btree ("workspace_id");
--> statement-breakpoint
REVOKE ALL ON TABLE "hosted_scenarios" FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "hosted_scenarios" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "hosted_scenarios" FROM authenticated;
  END IF;
END $$;
