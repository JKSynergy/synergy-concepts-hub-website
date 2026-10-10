-- ============================================================================
-- Migration 031: Phase 4 — Atomic action-item review transitions
-- ============================================================================
-- Closes the time-of-check/time-of-use gap in review_action_item.
--
-- Previously the function read the item's status, then issued an unconditional
-- UPDATE. A retried or concurrent 'acknowledge' on an already-acknowledged item
-- silently rewrote acknowledged_by / acknowledged_at, overwriting the original
-- reviewer's attribution without firing the audit trigger (it only logs real
-- status changes).
--
-- The update is now a single atomic statement guarded by the permitted source
-- statuses for each decision:
--   acknowledge  <- open
--   resolve      <- open, acknowledged
--   dismiss      <- open, acknowledged
--
-- A stale, repeated, or concurrent review matches zero rows and returns the
-- item's current status — an idempotent no-op with no write and no duplicate
-- audit event. Signature, grants, role checks, and audit behavior unchanged.
-- ============================================================================

BEGIN;

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
  v_status TEXT;
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

  -- Atomic guarded update: the WHERE clause pins the permitted source
  -- statuses inside the same statement that writes. A concurrent reviewer who
  -- lands first changes the row's status under the lock; this update then
  -- matches zero rows instead of overwriting the newer state or the original
  -- acknowledged_by/at attribution.
  UPDATE public.action_items
  SET status = v_next,
      acknowledged_by = CASE WHEN v_next = 'acknowledged' THEN p_actor ELSE acknowledged_by END,
      acknowledged_at = CASE WHEN v_next = 'acknowledged' THEN now() ELSE acknowledged_at END,
      resolved_by = CASE WHEN v_next IN ('resolved', 'dismissed') THEN p_actor ELSE resolved_by END,
      resolved_at = CASE WHEN v_next IN ('resolved', 'dismissed') THEN now() ELSE resolved_at END,
      updated_at = now()
  WHERE id = p_item_id
    AND status = ANY(CASE p_decision
      WHEN 'acknowledge' THEN ARRAY['open']
      ELSE ARRAY['open', 'acknowledged']
    END)
  RETURNING status INTO v_status;

  -- Idempotent no-op: already terminal, or already acknowledged for a
  -- repeated acknowledge. Return the real current status.
  IF v_status IS NULL THEN
    RETURN v_item.status;
  END IF;

  RETURN v_next;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_action_item(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_action_item(UUID, TEXT, UUID) TO service_role;

COMMIT;
