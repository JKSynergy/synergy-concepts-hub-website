-- ============================================================================
-- Migration 036: Governed deliverable publication
-- ============================================================================
-- Visibility transitions are operational actions for active admin/staff only.
-- The RPC locks the row, changes only is_visible_to_client, and writes the audit
-- event in the same transaction. Direct authenticated table updates are removed.

BEGIN;

DROP POLICY IF EXISTS "deliverables_update_staff" ON public.deliverables;
REVOKE UPDATE ON public.deliverables FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_deliverable_visibility(
  p_deliverable_id uuid,
  p_project_id uuid,
  p_visible boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deliverable public.deliverables%ROWTYPE;
  v_previous boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only active administrators or staff may change deliverable visibility'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_deliverable_id IS NULL OR p_project_id IS NULL OR p_visible IS NULL THEN
    RAISE EXCEPTION 'Deliverable, project and visibility are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_deliverable
  FROM public.deliverables
  WHERE id = p_deliverable_id
  FOR UPDATE;

  IF NOT FOUND OR v_deliverable.project_id <> p_project_id THEN
    RETURN jsonb_build_object(
      'changed', false,
      'reason', 'not_found',
      'deliverable_id', p_deliverable_id,
      'project_id', p_project_id
    );
  END IF;

  v_previous := v_deliverable.is_visible_to_client;
  IF v_previous = p_visible THEN
    RETURN jsonb_build_object(
      'changed', false,
      'reason', 'already_set',
      'deliverable_id', v_deliverable.id,
      'project_id', v_deliverable.project_id,
      'previous_visibility', v_previous,
      'visibility', p_visible
    );
  END IF;

  UPDATE public.deliverables
  SET is_visible_to_client = p_visible
  WHERE id = v_deliverable.id;

  PERFORM public.write_audit_log(
    CASE WHEN p_visible THEN 'deliverable.published' ELSE 'deliverable.unpublished' END,
    'deliverables',
    v_deliverable.id,
    jsonb_build_object('is_visible_to_client', v_previous),
    jsonb_build_object('is_visible_to_client', p_visible),
    jsonb_build_object(
      'project_id', v_deliverable.project_id,
      'deliverable_id', v_deliverable.id,
      'name', v_deliverable.name,
      'previous_visibility', v_previous,
      'visibility', p_visible
    )
  );

  RETURN jsonb_build_object(
    'changed', true,
    'deliverable_id', v_deliverable.id,
    'project_id', v_deliverable.project_id,
    'previous_visibility', v_previous,
    'visibility', p_visible
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_deliverable_visibility(uuid, uuid, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_deliverable_visibility(uuid, uuid, boolean)
  TO authenticated;

COMMIT;
