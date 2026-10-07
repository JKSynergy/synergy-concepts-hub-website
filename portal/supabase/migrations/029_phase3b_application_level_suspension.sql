-- ============================================================================
-- Migration 029: Phase 3B — Application-Level Service Suspension & Restoration
-- ============================================================================
-- Adds commercial/service access suspension metadata to public.systems and
-- audits status transitions. Infrastructure (Railway/Vercel) is NOT mutated;
-- suspension is enforced in the application layer.
--
-- Design guarantees:
--   * Suspension is independent of infrastructure health.
--   * Only administrators may suspend or resume application access.
--   * Audit events SERVICE_SUSPENDED / SERVICE_RESUMED are written automatically.
--   * No provider mutation is introduced.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Add suspension metadata to systems
-- ----------------------------------------------------------------------------
ALTER TABLE public.systems
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT CHECK (suspension_reason IS NULL OR public.check_no_secrets_in_text(suspension_reason)),
  ADD COLUMN IF NOT EXISTS suspension_note TEXT CHECK (suspension_note IS NULL OR public.check_no_secrets_in_text(suspension_note)),
  ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resumed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 2. Audit trigger for service status transitions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_system_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := COALESCE(NEW.suspended_by, NEW.resumed_by, auth.uid());

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'suspended' AND OLD.status <> 'suspended' THEN
      PERFORM public.write_audit_log(
        'SERVICE_SUSPENDED',
        'systems',
        NEW.id,
        to_jsonb(OLD),
        to_jsonb(NEW),
        jsonb_build_object(
          'client_id', NEW.client_id,
          'reason', NEW.suspension_reason,
          'actor', v_actor
        )
      );
    ELSIF OLD.status = 'suspended' AND NEW.status <> 'suspended' THEN
      PERFORM public.write_audit_log(
        'SERVICE_RESUMED',
        'systems',
        NEW.id,
        to_jsonb(OLD),
        to_jsonb(NEW),
        jsonb_build_object(
          'client_id', NEW.client_id,
          'actor', v_actor
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_system_status_transition ON public.systems;
CREATE TRIGGER trg_audit_system_status_transition
  AFTER UPDATE OF status ON public.systems
  FOR EACH ROW EXECUTE FUNCTION public.audit_system_status_transition();

-- ----------------------------------------------------------------------------
-- 3. Convenience function: suspend application access (admin only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suspend_application_system(
  p_system_id UUID,
  p_reason TEXT,
  p_note TEXT DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may suspend application access';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Suspension reason is required';
  END IF;

  UPDATE public.systems
  SET status = 'suspended',
      suspended_at = now(),
      suspended_by = p_actor,
      suspension_reason = p_reason,
      suspension_note = p_note,
      resumed_at = NULL,
      resumed_by = NULL,
      updated_at = now()
  WHERE id = p_system_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'System % not found', p_system_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.suspend_application_system(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_application_system(UUID, TEXT, TEXT, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Convenience function: resume application access (admin only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resume_application_system(
  p_system_id UUID,
  p_note TEXT DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may resume application access';
  END IF;

  UPDATE public.systems
  SET status = 'live',
      resumed_at = now(),
      resumed_by = p_actor,
      suspension_note = COALESCE(p_note, suspension_note),
      updated_at = now()
  WHERE id = p_system_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'System % not found', p_system_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resume_application_system(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_application_system(UUID, TEXT, UUID) TO service_role;

COMMIT;
