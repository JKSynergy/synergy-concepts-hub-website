-- ============================================================================
-- Migration 018: Phase 3E Backup Policies & Backup Events
-- SCH Portal / Synergy Concepts Hub
--
-- Introduces:
--   1. backup_policies table (expected cadence, retention, verification governance)
--   2. backup_events table (recorded backup evidence / outcomes)
--   3. Same-client integrity triggers (resource, system, agreement, policy)
--   4. Active-policy overlap guard (no ambiguous active coverage per resource)
--   5. Controlled event lifecycle triggers & timestamps
--   6. Destructive deletion blockers (operational evidence preservation)
--   7. Integrated audit logging via existing audit_logs
--   8. backup_policy_health view (deterministic healthy/due/overdue/failed/unverified)
--   9. Explicit RLS policies (Admin, Finance, Staff separated; Client denied)
--  10. Strict privilege hardening (no TRUNCATE, anon has 0 privileges)
--
-- Phase 3E is a RECORDING, GOVERNANCE, AND VERIFICATION layer.
-- It contains no backup execution, scheduling, provider API, or automation.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: backup_policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  service_agreement_id UUID NULL REFERENCES public.service_agreements(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 3 AND public.check_no_secrets_in_text(name)),
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  -- Custom cadence: expected days between backups. Required when frequency = 'custom'.
  frequency_interval_days INTEGER NULL CHECK (frequency_interval_days IS NULL OR frequency_interval_days > 0),
  -- Governance metadata only. No automatic deletion is implemented.
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  -- Governance flag: a successful backup event must eventually be verified.
  verification_required BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE NULL,
  operational_notes TEXT NULL CHECK (public.check_no_secrets_in_text(operational_notes)),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_backup_policy_custom_interval
    CHECK (frequency <> 'custom' OR (frequency_interval_days IS NOT NULL AND frequency_interval_days > 0)),
  CONSTRAINT chk_backup_policy_effective_window
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

-- ----------------------------------------------------------------------------
-- 2. Table: backup_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  backup_policy_id UUID NULL REFERENCES public.backup_policies(id) ON DELETE RESTRICT,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  service_agreement_id UUID NULL REFERENCES public.service_agreements(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN (
    'expected',
    'in_progress',
    'successful',
    'failed',
    'missed',
    'verified'
  )),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  verified_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Evidence is a REFERENCE (provider backup id, filename, snapshot id, storage
  -- location, manual note). Never credentials, keys, tokens or passwords.
  evidence_reference TEXT NULL CHECK (public.check_no_secrets_in_text(evidence_reference)),
  evidence_notes TEXT NULL CHECK (public.check_no_secrets_in_text(evidence_notes)),
  failure_reason TEXT NULL CHECK (public.check_no_secrets_in_text(failure_reason)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes for Query Performance & Lookups
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_backup_policies_client_id ON public.backup_policies(client_id);
CREATE INDEX IF NOT EXISTS idx_backup_policies_resource_id ON public.backup_policies(resource_id);
CREATE INDEX IF NOT EXISTS idx_backup_policies_system_id ON public.backup_policies(system_id);
CREATE INDEX IF NOT EXISTS idx_backup_policies_agreement_id ON public.backup_policies(service_agreement_id);
CREATE INDEX IF NOT EXISTS idx_backup_policies_is_active ON public.backup_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_backup_policies_frequency ON public.backup_policies(frequency);
-- Hot path for the active-policy overlap guard and health view
CREATE INDEX IF NOT EXISTS idx_backup_policies_active_resource ON public.backup_policies(resource_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_backup_events_client_id ON public.backup_events(client_id);
CREATE INDEX IF NOT EXISTS idx_backup_events_policy_id ON public.backup_events(backup_policy_id);
CREATE INDEX IF NOT EXISTS idx_backup_events_resource_id ON public.backup_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_backup_events_system_id ON public.backup_events(system_id);
CREATE INDEX IF NOT EXISTS idx_backup_events_status ON public.backup_events(status);
CREATE INDEX IF NOT EXISTS idx_backup_events_completed_at ON public.backup_events(completed_at);
CREATE INDEX IF NOT EXISTS idx_backup_events_recorded_by ON public.backup_events(recorded_by);

-- ----------------------------------------------------------------------------
-- 4. Same-Client Integrity & Consistency Triggers
-- ----------------------------------------------------------------------------

-- A. backup_policies same-client integrity + active overlap guard
CREATE OR REPLACE FUNCTION public.check_backup_policy_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res_client UUID;
  v_res_system UUID;
  v_sys_client UUID;
  v_agr_client UUID;
BEGIN
  -- Resource must exist; derive/verify client + system ownership
  SELECT client_id, system_id INTO v_res_client, v_res_system
  FROM public.resources WHERE id = NEW.resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced resource does not exist' USING ERRCODE = 'P0001';
  END IF;

  IF v_res_client IS NOT NULL AND v_res_client <> NEW.client_id THEN
    RAISE EXCEPTION 'Backup policy client_id does not match referenced resource client_id' USING ERRCODE = 'P0001';
  END IF;

  -- The resource's system is authoritative: derive it, or validate an explicit
  -- system_id only for standalone resources (system_id IS NULL).
  IF v_res_system IS NOT NULL THEN
    NEW.system_id := v_res_system;
  ELSIF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_sys_client FROM public.systems WHERE id = NEW.system_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced system does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_sys_client IS NOT NULL AND v_sys_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Backup policy client_id does not match referenced system client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify service agreement belongs to policy client
  IF NEW.service_agreement_id IS NOT NULL THEN
    SELECT client_id INTO v_agr_client FROM public.service_agreements WHERE id = NEW.service_agreement_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced service agreement does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_agr_client IS NOT NULL AND v_agr_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Backup policy client_id does not match referenced service agreement client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Active-policy overlap guard: a resource may not hold two simultaneously
  -- active policies whose effective windows overlap (NULL effective_until = open-ended).
  IF NEW.is_active THEN
    IF EXISTS (
      SELECT 1 FROM public.backup_policies p
      WHERE p.resource_id = NEW.resource_id
        AND p.id <> NEW.id
        AND p.is_active
        AND (p.effective_until IS NULL OR NEW.effective_from <= p.effective_until)
        AND (NEW.effective_until IS NULL OR p.effective_from <= NEW.effective_until)
    ) THEN
      RAISE EXCEPTION 'An active backup policy already exists for this resource covering the requested effective period' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_policy_integrity ON public.backup_policies;
CREATE TRIGGER trg_backup_policy_integrity
  BEFORE INSERT OR UPDATE OF client_id, resource_id, system_id, service_agreement_id, is_active, effective_from, effective_until ON public.backup_policies
  FOR EACH ROW EXECUTE FUNCTION public.check_backup_policy_integrity();

-- B. backup_events same-client integrity
CREATE OR REPLACE FUNCTION public.check_backup_event_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pol_client UUID;
  v_pol_resource UUID;
  v_res_client UUID;
  v_res_system UUID;
  v_sys_client UUID;
  v_agr_client UUID;
  v_verifier_role TEXT;
BEGIN
  -- If linked to a policy, the policy anchors client + resource consistency.
  IF NEW.backup_policy_id IS NOT NULL THEN
    SELECT client_id, resource_id INTO v_pol_client, v_pol_resource
    FROM public.backup_policies WHERE id = NEW.backup_policy_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced backup policy does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_pol_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Backup event client_id does not match referenced backup policy client_id' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.resource_id IS NULL THEN
      NEW.resource_id := v_pol_resource;
    ELSIF NEW.resource_id <> v_pol_resource THEN
      RAISE EXCEPTION 'Backup event resource_id does not match referenced backup policy resource_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify resource belongs to event client
  IF NEW.resource_id IS NOT NULL THEN
    SELECT client_id, system_id INTO v_res_client, v_res_system
    FROM public.resources WHERE id = NEW.resource_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced resource does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_res_client IS NOT NULL AND v_res_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Backup event client_id does not match referenced resource client_id' USING ERRCODE = 'P0001';
    END IF;
    -- Derive system from resource when authoritative
    IF v_res_system IS NOT NULL THEN
      NEW.system_id := v_res_system;
    END IF;
  END IF;

  -- Verify system belongs to event client (standalone resource case)
  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_sys_client FROM public.systems WHERE id = NEW.system_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced system does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_sys_client IS NOT NULL AND v_sys_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Backup event client_id does not match referenced system client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify service agreement belongs to event client
  IF NEW.service_agreement_id IS NOT NULL THEN
    SELECT client_id INTO v_agr_client FROM public.service_agreements WHERE id = NEW.service_agreement_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced service agreement does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_agr_client IS NOT NULL AND v_agr_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Backup event client_id does not match referenced service agreement client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify verifier is Admin or Staff
  IF NEW.verified_by IS NOT NULL THEN
    SELECT role INTO v_verifier_role FROM public.profiles WHERE id = NEW.verified_by;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Verifying user does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_verifier_role NOT IN ('admin', 'staff') THEN
      RAISE EXCEPTION 'Backup events can only be verified by Admin or Staff members' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_event_integrity ON public.backup_events;
CREATE TRIGGER trg_backup_event_integrity
  BEFORE INSERT OR UPDATE OF client_id, backup_policy_id, resource_id, system_id, service_agreement_id, verified_by ON public.backup_events
  FOR EACH ROW EXECUTE FUNCTION public.check_backup_event_integrity();

-- ----------------------------------------------------------------------------
-- 5. Lifecycle Guards & Timestamps
-- ----------------------------------------------------------------------------

-- A. backup_policies lifecycle guard
CREATE OR REPLACE FUNCTION public.check_backup_policy_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_finance() THEN
    RAISE EXCEPTION 'Finance users cannot create or modify backup policies' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_policy_lifecycle ON public.backup_policies;
CREATE TRIGGER trg_backup_policy_lifecycle
  BEFORE INSERT OR UPDATE ON public.backup_policies
  FOR EACH ROW EXECUTE FUNCTION public.check_backup_policy_lifecycle();

-- B. backup_events lifecycle guard
--
-- Controlled status model (deterministic, no automation):
--   expected    -> in_progress | successful | failed | missed
--   in_progress -> successful | failed | missed
--   successful  -> verified
--   failed      -> terminal (a retry is recorded as a NEW event)
--   missed      -> terminal
--   verified    -> terminal
CREATE OR REPLACE FUNCTION public.check_backup_event_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot record backup events' USING ERRCODE = 'P0001';
    END IF;

    -- 'verified' is only reachable via transition from 'successful'.
    IF NEW.status = 'verified' THEN
      RAISE EXCEPTION 'New backup events cannot directly be created as verified; verify a successful event instead' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL THEN
      RAISE EXCEPTION 'Verification fields can only be set by the verified status transition' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'failed' AND (NEW.failure_reason IS NULL OR char_length(trim(NEW.failure_reason)) < 3) THEN
      RAISE EXCEPTION 'A failed backup event requires a failure_reason' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
      NEW.started_at := now();
    END IF;
    IF NEW.status IN ('successful', 'failed', 'missed') AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.status = 'successful' AND NEW.started_at IS NULL THEN
      NEW.started_at := now();
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF auth.uid() IS NOT NULL AND public.is_finance() THEN
    RAISE EXCEPTION 'Finance users cannot modify backup events' USING ERRCODE = 'P0001';
  END IF;

  -- Evidence records are immutable in identity: policy/resource/client bindings
  -- cannot be retargeted after the fact.
  IF NEW.client_id <> OLD.client_id
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.backup_policy_id IS DISTINCT FROM OLD.backup_policy_id THEN
    RAISE EXCEPTION 'Backup event client, resource and policy bindings cannot be changed after recording' USING ERRCODE = 'P0001';
  END IF;

  -- Terminal states: verified, failed and missed events cannot change status.
  IF OLD.status IN ('verified', 'failed', 'missed') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Backup events in terminal status (%) cannot transition', OLD.status USING ERRCODE = 'P0001';
  END IF;

  -- Valid transition enforcement
  IF NEW.status <> OLD.status THEN
    IF OLD.status = 'expected' AND NEW.status NOT IN ('in_progress', 'successful', 'failed', 'missed') THEN
      RAISE EXCEPTION 'Invalid backup event transition: expected -> %', NEW.status USING ERRCODE = 'P0001';
    ELSIF OLD.status = 'in_progress' AND NEW.status NOT IN ('successful', 'failed', 'missed') THEN
      RAISE EXCEPTION 'Invalid backup event transition: in_progress -> %', NEW.status USING ERRCODE = 'P0001';
    ELSIF OLD.status = 'successful' AND NEW.status <> 'verified' THEN
      RAISE EXCEPTION 'Invalid backup event transition: successful -> %', NEW.status USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Timestamps on transitions
  IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  IF NEW.status IN ('successful', 'failed', 'missed') AND OLD.status <> NEW.status THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    IF NEW.status = 'successful' AND NEW.started_at IS NULL THEN
      NEW.started_at := COALESCE(NEW.completed_at, now());
    END IF;
  END IF;

  IF NEW.status = 'failed' AND (NEW.failure_reason IS NULL OR char_length(trim(NEW.failure_reason)) < 3) THEN
    RAISE EXCEPTION 'A failed backup event requires a failure_reason' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'verified' AND OLD.status <> 'verified' THEN
    NEW.verified_at := COALESCE(NEW.verified_at, now());
    NEW.verified_by := COALESCE(NEW.verified_by, auth.uid());
  END IF;

  -- verified_at/verified_by are only meaningful on a verified event
  IF NEW.status <> 'verified' AND (NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL) THEN
    RAISE EXCEPTION 'verified_at / verified_by are only valid on a verified backup event' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_event_lifecycle ON public.backup_events;
CREATE TRIGGER trg_backup_event_lifecycle
  BEFORE INSERT OR UPDATE ON public.backup_events
  FOR EACH ROW EXECUTE FUNCTION public.check_backup_event_lifecycle();

-- ----------------------------------------------------------------------------
-- 6. Delete Safety Blockers (Preserve Backup Evidence)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_policies_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Destructive deletion of backup policies is strictly forbidden. Deactivate the policy or set effective_until instead.' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_policies_no_delete ON public.backup_policies;
CREATE TRIGGER trg_backup_policies_no_delete
  BEFORE DELETE ON public.backup_policies
  FOR EACH ROW EXECUTE FUNCTION public.backup_policies_prevent_destructive_delete();

CREATE OR REPLACE FUNCTION public.backup_events_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Destructive deletion of backup event records is strictly forbidden. Record a corrected or superseding event instead.' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_events_no_delete ON public.backup_events;
CREATE TRIGGER trg_backup_events_no_delete
  BEFORE DELETE ON public.backup_events
  FOR EACH ROW EXECUTE FUNCTION public.backup_events_prevent_destructive_delete();

-- ----------------------------------------------------------------------------
-- 7. Audit Logging Triggers (existing audit_logs — no second audit system)
-- ----------------------------------------------------------------------------

-- A. backup_policies audit logger
CREATE OR REPLACE FUNCTION public.log_backup_policy_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'backup_policy.created',
      'backup_policies',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'name', NEW.name,
        'client_id', NEW.client_id,
        'resource_id', NEW.resource_id,
        'frequency', NEW.frequency,
        'retention_days', NEW.retention_days,
        'verification_required', NEW.verification_required,
        'is_active', NEW.is_active,
        'created_by', NEW.created_by
      )
    );
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    PERFORM public.write_audit_log(
      CASE WHEN NEW.is_active THEN 'backup_policy.activated' ELSE 'backup_policy.deactivated' END,
      'backup_policies',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('is_active', NEW.is_active)
    );
  END IF;

  IF to_jsonb(OLD) - 'updated_at' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' THEN
    PERFORM public.write_audit_log(
      'backup_policy.updated',
      'backup_policies',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_policy_audit ON public.backup_policies;
CREATE TRIGGER trg_backup_policy_audit
  AFTER INSERT OR UPDATE ON public.backup_policies
  FOR EACH ROW EXECUTE FUNCTION public.log_backup_policy_audit();

-- B. backup_events audit logger
CREATE OR REPLACE FUNCTION public.log_backup_event_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'backup_event.created',
      'backup_events',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'client_id', NEW.client_id,
        'resource_id', NEW.resource_id,
        'backup_policy_id', NEW.backup_policy_id,
        'status', NEW.status,
        'recorded_by', NEW.recorded_by
      )
    );
    IF NEW.status = 'failed' THEN
      PERFORM public.write_audit_log('backup_event.failed', 'backup_events', NEW.id, NULL, to_jsonb(NEW), jsonb_build_object('failure_reason', NEW.failure_reason));
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.status <> NEW.status THEN
    PERFORM public.write_audit_log(
      'backup_event.status_changed',
      'backup_events',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );

    IF NEW.status = 'verified' THEN
      PERFORM public.write_audit_log('backup_event.verified', 'backup_events', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('verified_at', NEW.verified_at, 'verified_by', NEW.verified_by));
    ELSIF NEW.status = 'failed' THEN
      PERFORM public.write_audit_log('backup_event.failed', 'backup_events', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('failure_reason', NEW.failure_reason));
    END IF;
  END IF;

  IF (OLD.evidence_reference IS DISTINCT FROM NEW.evidence_reference OR OLD.evidence_notes IS DISTINCT FROM NEW.evidence_notes)
     AND (NEW.evidence_reference IS NOT NULL OR NEW.evidence_notes IS NOT NULL) THEN
    PERFORM public.write_audit_log(
      'backup_event.evidence_recorded',
      'backup_events',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('has_reference', NEW.evidence_reference IS NOT NULL, 'has_notes', NEW.evidence_notes IS NOT NULL)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_event_audit ON public.backup_events;
CREATE TRIGGER trg_backup_event_audit
  AFTER INSERT OR UPDATE ON public.backup_events
  FOR EACH ROW EXECUTE FUNCTION public.log_backup_event_audit();

-- ----------------------------------------------------------------------------
-- 8. Deterministic Backup Health View
--
-- Calculation rules (documented, no SLA mathematics):
--   interval_days  = frequency_interval_days for 'custom', else
--                    daily=1, weekly=7, monthly=30.
--   last_completed = latest completed_at of events on the policy's resource
--                    within the effective window with status successful|verified
--                    (linked events via backup_policy_id, or unlinked events on
--                    the same resource recorded inside the window).
--   next_due_at    = COALESCE(last_completed, effective_from) + interval_days.
--   health precedence:
--     'inactive'   policy disabled or effective window has ended
--     'failed'     the most recent recorded event is a failure
--     'overdue'    latest event is 'missed', or now() > next_due_at
--     'unverified' verification_required and the latest successful event is not verified
--     'due'        inside the final 25% of the cadence window before next_due_at
--     'healthy'    otherwise
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.backup_policy_health
WITH (security_invoker = true) AS
WITH scoped AS (
  SELECT
    p.id AS policy_id,
    p.client_id,
    p.system_id,
    p.resource_id,
    p.service_agreement_id,
    p.name AS policy_name,
    p.frequency,
    p.frequency_interval_days,
    p.retention_days,
    p.verification_required,
    p.is_active,
    p.effective_from,
    p.effective_until,
    COALESCE(
      p.frequency_interval_days,
      CASE p.frequency
        WHEN 'daily' THEN 1
        WHEN 'weekly' THEN 7
        WHEN 'monthly' THEN 30
        ELSE 30
      END
    ) AS interval_days,
    ev.last_completed_at,
    ev.last_verified_at,
    ev.last_success_status,
    ev.last_event_status,
    ev.last_event_at,
    ev.last_failed_at,
    ev.last_failure_reason
  FROM public.backup_policies p
  LEFT JOIN LATERAL (
    SELECT
      max(be.completed_at) FILTER (WHERE be.status IN ('successful', 'verified')) AS last_completed_at,
      max(be.verified_at) FILTER (WHERE be.status = 'verified') AS last_verified_at,
      (array_agg(be.status ORDER BY be.completed_at DESC NULLS LAST, be.created_at DESC)
        FILTER (WHERE be.status IN ('successful', 'verified')))[1] AS last_success_status,
      (array_agg(be.status ORDER BY be.created_at DESC))[1] AS last_event_status,
      max(be.created_at) AS last_event_at,
      max(be.created_at) FILTER (WHERE be.status = 'failed') AS last_failed_at,
      (array_agg(be.failure_reason ORDER BY be.created_at DESC)
        FILTER (WHERE be.status = 'failed'))[1] AS last_failure_reason
    FROM public.backup_events be
    WHERE be.resource_id = p.resource_id
      AND (be.backup_policy_id = p.id OR be.backup_policy_id IS NULL)
      AND be.created_at >= p.effective_from::timestamptz
      AND (p.effective_until IS NULL OR be.created_at < (p.effective_until + 1)::timestamptz)
  ) ev ON TRUE
)
SELECT
  scoped.*,
  (COALESCE(scoped.last_completed_at, scoped.effective_from::timestamptz)
    + make_interval(days => scoped.interval_days)) AS next_due_at,
  CASE
    WHEN NOT scoped.is_active OR scoped.effective_until < CURRENT_DATE THEN 'inactive'
    WHEN scoped.last_event_status = 'failed' THEN 'failed'
    WHEN scoped.last_event_status = 'missed' THEN 'overdue'
    WHEN now() > COALESCE(scoped.last_completed_at, scoped.effective_from::timestamptz)
         + make_interval(days => scoped.interval_days) THEN 'overdue'
    WHEN scoped.verification_required AND scoped.last_success_status = 'successful' THEN 'unverified'
    WHEN now() > COALESCE(scoped.last_completed_at, scoped.effective_from::timestamptz)
         + make_interval(days => scoped.interval_days)
         - make_interval(secs => scoped.interval_days * 21600) THEN 'due'
    ELSE 'healthy'
  END AS health
FROM scoped;

-- ----------------------------------------------------------------------------
-- 9. Row Level Security (RLS) & Granular Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.backup_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_events ENABLE ROW LEVEL SECURITY;

-- backup_policies policies
DROP POLICY IF EXISTS backup_policies_select_admin ON public.backup_policies;
CREATE POLICY backup_policies_select_admin ON public.backup_policies
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS backup_policies_select_finance ON public.backup_policies;
CREATE POLICY backup_policies_select_finance ON public.backup_policies
  FOR SELECT TO authenticated
  USING (public.is_finance());

DROP POLICY IF EXISTS backup_policies_select_staff ON public.backup_policies;
CREATE POLICY backup_policies_select_staff ON public.backup_policies
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS backup_policies_insert_admin ON public.backup_policies;
CREATE POLICY backup_policies_insert_admin ON public.backup_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS backup_policies_update_admin ON public.backup_policies;
CREATE POLICY backup_policies_update_admin ON public.backup_policies
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- backup_events policies
DROP POLICY IF EXISTS backup_events_select_admin ON public.backup_events;
CREATE POLICY backup_events_select_admin ON public.backup_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS backup_events_select_finance ON public.backup_events;
CREATE POLICY backup_events_select_finance ON public.backup_events
  FOR SELECT TO authenticated
  USING (public.is_finance());

DROP POLICY IF EXISTS backup_events_select_staff ON public.backup_events;
CREATE POLICY backup_events_select_staff ON public.backup_events
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS backup_events_insert_admin ON public.backup_events;
CREATE POLICY backup_events_insert_admin ON public.backup_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS backup_events_insert_staff ON public.backup_events;
CREATE POLICY backup_events_insert_staff ON public.backup_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS backup_events_update_admin ON public.backup_events;
CREATE POLICY backup_events_update_admin ON public.backup_events
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS backup_events_update_staff ON public.backup_events;
CREATE POLICY backup_events_update_staff ON public.backup_events
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ----------------------------------------------------------------------------
-- 10. Explicit Privilege Hardening
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.backup_policies FROM anon;
REVOKE ALL ON public.backup_events FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.backup_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.backup_events TO authenticated;

REVOKE DELETE, TRUNCATE ON public.backup_policies FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.backup_events FROM authenticated, anon;

GRANT ALL ON public.backup_policies TO service_role;
GRANT ALL ON public.backup_events TO service_role;

REVOKE TRUNCATE ON public.backup_policies FROM service_role;
REVOKE TRUNCATE ON public.backup_events FROM service_role;

-- Health view: internal roles only (RLS of underlying tables applies via
-- security_invoker, so clients still see zero rows).
REVOKE ALL ON public.backup_policy_health FROM anon;
GRANT SELECT ON public.backup_policy_health TO authenticated;
GRANT SELECT ON public.backup_policy_health TO service_role;

COMMIT;
