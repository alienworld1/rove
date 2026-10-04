DO $$
DECLARE
  api_role text;
  private_table text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      FOREACH private_table IN ARRAY ARRAY[
        'audit_projection', 'cdrs', 'corridors', 'domain_events', 'evidence_verifications',
        'hosted_admissions', 'hosted_invites', 'hosted_rate_limits', 'hosted_sessions',
        'hosted_submissions', 'lab_run_events', 'lab_runs', 'lab_scenarios', 'lanes',
        'meter_evidence', 'meter_identities', 'outbox_jobs', 'payment_operations',
        'processed_commands', 'reconciliations', 'tempo_chain_snapshots',
        'tempo_channels', 'tempo_transactions', 'tempo_vouchers'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', private_table, api_role);
      END LOOP;
      EXECUTE format('REVOKE ALL ON TABLE public.published_runs FROM %I', api_role);
      EXECUTE format('GRANT SELECT ON TABLE public.published_runs TO %I', api_role);
    END IF;
  END LOOP;
END $$;
