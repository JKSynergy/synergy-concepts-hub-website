-- ============================================================================
-- Migration 034: Admin-only booking deletion
-- ============================================================================
-- Adds a Delete action for booking requests (/admin/bookings).
--
-- Before this migration the RLS policy `bookings_delete_staff` allowed any
-- operational staff member (admin OR staff) to delete a booking row, and no
-- app surface exposed deletion. The feature is admin-only, so:
--
--   1. The DELETE policy is tightened to is_admin() — direct PostgREST deletes
--      by staff/finance/client are rejected even if the action is bypassed.
--   2. delete_booking_admin() performs the real delete atomically in one
--      statement scope: admin check, row lock, dependency check, delete,
--      audit write. No check-then-delete race.
--
-- Dependency rule: the only table referencing bookings is
-- projects.booking_id (ON DELETE SET NULL). Deleting a booking that a project
-- references would silently erase the project's booking provenance, so the
-- RPC refuses with reason 'linked_project' — the operator must keep the
-- booking (cancel/complete) or detach the project first. No invoices,
-- payments or receipts reference bookings, so no financial records are
-- affected.
--
-- Contract (JSONB):
--   { "deleted": 1 }                          success
--   { "deleted": 0, "reason": "not_found" }   row missing or already deleted
--   { "deleted": 0, "reason": "linked_project",
--     "linked_projects": n }                  blocked by dependent project(s)
-- Non-admin callers get an insufficient_privilege exception, not a result.
--
-- Audit: the deleted row snapshot is written to audit_logs (append-only)
-- with actor/role resolved from the caller's JWT.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_booking_admin(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_linked integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator may delete booking requests'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock the row so a concurrent delete or link cannot interleave between the
  -- checks below and the DELETE. A racing deleter waits on the lock, then sees
  -- NOT FOUND and reports 'not_found' instead of erroring.
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', 0, 'reason', 'not_found');
  END IF;

  -- Never orphan operational provenance: a project converted from this booking
  -- points back at it. SET NULL would silently drop that link — block instead.
  SELECT count(*) INTO v_linked
  FROM public.projects WHERE booking_id = v_booking.id;
  IF v_linked > 0 THEN
    RETURN jsonb_build_object(
      'deleted', 0,
      'reason', 'linked_project',
      'linked_projects', v_linked
    );
  END IF;

  DELETE FROM public.bookings WHERE id = v_booking.id;

  PERFORM public.write_audit_log(
    'booking.deleted',
    'bookings',
    v_booking.id,
    to_jsonb(v_booking),
    NULL,
    jsonb_build_object(
      'title', v_booking.title,
      'type', v_booking.type,
      'status', v_booking.status,
      'client_id', v_booking.client_id,
      'scheduled_at', v_booking.scheduled_at
    )
  );

  RETURN jsonb_build_object('deleted', 1);
END;
$$;

-- User-context server action calls this with the caller's JWT; the function
-- enforces is_admin() itself. anon and PUBLIC get nothing.
REVOKE ALL ON FUNCTION public.delete_booking_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_booking_admin(uuid) TO authenticated;

-- Tighten the direct-delete path to match: admin only.
DROP POLICY IF EXISTS "bookings_delete_staff" ON public.bookings;
DROP POLICY IF EXISTS "bookings_delete_admin" ON public.bookings;
CREATE POLICY "bookings_delete_admin" ON public.bookings
  FOR DELETE USING (public.is_admin());

COMMIT;
