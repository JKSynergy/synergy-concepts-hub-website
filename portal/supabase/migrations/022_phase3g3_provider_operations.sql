-- ============================================================================
-- Migration 022 — Phase 3G-3: Controlled Provider Operations
-- ============================================================================
--
-- Builds on 3G-1 (connect → discover → review → explicitly link) and
-- 3G-2 (reconcile → propose → approve → apply SCH-side changes) by adding the
-- final link: CONTROLLED PROVIDER OPERATION → VERIFY ACTUAL PROVIDER STATE.
--
-- Provider-side operations are privileged operational actions, not CRUD:
--
--   linked resource → typed operation capability → proposal → explicit Admin
--   approval → server-side execution (Vault credential) → post-operation
--   verification → audited final result.
--
-- Hard rules enforced here:
--   * No arbitrary provider API calls — operation_key is a closed enum.
--   * No provider mutation without explicit Admin approval.
--   * Stale proposals cannot execute — the proposal is bound to the provider
--     observation (basis_run_id + basis_snapshot) it was approved against.
--   * Single-flight execution — a proposal can never have two live executions.
--   * Unknown execution outcomes are never reported as success.
--   * Credentials never enter these tables — they stay in Supabase Vault.
--   * Proposal/execution history is auditable and cannot be deleted.
--
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Operation keys — closed vocabulary
-- ----------------------------------------------------------------------------
-- Every provider-side operation is a named, typed capability. Extending this
-- list requires a new migration AND adapter support.
CREATE TABLE IF NOT EXISTS public.provider_operation_proposals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id     UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  discovered_resource_id  UUID NOT NULL REFERENCES public.provider_discovered_resources(id) ON DELETE RESTRICT,
  resource_id             UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
  operation_key           TEXT NOT NULL
    CHECK (operation_key IN ('pause_resource', 'resume_resource')),
  reason                  TEXT NOT NULL
    CHECK (char_length(btrim(reason)) > 0 AND public.check_no_secrets_in_text(reason)),
  -- The provider observation the proposal was created/approved against.
  basis_run_id            UUID REFERENCES public.provider_discovery_runs(id),
  basis_snapshot          JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (public.check_no_secrets_in_text(basis_snapshot::text)),
  status                  TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed', 'approved', 'rejected', 'cancelled',
    'executing', 'verification_pending', 'verified',
    'failed', 'verification_failed', 'stale')),
  requested_by            UUID REFERENCES auth.users(id),
  approved_by             UUID REFERENCES auth.users(id),
  approved_at             TIMESTAMPTZ,
  decided_reason          TEXT CHECK (public.check_no_secrets_in_text(decided_reason)),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open proposal per (external resource, operation). A finished proposal
-- (verified/failed/rejected/cancelled/stale) frees the slot for a new one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_open_proposal
  ON public.provider_operation_proposals (discovered_resource_id, operation_key)
  WHERE status IN ('proposed', 'approved', 'executing', 'verification_pending', 'verification_failed');

CREATE INDEX IF NOT EXISTS idx_op_proposals_account
  ON public.provider_operation_proposals (provider_account_id);
CREATE INDEX IF NOT EXISTS idx_op_proposals_status
  ON public.provider_operation_proposals (status);

CREATE TABLE IF NOT EXISTS public.provider_operation_executions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id               UUID NOT NULL REFERENCES public.provider_operation_proposals(id) ON DELETE RESTRICT,
  provider_account_id       UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  operation_key             TEXT NOT NULL,
  -- Stable across retries of the same proposal so a provider that supports
  -- idempotency keys deduplicates; SCH-side single-flight covers the rest.
  idempotency_key           TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'executing' CHECK (status IN (
    'executing', 'completed', 'failed', 'execution_unknown',
    'verification_pending', 'verified', 'verification_failed')),
  provider_result_category  TEXT CHECK (public.check_no_secrets_in_text(provider_result_category)),
  provider_request_reference TEXT CHECK (public.check_no_secrets_in_text(provider_request_reference)),
  verification_status       TEXT,
  observed_provider_status  TEXT CHECK (public.check_no_secrets_in_text(observed_provider_status)),
  error_category            TEXT CHECK (public.check_no_secrets_in_text(error_category)),
  safe_error_message        TEXT CHECK (public.check_no_secrets_in_text(safe_error_message)),
  started_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at              TIMESTAMPTZ,
  verified_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-flight: a proposal can never have two live executions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_live_execution
  ON public.provider_operation_executions (proposal_id)
  WHERE status IN ('executing', 'verification_pending');

CREATE INDEX IF NOT EXISTS idx_op_executions_proposal
  ON public.provider_operation_executions (proposal_id);

-- ----------------------------------------------------------------------------
-- 2. propose_provider_operation — explicit proposal on a LINKED resource
-- ----------------------------------------------------------------------------
-- Returns the proposal id. Idempotent: if an open proposal already exists for
-- the same discovered resource + operation, the existing id is returned
-- (duplicate browser submissions cannot create duplicate proposals).
CREATE OR REPLACE FUNCTION public.propose_provider_operation(
  p_discovered_id UUID,
  p_operation_key TEXT,
  p_reason TEXT,
  p_actor UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disc     public.provider_discovered_resources%ROWTYPE;
  v_existing UUID;
  v_id       UUID;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may propose provider operations';
  END IF;

  IF p_operation_key NOT IN ('pause_resource', 'resume_resource') THEN
    RAISE EXCEPTION 'Unsupported provider operation: %', p_operation_key;
  END IF;

  SELECT * INTO v_disc
  FROM public.provider_discovered_resources
  WHERE id = p_discovered_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discovered resource % not found', p_discovered_id;
  END IF;

  IF v_disc.link_status <> 'linked' OR v_disc.linked_resource_id IS NULL THEN
    RAISE EXCEPTION 'Provider operations require an explicitly linked SCH resource';
  END IF;
  IF v_disc.external_missing THEN
    RAISE EXCEPTION 'Provider operations require the resource to be present externally';
  END IF;
  IF v_disc.last_run_id IS NULL THEN
    RAISE EXCEPTION 'Provider operations require a discovery observation as basis';
  END IF;

  -- Idempotent propose: reuse an existing open proposal.
  SELECT id INTO v_existing
  FROM public.provider_operation_proposals
  WHERE discovered_resource_id = p_discovered_id
    AND operation_key = p_operation_key
    AND status IN ('proposed', 'approved', 'executing', 'verification_pending', 'verification_failed');
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.provider_operation_proposals (
    provider_account_id, discovered_resource_id, resource_id,
    operation_key, reason, basis_run_id, basis_snapshot, requested_by
  ) VALUES (
    v_disc.provider_account_id, v_disc.id, v_disc.linked_resource_id,
    p_operation_key, p_reason, v_disc.last_run_id,
    public.provider_discovered_snapshot(v_disc.id), p_actor
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. review_provider_operation — approve / reject / cancel
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_provider_operation(
  p_proposal_id UUID,
  p_decision TEXT,
  p_actor UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop public.provider_operation_proposals%ROWTYPE;
  v_next TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may review provider operations';
  END IF;

  SELECT * INTO v_prop FROM public.provider_operation_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider operation proposal % not found', p_proposal_id;
  END IF;

  IF p_decision NOT IN ('approve', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'Unknown review decision: %', p_decision;
  END IF;

  IF p_decision = 'approve' THEN
    IF v_prop.status <> 'proposed' THEN
      RAISE EXCEPTION 'Only proposed operations can be approved (currently %)', v_prop.status;
    END IF;
    v_next := 'approved';
  ELSIF p_decision = 'reject' THEN
    IF v_prop.status <> 'proposed' THEN
      RAISE EXCEPTION 'Only proposed operations can be rejected (currently %)', v_prop.status;
    END IF;
    v_next := 'rejected';
  ELSE
    IF v_prop.status NOT IN ('proposed', 'approved') THEN
      RAISE EXCEPTION 'Only proposed or approved operations can be cancelled (currently %)', v_prop.status;
    END IF;
    v_next := 'cancelled';
  END IF;

  UPDATE public.provider_operation_proposals
  SET status = v_next,
      approved_by = CASE WHEN v_next = 'approved' THEN p_actor ELSE approved_by END,
      approved_at = CASE WHEN v_next = 'approved' THEN now() ELSE approved_at END,
      decided_reason = COALESCE(p_reason, decided_reason),
      updated_at = now()
  WHERE id = p_proposal_id;

  RETURN v_next;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. begin_provider_operation_execution — gate + single-flight lock
-- ----------------------------------------------------------------------------
-- Validates everything that must be true before ANY provider call is made:
--   approved status, linked resource present externally, connected account,
--   and a non-stale basis (the provider observation the proposal was approved
--   against must still be the latest observation and status must match).
-- Returns JSONB:
--   { outcome: 'begin', execution_id, provider_account_id, external_resource_id,
--     resource_type, operation_key, idempotency_key }
--   { outcome: 'stale' }      — proposal marked stale, do not execute
-- Raises for genuine authorization/validation failures.
CREATE OR REPLACE FUNCTION public.begin_provider_operation_execution(
  p_proposal_id UUID,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop  public.provider_operation_proposals%ROWTYPE;
  v_disc  public.provider_discovered_resources%ROWTYPE;
  v_acct  public.provider_accounts%ROWTYPE;
  v_exec  UUID;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may execute provider operations';
  END IF;

  SELECT * INTO v_prop FROM public.provider_operation_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider operation proposal % not found', p_proposal_id;
  END IF;

  IF v_prop.status = 'verification_pending' THEN
    RAISE EXCEPTION 'An execution for this proposal is awaiting verification — verify it before retrying';
  END IF;
  IF v_prop.status <> 'approved' THEN
    RAISE EXCEPTION 'Provider operation must be approved before execution (currently %)', v_prop.status;
  END IF;

  SELECT * INTO v_disc FROM public.provider_discovered_resources
  WHERE id = v_prop.discovered_resource_id;
  IF NOT FOUND OR v_disc.link_status <> 'linked' OR v_disc.linked_resource_id IS NULL THEN
    RAISE EXCEPTION 'Linked provider resource is no longer available';
  END IF;
  IF v_disc.external_missing THEN
    UPDATE public.provider_operation_proposals
      SET status = 'stale', updated_at = now() WHERE id = p_proposal_id;
    RETURN jsonb_build_object('outcome', 'stale', 'reason', 'resource_missing_externally');
  END IF;

  -- Stale basis: a newer provider observation, or an external status change
  -- since approval, invalidates the proposal.
  IF v_disc.last_run_id IS DISTINCT FROM v_prop.basis_run_id
     OR v_disc.status IS DISTINCT FROM (v_prop.basis_snapshot ->> 'status') THEN
    UPDATE public.provider_operation_proposals
      SET status = 'stale', updated_at = now() WHERE id = p_proposal_id;
    RETURN jsonb_build_object('outcome', 'stale', 'reason', 'provider_state_changed');
  END IF;

  -- Connection must be live — a stale failed credential state can never reach
  -- a provider mutation.
  SELECT * INTO v_acct FROM public.provider_accounts WHERE id = v_prop.provider_account_id;
  IF NOT FOUND OR v_acct.status = 'archived' THEN
    RAISE EXCEPTION 'Provider account is not available';
  END IF;
  IF v_acct.connection_status <> 'connected' THEN
    RAISE EXCEPTION 'Provider account is not connected — run a connection test first (currently %)', v_acct.connection_status;
  END IF;
  IF v_acct.credential_reference IS NULL THEN
    RAISE EXCEPTION 'No credential is configured for this provider account';
  END IF;

  INSERT INTO public.provider_operation_executions (
    proposal_id, provider_account_id, operation_key, idempotency_key, status
  ) VALUES (
    p_proposal_id, v_prop.provider_account_id, v_prop.operation_key,
    'schop-' || p_proposal_id::text, 'executing'
  ) RETURNING id INTO v_exec;

  UPDATE public.provider_operation_proposals
    SET status = 'executing', updated_at = now() WHERE id = p_proposal_id;

  RETURN jsonb_build_object(
    'outcome', 'begin',
    'execution_id', v_exec,
    'provider_account_id', v_prop.provider_account_id,
    'external_resource_id', v_disc.external_resource_id,
    'resource_type', v_disc.resource_type,
    'operation_key', v_prop.operation_key,
    'idempotency_key', 'schop-' || p_proposal_id::text
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. complete_provider_operation_execution — record the normalized provider result
-- ----------------------------------------------------------------------------
-- The server action calls the adapter, then reports the NORMALIZED category
-- here — never a raw payload. Result handling:
--   success / accepted / already_in_desired_state → verification_pending
--   definitive failures (auth/permission/invalid/not_found/conflict)
--     → execution failed, proposal failed
--   transient/unknown (rate_limited/unavailable/network_error/execution_unknown)
--     → execution recorded, proposal returns to 'approved' for a SAFE retry
CREATE OR REPLACE FUNCTION public.complete_provider_operation_execution(
  p_execution_id UUID,
  p_result_category TEXT,
  p_provider_ref TEXT DEFAULT NULL,
  p_error_category TEXT DEFAULT NULL,
  p_safe_message TEXT DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exec   public.provider_operation_executions%ROWTYPE;
  v_prop   public.provider_operation_proposals%ROWTYPE;
  v_estat  TEXT;
  v_pstat  TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may record provider operation results';
  END IF;

  IF p_result_category NOT IN (
    'success', 'accepted', 'already_in_desired_state',
    'not_found', 'auth_failed', 'permission_denied', 'rate_limited',
    'unavailable', 'invalid_request', 'conflict', 'network_error',
    'malformed_response', 'execution_unknown', 'no_credentials', 'unsupported'
  ) THEN
    RAISE EXCEPTION 'Unknown provider result category: %', p_result_category;
  END IF;

  SELECT * INTO v_exec FROM public.provider_operation_executions WHERE id = p_execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider operation execution % not found', p_execution_id;
  END IF;
  IF v_exec.status <> 'executing' THEN
    RETURN 'already_completed';
  END IF;

  SELECT * INTO v_prop FROM public.provider_operation_proposals WHERE id = v_exec.proposal_id;

  IF p_result_category IN ('success', 'accepted', 'already_in_desired_state') THEN
    v_estat := 'completed';
    v_pstat := 'verification_pending';
  ELSIF p_result_category IN ('rate_limited', 'unavailable', 'network_error', 'execution_unknown') THEN
    -- Transient/unknown: execution is recorded; the proposal returns to
    -- 'approved' so an Admin may retry (or verify) — never auto-retried.
    v_estat := CASE WHEN p_result_category = 'execution_unknown' THEN 'execution_unknown' ELSE 'failed' END;
    v_pstat := 'approved';
  ELSE
    v_estat := 'failed';
    v_pstat := 'failed';
  END IF;

  UPDATE public.provider_operation_executions
  SET status = v_estat,
      provider_result_category = p_result_category,
      provider_request_reference = p_provider_ref,
      error_category = p_error_category,
      safe_error_message = p_safe_message,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_execution_id;

  UPDATE public.provider_operation_proposals
  SET status = v_pstat, updated_at = now()
  WHERE id = v_exec.proposal_id;

  RETURN v_pstat;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. finish_provider_operation_verification — mandatory post-operation check
-- ----------------------------------------------------------------------------
-- Execution "success" is never trusted: the adapter re-reads the resource and
-- reports whether the provider now shows the target state. Outcomes:
--   verified  → execution verified, proposal verified, SCH external_* updated
--   pending   → provider still transitioning; verification stays pending
--   mismatch  → execution + proposal verification_failed (NOT success)
CREATE OR REPLACE FUNCTION public.finish_provider_operation_verification(
  p_execution_id UUID,
  p_outcome TEXT,
  p_observed_status TEXT DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exec public.provider_operation_executions%ROWTYPE;
  v_prop public.provider_operation_proposals%ROWTYPE;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may record provider operation verification';
  END IF;

  IF p_outcome NOT IN ('verified', 'pending', 'mismatch') THEN
    RAISE EXCEPTION 'Unknown verification outcome: %', p_outcome;
  END IF;

  SELECT * INTO v_exec FROM public.provider_operation_executions WHERE id = p_execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider operation execution % not found', p_execution_id;
  END IF;

  SELECT * INTO v_prop FROM public.provider_operation_proposals WHERE id = v_exec.proposal_id;
  IF v_prop.status <> 'verification_pending' THEN
    RAISE EXCEPTION 'Proposal % is not awaiting verification (currently %)', v_prop.id, v_prop.status;
  END IF;

  IF p_outcome = 'pending' THEN
    UPDATE public.provider_operation_executions
    SET status = 'verification_pending', verification_status = 'pending',
        observed_provider_status = p_observed_status, updated_at = now()
    WHERE id = p_execution_id;
    RETURN 'verification_pending';
  END IF;

  IF p_outcome = 'verified' THEN
    UPDATE public.provider_operation_executions
    SET status = 'verified', verification_status = 'verified',
        observed_provider_status = p_observed_status, verified_at = now(), updated_at = now()
    WHERE id = p_execution_id;

    UPDATE public.provider_operation_proposals
    SET status = 'verified', updated_at = now()
    WHERE id = v_prop.id;

    -- SCH-side record: the provider-observed status is authoritative for
    -- external_status; SCH-owned fields are untouched.
    UPDATE public.resources
    SET external_status = p_observed_status,
        external_checked_at = now(),
        updated_at = now()
    WHERE id = v_prop.resource_id;

    UPDATE public.provider_discovered_resources
    SET status = p_observed_status,
        reconciled_snapshot = public.provider_discovered_snapshot(v_prop.discovered_resource_id)
          || jsonb_build_object('status', p_observed_status),
        updated_at = now()
    WHERE id = v_prop.discovered_resource_id;

    RETURN 'verified';
  END IF;

  -- mismatch
  UPDATE public.provider_operation_executions
  SET status = 'verification_failed', verification_status = 'mismatch',
      observed_provider_status = p_observed_status, verified_at = now(), updated_at = now()
  WHERE id = p_execution_id;

  UPDATE public.provider_operation_proposals
  SET status = 'verification_failed', updated_at = now()
  WHERE id = v_prop.id;

  RETURN 'verification_failed';
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Audit triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_provider_operation_proposal_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_operation.proposed', 'provider_operation_proposals', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'discovered_resource_id', NEW.discovered_resource_id,
        'resource_id', NEW.resource_id,
        'operation_key', NEW.operation_key,
        'requested_by', NEW.requested_by
      )
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.write_audit_log(
      CASE NEW.status
        WHEN 'approved'             THEN 'provider_operation.approved'
        WHEN 'rejected'             THEN 'provider_operation.rejected'
        WHEN 'cancelled'            THEN 'provider_operation.cancelled'
        WHEN 'executing'            THEN 'provider_operation.started'
        WHEN 'verified'             THEN 'provider_operation.verified'
        WHEN 'verification_failed'  THEN 'provider_operation.verification_failed'
        WHEN 'failed'               THEN 'provider_operation.failed'
        WHEN 'stale'                THEN 'provider_operation.stale'
        ELSE 'provider_operation.updated'
      END,
      'provider_operation_proposals', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'discovered_resource_id', NEW.discovered_resource_id,
        'resource_id', NEW.resource_id,
        'operation_key', NEW.operation_key,
        'from', OLD.status,
        'to', NEW.status,
        'approved_by', NEW.approved_by
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_op_proposal_audit ON public.provider_operation_proposals;
CREATE TRIGGER trg_op_proposal_audit
  AFTER INSERT OR UPDATE ON public.provider_operation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.log_provider_operation_proposal_audit();

CREATE OR REPLACE FUNCTION public.log_provider_operation_execution_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_operation.execution_started', 'provider_operation_executions', NEW.id, NULL, NULL,
      jsonb_build_object(
        'proposal_id', NEW.proposal_id,
        'provider_account_id', NEW.provider_account_id,
        'operation_key', NEW.operation_key
      )
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.write_audit_log(
      CASE NEW.status
        WHEN 'completed'            THEN 'provider_operation.completed'
        WHEN 'failed'               THEN 'provider_operation.failed'
        WHEN 'execution_unknown'    THEN 'provider_operation.execution_unknown'
        WHEN 'verified'             THEN 'provider_operation.verified'
        WHEN 'verification_failed'  THEN 'provider_operation.verification_failed'
        ELSE 'provider_operation.execution_updated'
      END,
      'provider_operation_executions', NEW.id, NULL, NULL,
      jsonb_build_object(
        'proposal_id', NEW.proposal_id,
        'provider_account_id', NEW.provider_account_id,
        'operation_key', NEW.operation_key,
        'from', OLD.status,
        'to', NEW.status,
        'provider_result_category', NEW.provider_result_category,
        'observed_provider_status', NEW.observed_provider_status
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_op_execution_audit ON public.provider_operation_executions;
CREATE TRIGGER trg_op_execution_audit
  AFTER INSERT OR UPDATE ON public.provider_operation_executions
  FOR EACH ROW EXECUTE FUNCTION public.log_provider_operation_execution_audit();

-- ----------------------------------------------------------------------------
-- 8. Views
-- ----------------------------------------------------------------------------
-- Admin/Finance operation overview — normalized fields only, never payloads.
CREATE OR REPLACE VIEW public.provider_operation_overview AS
SELECT
  p.id,
  p.provider_account_id,
  p.discovered_resource_id,
  p.resource_id,
  pr.name AS provider_name,
  pr.adapter_key,
  pa.account_name,
  pa.connection_status,
  d.external_resource_id,
  d.resource_type AS external_type,
  d.name AS external_name,
  d.status AS provider_status,
  d.external_missing,
  r.name AS sch_resource_name,
  r.status AS sch_status,
  s.name AS system_name,
  cp.company_name AS client_company,
  p.operation_key,
  p.reason,
  p.status,
  p.basis_run_id,
  p.basis_snapshot,
  p.requested_by,
  req.full_name AS requested_by_name,
  p.approved_by,
  p.approved_at,
  p.created_at,
  p.updated_at,
  (d.last_run_id IS DISTINCT FROM p.basis_run_id
     OR d.status IS DISTINCT FROM (p.basis_snapshot ->> 'status')) AS basis_stale
FROM public.provider_operation_proposals p
JOIN public.provider_accounts pa ON pa.id = p.provider_account_id
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.provider_discovered_resources d ON d.id = p.discovered_resource_id
LEFT JOIN public.resources r ON r.id = p.resource_id
LEFT JOIN public.systems s ON s.id = r.system_id
LEFT JOIN public.profiles cp ON cp.id = r.client_id
LEFT JOIN public.profiles req ON req.id = p.requested_by
WHERE public.is_admin() OR public.is_finance();

CREATE OR REPLACE VIEW public.provider_operation_execution_overview AS
SELECT
  e.id,
  e.proposal_id,
  e.provider_account_id,
  e.operation_key,
  e.status,
  e.provider_result_category,
  e.verification_status,
  e.observed_provider_status,
  e.error_category,
  e.safe_error_message,
  e.started_at,
  e.completed_at,
  e.verified_at,
  e.created_at
FROM public.provider_operation_executions e
WHERE public.is_admin() OR public.is_finance();

-- ----------------------------------------------------------------------------
-- 9. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_operation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_operation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS op_proposals_select_admin ON public.provider_operation_proposals;
CREATE POLICY op_proposals_select_admin ON public.provider_operation_proposals
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS op_proposals_select_finance ON public.provider_operation_proposals;
CREATE POLICY op_proposals_select_finance ON public.provider_operation_proposals
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS op_proposals_insert_admin ON public.provider_operation_proposals;
CREATE POLICY op_proposals_insert_admin ON public.provider_operation_proposals
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS op_proposals_update_admin ON public.provider_operation_proposals;
CREATE POLICY op_proposals_update_admin ON public.provider_operation_proposals
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS op_executions_select_admin ON public.provider_operation_executions;
CREATE POLICY op_executions_select_admin ON public.provider_operation_executions
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS op_executions_select_finance ON public.provider_operation_executions;
CREATE POLICY op_executions_select_finance ON public.provider_operation_executions
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS op_executions_insert_admin ON public.provider_operation_executions;
CREATE POLICY op_executions_insert_admin ON public.provider_operation_executions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS op_executions_update_admin ON public.provider_operation_executions;
CREATE POLICY op_executions_update_admin ON public.provider_operation_executions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. Delete safety — operation history is auditable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_operation_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Provider operation records are auditable history and cannot be deleted; use status transitions instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_op_proposals_no_delete ON public.provider_operation_proposals;
CREATE TRIGGER trg_op_proposals_no_delete
  BEFORE DELETE ON public.provider_operation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.provider_operation_prevent_destructive_delete();

DROP TRIGGER IF EXISTS trg_op_executions_no_delete ON public.provider_operation_executions;
CREATE TRIGGER trg_op_executions_no_delete
  BEFORE DELETE ON public.provider_operation_executions
  FOR EACH ROW EXECUTE FUNCTION public.provider_operation_prevent_destructive_delete();

DROP TRIGGER IF EXISTS set_op_proposals_updated_at ON public.provider_operation_proposals;
CREATE TRIGGER set_op_proposals_updated_at
  BEFORE UPDATE ON public.provider_operation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_op_executions_updated_at ON public.provider_operation_executions;
CREATE TRIGGER set_op_executions_updated_at
  BEFORE UPDATE ON public.provider_operation_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 11. Privileges
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.provider_operation_proposals FROM anon;
REVOKE ALL ON public.provider_operation_executions FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.provider_operation_proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_operation_executions TO authenticated;
REVOKE DELETE, TRUNCATE ON public.provider_operation_proposals FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.provider_operation_executions FROM authenticated, anon;
GRANT ALL ON public.provider_operation_proposals TO service_role;
GRANT ALL ON public.provider_operation_executions TO service_role;
REVOKE TRUNCATE ON public.provider_operation_proposals FROM service_role;
REVOKE TRUNCATE ON public.provider_operation_executions FROM service_role;

REVOKE ALL ON public.provider_operation_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_operation_overview TO authenticated, service_role;
REVOKE ALL ON public.provider_operation_execution_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_operation_execution_overview TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.propose_provider_operation(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_provider_operation(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.begin_provider_operation_execution(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_provider_operation_execution(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_provider_operation_verification(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.propose_provider_operation(UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_provider_operation(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_provider_operation_execution(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_provider_operation_execution(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_provider_operation_verification(UUID, TEXT, TEXT, UUID) TO service_role;

COMMIT;
