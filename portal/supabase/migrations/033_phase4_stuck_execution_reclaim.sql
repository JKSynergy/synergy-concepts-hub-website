-- ============================================================================
-- Migration 033: Phase 4 — Reclaim executions wedged in 'executing'
-- ============================================================================
-- If the server action crashes or throws between
-- begin_provider_operation_execution and
-- complete_provider_operation_execution, the execution row stays 'executing'
-- forever: uq_operation_live_execution blocks a retry, verifyProviderOperation
-- only sees completed/verification_pending executions, and
-- uq_operation_open_proposal blocks a fresh proposal for the same resource+op.
-- Manual SQL was the only recovery path.
--
-- reclaim_stuck_provider_executions moves an 'executing' execution past the
-- in-flight window to 'execution_unknown' and its proposal to
-- 'verification_pending' — forcing the EXISTING read-only verify path to
-- reconcile actual provider state before any retry can occur.
--
-- Contract (JSONB):
--   sweep     (p_execution_id NULL) : { "reclaimed": <int> }
--   targeted  (p_execution_id given): { "reclaimed": 0|1,
--                                       "reason": "reclaimed" | "too_recent"
--                                               | "not_stuck" | "not_found" }
-- 'not_stuck' means the execution/proposal pair is not in 'executing' — either
-- another caller already resolved it or the state is inconsistent. The caller
-- must re-read authoritative state rather than trust a stale snapshot.
--
-- Race safety: the HTTP provider timeout is 15s; serverless functions cannot
-- outlive the window. Even in a pathological case where the original call was
-- still running, its complete_* RPC would see status<>'executing' and its
-- finish_* RPC operates on the proposal's 'verification_pending' state, so
-- the verification it performs lands consistently. The guarded UPDATE takes
-- row locks — a second concurrent reclaim matches zero rows.
-- ============================================================================

BEGIN;

-- The return type changed INTEGER -> JSONB since first DEV application.
DROP FUNCTION IF EXISTS public.reclaim_stuck_provider_executions(INTERVAL, UUID);

CREATE OR REPLACE FUNCTION public.reclaim_stuck_provider_executions(
  p_min_age INTERVAL DEFAULT '15 minutes',
  p_execution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n       INTEGER;
  v_estat   TEXT;
  v_pstat   TEXT;
  v_started TIMESTAMPTZ;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may reclaim provider operation executions';
  END IF;

  -- A non-positive window would let a caller reclaim a genuinely in-flight
  -- execution — refuse invalid input outright.
  IF p_min_age IS NULL OR p_min_age <= interval '0 seconds' THEN
    RAISE EXCEPTION 'p_min_age must be a positive interval';
  END IF;

  -- Targeted call: classify before touching anything so the caller can tell
  -- "not yet stuck" apart from "already resolved elsewhere".
  IF p_execution_id IS NOT NULL THEN
    SELECT e.status, p.status, e.started_at
      INTO v_estat, v_pstat, v_started
      FROM public.provider_operation_executions e
      JOIN public.provider_operation_proposals p ON p.id = e.proposal_id
      WHERE e.id = p_execution_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('reclaimed', 0, 'reason', 'not_found');
    END IF;
    IF v_estat <> 'executing' OR v_pstat <> 'executing' THEN
      RETURN jsonb_build_object('reclaimed', 0, 'reason', 'not_stuck');
    END IF;
    IF v_started >= now() - p_min_age THEN
      RETURN jsonb_build_object('reclaimed', 0, 'reason', 'too_recent');
    END IF;
  END IF;

  WITH stuck AS (
    SELECT e.id AS exec_id, e.proposal_id
    FROM public.provider_operation_executions e
    JOIN public.provider_operation_proposals p ON p.id = e.proposal_id
    WHERE e.status = 'executing'
      AND p.status = 'executing'
      AND e.started_at < now() - p_min_age
      AND (p_execution_id IS NULL OR e.id = p_execution_id)
    FOR UPDATE OF e
  ),
  upd_exec AS (
    UPDATE public.provider_operation_executions e
    SET status = 'execution_unknown',
        provider_result_category = 'execution_unknown',
        error_category = 'execution_unknown',
        safe_error_message = 'Execution exceeded the in-flight window — provider outcome unknown; verification required',
        completed_at = now(),
        updated_at = now()
    FROM stuck
    WHERE e.id = stuck.exec_id
    RETURNING e.proposal_id
  ),
  upd_prop AS (
    UPDATE public.provider_operation_proposals p
    SET status = 'verification_pending', updated_at = now()
    WHERE p.id IN (SELECT proposal_id FROM upd_exec)
    RETURNING p.id
  )
  SELECT count(*) INTO v_n FROM upd_prop;

  -- A targeted call that passed the pre-check but updated zero rows lost a
  -- race: another caller resolved the execution while this one waited on the
  -- FOR UPDATE lock. That is 'not_stuck', not 'reclaimed'.
  RETURN jsonb_build_object(
    'reclaimed', v_n,
    'reason', CASE WHEN p_execution_id IS NULL THEN NULL
                   WHEN v_n = 1 THEN 'reclaimed' ELSE 'not_stuck' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reclaim_stuck_provider_executions(INTERVAL, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stuck_provider_executions(INTERVAL, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- Hardening: complete_provider_operation_execution raced with reclaim.
-- The 022 version read the execution without a lock, checked the stale
-- snapshot, then applied UNGUARDED updates — a late "original" request could
-- overwrite execution_unknown -> failed AND flip verification_pending back to
-- 'approved', permitting re-execution before reconciliation. Observed on DEV
-- with two concurrent sessions (complete='approved' after reclaim won).
-- FOR UPDATE serializes the check against reclaim's row lock; whichever
-- caller waits re-reads the updated row and no-ops honestly.
-- ----------------------------------------------------------------------------
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

  -- FOR UPDATE blocks until any in-flight transition on this row commits and
  -- then returns the post-commit version — the stale-snapshot check below is
  -- therefore authoritative, not a time-of-check race.
  SELECT * INTO v_exec FROM public.provider_operation_executions
  WHERE id = p_execution_id FOR UPDATE;
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
-- Hardening: finish_provider_operation_verification raced with itself.
-- The 022 version read the execution and proposal without locks, checked the
-- 'verification_pending' guard on a stale snapshot, then applied unguarded
-- updates — two concurrent verifications could diverge: a slow 'pending'
-- finish committing after a 'verified' finish would regress the execution to
-- 'verification_pending' while the proposal stayed 'verified'.
-- FOR UPDATE (execution first, then proposal — the same order used by
-- reclaim and complete) serializes concurrent finishes; the loser re-reads
-- the post-commit proposal state and raises the guard instead of clobbering.
-- ----------------------------------------------------------------------------
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

  -- Lock execution first, then proposal — consistent with
  -- reclaim_stuck_provider_executions and complete_provider_operation_execution.
  SELECT * INTO v_exec FROM public.provider_operation_executions
  WHERE id = p_execution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider operation execution % not found', p_execution_id;
  END IF;

  SELECT * INTO v_prop FROM public.provider_operation_proposals
  WHERE id = v_exec.proposal_id FOR UPDATE;
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

COMMIT;
