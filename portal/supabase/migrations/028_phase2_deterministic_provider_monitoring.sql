BEGIN;

ALTER TABLE public.provider_monitoring_schedules
  DROP CONSTRAINT IF EXISTS provider_monitoring_schedules_frequency_check;
UPDATE public.provider_monitoring_schedules
SET frequency = CASE frequency
  WHEN 'hourly' THEN 'every_6_hours'
  WHEN 'weekly' THEN 'daily'
  ELSE frequency
END
WHERE frequency IN ('hourly', 'weekly');
ALTER TABLE public.provider_monitoring_schedules
  ADD CONSTRAINT provider_monitoring_schedules_frequency_check
  CHECK (frequency IN ('every_6_hours', 'every_12_hours', 'daily'));
ALTER TABLE public.provider_monitoring_schedules
  ADD COLUMN IF NOT EXISTS baseline_established_at TIMESTAMPTZ;

ALTER TABLE public.provider_monitoring_runs
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signals_updated INTEGER NOT NULL DEFAULT 0 CHECK (signals_updated >= 0);

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1);

CREATE OR REPLACE FUNCTION public.save_monitoring_schedule(
  p_provider_account_id UUID,
  p_frequency TEXT,
  p_enabled BOOLEAN,
  p_actor UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_next TIMESTAMPTZ;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may manage monitoring schedules';
  END IF;
  IF p_frequency NOT IN ('every_6_hours', 'every_12_hours', 'daily') THEN
    RAISE EXCEPTION 'Unsupported monitoring frequency: %', p_frequency;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_accounts WHERE id = p_provider_account_id) THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  v_next := CASE WHEN p_enabled THEN
    now() + CASE p_frequency
      WHEN 'every_6_hours' THEN interval '6 hours'
      WHEN 'every_12_hours' THEN interval '12 hours'
      WHEN 'daily' THEN interval '1 day'
    END
  ELSE NULL END;

  INSERT INTO public.provider_monitoring_schedules (
    provider_account_id, frequency, enabled, next_run_at, created_by
  ) VALUES (
    p_provider_account_id, p_frequency, p_enabled, v_next, p_actor
  )
  ON CONFLICT (provider_account_id) DO UPDATE SET
    frequency = EXCLUDED.frequency,
    enabled = EXCLUDED.enabled,
    next_run_at = CASE
      WHEN provider_monitoring_schedules.enabled IS DISTINCT FROM EXCLUDED.enabled
        OR provider_monitoring_schedules.frequency IS DISTINCT FROM EXCLUDED.frequency
      THEN EXCLUDED.next_run_at
      ELSE provider_monitoring_schedules.next_run_at
    END,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_monitoring_run(
  p_provider_account_id UUID,
  p_trigger_source TEXT,
  p_schedule_id UUID DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run UUID;
  v_skip UUID;
  v_baseline BOOLEAN;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may start monitoring runs';
  END IF;
  IF p_trigger_source NOT IN ('manual', 'scheduled', 'event') THEN
    RAISE EXCEPTION 'Unknown monitoring trigger: %', p_trigger_source;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_accounts
    WHERE id = p_provider_account_id AND status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Provider account % is not available for monitoring', p_provider_account_id;
  END IF;

  IF p_schedule_id IS NOT NULL THEN
    SELECT baseline_established_at IS NULL INTO v_baseline
    FROM public.provider_monitoring_schedules WHERE id = p_schedule_id;
    v_baseline := COALESCE(v_baseline, true);
  ELSE
    v_baseline := NOT EXISTS (
      SELECT 1 FROM public.provider_monitoring_runs
      WHERE provider_account_id = p_provider_account_id AND status = 'completed'
    );
  END IF;

  INSERT INTO public.provider_monitoring_runs (
    schedule_id, provider_account_id, trigger_source, status, is_baseline
  ) VALUES (
    p_schedule_id, p_provider_account_id, p_trigger_source, 'running', v_baseline
  )
  ON CONFLICT (provider_account_id) WHERE status = 'running' DO NOTHING
  RETURNING id INTO v_run;

  IF v_run IS NULL THEN
    INSERT INTO public.provider_monitoring_runs (
      schedule_id, provider_account_id, trigger_source, status,
      error_category, completed_at, is_baseline
    ) VALUES (
      p_schedule_id, p_provider_account_id, p_trigger_source, 'skipped',
      'already_running', now(), false
    ) RETURNING id INTO v_skip;
    RETURN jsonb_build_object('outcome', 'skipped', 'run_id', v_skip, 'is_baseline', false);
  END IF;

  RETURN jsonb_build_object('outcome', 'begin', 'run_id', v_run, 'is_baseline', v_baseline);
END;
$$;

ALTER FUNCTION public.process_monitoring_run(UUID, UUID, UUID)
  RENAME TO process_monitoring_run_phase3g4;

CREATE FUNCTION public.process_monitoring_run(
  p_run_id UUID,
  p_actor UUID DEFAULT NULL,
  p_reconciliation_run_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_baseline BOOLEAN;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may process monitoring runs';
  END IF;
  SELECT is_baseline INTO v_baseline FROM public.provider_monitoring_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monitoring run % not found', p_run_id; END IF;
  IF v_baseline THEN
    RETURN jsonb_build_object('changes_detected', 0, 'signals_created', 0, 'incidents_created', 0);
  END IF;
  RETURN public.process_monitoring_run_phase3g4(p_run_id, p_actor, p_reconciliation_run_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_monitoring_run_phase3g4(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_monitoring_run(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_monitoring_run(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.provider_discovered_snapshot(p_discovered_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'external_resource_id', d.external_resource_id,
    'resource_type', d.resource_type,
    'name', d.name,
    'status', d.status,
    'region', d.region,
    'external_url', d.external_url,
    'external_missing', d.external_missing,
    'operational_metadata', jsonb_strip_nulls(jsonb_build_object(
      'production_domain', d.metadata -> 'production_domain',
      'production_status', d.metadata #> '{environments,production,status}',
      'latest_deployment_status', d.metadata #> '{latest_deployment,status}'
    ))
  )
  FROM public.provider_discovered_resources d
  WHERE d.id = p_discovered_id;
$$;

CREATE OR REPLACE FUNCTION public.track_monitoring_signal_observation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'provider_monitoring'
     AND NEW.monitoring_run_id IS DISTINCT FROM OLD.monitoring_run_id THEN
    NEW.last_observed_at := now();
    NEW.occurrence_count := OLD.occurrence_count + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_action_item_monitoring_observation ON public.action_items;
CREATE TRIGGER trg_action_item_monitoring_observation
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.track_monitoring_signal_observation();

CREATE OR REPLACE FUNCTION public.complete_monitoring_run(
  p_run_id UUID,
  p_outcome TEXT,
  p_discovery_run_id UUID DEFAULT NULL,
  p_reconciliation_run_id UUID DEFAULT NULL,
  p_changes_detected INTEGER DEFAULT 0,
  p_signals_created INTEGER DEFAULT 0,
  p_incidents_created INTEGER DEFAULT 0,
  p_error_category TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.provider_monitoring_runs%ROWTYPE;
  v_sched public.provider_monitoring_schedules%ROWTYPE;
  v_failures INTEGER;
  v_dedupe TEXT;
  v_existing UUID;
  v_immediate BOOLEAN;
  v_severity TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may complete monitoring runs';
  END IF;
  IF p_outcome NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'Unknown monitoring outcome: %', p_outcome;
  END IF;

  SELECT * INTO v_run FROM public.provider_monitoring_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monitoring run % not found', p_run_id; END IF;
  IF v_run.status <> 'running' THEN RETURN 'already_completed'; END IF;

  UPDATE public.provider_monitoring_runs
  SET status = p_outcome,
      discovery_run_id = COALESCE(p_discovery_run_id, discovery_run_id),
      reconciliation_run_id = COALESCE(p_reconciliation_run_id, reconciliation_run_id),
      changes_detected = p_changes_detected,
      signals_created = p_signals_created,
      incidents_created = p_incidents_created,
      error_category = p_error_category,
      completed_at = now(), updated_at = now()
  WHERE id = p_run_id;

  IF v_run.schedule_id IS NOT NULL THEN
    SELECT * INTO v_sched FROM public.provider_monitoring_schedules WHERE id = v_run.schedule_id;
    v_failures := CASE WHEN p_outcome = 'completed' THEN 0 ELSE v_sched.consecutive_failures + 1 END;
    UPDATE public.provider_monitoring_schedules
    SET last_run_at = now(),
        last_success_at = CASE WHEN p_outcome = 'completed' THEN now() ELSE last_success_at END,
        last_failure_at = CASE WHEN p_outcome = 'failed' THEN now() ELSE last_failure_at END,
        consecutive_failures = v_failures,
        baseline_established_at = CASE
          WHEN p_outcome = 'completed' AND v_run.is_baseline THEN COALESCE(baseline_established_at, now())
          ELSE baseline_established_at END,
        next_run_at = CASE WHEN enabled THEN
          now() + CASE frequency
            WHEN 'every_6_hours' THEN interval '6 hours'
            WHEN 'every_12_hours' THEN interval '12 hours'
            WHEN 'daily' THEN interval '1 day'
          END
        ELSE next_run_at END,
        updated_at = now()
    WHERE id = v_run.schedule_id;
  ELSE
    SELECT count(*)::INTEGER INTO v_failures
    FROM public.provider_monitoring_runs
    WHERE provider_account_id = v_run.provider_account_id
      AND status = 'failed'
      AND started_at >= now() - interval '7 days';
  END IF;

  v_immediate := p_error_category IN ('auth_failed', 'permission_denied', 'no_credentials');
  v_severity := CASE WHEN v_immediate THEN 'critical' ELSE 'warning' END;
  IF p_outcome = 'failed' AND (v_immediate OR v_failures >= 2) THEN
    v_dedupe := 'mon:' || v_run.provider_account_id::text || ':connection';
    SELECT id INTO v_existing FROM public.action_items
    WHERE dedupe_key = v_dedupe AND status IN ('open', 'acknowledged');
    IF v_existing IS NULL THEN
      INSERT INTO public.action_items (
        source, event_type, severity, title, summary, recommended_action,
        dedupe_key, provider_account_id, monitoring_run_id,
        client_id, detected_at, first_observed_at, last_observed_at
      )
      SELECT 'provider_monitoring',
             CASE WHEN v_immediate THEN 'discovery_failure' ELSE 'connection_failure' END,
             v_severity,
             CASE WHEN v_immediate THEN 'Provider authentication or permission failure' ELSE 'Provider connection repeatedly failing' END,
             'SCH could not complete read-only provider discovery (' || COALESCE(p_error_category, 'unknown')
               || '). This means provider evidence is unavailable; it does not prove client infrastructure is down.',
             'Check the provider credential, permissions, and provider service status',
             v_dedupe, v_run.provider_account_id, p_run_id,
             a.client_id, now(), now(), now()
      FROM public.provider_accounts a WHERE a.id = v_run.provider_account_id;
    ELSE
      UPDATE public.action_items
      SET monitoring_run_id = p_run_id,
          severity = CASE WHEN severity = 'critical' THEN severity ELSE v_severity END,
          summary = 'SCH could not complete read-only provider discovery (' || COALESCE(p_error_category, 'unknown') || ').',
          updated_at = now()
      WHERE id = v_existing;
    END IF;
  END IF;

  IF p_outcome = 'completed' THEN
    UPDATE public.action_items
    SET status = 'resolved', resolved_at = now(), last_observed_at = now(), updated_at = now()
    WHERE dedupe_key = 'mon:' || v_run.provider_account_id::text || ':connection'
      AND status IN ('open', 'acknowledged');
  END IF;

  RETURN p_outcome;
END;
$$;

DROP VIEW IF EXISTS public.provider_monitoring_overview;
CREATE VIEW public.provider_monitoring_overview AS
SELECT
  s.id AS schedule_id, s.provider_account_id, pr.name AS provider_name,
  pr.adapter_key, pa.account_name, pa.ownership, pa.client_id,
  cp.company_name AS client_company, pa.connection_status,
  s.frequency, s.enabled, s.next_run_at, s.last_run_at, s.last_success_at,
  s.last_failure_at, s.consecutive_failures, s.baseline_established_at,
  lr.id AS last_run_id, lr.status AS last_run_status,
  lr.trigger_source AS last_trigger, lr.changes_detected AS last_changes_detected,
  lr.signals_created AS last_signals_created, lr.signals_updated AS last_signals_updated,
  lr.error_category AS last_error_category, s.created_at, s.updated_at
FROM public.provider_monitoring_schedules s
JOIN public.provider_accounts pa ON pa.id = s.provider_account_id
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.profiles cp ON cp.id = pa.client_id
LEFT JOIN LATERAL (
  SELECT r.* FROM public.provider_monitoring_runs r
  WHERE r.provider_account_id = s.provider_account_id
  ORDER BY r.started_at DESC LIMIT 1
) lr ON true
WHERE public.is_admin() OR public.is_finance();

DROP VIEW IF EXISTS public.provider_monitoring_run_overview;
CREATE VIEW public.provider_monitoring_run_overview AS
SELECT
  r.id, r.schedule_id, r.provider_account_id, pr.name AS provider_name,
  pa.account_name, r.trigger_source, r.status, r.is_baseline,
  r.discovery_run_id, dr.status AS discovery_status, dr.discovered_count,
  r.reconciliation_run_id, rr.status AS reconciliation_status,
  rr.changes_detected AS reconciliation_changes, r.changes_detected,
  r.signals_created, r.signals_updated, r.incidents_created,
  r.error_category, r.started_at, r.completed_at, r.created_at
FROM public.provider_monitoring_runs r
JOIN public.provider_accounts pa ON pa.id = r.provider_account_id
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.provider_discovery_runs dr ON dr.id = r.discovery_run_id
LEFT JOIN public.provider_reconciliation_runs rr ON rr.id = r.reconciliation_run_id
WHERE public.is_admin() OR public.is_finance();

DROP VIEW IF EXISTS public.action_item_overview;
CREATE VIEW public.action_item_overview AS
SELECT
  ai.id, ai.source, ai.event_type, ai.severity, ai.title, ai.summary,
  ai.recommended_action, ai.status, ai.provider_account_id,
  pr.name AS provider_name, pa.account_name, ai.discovered_resource_id,
  d.external_resource_id, d.name AS external_name, ai.reconciliation_item_id,
  ai.monitoring_run_id, ai.client_id, cp.company_name AS client_company,
  ai.system_id, s.name AS system_name, ai.resource_id,
  res.name AS resource_name, res.status AS resource_status,
  ai.incident_id, inc.status AS incident_status, ai.detected_at,
  ai.first_observed_at, ai.last_observed_at, ai.occurrence_count,
  ai.acknowledged_by, ack.full_name AS acknowledged_by_name,
  ai.resolved_by, res2.full_name AS resolved_by_name, ai.resolved_at,
  ai.created_at, ai.updated_at
FROM public.action_items ai
LEFT JOIN public.provider_accounts pa ON pa.id = ai.provider_account_id
LEFT JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.provider_discovered_resources d ON d.id = ai.discovered_resource_id
LEFT JOIN public.profiles cp ON cp.id = ai.client_id
LEFT JOIN public.systems s ON s.id = ai.system_id
LEFT JOIN public.resources res ON res.id = ai.resource_id
LEFT JOIN public.incidents inc ON inc.id = ai.incident_id
LEFT JOIN public.profiles ack ON ack.id = ai.acknowledged_by
LEFT JOIN public.profiles res2 ON res2.id = ai.resolved_by
WHERE public.is_admin() OR public.is_finance() OR public.is_staff();

REVOKE ALL ON public.provider_monitoring_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_monitoring_overview TO authenticated, service_role;
REVOKE ALL ON public.provider_monitoring_run_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_monitoring_run_overview TO authenticated, service_role;
REVOKE ALL ON public.action_item_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.action_item_overview TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.track_monitoring_signal_observation() FROM PUBLIC, anon, authenticated;

COMMIT;
