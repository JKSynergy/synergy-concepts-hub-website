-- ============================================================================
-- Migration 025 — Phase 3G-6: Controlled Operational Automation
-- ============================================================================
--
-- Extends SCH from OBSERVE → DETECT → SURFACE to
-- OBSERVE → DETECT → DECIDE DETERMINISTICALLY → CREATE ACTION OR PROPOSAL
-- → EXECUTE ONLY WITH THE CORRECT AUTHORITY → VERIFY → AUDIT.
--
-- Hard rules enforced here:
--   * Closed rule catalog — rule_key is a CHECK-constrained vocabulary. New
--     automations require a migration, not configuration.
--   * Two risk classes only: 'internal_safe' actions execute directly
--     (tasks, signals, escalations — no provider mutation);
--     'approval_required' actions can ONLY create a 3G-3 provider operation
--     proposal. The proposal → Admin approval → execution → verification
--     pipeline of Migration 022 remains the sole path to provider mutation.
--   * Idempotent — deterministic automation_key on tasks, dedupe_key on
--     action_items, and the existing open-proposal uniqueness make repeated
--     evidence converge to a single action.
--   * Every evaluation is recorded in automation_runs and audited.
--   * Automation evaluation NEVER blocks monitoring: each rule is evaluated
--     in its own exception block; a failure is recorded, not raised.
--   * No secrets are stored; all text fields pass check_no_secrets_in_text.
--
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. automation_rules — the closed deterministic catalog
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key          TEXT NOT NULL UNIQUE CHECK (rule_key IN (
    'connection_failure_escalation',
    'linked_resource_missing_investigation',
    'provider_resume_proposal',
    'backup_failure_escalation',
    'incident_escalation'
  )),
  name              TEXT NOT NULL
    CHECK (char_length(btrim(name)) > 0 AND public.check_no_secrets_in_text(name)),
  description       TEXT NOT NULL
    CHECK (char_length(btrim(description)) > 0 AND public.check_no_secrets_in_text(description)),
  risk_class        TEXT NOT NULL CHECK (risk_class IN ('internal_safe', 'approval_required')),
  scope             TEXT NOT NULL CHECK (scope IN ('account', 'sweep')),
  enabled           BOOLEAN NOT NULL DEFAULT true,
  -- Per-rule meaning documented in description (consecutive failures,
  -- persistence runs, escalation hours, consecutive failed/missed backups).
  threshold         INTEGER NOT NULL DEFAULT 1 CHECK (threshold >= 1),
  cooldown_seconds  INTEGER NOT NULL DEFAULT 21600 CHECK (cooldown_seconds >= 0),
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalog integrity: the (rule_key → risk_class, scope) mapping is fixed by
-- design. This trigger makes the catalog tamper-evident — no update may move
-- a rule to a different risk class or scope, and no row may exist outside the
-- closed vocabulary (the CHECK above already blocks unknown rule_keys).
CREATE OR REPLACE FUNCTION public.check_automation_rule_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.rule_key = 'connection_failure_escalation'
      AND (NEW.risk_class <> 'internal_safe' OR NEW.scope <> 'account'))
    OR (NEW.rule_key = 'linked_resource_missing_investigation'
      AND (NEW.risk_class <> 'internal_safe' OR NEW.scope <> 'account'))
    OR (NEW.rule_key = 'provider_resume_proposal'
      AND (NEW.risk_class <> 'approval_required' OR NEW.scope <> 'account'))
    OR (NEW.rule_key = 'backup_failure_escalation'
      AND (NEW.risk_class <> 'internal_safe' OR NEW.scope <> 'sweep'))
    OR (NEW.rule_key = 'incident_escalation'
      AND (NEW.risk_class <> 'internal_safe' OR NEW.scope <> 'sweep'))
  THEN
    RAISE EXCEPTION 'Automation rule % has a fixed risk class and scope', NEW.rule_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_rule_integrity ON public.automation_rules;
CREATE TRIGGER trg_automation_rule_integrity
  BEFORE INSERT OR UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.check_automation_rule_integrity();

INSERT INTO public.automation_rules (
  rule_key, name, description, risk_class, scope, enabled, threshold, cooldown_seconds
) VALUES
  ('connection_failure_escalation',
   'Repeated provider connection failure',
   'When a provider account monitoring schedule records N consecutive failures, escalate the Action Center signal to critical and create an operational investigation task. Never rotates credentials.',
   'internal_safe', 'account', true, 3, 21600),
  ('linked_resource_missing_investigation',
   'Linked resource missing investigation',
   'When reconciliation confirms a linked SCH resource is missing at the provider and an incident is open, create a deduplicated investigation task linked to that incident. Never deletes or unlinks anything.',
   'internal_safe', 'account', true, 1, 21600),
  ('provider_resume_proposal',
   'Unavailable linked resource → resume proposal',
   'When a linked Supabase project is observed in a paused/stopped state across N completed monitoring runs, create a resume_resource operation proposal. APPROVAL REQUIRED — the proposal follows the existing 3G-3 approve/execute/verify pipeline; automation never executes it.',
   'approval_required', 'account', true, 2, 86400),
  ('backup_failure_escalation',
   'Backup failure escalation',
   'When an active backup policy has N consecutive latest events in failed/missed state, raise an Action Center signal and create a backup review task. Recovers automatically when a successful/verified event is observed. Never changes provider backup configuration.',
   'internal_safe', 'sweep', true, 2, 21600),
  ('incident_escalation',
   'Unresolved incident escalation',
   'When an incident remains unresolved beyond N hours, create an urgent escalation task and an Action Center item for Admin review. Never closes or resolves the incident.',
   'internal_safe', 'sweep', true, 24, 86400)
ON CONFLICT (rule_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. tasks.automation_key — deterministic task idempotency
-- ----------------------------------------------------------------------------
-- Automation-created tasks carry a stable key
-- (auto:{rule}:{scope}) so repeated evidence refreshes the same open task
-- rather than spawning duplicates. Human-created tasks leave it NULL.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS automation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_automation_open
  ON public.tasks (automation_key)
  WHERE automation_key IS NOT NULL
    AND status IN ('open', 'assigned', 'in_progress', 'blocked');

-- ----------------------------------------------------------------------------
-- 3. action_items — automation is a new signal source
-- ----------------------------------------------------------------------------
ALTER TABLE public.action_items DROP CONSTRAINT action_items_source_check;
ALTER TABLE public.action_items
  ADD CONSTRAINT action_items_source_check
  CHECK (source IN ('provider_monitoring', 'provider_reconciliation', 'provider_event', 'automation', 'manual'));

-- ----------------------------------------------------------------------------
-- 4. automation_runs — the auditable evaluation record
-- ----------------------------------------------------------------------------
-- One row per rule-scope evaluation decision. This is the automation audit
-- trail: what was evaluated, on what evidence, what was decided, and which
-- SCH records were created.
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id               UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE RESTRICT,
  rule_key              TEXT NOT NULL,
  -- Deterministic subject, e.g. 'acct:{uuid}', 'res:{uuid}', 'pol:{uuid}',
  -- 'inc:{uuid}'. Cooldowns and history are scoped by this key.
  scope_key             TEXT NOT NULL,
  provider_account_id   UUID REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  monitoring_run_id     UUID REFERENCES public.provider_monitoring_runs(id) ON DELETE SET NULL,
  trigger_source        TEXT NOT NULL
    CHECK (trigger_source IN ('manual', 'scheduled', 'event', 'sweep')),
  decision              TEXT NOT NULL CHECK (decision IN (
    'acted', 'proposal_created', 'resolved',
    'skipped_no_condition', 'skipped_disabled', 'skipped_cooldown',
    'skipped_duplicate', 'skipped_no_client', 'failed'
  )),
  detail                TEXT CHECK (public.check_no_secrets_in_text(detail)),
  action_item_id        UUID REFERENCES public.action_items(id) ON DELETE SET NULL,
  task_id               UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  proposal_id           UUID REFERENCES public.provider_operation_proposals(id) ON DELETE SET NULL,
  evaluated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_scope
  ON public.automation_runs (rule_key, scope_key, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_evaluated
  ON public.automation_runs (evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_account
  ON public.automation_runs (provider_account_id);

-- ----------------------------------------------------------------------------
-- 5. Internal helpers — signal upsert, task create, run record, cooldown
-- ----------------------------------------------------------------------------
-- Upsert an Action Center signal under a deterministic dedupe key. Mirrors
-- the process_monitoring_run convention: an open item is refreshed, never
-- duplicated. Returns the item id.
CREATE OR REPLACE FUNCTION public.automation_upsert_signal(
  p_dedupe       TEXT,
  p_severity     TEXT,
  p_title        TEXT,
  p_summary      TEXT,
  p_action       TEXT,
  p_account      UUID DEFAULT NULL,
  p_discovered   UUID DEFAULT NULL,
  p_client       UUID DEFAULT NULL,
  p_system       UUID DEFAULT NULL,
  p_resource     UUID DEFAULT NULL,
  p_incident     UUID DEFAULT NULL,
  p_run          UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
  v_id       UUID;
BEGIN
  SELECT id INTO v_existing FROM public.action_items
  WHERE dedupe_key = p_dedupe AND status IN ('open', 'acknowledged');

  IF v_existing IS NOT NULL THEN
    UPDATE public.action_items
    SET detected_at = now(),
        summary = p_summary,
        severity = p_severity,
        incident_id = COALESCE(p_incident, incident_id),
        monitoring_run_id = COALESCE(p_run, monitoring_run_id),
        updated_at = now()
    WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.action_items (
    source, event_type, severity, title, summary, recommended_action,
    dedupe_key, provider_account_id, discovered_resource_id,
    monitoring_run_id, client_id, system_id, resource_id, incident_id,
    detected_at
  ) VALUES (
    'automation', 'general', p_severity, p_title, p_summary, p_action,
    p_dedupe, p_account, p_discovered,
    p_run, p_client, p_system, p_resource, p_incident,
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Create a deduplicated automation task. Returns JSONB:
--   { outcome: 'created',  task_id }
--   { outcome: 'duplicate', task_id }  — open task with this key already exists
--   { outcome: 'no_client' }           — tasks.client_id is NOT NULL; no task
CREATE OR REPLACE FUNCTION public.automation_create_task(
  p_key      TEXT,
  p_client   UUID,
  p_system   UUID,
  p_resource UUID,
  p_incident UUID,
  p_title    TEXT,
  p_desc     TEXT,
  p_priority TEXT,
  p_actor    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
  v_creator  UUID;
  v_id       UUID;
BEGIN
  IF p_client IS NULL THEN
    RETURN jsonb_build_object('outcome', 'no_client');
  END IF;

  SELECT id INTO v_existing FROM public.tasks
  WHERE automation_key = p_key
    AND status IN ('open', 'assigned', 'in_progress', 'blocked');
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'duplicate', 'task_id', v_existing);
  END IF;

  -- created_by is NOT NULL: use the caller, else the earliest admin — the
  -- same reporter convention process_monitoring_run uses for incidents.
  v_creator := COALESCE(
    p_actor,
    (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1)
  );
  IF v_creator IS NULL THEN
    RETURN jsonb_build_object('outcome', 'no_client', 'detail', 'no_reporter');
  END IF;

  INSERT INTO public.tasks (
    client_id, system_id, resource_id, incident_id,
    title, description, status, priority, created_by, automation_key
  ) VALUES (
    p_client, p_system, p_resource, p_incident,
    p_title, p_desc, 'open', p_priority, v_creator, p_key
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('outcome', 'created', 'task_id', v_id);
END;
$$;

-- Record an evaluation decision in automation_runs and write the audit entry.
-- 'skipped_no_condition' rows are recorded (they are the evidence a rule was
-- evaluated) but not audit-logged individually — the per-call
-- 'automation.evaluated' entry covers them.
CREATE OR REPLACE FUNCTION public.automation_record(
  p_rule_id    UUID,
  p_rule_key   TEXT,
  p_scope_key  TEXT,
  p_account    UUID,
  p_run        UUID,
  p_trigger    TEXT,
  p_decision   TEXT,
  p_detail     TEXT DEFAULT NULL,
  p_item       UUID DEFAULT NULL,
  p_task       UUID DEFAULT NULL,
  p_proposal   UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_action TEXT;
BEGIN
  INSERT INTO public.automation_runs (
    rule_id, rule_key, scope_key, provider_account_id, monitoring_run_id,
    trigger_source, decision, detail, action_item_id, task_id, proposal_id
  ) VALUES (
    p_rule_id, p_rule_key, p_scope_key, p_account, p_run,
    p_trigger, p_decision, p_detail, p_item, p_task, p_proposal
  )
  RETURNING id INTO v_id;

  v_action := CASE p_decision
    WHEN 'acted'            THEN 'automation.action_created'
    WHEN 'proposal_created' THEN 'automation.proposal_created'
    WHEN 'resolved'         THEN 'automation.signal_resolved'
    WHEN 'failed'           THEN 'automation.action_failed'
    WHEN 'skipped_disabled' THEN 'automation.action_skipped'
    WHEN 'skipped_cooldown' THEN 'automation.action_skipped'
    ELSE NULL
  END;

  IF v_action IS NOT NULL THEN
    PERFORM public.write_audit_log(
      v_action, 'automation_runs', v_id, NULL, NULL,
      jsonb_build_object(
        'rule_key', p_rule_key, 'scope_key', p_scope_key,
        'decision', p_decision, 'trigger_source', p_trigger,
        'action_item_id', p_item, 'task_id', p_task, 'proposal_id', p_proposal
      )
    );
  END IF;

  RETURN v_id;
END;
$$;

-- Cooldown gate: TRUE when this rule+scope produced an action within the
-- rule's cooldown window. Prevents storms without hiding new conditions —
-- a resolved signal that reopens creates a new action item (dedupe only
-- matches open items), and the cooldown only throttles repeat actions.
CREATE OR REPLACE FUNCTION public.automation_in_cooldown(
  p_rule_id   UUID,
  p_scope_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.automation_runs ar
    JOIN public.automation_rules r ON r.id = ar.rule_id
    WHERE ar.rule_id = p_rule_id
      AND ar.scope_key = p_scope_key
      AND ar.decision IN ('acted', 'proposal_created')
      AND ar.evaluated_at > now() - make_interval(secs => r.cooldown_seconds)
  );
$$;

-- ----------------------------------------------------------------------------
-- 6. save_automation_rule — admin configuration of a catalog rule
-- ----------------------------------------------------------------------------
-- Only enabled/threshold/cooldown are configurable. rule_key, risk_class and
-- scope are fixed by the catalog; unknown keys are rejected.
CREATE OR REPLACE FUNCTION public.save_automation_rule(
  p_rule_key         TEXT,
  p_enabled          BOOLEAN,
  p_threshold        INTEGER,
  p_cooldown_seconds INTEGER,
  p_actor            UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may configure automation rules';
  END IF;
  IF p_threshold IS NULL OR p_threshold < 1 THEN
    RAISE EXCEPTION 'Automation threshold must be a positive integer';
  END IF;
  IF p_cooldown_seconds IS NULL OR p_cooldown_seconds < 0 THEN
    RAISE EXCEPTION 'Automation cooldown must be zero or greater';
  END IF;

  UPDATE public.automation_rules
  SET enabled = p_enabled,
      threshold = p_threshold,
      cooldown_seconds = p_cooldown_seconds,
      updated_by = p_actor,
      updated_at = now()
  WHERE rule_key = p_rule_key
  RETURNING id INTO v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown automation rule: %', p_rule_key;
  END IF;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. evaluate_account_automation — account-scope rules, per monitoring run
-- ----------------------------------------------------------------------------
-- Called by the monitoring service after every run (manual, scheduled AND
-- event-triggered — one converged path). Each rule runs in its own exception
-- block: a rule failure is recorded and never fails the monitoring run.
--
-- Returns JSONB: { evaluations: [ {rule_key, scope_key, decision, ...} ] }
CREATE OR REPLACE FUNCTION public.evaluate_account_automation(
  p_provider_account_id UUID,
  p_monitoring_run_id   UUID DEFAULT NULL,
  p_run_succeeded       BOOLEAN DEFAULT true,
  p_trigger_source      TEXT DEFAULT 'manual',
  p_actor               UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule      public.automation_rules%ROWTYPE;
  v_acct      public.provider_accounts%ROWTYPE;
  v_sched     public.provider_monitoring_schedules%ROWTYPE;
  v_disc      public.provider_discovered_resources%ROWTYPE;
  v_res       public.resources%ROWTYPE;
  v_incident  UUID;
  v_item      UUID;
  v_task      JSONB;
  v_prop      UUID;
  v_down_runs INTEGER;
  v_results   JSONB := '[]'::jsonb;
  v_scope     TEXT;
  v_decision  TEXT;
  v_detail    TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may evaluate automation';
  END IF;
  IF p_trigger_source NOT IN ('manual', 'scheduled', 'event', 'sweep') THEN
    RAISE EXCEPTION 'Unknown automation trigger: %', p_trigger_source;
  END IF;

  SELECT * INTO v_acct FROM public.provider_accounts WHERE id = p_provider_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  PERFORM public.write_audit_log(
    'automation.evaluated', 'provider_accounts', p_provider_account_id, NULL, NULL,
    jsonb_build_object('trigger_source', p_trigger_source, 'monitoring_run_id', p_monitoring_run_id,
                       'run_succeeded', p_run_succeeded)
  );

  -- ==========================================================================
  -- RULE: connection_failure_escalation (internal_safe)
  --   condition: schedule consecutive_failures >= threshold (on a failed run)
  --   action:    escalate existing signal to critical + deduplicated task
  -- ==========================================================================
  BEGIN
    SELECT * INTO v_rule FROM public.automation_rules
    WHERE rule_key = 'connection_failure_escalation';
    v_scope := 'acct:' || p_provider_account_id::text;
    v_decision := 'skipped_no_condition';
    v_detail := NULL;
    v_item := NULL;
    v_task := NULL;

    IF NOT v_rule.enabled THEN
      v_decision := 'skipped_disabled';
    ELSIF p_run_succeeded THEN
      v_decision := 'skipped_no_condition';
      v_detail := 'run completed';
    ELSE
      SELECT * INTO v_sched FROM public.provider_monitoring_schedules
      WHERE provider_account_id = p_provider_account_id;
      IF v_sched.id IS NOT NULL AND v_sched.consecutive_failures >= v_rule.threshold THEN
        IF public.automation_in_cooldown(v_rule.id, v_scope) THEN
          v_decision := 'skipped_cooldown';
        ELSE
          -- Escalate the existing connection signal (created by 3G-4 at ≥2).
          v_item := public.automation_upsert_signal(
            'mon:' || p_provider_account_id::text || ':connection',
            'critical',
            'Provider connection repeatedly failing',
            'SCH could not query the provider account for '
              || v_sched.consecutive_failures || ' consecutive monitoring runs. '
              || 'Escalated by automation — the provider credential or provider '
              || 'service needs attention.',
            'Check the provider credential and provider service status',
            p_provider_account_id, NULL, v_acct.client_id, NULL, NULL, NULL,
            p_monitoring_run_id
          );
          v_task := public.automation_create_task(
            'auto:conn:' || p_provider_account_id::text,
            v_acct.client_id, NULL, NULL, NULL,
            'Investigate repeated provider connection failure',
            'Automation escalated ' || v_sched.consecutive_failures
              || ' consecutive monitoring failures on provider account '
              || COALESCE(v_acct.account_name, p_provider_account_id::text)
              || '. Verify the credential in the provider console and the '
              || 'provider service status. Automation never rotates credentials.',
            'high', p_actor
          );
          IF v_task ->> 'outcome' = 'created' THEN
            v_decision := 'acted';
          ELSIF v_task ->> 'outcome' = 'duplicate' THEN
            v_decision := 'skipped_duplicate';
          ELSE
            v_decision := 'skipped_no_client';
          END IF;
          v_detail := 'consecutive_failures=' || v_sched.consecutive_failures;
        END IF;
      END IF;
    END IF;

    PERFORM public.automation_record(
      v_rule.id, v_rule.rule_key, v_scope, p_provider_account_id,
      p_monitoring_run_id, p_trigger_source, v_decision, v_detail,
      v_item, (v_task ->> 'task_id')::uuid, NULL
    );
    v_results := v_results || jsonb_build_object(
      'rule_key', 'connection_failure_escalation', 'scope_key', v_scope,
      'decision', v_decision, 'detail', v_detail
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.automation_record(
      v_rule.id, 'connection_failure_escalation', 'acct:' || p_provider_account_id::text,
      p_provider_account_id, p_monitoring_run_id, p_trigger_source, 'failed',
      left(SQLERRM, 400), NULL, NULL, NULL
    );
  END;

  -- ==========================================================================
  -- RULE: linked_resource_missing_investigation (internal_safe)
  --   condition: linked discovered resource confirmed external_missing AND an
  --              open incident covers it (3G-4 already classified it)
  --   action:    deduplicated investigation task linked to the incident
  -- ==========================================================================
  IF p_run_succeeded THEN
    FOR v_disc IN
      SELECT d.* FROM public.provider_discovered_resources d
      WHERE d.provider_account_id = p_provider_account_id
        AND d.link_status = 'linked'
        AND d.linked_resource_id IS NOT NULL
        AND d.external_missing
      ORDER BY d.id
    LOOP
      BEGIN
        SELECT * INTO v_rule FROM public.automation_rules
        WHERE rule_key = 'linked_resource_missing_investigation';
        v_scope := 'res:' || v_disc.linked_resource_id::text;
        v_decision := 'skipped_no_condition';
        v_detail := NULL;
        v_item := NULL;
        v_task := NULL;

        IF NOT v_rule.enabled THEN
          v_decision := 'skipped_disabled';
        ELSIF public.automation_in_cooldown(v_rule.id, v_scope) THEN
          v_decision := 'skipped_cooldown';
        ELSE
          SELECT id INTO v_incident FROM public.incidents
          WHERE resource_id = v_disc.linked_resource_id
            AND status IN ('open', 'acknowledged', 'investigating', 'monitoring')
          LIMIT 1;

          IF v_incident IS NULL THEN
            v_decision := 'skipped_no_condition';
            v_detail := 'no open incident for missing resource';
          ELSE
            SELECT * INTO v_res FROM public.resources WHERE id = v_disc.linked_resource_id;
            v_task := public.automation_create_task(
              'auto:missing:' || v_disc.linked_resource_id::text,
              v_res.client_id, v_res.system_id, v_res.id, v_incident,
              'Investigate provider resource missing externally',
              'Reconciliation confirmed the linked provider resource '
                || COALESCE(v_disc.external_resource_id, v_disc.id::text)
                || ' is missing externally while the incident remains open. '
                || 'Determine whether the removal was intentional; do NOT '
                || 'unlink or delete the SCH resource automatically.',
              'high', p_actor
            );
            IF v_task ->> 'outcome' = 'created' THEN
              v_decision := 'acted';
              v_detail := 'incident=' || v_incident::text;
            ELSIF v_task ->> 'outcome' = 'duplicate' THEN
              v_decision := 'skipped_duplicate';
            ELSE
              v_decision := 'skipped_no_client';
            END IF;
          END IF;
        END IF;

        PERFORM public.automation_record(
          v_rule.id, v_rule.rule_key, v_scope, p_provider_account_id,
          p_monitoring_run_id, p_trigger_source, v_decision, v_detail,
          v_item, (v_task ->> 'task_id')::uuid, NULL
        );
        v_results := v_results || jsonb_build_object(
          'rule_key', 'linked_resource_missing_investigation', 'scope_key', v_scope,
          'decision', v_decision, 'detail', v_detail
        );
      EXCEPTION WHEN OTHERS THEN
        PERFORM public.automation_record(
          v_rule.id, 'linked_resource_missing_investigation',
          'res:' || COALESCE(v_disc.linked_resource_id::text, v_disc.id::text),
          p_provider_account_id, p_monitoring_run_id, p_trigger_source, 'failed',
          left(SQLERRM, 400), NULL, NULL, NULL
        );
      END;
    END LOOP;
  END IF;

  -- ==========================================================================
  -- RULE: provider_resume_proposal (approval_required)
  --   condition: linked Supabase project observed in a resumable down state
  --              (PAUSED/INACTIVE/SUSPENDED/STOPPED) across >= threshold
  --              completed monitoring runs
  --   action:    create a resume_resource OPERATION PROPOSAL via the existing
  --              3G-3 RPC. Approval, execution and verification stay human.
  -- ==========================================================================
  IF p_run_succeeded THEN
    FOR v_disc IN
      SELECT d.* FROM public.provider_discovered_resources d
      JOIN public.provider_accounts a ON a.id = d.provider_account_id
      JOIN public.providers p ON p.id = a.provider_id
      WHERE d.provider_account_id = p_provider_account_id
        AND d.link_status = 'linked'
        AND d.linked_resource_id IS NOT NULL
        AND NOT d.external_missing
        AND p.adapter_key = 'supabase'        -- the only provider with resume capability (3G-3)
        AND d.resource_type = 'project'       -- capability matrix: supabase/project only
        AND upper(COALESCE(d.status, '')) IN ('INACTIVE', 'PAUSED', 'SUSPENDED', 'STOPPED')
      ORDER BY d.id
    LOOP
      BEGIN
        SELECT * INTO v_rule FROM public.automation_rules
        WHERE rule_key = 'provider_resume_proposal';
        v_scope := 'res:' || v_disc.linked_resource_id::text;
        v_decision := 'skipped_no_condition';
        v_detail := NULL;
        v_item := NULL;
        v_prop := NULL;

        IF NOT v_rule.enabled THEN
          v_decision := 'skipped_disabled';
        ELSIF public.automation_in_cooldown(v_rule.id, v_scope) THEN
          v_decision := 'skipped_cooldown';
        ELSE
          -- Persistence: count completed monitoring runs whose reconciliation
          -- observed this resource in a resumable down state. Unchanged items
          -- carry current_snapshot, so every run contributes evidence.
          SELECT count(DISTINCT mr.id) INTO v_down_runs
          FROM public.provider_reconciliation_items ri
          JOIN public.provider_monitoring_runs mr
            ON mr.reconciliation_run_id = ri.run_id
           AND mr.status = 'completed'
          WHERE ri.discovered_resource_id = v_disc.id
            AND upper(COALESCE(ri.current_snapshot ->> 'status', ''))
              IN ('INACTIVE', 'PAUSED', 'SUSPENDED', 'STOPPED');

          IF v_down_runs < v_rule.threshold THEN
            v_decision := 'skipped_no_condition';
            v_detail := 'down_runs=' || v_down_runs;
          ELSE
            -- Existing 3G-3 path: validates linked/present/basis, dedupes open
            -- proposals, captures basis_run_id + basis_snapshot (stale-state
            -- protection is enforced again at execution time by 022).
            v_prop := public.propose_provider_operation(
              v_disc.id,
              'resume_resource',
              'Automated proposal (rule provider_resume_proposal): linked '
                || 'resource observed in state '
                || COALESCE(v_disc.status, 'unknown')
                || ' across ' || v_down_runs
                || ' completed monitoring runs. Evidence: monitoring run '
                || COALESCE(p_monitoring_run_id::text, 'n/a')
                || '. Approval by an administrator is required before any '
                || 'provider change.',
              NULL
            );
            v_decision := 'proposal_created';
            v_detail := 'down_runs=' || v_down_runs || ',proposal=' || v_prop::text;
          END IF;
        END IF;

        PERFORM public.automation_record(
          v_rule.id, v_rule.rule_key, v_scope, p_provider_account_id,
          p_monitoring_run_id, p_trigger_source, v_decision, v_detail,
          v_item, NULL, v_prop
        );
        v_results := v_results || jsonb_build_object(
          'rule_key', 'provider_resume_proposal', 'scope_key', v_scope,
          'decision', v_decision, 'detail', v_detail
        );
      EXCEPTION WHEN OTHERS THEN
        PERFORM public.automation_record(
          v_rule.id, 'provider_resume_proposal',
          'res:' || COALESCE(v_disc.linked_resource_id::text, v_disc.id::text),
          p_provider_account_id, p_monitoring_run_id, p_trigger_source, 'failed',
          left(SQLERRM, 400), NULL, NULL, NULL
        );
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('evaluations', v_results);
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. evaluate_automation_sweep — global rules over the whole operations layer
-- ----------------------------------------------------------------------------
-- Runs after each monitoring run completes (same execution context — events
-- and scheduled runs converge here) and at the end of the scheduled sweep so
-- incident-aging and backup-health are evaluated even with no due accounts.
CREATE OR REPLACE FUNCTION public.evaluate_automation_sweep(
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule     public.automation_rules%ROWTYPE;
  v_pol      public.backup_policies%ROWTYPE;
  v_inc      public.incidents%ROWTYPE;
  v_recent   INTEGER;
  v_total    INTEGER;
  v_item     UUID;
  v_task     JSONB;
  v_results  JSONB := '[]'::jsonb;
  v_scope    TEXT;
  v_decision TEXT;
  v_detail   TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may evaluate automation';
  END IF;

  PERFORM public.write_audit_log(
    'automation.evaluated', 'automation_rules', NULL, NULL, NULL,
    jsonb_build_object('trigger_source', 'sweep')
  );

  -- ==========================================================================
  -- RULE: backup_failure_escalation (internal_safe)
  --   condition: active policy whose `threshold` most recent events are ALL
  --              'failed'/'missed'
  --   action:    Action Center signal + deduplicated review task
  --   recovery:  latest event successful/verified → resolve the open signal
  -- ==========================================================================
  SELECT * INTO v_rule FROM public.automation_rules
  WHERE rule_key = 'backup_failure_escalation';

  FOR v_pol IN
    SELECT * FROM public.backup_policies WHERE is_active ORDER BY id
  LOOP
    BEGIN
      v_scope := 'pol:' || v_pol.id::text;
      v_item := NULL;
      v_task := NULL;
      v_detail := NULL;

      SELECT
        count(*),
        count(*) FILTER (WHERE status IN ('failed', 'missed'))
      INTO v_total, v_recent
      FROM (
        SELECT status FROM public.backup_events
        WHERE backup_policy_id = v_pol.id
        ORDER BY created_at DESC
        LIMIT v_rule.threshold
      ) t;

      IF NOT v_rule.enabled THEN
        v_decision := 'skipped_disabled';
      ELSIF v_total < v_rule.threshold OR v_recent < v_rule.threshold THEN
        -- Condition not met. If the latest event is healthy, resolve any open
        -- automation signal for this policy (evidence-based resolution).
        IF EXISTS (
          SELECT 1 FROM (
            SELECT status FROM public.backup_events
            WHERE backup_policy_id = v_pol.id
            ORDER BY created_at DESC LIMIT 1
          ) l WHERE l.status IN ('successful', 'verified')
        ) THEN
          UPDATE public.action_items
          SET status = 'resolved', resolved_at = now(), updated_at = now()
          WHERE dedupe_key = 'auto:backup:' || v_pol.id::text
            AND status IN ('open', 'acknowledged')
          RETURNING id INTO v_item;
          IF v_item IS NOT NULL THEN
            v_decision := 'resolved';
          ELSE
            v_decision := 'skipped_no_condition';
          END IF;
        ELSE
          v_decision := 'skipped_no_condition';
        END IF;
      ELSIF public.automation_in_cooldown(v_rule.id, v_scope) THEN
        -- Still refresh the signal so the open item reflects the latest state.
        v_item := public.automation_upsert_signal(
          'auto:backup:' || v_pol.id::text,
          'warning',
          'Backup failures require review',
          'The ' || v_rule.threshold || ' most recent backup events for policy "'
            || v_pol.name || '" are failed or missed.',
          'Review backup evidence and provider status; verify the next scheduled backup',
          NULL, NULL, v_pol.client_id, v_pol.system_id, v_pol.resource_id, NULL, NULL
        );
        v_decision := 'skipped_cooldown';
      ELSE
        v_item := public.automation_upsert_signal(
          'auto:backup:' || v_pol.id::text,
          'warning',
          'Backup failures require review',
          'The ' || v_rule.threshold || ' most recent backup events for policy "'
            || v_pol.name || '" are failed or missed.',
          'Review backup evidence and provider status; verify the next scheduled backup',
          NULL, NULL, v_pol.client_id, v_pol.system_id, v_pol.resource_id, NULL, NULL
        );
        v_task := public.automation_create_task(
          'auto:backup:' || v_pol.id::text,
          v_pol.client_id, v_pol.system_id, v_pol.resource_id, NULL,
          'Review repeated backup failures',
          'Automation detected ' || v_rule.threshold
            || ' consecutive failed/missed backup events for policy "'
            || v_pol.name || '". Review backup evidence; automation does not '
            || 'change provider backup configuration.',
          'high', p_actor
        );
        IF v_task ->> 'outcome' = 'created' THEN
          v_decision := 'acted';
        ELSIF v_task ->> 'outcome' = 'duplicate' THEN
          v_decision := 'skipped_duplicate';
        ELSE
          v_decision := 'skipped_no_client';
        END IF;
        v_detail := 'recent_failed=' || v_recent || ' of ' || v_total;
      END IF;

      PERFORM public.automation_record(
        v_rule.id, v_rule.rule_key, v_scope, NULL, NULL, 'sweep',
        v_decision, v_detail, v_item, (v_task ->> 'task_id')::uuid, NULL
      );
      v_results := v_results || jsonb_build_object(
        'rule_key', 'backup_failure_escalation', 'scope_key', v_scope,
        'decision', v_decision, 'detail', v_detail
      );
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.automation_record(
        v_rule.id, 'backup_failure_escalation', 'pol:' || v_pol.id::text,
        NULL, NULL, 'sweep', 'failed', left(SQLERRM, 400), NULL, NULL, NULL
      );
    END;
  END LOOP;

  -- ==========================================================================
  -- RULE: incident_escalation (internal_safe)
  --   condition: incident unresolved (not resolved/closed/cancelled) and
  --              opened_at older than `threshold` hours
  --   action:    urgent escalation task (linked to incident) + Action Center
  --              item. The incident lifecycle is untouched.
  -- ==========================================================================
  SELECT * INTO v_rule FROM public.automation_rules
  WHERE rule_key = 'incident_escalation';

  FOR v_inc IN
    SELECT * FROM public.incidents
    WHERE status IN ('open', 'acknowledged', 'investigating', 'monitoring')
      AND opened_at < now() - make_interval(hours => v_rule.threshold)
    ORDER BY opened_at
  LOOP
    BEGIN
      v_scope := 'inc:' || v_inc.id::text;
      v_item := NULL;
      v_task := NULL;
      v_detail := NULL;

      IF NOT v_rule.enabled THEN
        v_decision := 'skipped_disabled';
      ELSIF public.automation_in_cooldown(v_rule.id, v_scope) THEN
        v_decision := 'skipped_cooldown';
      ELSE
        v_item := public.automation_upsert_signal(
          'auto:incident:' || v_inc.id::text,
          'critical',
          'Unresolved incident requires escalation',
          'Incident "' || v_inc.title || '" (severity ' || v_inc.severity
            || ') has been unresolved for more than ' || v_rule.threshold
            || ' hours.',
          'Escalate to an administrator and review the incident timeline',
          NULL, NULL, v_inc.client_id, v_inc.system_id, v_inc.resource_id, v_inc.id, NULL
        );
        v_task := public.automation_create_task(
          'auto:escalation:' || v_inc.id::text,
          v_inc.client_id, v_inc.system_id, v_inc.resource_id, v_inc.id,
          'Escalate unresolved incident: ' || left(v_inc.title, 120),
          'Automation escalated incident ' || v_inc.id::text
            || ' — unresolved beyond ' || v_rule.threshold
            || ' hours. Automation never closes or resolves incidents.',
          'urgent', p_actor
        );
        IF v_task ->> 'outcome' = 'created' THEN
          v_decision := 'acted';
        ELSIF v_task ->> 'outcome' = 'duplicate' THEN
          v_decision := 'skipped_duplicate';
        ELSE
          v_decision := 'skipped_no_client';
        END IF;
        v_detail := 'opened_at=' || v_inc.opened_at::text;
      END IF;

      PERFORM public.automation_record(
        v_rule.id, v_rule.rule_key, v_scope, NULL, NULL, 'sweep',
        v_decision, v_detail, v_item, (v_task ->> 'task_id')::uuid, NULL
      );
      v_results := v_results || jsonb_build_object(
        'rule_key', 'incident_escalation', 'scope_key', v_scope,
        'decision', v_decision, 'detail', v_detail
      );
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.automation_record(
        v_rule.id, 'incident_escalation', 'inc:' || v_inc.id::text,
        NULL, NULL, 'sweep', 'failed', left(SQLERRM, 400), NULL, NULL, NULL
      );
    END;
  END LOOP;

  RETURN jsonb_build_object('evaluations', v_results);
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Audit trigger — rule configuration changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_automation_rule_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'automation.rule_created', 'automation_rules', NEW.id, NULL, NULL,
      jsonb_build_object('rule_key', NEW.rule_key, 'risk_class', NEW.risk_class,
                         'scope', NEW.scope, 'enabled', NEW.enabled,
                         'threshold', NEW.threshold)
    );
    RETURN NEW;
  END IF;

  IF OLD.enabled IS DISTINCT FROM NEW.enabled
     OR OLD.threshold IS DISTINCT FROM NEW.threshold
     OR OLD.cooldown_seconds IS DISTINCT FROM NEW.cooldown_seconds THEN
    PERFORM public.write_audit_log(
      CASE WHEN NEW.enabled AND NOT OLD.enabled THEN 'automation.enabled'
           WHEN NOT NEW.enabled AND OLD.enabled THEN 'automation.disabled'
           ELSE 'automation.rule_updated' END,
      'automation_rules', NEW.id, NULL, NULL,
      jsonb_build_object('rule_key', NEW.rule_key,
                         'enabled', NEW.enabled, 'threshold', NEW.threshold,
                         'cooldown_seconds', NEW.cooldown_seconds)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_rule_audit ON public.automation_rules;
CREATE TRIGGER trg_automation_rule_audit
  AFTER INSERT OR UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_automation_rule_audit();

-- ----------------------------------------------------------------------------
-- 10. Views — catalog + history (normalized fields only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.automation_rule_overview AS
SELECT
  r.id,
  r.rule_key,
  r.name,
  r.description,
  r.risk_class,
  r.scope,
  r.enabled,
  r.threshold,
  r.cooldown_seconds,
  last.evaluated_at AS last_evaluated_at,
  last.decision     AS last_decision,
  last.detail       AS last_detail,
  acted.acted_at    AS last_action_at,
  r.created_at,
  r.updated_at
FROM public.automation_rules r
LEFT JOIN LATERAL (
  SELECT ar.evaluated_at, ar.decision, ar.detail
  FROM public.automation_runs ar
  WHERE ar.rule_id = r.id
  ORDER BY ar.evaluated_at DESC
  LIMIT 1
) last ON true
LEFT JOIN LATERAL (
  SELECT ar.evaluated_at AS acted_at
  FROM public.automation_runs ar
  WHERE ar.rule_id = r.id AND ar.decision IN ('acted', 'proposal_created')
  ORDER BY ar.evaluated_at DESC
  LIMIT 1
) acted ON true
WHERE public.is_admin() OR public.is_finance();

CREATE OR REPLACE VIEW public.automation_run_overview AS
SELECT
  ar.id,
  ar.rule_key,
  r.name AS rule_name,
  r.risk_class,
  ar.scope_key,
  ar.provider_account_id,
  pa.account_name,
  ar.monitoring_run_id,
  ar.trigger_source,
  ar.decision,
  ar.detail,
  ar.action_item_id,
  ar.task_id,
  ar.proposal_id,
  ar.evaluated_at,
  ar.created_at
FROM public.automation_runs ar
JOIN public.automation_rules r ON r.id = ar.rule_id
LEFT JOIN public.provider_accounts pa ON pa.id = ar.provider_account_id
WHERE public.is_admin() OR public.is_finance() OR public.is_staff();

-- ----------------------------------------------------------------------------
-- 11. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_rules_select_admin ON public.automation_rules;
CREATE POLICY automation_rules_select_admin ON public.automation_rules
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS automation_rules_select_finance ON public.automation_rules;
CREATE POLICY automation_rules_select_finance ON public.automation_rules
  FOR SELECT TO authenticated USING (public.is_finance());
-- No INSERT/UPDATE/DELETE policies for authenticated: rule configuration goes
-- exclusively through save_automation_rule (admin-only RPC).

DROP POLICY IF EXISTS automation_runs_select_internal ON public.automation_runs;
CREATE POLICY automation_runs_select_internal ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance() OR public.is_staff());
-- No write policies: evaluation runs only through the SECURITY DEFINER
-- evaluation functions.

-- ----------------------------------------------------------------------------
-- 12. Delete safety — catalog + evaluation history are auditable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.automation_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Automation records are auditable history and cannot be deleted; use enabled=false on rules instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_automation_rules_no_delete ON public.automation_rules;
CREATE TRIGGER trg_automation_rules_no_delete
  BEFORE DELETE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.automation_prevent_destructive_delete();

DROP TRIGGER IF EXISTS trg_automation_runs_no_delete ON public.automation_runs;
CREATE TRIGGER trg_automation_runs_no_delete
  BEFORE DELETE ON public.automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.automation_prevent_destructive_delete();

DROP TRIGGER IF EXISTS set_automation_rules_updated_at ON public.automation_rules;
CREATE TRIGGER set_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 13. Privileges
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.automation_rules FROM anon;
REVOKE ALL ON public.automation_runs FROM anon;
GRANT SELECT ON public.automation_rules TO authenticated;
GRANT SELECT ON public.automation_runs TO authenticated;
REVOKE DELETE, TRUNCATE ON public.automation_rules FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.automation_runs FROM authenticated, anon;
GRANT ALL ON public.automation_rules TO service_role;
GRANT ALL ON public.automation_runs TO service_role;
REVOKE TRUNCATE ON public.automation_rules FROM service_role;
REVOKE TRUNCATE ON public.automation_runs FROM service_role;

REVOKE ALL ON public.automation_rule_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.automation_rule_overview TO authenticated, service_role;
REVOKE ALL ON public.automation_run_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.automation_run_overview TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.save_automation_rule(TEXT, BOOLEAN, INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_account_automation(UUID, UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_automation_sweep(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_upsert_signal(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_create_task(TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_record(UUID, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.automation_in_cooldown(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_automation_rule(TEXT, BOOLEAN, INTEGER, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_account_automation(UUID, UUID, BOOLEAN, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_automation_sweep(UUID) TO service_role;

COMMIT;
