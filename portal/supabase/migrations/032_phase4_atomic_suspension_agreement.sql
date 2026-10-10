-- ============================================================================
-- Migration 032: Phase 4 — Atomic suspension case + agreement transitions
-- ============================================================================
-- executeSuspensionCase / completeCaseRestoration previously issued two
-- separate writes through the user-scoped client:
--   1. suspension_cases.status  -> 'suspended' | 'restored'   (guarded)
--   2. service_agreements.status -> 'suspended' | 'active'    (unguarded, result ignored)
--
-- That was non-atomic and silently broken for staff: suspension_cases UPDATE
-- RLS allows staff, but service_agreements_update pins status unchanged for
-- staff — so a staff executor produced case='suspended', agreement='active',
-- while the UI reported success.
--
-- transition_suspension_case performs both writes in one function call — a
-- single implicit transaction. Either both land or neither does.
--
-- Grant model: EXECUTE to authenticated only, called through the caller's own
-- session so auth.uid() is the real user. The lifecycle trigger
-- (trg_suspension_case_lifecycle) and audit triggers still fire with true
-- caller attribution; definer rights bypass RLS only inside this function,
-- which is what legitimately lets an assigned staff executor flip the
-- agreement status. Role checks are repeated inside the function because
-- definer rights bypass RLS on both tables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.transition_suspension_case(
  p_case_id UUID,
  p_action TEXT,
  p_actor UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case     public.suspension_cases%ROWTYPE;
  v_actor    UUID := auth.uid();
  v_is_admin BOOLEAN := public.is_admin();
  v_is_staff BOOLEAN := public.is_staff();
  v_target   TEXT;
  v_from     TEXT[];
  v_agree    TEXT;
  v_status   TEXT;
BEGIN
  -- Identity and role checks — p_actor is only a consistency assertion, never
  -- the source of authority.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Actor mismatch: p_actor must be the authenticated caller';
  END IF;
  IF NOT (v_is_admin OR v_is_staff) THEN
    RAISE EXCEPTION 'Permission denied: only administrators or operational staff may transition suspension cases';
  END IF;
  IF p_action NOT IN ('execute', 'complete_restoration') THEN
    RAISE EXCEPTION 'Unsupported suspension transition: %', p_action;
  END IF;

  SELECT * INTO v_case FROM public.suspension_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suspension case % not found', p_case_id;
  END IF;

  -- Staff may only execute/restore cases assigned to them (mirrors the
  -- lifecycle trigger's non-admin assignment rule).
  IF NOT v_is_admin AND v_case.assigned_to IS NOT NULL AND v_case.assigned_to <> v_actor THEN
    RAISE EXCEPTION 'Only assigned staff can execute this suspension case';
  END IF;

  v_target := CASE p_action WHEN 'execute' THEN 'suspended' ELSE 'restored' END;
  v_from   := CASE p_action
                WHEN 'execute'               THEN ARRAY['approved', 'executing']
                ELSE ARRAY['suspended', 'restoration_pending']
              END;
  v_agree  := CASE p_action WHEN 'execute' THEN 'suspended' ELSE 'active' END;

  -- Idempotent no-op: a retried submission on an already-transitioned case
  -- returns the current status without a write or a second audit event.
  IF v_case.status = v_target THEN
    RETURN v_case.status;
  END IF;

  IF NOT (v_case.status = ANY(v_from)) THEN
    RAISE EXCEPTION 'This transition is not available for the case''s current state';
  END IF;

  -- Write 1 of 2 (atomic with write 2): guarded on the permitted source
  -- statuses. trg_suspension_case_lifecycle re-validates role/assignment/
  -- transition under auth.uid() inside this same transaction.
  UPDATE public.suspension_cases
  SET status            = v_target,
      executed_at       = CASE WHEN p_action = 'execute' THEN now() ELSE executed_at END,
      restored_at       = CASE WHEN p_action = 'complete_restoration' THEN now() ELSE restored_at END,
      operational_notes = CASE WHEN NULLIF(btrim(p_notes), '') IS NOT NULL
                               THEN btrim(p_notes) ELSE operational_notes END
  WHERE id = p_case_id
    AND status = ANY(v_from)
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'This transition is not available for the case''s current state';
  END IF;

  -- Write 2 of 2: the linked agreement follows the case in the same
  -- transaction. service_agreement_id is NOT NULL + FK RESTRICT, so a miss
  -- here means corrupted data — raise and roll back write 1.
  UPDATE public.service_agreements
  SET status = v_agree
  WHERE id = v_case.service_agreement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked service agreement % not found', v_case.service_agreement_id;
  END IF;

  -- service_agreements has no status audit trigger — record the commercial
  -- transition explicitly. write_audit_log attributes via auth.uid().
  PERFORM public.write_audit_log(
    'service_agreement.status_changed',
    'service_agreements',
    v_case.service_agreement_id,
    NULL,
    jsonb_build_object('status', v_agree),
    jsonb_build_object('suspension_case_id', p_case_id, 'transition', p_action)
  );

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_suspension_case(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_suspension_case(UUID, TEXT, UUID, TEXT) TO authenticated;

COMMIT;
