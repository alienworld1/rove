CREATE TABLE "audit_projection" (
	"event_id" text PRIMARY KEY NOT NULL,
	"lane_id" text NOT NULL,
	"corridor_id" text NOT NULL,
	"lane_version" integer NOT NULL,
	"state" text NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdrs" (
	"id" text PRIMARY KEY NOT NULL,
	"lane_id" text NOT NULL,
	"external_session_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"normalized_total" numeric(78, 0),
	CONSTRAINT "cdr_total_nonnegative" CHECK ("cdrs"."normalized_total" is null or "cdrs"."normalized_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "corridors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"payer_emsp" text NOT NULL,
	"payee_cpo" text NOT NULL,
	"settlement_asset_id" text NOT NULL,
	"tempo_network" text NOT NULL,
	"asset_decimals" integer NOT NULL,
	"tariff_per_kwh" numeric(78, 0) NOT NULL,
	"tariff_decimals" integer NOT NULL,
	"protection_policy" jsonb NOT NULL,
	"reserve_policy" jsonb NOT NULL,
	"settlement_policy" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "corridor_tariff_nonnegative" CHECK (tariff_per_kwh >= 0),
	CONSTRAINT "corridor_identity_nonempty" CHECK (length(trim("corridors"."name")) > 0 and length(trim("corridors"."payer_emsp")) > 0 and length(trim("corridors"."payee_cpo")) > 0),
	CONSTRAINT "corridor_decimals_valid" CHECK ("corridors"."asset_decimals" between 0 and 36 and "corridors"."tariff_decimals" between 0 and 36)
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"corridor_id" text NOT NULL,
	"lane_id" text,
	"lane_version" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"trace_time" timestamp with time zone,
	"causation_id" text,
	"correlation_id" text NOT NULL,
	"reason_code" text,
	"payload" jsonb NOT NULL,
	"evidence_hash" text,
	"channel_id" text,
	"tx_hash" text,
	"cdr_id" text
);
--> statement-breakpoint
CREATE TABLE "evidence_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"evidence_id" text NOT NULL,
	"verifier_version" text NOT NULL,
	"accepted" boolean NOT NULL,
	"reason_code" text,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"trace_time" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"status" text NOT NULL,
	"cursor" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lab_run_cursor_nonnegative" CHECK ("lab_runs"."cursor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lab_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lanes" (
	"id" text PRIMARY KEY NOT NULL,
	"corridor_id" text NOT NULL,
	"version" integer NOT NULL,
	"external_session_id" text NOT NULL,
	"charger_id" text NOT NULL,
	"meter_id" text NOT NULL,
	"max_power_watts" numeric(78, 0) NOT NULL,
	"expected_proof_interval_ms" bigint NOT NULL,
	"tariff_snapshot" jsonb NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"settlement_asset_id" text NOT NULL,
	"tempo_network" text NOT NULL,
	"state" text NOT NULL,
	"service_started" boolean NOT NULL,
	"evidence_health" text NOT NULL,
	"chain_health" text NOT NULL,
	"signer_health" text NOT NULL,
	"trusted_energy_wh" numeric(78, 0) NOT NULL,
	"trusted_delivered_value" numeric(78, 0) NOT NULL,
	"authorized_value" numeric(78, 0) NOT NULL,
	"settled_value" numeric(78, 0) NOT NULL,
	"confirmed_deposit" numeric(78, 0),
	"funded_headroom" numeric(78, 0),
	"last_trusted_evidence_at" timestamp with time zone,
	"last_chain_observed_at" timestamp with time zone,
	"last_evidence_hash" text,
	"last_evidence_sequence" integer,
	"channel_id" text,
	"unverified_service_bound" numeric(78, 0) NOT NULL,
	"worst_case_delivered_value" numeric(78, 0) NOT NULL,
	"protected_value" numeric(78, 0) NOT NULL,
	"protected_watermark" numeric(78, 0) NOT NULL,
	"unprotected_exposure_bound" numeric(78, 0) NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"final_cdr_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lane_version_nonnegative" CHECK (version >= 0),
	CONSTRAINT "lane_values_nonnegative" CHECK ("lanes"."trusted_energy_wh" >= 0 and "lanes"."trusted_delivered_value" >= 0 and "lanes"."authorized_value" >= 0 and "lanes"."settled_value" >= 0 and ("lanes"."confirmed_deposit" is null or "lanes"."confirmed_deposit" >= 0) and ("lanes"."funded_headroom" is null or "lanes"."funded_headroom" >= 0) and "lanes"."unverified_service_bound" >= 0 and "lanes"."worst_case_delivered_value" >= 0 and "lanes"."protected_value" >= 0 and "lanes"."protected_watermark" >= 0 and "lanes"."unprotected_exposure_bound" >= 0),
	CONSTRAINT "lane_capacity_positive" CHECK ("lanes"."max_power_watts" > 0 and "lanes"."expected_proof_interval_ms" > 0),
	CONSTRAINT "lane_value_order" CHECK ("lanes"."authorized_value" <= "lanes"."trusted_delivered_value" and "lanes"."settled_value" <= "lanes"."authorized_value" and ("lanes"."confirmed_deposit" is null or "lanes"."authorized_value" <= "lanes"."confirmed_deposit") and "lanes"."protected_value" <= "lanes"."authorized_value" and "lanes"."protected_value" <= "lanes"."trusted_delivered_value")
);
--> statement-breakpoint
CREATE TABLE "meter_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"lane_id" text NOT NULL,
	"raw" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"trace_time" timestamp with time zone,
	"meter_id" text,
	"session_id" text,
	"sequence" integer,
	"accepted_sequence" integer,
	"cumulative_wh" numeric(78, 0),
	"cumulative_milli_wh" numeric(78, 0),
	CONSTRAINT "evidence_values_nonnegative" CHECK (("meter_evidence"."cumulative_wh" is null or "meter_evidence"."cumulative_wh" >= 0) and ("meter_evidence"."cumulative_milli_wh" is null or "meter_evidence"."cumulative_milli_wh" >= 0))
);
--> statement-breakpoint
CREATE TABLE "meter_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"corridor_id" text NOT NULL,
	"meter_id" text NOT NULL,
	"cpo" text NOT NULL,
	"public_key_hex" text NOT NULL,
	"algorithm" text NOT NULL,
	"fingerprint" text NOT NULL,
	"enabled" boolean NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"lane_id" text NOT NULL,
	"effect_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" text,
	"last_error" text,
	"external_reference" text,
	CONSTRAINT "outbox_jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "outbox_attempts_nonnegative" CHECK ("outbox_jobs"."attempt_count" >= 0),
	CONSTRAINT "outbox_status_valid" CHECK ("outbox_jobs"."status" in ('pending', 'processing', 'submitted', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "processed_commands" (
	"command_id" text PRIMARY KEY NOT NULL,
	"aggregate_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"outcome" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"lane_id" text NOT NULL,
	"cdr_id" text NOT NULL,
	"status" text NOT NULL,
	"compared_total" numeric(78, 0),
	"reason_code" text,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tempo_chain_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"chain_height" numeric(78, 0) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"confirmed_deposit" numeric(78, 0) NOT NULL,
	"settled_value" numeric(78, 0) NOT NULL,
	"channel_state" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "snapshot_values_nonnegative" CHECK ("tempo_chain_snapshots"."chain_height" >= 0 and "tempo_chain_snapshots"."confirmed_deposit" >= 0 and "tempo_chain_snapshots"."settled_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tempo_channels" (
	"lane_id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"network" text NOT NULL,
	"asset_id" text NOT NULL,
	"status" text NOT NULL,
	"observed_at" timestamp with time zone,
	CONSTRAINT "tempo_channels_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "tempo_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"tx_hash" text,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "tempo_transactions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "tempo_vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"cumulative_amount" numeric(78, 0) NOT NULL,
	"signer_ref" text NOT NULL,
	"domain_ref" text NOT NULL,
	"signature_ref" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "voucher_amount_nonnegative" CHECK (cumulative_amount >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_projection" ADD CONSTRAINT "audit_projection_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_projection" ADD CONSTRAINT "audit_projection_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_projection" ADD CONSTRAINT "audit_projection_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdrs" ADD CONSTRAINT "cdrs_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_verifications" ADD CONSTRAINT "evidence_verifications_evidence_id_meter_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."meter_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_run_events" ADD CONSTRAINT "lab_run_events_run_id_lab_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_runs_scenario_id_lab_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."lab_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lanes" ADD CONSTRAINT "lanes_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_evidence" ADD CONSTRAINT "meter_evidence_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_identities" ADD CONSTRAINT "meter_identities_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_cdr_id_cdrs_id_fk" FOREIGN KEY ("cdr_id") REFERENCES "public"."cdrs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_chain_snapshots" ADD CONSTRAINT "tempo_chain_snapshots_channel_id_tempo_channels_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."tempo_channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_channels" ADD CONSTRAINT "tempo_channels_lane_id_lanes_id_fk" FOREIGN KEY ("lane_id") REFERENCES "public"."lanes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_transactions" ADD CONSTRAINT "tempo_transactions_channel_id_tempo_channels_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."tempo_channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ADD CONSTRAINT "tempo_vouchers_channel_id_tempo_channels_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."tempo_channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_lane_version_idx" ON "audit_projection" USING btree ("lane_id","lane_version");--> statement-breakpoint
CREATE INDEX "cdr_lane_idx" ON "cdrs" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "event_lane_order_idx" ON "domain_events" USING btree ("lane_id","lane_version");--> statement-breakpoint
CREATE INDEX "event_corridor_idx" ON "domain_events" USING btree ("corridor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_evidence_unique" ON "evidence_verifications" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_run_sequence_unique" ON "lab_run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "lab_run_scenario_idx" ON "lab_runs" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lane_external_session_unique" ON "lanes" USING btree ("external_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lane_channel_unique" ON "lanes" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "lane_corridor_idx" ON "lanes" USING btree ("corridor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_lane_hash_unique" ON "meter_evidence" USING btree ("lane_id","evidence_hash");--> statement-breakpoint
CREATE INDEX "evidence_lane_time_idx" ON "meter_evidence" USING btree ("lane_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_accepted_sequence_unique" ON "meter_evidence" USING btree ("lane_id","accepted_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "meter_corridor_identity" ON "meter_identities" USING btree ("corridor_id","meter_id");--> statement-breakpoint
CREATE INDEX "meter_corridor_idx" ON "meter_identities" USING btree ("corridor_id");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_lane_idx" ON "outbox_jobs" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "command_aggregate_idx" ON "processed_commands" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "reconciliation_lane_idx" ON "reconciliations" USING btree ("lane_id");--> statement-breakpoint
CREATE INDEX "tempo_snapshot_channel_time_idx" ON "tempo_chain_snapshots" USING btree ("channel_id","observed_at");--> statement-breakpoint
CREATE INDEX "tempo_transaction_channel_idx" ON "tempo_transactions" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "tempo_voucher_channel_idx" ON "tempo_vouchers" USING btree ("channel_id");