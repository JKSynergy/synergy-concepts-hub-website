-- ============================================================================
-- Migration 023 — Phase 3G-4: Provider Monitoring & Scheduled Reconciliation
-- ============================================================================
--
-- First genuine automation layer:
--
--   SCHEDULE → DISCOVER → RECONCILE → DETECT CHANGE → CLASSIFY
--     → ACTION CENTER / INCIDENT SIGNAL → HUMAN REVIEW
--
-- Hard rules enforced here:
--   * Automation may observe, compare, classify and surface — it must NEVER
--     mutate provider infrastructure. Nothing in this migration can create,
--     approve or execute a provider_operation_proposal.
--   * Manual "Run Now" and scheduled execution share ONE service path:
--     begin_monitoring_run → (existing discovery) → run_provider_reconciliation
--     → process_monitoring_run → complete_monitoring_run.
--   * Single-flight: at most one 'running' monitoring run per provider
--     account — enforced by a partial unique index, not by hoping.
--   * Signals deduplicate on a stable dedupe_key — repeated scheduled runs
--     refresh the existing open item instead of stacking duplicates.
--   * Incident creation is a narrow deterministic rule: a linked SCH resource
--     that is confirmed missing externally, or whose provider state is
--     observed down/unavailable, and no open incident already covers it.
--   * Credentials never enter these tables — they stay in Supabase Vault.
--   * Schedules, runs and signals are auditable; runs and signals cannot be
--     deleted.
--
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Monitoring schedules — one per provider account
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_monitoring_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id   UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  frequency             TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('hourly', 'every_6_hours', 'daily', 'weekly')),
  enabled               BOOLEAN NOT NULL DEFAULT false,
  next_run_at           TIMESTAMPTZ,
  last_run_at           TIMESTAMPTZ,
  last_success_at       TIMESTAMPTZ,
  last_failure_at       TIMESTAMPTZ,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_monitoring_schedule_account UNIQUE (provider_account_id)
);

-- ----------------------------------------------------------------------------
-- 2. Monitoring runs — one row per execution attempt (manual or scheduled)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_monitoring_runs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id             UUID REFERENCES public.provider_monitoring_schedules(id) ON DELETE SET NULL,
  provider_account_id     UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  trigger_source          TEXT NOT NULL CHECK (trigger_source IN ('manual', 'scheduled')),
  status                  TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  discovery_run_id        UUID REFERENCES public.provider_discovery_runs(id),
  reconciliation_run_id   UUID REFERENCES public.provider_reconciliation_runs(id),
  changes_detected        INTEGER NOT NULL DEFAULT 0 CHECK (changes_detected >= 0),
  signals_created         INTEGER NOT NULL DEFAULT 0 CHECK (signals_created >= 0),
  incidents_created       INTEGER NOT NULL DEFAULT 0 CHECK (incidents_created >= 0),
  error_category          TEXT CHECK (public.check_no_secrets_in_text(error_category)),
  started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-flight: at most ONE running monitoring run per provider account.
-- The partial unique index is the lock — no advisory guessing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_monitoring_live_run
  ON public.provider_monitoring_runs (provider_account_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_monitoring_runs_account
  ON public.provider_monitoring_runs (provider_account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_runs_schedule
  ON public.provider_monitoring_runs (schedule_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_runs_status
  ON public.provider_monitoring_runs (status);

-- ----------------------------------------------------------------------------
-- 3. action_items — the Action Center (generic, source-tagged, deduplicated)
-- ----------------------------------------------------------------------------
-- A signal is the unit of "something needs human attention". Provider
-- monitoring is the first source; the model is deliberately generic so other
-- operational sources can use it later without inventing alert tables.
CREATE TABLE IF NOT EXISTS public.action_items (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                    TEXT NOT NULL
    CHECK (source IN ('provider_monitoring', 'provider_reconciliation', 'manual')),
  event_type                TEXT NOT NULL CHECK (event_type IN (
    'connection_failure', 'discovery_failure', 'external_change',
    'missing_externally', 'new_external_resource', 'identity_change',
    'sch_only', 'general')),
  severity                  TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title                     TEXT NOT NULL
    CHECK (char_length(btrim(title)) > 0 AND public.check_no_secrets_in_text(title)),
  summary                   TEXT CHECK (public.check_no_secrets_in_text(summary)),
  recommended_action        TEXT CHECK (public.check_no_secrets_in_text(recommended_action)),
  status                    TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  -- Stable dedupe identity: one OPEN item per (subject, event). A repeat of
  -- the same condition refreshes the existing item instead of duplicating.
  dedupe_key                TEXT NOT NULL,
  provider_account_id       UUID REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  discovered_resource_id    UUID REFERENCES public.provider_discovered_resources(id) ON DELETE SET NULL,
  reconciliation_item_id    UUID REFERENCES public.provider_reconciliation_items(id) ON DELETE SET NULL,
  monitoring_run_id         UUID REFERENCES public.provider_monitoring_runs(id) ON DELETE SET NULL,
  client_id                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  system_id                 UUID REFERENCES public.systems(id) ON DELETE SET NULL,
  resource_id               UUID REFERENCES public.resources(id) ON DELETE SET NULL,
  incident_id               UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  detected_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by           UUID REFERENCES auth.users(id),
  acknowledged_at           TIMESTAMPTZ,
  resolved_by               UUID REFERENCES auth.users(id),
  resolved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most ONE open/acknowledged item per dedupe key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_item_open
  ON public.action_items (dedupe_key)
  WHERE status IN ('open', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_action_items_status ON public.action_items (status);
CREATE INDEX IF NOT EXISTS idx_action_items_account ON public.action_items (provider_account_id);
CREATE INDEX IF NOT EXISTS idx_action_items_client ON public.action_items (client_id);

-- ----------------------------------------------------------------------------
-- 4. save_monitoring_schedule — admin-managed schedule upsert
-- ----------------------------------------------------------------------------
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
  IF p_frequency NOT IN ('hourly', 'every_6_hours', 'daily', 'weekly') THEN
    RAISE EXCEPTION 'Unsupported monitoring frequency: %', p_frequency;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_accounts WHERE id = p_provider_account_id) THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  v_next := CASE WHEN p_enabled THEN
    now() + CASE p_frequency
      WHEN 'hourly'         THEN interval '1 hour'
      WHEN 'every_6_hours'  THEN interval '6 hours'
      WHEN 'daily'          THEN interval '1 day'
      WHEN 'weekly'         THEN interval '7 days'
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

-- ----------------------------------------------------------------------------
-- 5. due_monitoring_schedules — enabled + past due
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.due_monitoring_schedules()
RETURNS TABLE (schedule_id UUID, provider_account_id UUID)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.provider_account_id
  FROM public.provider_monitoring_schedules s
  JOIN public.provider_accounts a ON a.id = s.provider_account_id
  WHERE s.enabled
    AND s.next_run_at IS NOT NULL
    AND s.next_run_at <= now()
    AND a.status <> 'archived'
  ORDER BY s.next_run_at;
$$;

-- ----------------------------------------------------------------------------
-- 6. begin_monitoring_run — claim the single-flight slot
-- ----------------------------------------------------------------------------
-- Returns JSONB:
--   { outcome: 'begin',   run_id }  — caller now owns the run
--   { outcome: 'skipped', run_id }  — a run was already live; a skipped row is
--                                     recorded so scheduler retries are audited
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
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may start monitoring runs';
  END IF;
  IF p_trigger_source NOT IN ('manual', 'scheduled') THEN
    RAISE EXCEPTION 'Unknown monitoring trigger: %', p_trigger_source;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_accounts
    WHERE id = p_provider_account_id AND status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Provider account % is not available for monitoring', p_provider_account_id;
  END IF;

  -- Single-flight claim: the partial unique index rejects a second 'running'
  -- row for the same account. On conflict, record an audited 'skipped' run.
  INSERT INTO public.provider_monitoring_runs (
    schedule_id, provider_account_id, trigger_source, status
  ) VALUES (
    p_schedule_id, p_provider_account_id, p_trigger_source, 'running'
  )
  ON CONFLICT (provider_account_id) WHERE status = 'running' DO NOTHING
  RETURNING id INTO v_run;

  IF v_run IS NULL THEN
    INSERT INTO public.provider_monitoring_runs (
      schedule_id, provider_account_id, trigger_source, status,
      error_category, completed_at
    ) VALUES (
      p_schedule_id, p_provider_account_id, p_trigger_source, 'skipped',
      'already_running', now()
    ) RETURNING id INTO v_skip;
    RETURN jsonb_build_object('outcome', 'skipped', 'run_id', v_skip);
  END IF;

  RETURN jsonb_build_object('outcome', 'begin', 'run_id', v_run);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. process_monitoring_run — deterministic classify → signals → incidents
-- ----------------------------------------------------------------------------
-- Reads the reconciliation items produced by this monitoring run and:
--   * creates/refreshes deduplicated Action Center signals
--   * creates/deduplicates incidents for the narrow "linked resource is
--     externally gone or down" rule
--   * auto-resolves signals whose subject reconciled cleanly ('unchanged')
-- Returns JSONB: { changes_detected, signals_created, incidents_created }
CREATE OR REPLACE FUNCTION public.process_monitoring_run(
  p_run_id UUID,
  p_actor UUID DEFAULT NULL,
  p_reconciliation_run_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run        public.provider_monitoring_runs%ROWTYPE;
  v_item       public.provider_reconciliation_items%ROWTYPE;
  v_res        public.resources%ROWTYPE;
  v_disc       public.provider_discovered_resources%ROWTYPE;
  v_existing   UUID;
  v_incident   UUID;
  v_reporter   UUID;
  v_severity   TEXT;
  v_event      TEXT;
  v_title      TEXT;
  v_summary    TEXT;
  v_action     TEXT;
  v_dedupe     TEXT;
  v_is_down    BOOLEAN;
  v_changes    INTEGER := 0;
  v_signals    INTEGER := 0;
  v_incidents  INTEGER := 0;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may process monitoring runs';
  END IF;

  SELECT * INTO v_run FROM public.provider_monitoring_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Monitoring run % not found', p_run_id;
  END IF;
  -- The caller may pass the fresh reconciliation run id directly (the run row
  -- is stamped at completion, after processing).
  v_run.reconciliation_run_id := COALESCE(p_reconciliation_run_id, v_run.reconciliation_run_id);
  IF v_run.reconciliation_run_id IS NULL THEN
    RETURN jsonb_build_object('changes_detected', 0, 'signals_created', 0, 'incidents_created', 0);
  END IF;

  -- Who "reported" monitoring incidents: the caller, else the schedule owner,
  -- else the earliest admin — reported_by is NOT NULL.
  v_reporter := COALESCE(
    p_actor,
    (SELECT s.created_by FROM public.provider_monitoring_schedules s
      WHERE s.id = v_run.schedule_id),
    (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1)
  );

  FOR v_item IN
    SELECT * FROM public.provider_reconciliation_items
    WHERE run_id = v_run.reconciliation_run_id
      AND change_type <> 'unchanged'
  LOOP
    v_changes := v_changes + 1;

    -- Subject context (linked resource → client/system/resource lineage).
    v_res := NULL;
    v_disc := NULL;
    IF v_item.resource_id IS NOT NULL THEN
      SELECT * INTO v_res FROM public.resources WHERE id = v_item.resource_id;
    END IF;
    IF v_item.discovered_resource_id IS NOT NULL THEN
      SELECT * INTO v_disc FROM public.provider_discovered_resources
      WHERE id = v_item.discovered_resource_id;
    END IF;

    -- Down-state vocabulary: provider status indicating the resource is not
    -- serving. Deterministic — no inference from arbitrary metadata.
    v_is_down := v_item.change_type = 'missing_externally'
      OR upper(COALESCE(v_item.current_snapshot ->> 'status', '')) IN (
        'INACTIVE', 'PAUSED', 'SUSPENDED', 'STOPPED', 'DELETED',
        'CRASHED', 'DOWN', 'FAILED', 'ERROR', 'REMOVED'
      );

    -- Classification → severity / event / copy (deterministic rules only).
    v_event := v_item.change_type;
    v_severity := 'info';
    v_title := 'Provider reconciliation change';
    v_action := 'Review reconciliation item';

    IF v_item.change_type = 'missing_externally' THEN
      v_severity := CASE WHEN v_item.resource_id IS NOT NULL THEN 'critical' ELSE 'warning' END;
      v_title := 'Resource missing at provider';
      v_action := 'Verify the resource at the provider; if intentional, update the SCH record';
    ELSIF v_item.change_type = 'identity_change' THEN
      v_severity := 'warning';
      v_title := 'Provider resource identity changed';
      v_action := 'Confirm the provider resource still corresponds to the linked SCH resource';
    ELSIF v_item.change_type = 'external_change' THEN
      IF v_item.change_summary ILIKE '%status%' THEN
        v_severity := CASE WHEN v_is_down AND v_item.resource_id IS NOT NULL THEN 'critical' ELSE 'warning' END;
        v_title := 'Provider resource status changed';
        v_action := 'Review resource state; use the provider operations workflow if action is needed';
      ELSE
        v_severity := 'info';
        v_title := 'Provider resource metadata changed';
        v_action := 'Review reconciliation item';
      END IF;
    ELSIF v_item.change_type = 'new_external_resource' THEN
      v_severity := 'info';
      v_title := 'New provider resource discovered';
      v_action := 'Review and explicitly link the discovered resource';
    ELSIF v_item.change_type = 'sch_only' THEN
      v_severity := 'info';
      v_title := 'SCH resource has no provider counterpart';
      v_action := 'Review whether the SCH resource is still provisioned';
    END IF;

    v_summary := COALESCE(v_item.change_summary, v_item.change_type);
    v_dedupe := 'mon:' || v_item.provider_account_id::text || ':'
      || COALESCE(v_item.discovered_resource_id::text, v_item.resource_id::text, 'account')
      || ':' || v_event;

    SELECT id INTO v_existing FROM public.action_items
    WHERE dedupe_key = v_dedupe AND status IN ('open', 'acknowledged');

    IF v_existing IS NOT NULL THEN
      -- Same unresolved condition → refresh the existing signal, no duplicate.
      UPDATE public.action_items
      SET detected_at = now(),
          summary = v_summary,
          monitoring_run_id = p_run_id,
          reconciliation_item_id = v_item.id,
          severity = v_severity,
          updated_at = now()
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.action_items (
        source, event_type, severity, title, summary, recommended_action,
        dedupe_key, provider_account_id, discovered_resource_id,
        reconciliation_item_id, monitoring_run_id,
        client_id, system_id, resource_id, detected_at
      ) VALUES (
        'provider_monitoring', v_event, v_severity, v_title, v_summary, v_action,
        v_dedupe, v_item.provider_account_id, v_item.discovered_resource_id,
        v_item.id, p_run_id,
        v_res.client_id, v_res.system_id, v_res.id, now()
      );
      v_signals := v_signals + 1;
    END IF;

    -- Incident rule (narrow, deterministic): linked SCH resource that is
    -- confirmed missing externally OR observed in a provider down state, and
    -- no open incident already covers that resource.
    IF v_item.resource_id IS NOT NULL AND v_is_down THEN
      SELECT id INTO v_incident FROM public.incidents
      WHERE resource_id = v_item.resource_id
        AND status IN ('open', 'acknowledged', 'investigating', 'monitoring')
      LIMIT 1;

      IF v_incident IS NOT NULL THEN
        -- Same unresolved condition → touch the existing incident, not a new one.
        UPDATE public.incidents SET updated_at = now() WHERE id = v_incident;
        UPDATE public.action_items
        SET incident_id = v_incident, updated_at = now()
        WHERE dedupe_key = v_dedupe AND status IN ('open', 'acknowledged');
      ELSIF v_reporter IS NOT NULL THEN
        INSERT INTO public.incidents (
          client_id, system_id, resource_id, title, description,
          severity, status, reported_by
        ) VALUES (
          v_res.client_id, v_res.system_id, v_res.id,
          'Provider resource unavailable: ' || COALESCE(v_res.name, 'resource'),
          'Scheduled provider monitoring detected that the linked provider '
            || 'resource is '
            || CASE WHEN v_item.change_type = 'missing_externally'
                 THEN 'missing externally'
                 ELSE 'in a down state (' || COALESCE(v_item.current_snapshot ->> 'status', 'unknown') || ')'
               END
            || '. Review the resource and reconcile.',
          CASE WHEN v_item.change_type = 'missing_externally' THEN 'critical' ELSE 'high' END,
          'open', v_reporter
        ) RETURNING id INTO v_incident;
        v_incidents := v_incidents + 1;

        UPDATE public.action_items
        SET incident_id = v_incident, updated_at = now()
        WHERE dedupe_key = v_dedupe AND status IN ('open', 'acknowledged');
      END IF;
    END IF;
  END LOOP;

  -- Auto-resolve: a subject OBSERVED present and healthy in the latest
  -- discovery clears its open missing/status signals — even when the change
  -- has become the baseline (a resource that stays INACTIVE keeps its signal;
  -- one that returns to ACTIVE_HEALTHY gets resolved). Incidents stay in the
  -- human lifecycle — a human resolves them.
  UPDATE public.action_items ai
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE ai.provider_account_id = v_run.provider_account_id
    AND ai.status IN ('open', 'acknowledged')
    AND ai.event_type IN ('external_change', 'missing_externally')
    AND ai.discovered_resource_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.provider_discovered_resources d
      WHERE d.id = ai.discovered_resource_id
        AND NOT d.external_missing
        AND upper(COALESCE(d.status, '')) NOT IN (
          'INACTIVE', 'PAUSED', 'SUSPENDED', 'STOPPED', 'DELETED',
          'CRASHED', 'DOWN', 'FAILED', 'ERROR', 'REMOVED'
        )
    );

  RETURN jsonb_build_object(
    'changes_detected', v_changes,
    'signals_created', v_signals,
    'incidents_created', v_incidents
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. complete_monitoring_run — finish + schedule bookkeeping + failure signal
-- ----------------------------------------------------------------------------
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
  v_run      public.provider_monitoring_runs%ROWTYPE;
  v_sched    public.provider_monitoring_schedules%ROWTYPE;
  v_failures INTEGER;
  v_dedupe   TEXT;
  v_existing UUID;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may complete monitoring runs';
  END IF;
  IF p_outcome NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'Unknown monitoring outcome: %', p_outcome;
  END IF;

  SELECT * INTO v_run FROM public.provider_monitoring_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Monitoring run % not found', p_run_id;
  END IF;
  IF v_run.status <> 'running' THEN
    RETURN 'already_completed';
  END IF;

  UPDATE public.provider_monitoring_runs
  SET status = p_outcome,
      discovery_run_id = COALESCE(p_discovery_run_id, discovery_run_id),
      reconciliation_run_id = COALESCE(p_reconciliation_run_id, reconciliation_run_id),
      changes_detected = p_changes_detected,
      signals_created = p_signals_created,
      incidents_created = p_incidents_created,
      error_category = p_error_category,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_run_id;

  -- Schedule bookkeeping: last run, success/failure counters, next due.
  IF v_run.schedule_id IS NOT NULL THEN
    SELECT * INTO v_sched FROM public.provider_monitoring_schedules WHERE id = v_run.schedule_id;
    v_failures := CASE WHEN p_outcome = 'completed' THEN 0 ELSE v_sched.consecutive_failures + 1 END;
    UPDATE public.provider_monitoring_schedules
    SET last_run_at = now(),
        last_success_at = CASE WHEN p_outcome = 'completed' THEN now() ELSE last_success_at END,
        last_failure_at = CASE WHEN p_outcome = 'failed' THEN now() ELSE last_failure_at END,
        consecutive_failures = v_failures,
        next_run_at = CASE WHEN enabled THEN
          now() + CASE frequency
            WHEN 'hourly'         THEN interval '1 hour'
            WHEN 'every_6_hours'  THEN interval '6 hours'
            WHEN 'daily'          THEN interval '1 day'
            WHEN 'weekly'         THEN interval '7 days'
          END
        ELSE next_run_at END,
        updated_at = now()
    WHERE id = v_run.schedule_id;
  ELSE
    v_failures := CASE WHEN p_outcome = 'completed' THEN 0 ELSE 1 END;
  END IF;

  -- Repeated-connection-failure signal: a single transient failure records a
  -- failed run; a SECOND consecutive failure surfaces an Action Center item.
  -- This reports "SCH cannot query the provider" — never "client infra is down".
  IF p_outcome = 'failed' AND v_failures >= 2 THEN
    v_dedupe := 'mon:' || v_run.provider_account_id::text || ':connection';
    SELECT id INTO v_existing FROM public.action_items
    WHERE dedupe_key = v_dedupe AND status IN ('open', 'acknowledged');
    IF v_existing IS NULL THEN
      INSERT INTO public.action_items (
        source, event_type, severity, title, summary, recommended_action,
        dedupe_key, provider_account_id, monitoring_run_id,
        client_id, detected_at
      )
      SELECT 'provider_monitoring',
             'connection_failure', 'warning',
             'Provider connection repeatedly failing',
             'SCH could not query the provider account (' || COALESCE(p_error_category, 'unknown')
               || ') for ' || v_failures || ' consecutive monitoring runs. '
               || 'This means SCH cannot observe the provider — it does NOT prove client infrastructure is down.',
             'Check the provider credential and provider service status',
             v_dedupe, v_run.provider_account_id, p_run_id,
             a.client_id, now()
      FROM public.provider_accounts a WHERE a.id = v_run.provider_account_id;
    END IF;
  END IF;

  -- Recovery: a successful run clears the connection-failure signal.
  IF p_outcome = 'completed' THEN
    UPDATE public.action_items
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE dedupe_key = 'mon:' || v_run.provider_account_id::text || ':connection'
      AND status IN ('open', 'acknowledged');
  END IF;

  RETURN p_outcome;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. review_action_item — acknowledge / resolve / dismiss a signal
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_action_item(
  p_item_id UUID,
  p_decision TEXT,
  p_actor UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.action_items%ROWTYPE;
  v_next TEXT;
BEGIN
  IF NOT public.caller_is_service_role()
     AND NOT public.is_admin()
     AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only administrators or operational staff may review action items';
  END IF;
  IF p_decision NOT IN ('acknowledge', 'resolve', 'dismiss') THEN
    RAISE EXCEPTION 'Unknown action item decision: %', p_decision;
  END IF;

  SELECT * INTO v_item FROM public.action_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action item % not found', p_item_id;
  END IF;
  IF v_item.status IN ('resolved', 'dismissed') THEN
    RETURN v_item.status;
  END IF;

  v_next := CASE p_decision
    WHEN 'acknowledge' THEN 'acknowledged'
    WHEN 'resolve'     THEN 'resolved'
    ELSE 'dismissed'
  END;

  UPDATE public.action_items
  SET status = v_next,
      acknowledged_by = CASE WHEN v_next = 'acknowledged' THEN p_actor ELSE acknowledged_by END,
      acknowledged_at = CASE WHEN v_next = 'acknowledged' THEN now() ELSE acknowledged_at END,
      resolved_by = CASE WHEN v_next IN ('resolved', 'dismissed') THEN p_actor ELSE resolved_by END,
      resolved_at = CASE WHEN v_next IN ('resolved', 'dismissed') THEN now() ELSE resolved_at END,
      updated_at = now()
  WHERE id = p_item_id;

  RETURN v_next;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Audit triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_monitoring_schedule_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_monitoring.schedule_created', 'provider_monitoring_schedules', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'frequency', NEW.frequency, 'enabled', NEW.enabled, 'created_by', NEW.created_by
      )
    );
    RETURN NEW;
  END IF;

  IF OLD.enabled IS DISTINCT FROM NEW.enabled THEN
    PERFORM public.write_audit_log(
      CASE WHEN NEW.enabled THEN 'provider_monitoring.schedule_enabled'
           ELSE 'provider_monitoring.schedule_disabled' END,
      'provider_monitoring_schedules', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'frequency', NEW.frequency, 'enabled', NEW.enabled
      )
    );
  ELSIF OLD.frequency IS DISTINCT FROM NEW.frequency THEN
    PERFORM public.write_audit_log(
      'provider_monitoring.schedule_updated', 'provider_monitoring_schedules', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'from', OLD.frequency, 'to', NEW.frequency
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monitoring_schedule_audit ON public.provider_monitoring_schedules;
CREATE TRIGGER trg_monitoring_schedule_audit
  AFTER INSERT OR UPDATE ON public.provider_monitoring_schedules
  FOR EACH ROW EXECUTE FUNCTION public.log_monitoring_schedule_audit();

CREATE OR REPLACE FUNCTION public.log_monitoring_run_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      CASE NEW.status
        WHEN 'skipped' THEN 'provider_monitoring.skipped'
        ELSE 'provider_monitoring.started' END,
      'provider_monitoring_runs', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'schedule_id', NEW.schedule_id,
        'trigger_source', NEW.trigger_source
      )
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.write_audit_log(
      CASE NEW.status
        WHEN 'completed' THEN 'provider_monitoring.completed'
        WHEN 'failed'    THEN 'provider_monitoring.failed'
        WHEN 'skipped'   THEN 'provider_monitoring.skipped'
        ELSE 'provider_monitoring.run_updated' END,
      'provider_monitoring_runs', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'schedule_id', NEW.schedule_id,
        'trigger_source', NEW.trigger_source,
        'discovery_run_id', NEW.discovery_run_id,
        'reconciliation_run_id', NEW.reconciliation_run_id,
        'changes_detected', NEW.changes_detected,
        'signals_created', NEW.signals_created,
        'incidents_created', NEW.incidents_created,
        'error_category', NEW.error_category,
        'from', OLD.status, 'to', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monitoring_run_audit ON public.provider_monitoring_runs;
CREATE TRIGGER trg_monitoring_run_audit
  AFTER INSERT OR UPDATE ON public.provider_monitoring_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_monitoring_run_audit();

CREATE OR REPLACE FUNCTION public.log_action_item_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_monitoring.signal_created', 'action_items', NEW.id, NULL, NULL,
      jsonb_build_object(
        'source', NEW.source, 'event_type', NEW.event_type,
        'severity', NEW.severity, 'dedupe_key', NEW.dedupe_key,
        'provider_account_id', NEW.provider_account_id,
        'resource_id', NEW.resource_id, 'client_id', NEW.client_id,
        'monitoring_run_id', NEW.monitoring_run_id,
        'incident_id', NEW.incident_id
      )
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.write_audit_log(
      CASE NEW.status
        WHEN 'acknowledged' THEN 'provider_monitoring.signal_acknowledged'
        WHEN 'resolved'     THEN 'provider_monitoring.signal_resolved'
        WHEN 'dismissed'    THEN 'provider_monitoring.signal_dismissed'
        ELSE 'provider_monitoring.signal_updated' END,
      'action_items', NEW.id, NULL, NULL,
      jsonb_build_object(
        'event_type', NEW.event_type, 'dedupe_key', NEW.dedupe_key,
        'from', OLD.status, 'to', NEW.status,
        'resolved_by', NEW.resolved_by, 'incident_id', NEW.incident_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_action_item_audit ON public.action_items;
CREATE TRIGGER trg_action_item_audit
  AFTER INSERT OR UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.log_action_item_audit();

-- ----------------------------------------------------------------------------
-- 11. Views
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.provider_monitoring_overview AS
SELECT
  s.id AS schedule_id,
  s.provider_account_id,
  pr.name AS provider_name,
  pr.adapter_key,
  pa.account_name,
  pa.ownership,
  pa.client_id,
  cp.company_name AS client_company,
  pa.connection_status,
  s.frequency,
  s.enabled,
  s.next_run_at,
  s.last_run_at,
  s.last_success_at,
  s.last_failure_at,
  s.consecutive_failures,
  lr.id AS last_run_id,
  lr.status AS last_run_status,
  lr.trigger_source AS last_trigger,
  lr.changes_detected AS last_changes_detected,
  lr.signals_created AS last_signals_created,
  lr.error_category AS last_error_category,
  s.created_at,
  s.updated_at
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

CREATE OR REPLACE VIEW public.provider_monitoring_run_overview AS
SELECT
  r.id,
  r.schedule_id,
  r.provider_account_id,
  pr.name AS provider_name,
  pa.account_name,
  r.trigger_source,
  r.status,
  r.discovery_run_id,
  dr.status AS discovery_status,
  dr.discovered_count,
  r.reconciliation_run_id,
  rr.status AS reconciliation_status,
  rr.changes_detected AS reconciliation_changes,
  r.changes_detected,
  r.signals_created,
  r.incidents_created,
  r.error_category,
  r.started_at,
  r.completed_at,
  r.created_at
FROM public.provider_monitoring_runs r
JOIN public.provider_accounts pa ON pa.id = r.provider_account_id
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.provider_discovery_runs dr ON dr.id = r.discovery_run_id
LEFT JOIN public.provider_reconciliation_runs rr ON rr.id = r.reconciliation_run_id
WHERE public.is_admin() OR public.is_finance();

CREATE OR REPLACE VIEW public.action_item_overview AS
SELECT
  ai.id,
  ai.source,
  ai.event_type,
  ai.severity,
  ai.title,
  ai.summary,
  ai.recommended_action,
  ai.status,
  ai.provider_account_id,
  pr.name AS provider_name,
  pa.account_name,
  ai.discovered_resource_id,
  d.external_resource_id,
  d.name AS external_name,
  ai.reconciliation_item_id,
  ai.monitoring_run_id,
  ai.client_id,
  cp.company_name AS client_company,
  ai.system_id,
  s.name AS system_name,
  ai.resource_id,
  res.name AS resource_name,
  res.status AS resource_status,
  ai.incident_id,
  inc.status AS incident_status,
  ai.detected_at,
  ai.acknowledged_by,
  ack.full_name AS acknowledged_by_name,
  ai.resolved_by,
  res2.full_name AS resolved_by_name,
  ai.resolved_at,
  ai.created_at,
  ai.updated_at
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

-- ----------------------------------------------------------------------------
-- 12. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_monitoring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_monitoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mon_sched_select_admin ON public.provider_monitoring_schedules;
CREATE POLICY mon_sched_select_admin ON public.provider_monitoring_schedules
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS mon_sched_select_finance ON public.provider_monitoring_schedules;
CREATE POLICY mon_sched_select_finance ON public.provider_monitoring_schedules
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS mon_sched_insert_admin ON public.provider_monitoring_schedules;
CREATE POLICY mon_sched_insert_admin ON public.provider_monitoring_schedules
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mon_sched_update_admin ON public.provider_monitoring_schedules;
CREATE POLICY mon_sched_update_admin ON public.provider_monitoring_schedules
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mon_runs_select_admin ON public.provider_monitoring_runs;
CREATE POLICY mon_runs_select_admin ON public.provider_monitoring_runs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS mon_runs_select_finance ON public.provider_monitoring_runs;
CREATE POLICY mon_runs_select_finance ON public.provider_monitoring_runs
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS mon_runs_insert_admin ON public.provider_monitoring_runs;
CREATE POLICY mon_runs_insert_admin ON public.provider_monitoring_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mon_runs_update_admin ON public.provider_monitoring_runs;
CREATE POLICY mon_runs_update_admin ON public.provider_monitoring_runs
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS action_items_select_internal ON public.action_items;
CREATE POLICY action_items_select_internal ON public.action_items
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance() OR public.is_staff());
DROP POLICY IF EXISTS action_items_insert_internal ON public.action_items;
CREATE POLICY action_items_insert_internal ON public.action_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_staff());
DROP POLICY IF EXISTS action_items_update_internal ON public.action_items;
CREATE POLICY action_items_update_internal ON public.action_items
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_staff())
  WITH CHECK (public.is_admin() OR public.is_staff());

-- ----------------------------------------------------------------------------
-- 13. Delete safety — runs and signals are auditable history
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_monitoring_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Monitoring records and action items are auditable history and cannot be deleted; use status transitions instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_mon_runs_no_delete ON public.provider_monitoring_runs;
CREATE TRIGGER trg_mon_runs_no_delete
  BEFORE DELETE ON public.provider_monitoring_runs
  FOR EACH ROW EXECUTE FUNCTION public.provider_monitoring_prevent_destructive_delete();

DROP TRIGGER IF EXISTS trg_action_items_no_delete ON public.action_items;
CREATE TRIGGER trg_action_items_no_delete
  BEFORE DELETE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.provider_monitoring_prevent_destructive_delete();

DROP TRIGGER IF EXISTS set_mon_sched_updated_at ON public.provider_monitoring_schedules;
CREATE TRIGGER set_mon_sched_updated_at
  BEFORE UPDATE ON public.provider_monitoring_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_mon_runs_updated_at ON public.provider_monitoring_runs;
CREATE TRIGGER set_mon_runs_updated_at
  BEFORE UPDATE ON public.provider_monitoring_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_action_items_updated_at ON public.action_items;
CREATE TRIGGER set_action_items_updated_at
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. Privileges
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.provider_monitoring_schedules FROM anon;
REVOKE ALL ON public.provider_monitoring_runs FROM anon;
REVOKE ALL ON public.action_items FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.provider_monitoring_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_monitoring_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.action_items TO authenticated;
REVOKE DELETE, TRUNCATE ON public.provider_monitoring_schedules FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.provider_monitoring_runs FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.action_items FROM authenticated, anon;
GRANT ALL ON public.provider_monitoring_schedules TO service_role;
GRANT ALL ON public.provider_monitoring_runs TO service_role;
GRANT ALL ON public.action_items TO service_role;
REVOKE TRUNCATE ON public.provider_monitoring_schedules FROM service_role;
REVOKE TRUNCATE ON public.provider_monitoring_runs FROM service_role;
REVOKE TRUNCATE ON public.action_items FROM service_role;

REVOKE ALL ON public.provider_monitoring_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_monitoring_overview TO authenticated, service_role;
REVOKE ALL ON public.provider_monitoring_run_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_monitoring_run_overview TO authenticated, service_role;
REVOKE ALL ON public.action_item_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.action_item_overview TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.save_monitoring_schedule(UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.due_monitoring_schedules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.begin_monitoring_run(UUID, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_monitoring_run(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_monitoring_run(UUID, TEXT, UUID, UUID, INTEGER, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_action_item(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_monitoring_schedule(UUID, TEXT, BOOLEAN, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.due_monitoring_schedules() TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_monitoring_run(UUID, TEXT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_monitoring_run(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_monitoring_run(UUID, TEXT, UUID, UUID, INTEGER, INTEGER, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_action_item(UUID, TEXT, UUID) TO service_role;

COMMIT;
