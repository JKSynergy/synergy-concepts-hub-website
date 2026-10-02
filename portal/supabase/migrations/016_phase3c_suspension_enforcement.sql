-- ============================================================================
-- Migration 016: Phase 3C Suspension & Service Enforcement
-- SCH Portal / Synergy Concepts Hub
--
-- Introduces:
--   1. suspension_cases
--   2. suspension_actions
--   3. Same-client & agreement scope integrity triggers
--   4. Controlled lifecycle & approval safety triggers
--   5. Integrated audit logging via existing audit_logs
--   6. Explicit RLS policies (Admin, Finance, Staff separated; Client denied)
--   7. Strict privilege hardening (no TRUNCATE, anon has 0 privileges)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: suspension_cases
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suspension_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_agreement_id UUID NOT NULL REFERENCES public.service_agreements(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 3 AND public.check_no_secrets_in_text(reason)),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed',
    'pending_approval',
    'approved',
    'rejected',
    'executing',
    'suspended',
    'restoration_pending',
    'restored',
    'cancelled'
  )),
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by UUID NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_to UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ NULL,
  executed_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  restored_at TIMESTAMPTZ NULL,
  notes TEXT NULL CHECK (public.check_no_secrets_in_text(notes)),
  operational_notes TEXT NULL CHECK (public.check_no_secrets_in_text(operational_notes)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Table: suspension_actions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suspension_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suspension_case_id UUID NOT NULL REFERENCES public.suspension_cases(id) ON DELETE RESTRICT,
  resource_id UUID NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'suspension',
    'restoration',
    'verification',
    'suspend',
    'restore',
    'verify'
  )),
  action_status TEXT NOT NULL DEFAULT 'pending' CHECK (action_status IN (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'cancelled',
    'verified'
  )),
  performed_by UUID NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  performed_at TIMESTAMPTZ NULL,
  assigned_to UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_by UUID NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ NULL,
  evidence TEXT NULL CHECK (public.check_no_secrets_in_text(evidence)),
  evidence_reference TEXT NULL CHECK (public.check_no_secrets_in_text(evidence_reference)),
  notes TEXT NULL CHECK (public.check_no_secrets_in_text(notes)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Performance Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_suspension_cases_agreement_id ON public.suspension_cases(service_agreement_id);
CREATE INDEX IF NOT EXISTS idx_suspension_cases_client_id ON public.suspension_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_suspension_cases_system_id ON public.suspension_cases(system_id);
CREATE INDEX IF NOT EXISTS idx_suspension_cases_status ON public.suspension_cases(status);
CREATE INDEX IF NOT EXISTS idx_suspension_cases_assigned_to ON public.suspension_cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_suspension_cases_requested_by ON public.suspension_cases(requested_by);

CREATE INDEX IF NOT EXISTS idx_suspension_actions_case_id ON public.suspension_actions(suspension_case_id);
CREATE INDEX IF NOT EXISTS idx_suspension_actions_resource_id ON public.suspension_actions(resource_id);
CREATE INDEX IF NOT EXISTS idx_suspension_actions_status ON public.suspension_actions(action_status);
CREATE INDEX IF NOT EXISTS idx_suspension_actions_assigned_to ON public.suspension_actions(assigned_to);

-- ----------------------------------------------------------------------------
-- 4. Timestamp Triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_suspension_cases_updated_at ON public.suspension_cases;
CREATE TRIGGER set_suspension_cases_updated_at
  BEFORE UPDATE ON public.suspension_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_suspension_actions_updated_at ON public.suspension_actions;
CREATE TRIGGER set_suspension_actions_updated_at
  BEFORE UPDATE ON public.suspension_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Same-Client & Scope Integrity Triggers
-- ----------------------------------------------------------------------------

-- A. Suspension Case Same-Client Integrity
CREATE OR REPLACE FUNCTION public.check_suspension_case_client_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement_client UUID;
  v_system_client UUID;
BEGIN
  -- Verify agreement exists and matches case client
  SELECT client_id INTO v_agreement_client 
  FROM public.service_agreements 
  WHERE id = NEW.service_agreement_id;

  IF v_agreement_client IS NULL THEN
    RAISE EXCEPTION 'Referenced service agreement does not exist' USING ERRCODE = 'P0001';
  END IF;

  IF v_agreement_client <> NEW.client_id THEN
    RAISE EXCEPTION 'Suspension case client must match service agreement client' USING ERRCODE = 'P0001';
  END IF;

  -- Verify system exists and belongs to case client (if specified)
  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_system_client 
    FROM public.systems 
    WHERE id = NEW.system_id;

    IF v_system_client IS NULL THEN
      RAISE EXCEPTION 'Referenced system does not exist' USING ERRCODE = 'P0001';
    END IF;

    IF v_system_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Suspension case system must belong to the case client' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suspension_case_client_integrity ON public.suspension_cases;
CREATE TRIGGER trg_suspension_case_client_integrity
  BEFORE INSERT OR UPDATE OF service_agreement_id, client_id, system_id ON public.suspension_cases
  FOR EACH ROW EXECUTE FUNCTION public.check_suspension_case_client_integrity();

-- B. Suspension Action Same-Client & Agreement Scope Integrity
CREATE OR REPLACE FUNCTION public.check_suspension_action_client_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_client UUID;
  v_case_agreement UUID;
  v_resource_client UUID;
  v_resource_system UUID;
  v_system_client UUID;
  v_covered_in_agreement BOOLEAN;
BEGIN
  -- Fetch suspension case client and agreement
  SELECT client_id, service_agreement_id 
  INTO v_case_client, v_case_agreement
  FROM public.suspension_cases
  WHERE id = NEW.suspension_case_id;

  IF v_case_client IS NULL THEN
    RAISE EXCEPTION 'Referenced suspension case does not exist' USING ERRCODE = 'P0001';
  END IF;

  -- If resource is specified, verify ownership and coverage by agreement
  IF NEW.resource_id IS NOT NULL THEN
    SELECT client_id, system_id 
    INTO v_resource_client, v_resource_system
    FROM public.resources
    WHERE id = NEW.resource_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced resource does not exist' USING ERRCODE = 'P0001';
    END IF;

    -- Verify resource client ownership matches case client
    IF v_resource_client IS NOT NULL AND v_resource_client <> v_case_client THEN
      RAISE EXCEPTION 'Suspension action resource client ownership must match suspension case client' USING ERRCODE = 'P0001';
    END IF;

    -- Verify resource system client matches case client (if attached to system)
    IF v_resource_system IS NOT NULL THEN
      SELECT client_id INTO v_system_client FROM public.systems WHERE id = v_resource_system;
      IF v_system_client IS NOT NULL AND v_system_client <> v_case_client THEN
        RAISE EXCEPTION 'Suspension action resource system must belong to suspension case client' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- Verify resource is covered by the agreement: agreement -> agreement_resources -> resource
    SELECT EXISTS (
      SELECT 1 FROM public.agreement_resources
      WHERE agreement_id = v_case_agreement AND resource_id = NEW.resource_id
    ) INTO v_covered_in_agreement;

    IF NOT v_covered_in_agreement THEN
      RAISE EXCEPTION 'Resource must be covered by the service agreement in agreement_resources' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suspension_action_client_integrity ON public.suspension_actions;
CREATE TRIGGER trg_suspension_action_client_integrity
  BEFORE INSERT OR UPDATE OF suspension_case_id, resource_id ON public.suspension_actions
  FOR EACH ROW EXECUTE FUNCTION public.check_suspension_action_client_integrity();

-- ----------------------------------------------------------------------------
-- 6. Suspension Lifecycle & Approval Safety Triggers
-- ----------------------------------------------------------------------------

-- A. Suspension Case Lifecycle & Approval Guard
CREATE OR REPLACE FUNCTION public.check_suspension_case_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A new suspension must start in proposed or pending_approval
    IF NEW.status NOT IN ('proposed', 'pending_approval') THEN
      RAISE EXCEPTION 'New suspension case cannot directly be created in an active or executed status' USING ERRCODE = 'P0001';
    END IF;

    -- Cannot forge approvals or executions upon creation
    IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'New suspension case cannot carry approval metadata on creation' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.executed_at IS NOT NULL OR NEW.verified_at IS NOT NULL OR NEW.restored_at IS NOT NULL THEN
      RAISE EXCEPTION 'New suspension case cannot carry execution or restoration timestamps on creation' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  -- 1. Immutable Terminal States: Rejected, Cancelled, Restored cannot transition further
  IF OLD.status = 'rejected' AND NEW.status <> 'rejected' THEN
    RAISE EXCEPTION 'Rejected suspension case cannot be executed or transitioned' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled suspension case cannot be executed or transitioned' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'restored' AND NEW.status <> 'restored' THEN
    RAISE EXCEPTION 'Restored suspension case is completed and cannot be transitioned' USING ERRCODE = 'P0001';
  END IF;

  -- 2. State Transition Rules & Governance
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF OLD.status NOT IN ('proposed', 'pending_approval') THEN
      RAISE EXCEPTION 'Only proposed or pending_approval cases can be approved' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can approve suspension cases' USING ERRCODE = 'P0001';
    END IF;

    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
  END IF;

  IF NEW.status = 'rejected' AND OLD.status <> 'rejected' THEN
    IF OLD.status NOT IN ('proposed', 'pending_approval') THEN
      RAISE EXCEPTION 'Only proposed or pending_approval cases can be rejected' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can reject suspension cases' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.status = 'executing' AND OLD.status <> 'executing' THEN
    IF OLD.status NOT IN ('approved', 'executing') THEN
      RAISE EXCEPTION 'Suspension case must be approved before execution can begin' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot execute suspension' USING ERRCODE = 'P0001';
    END IF;

    -- If operational staff (non-admin), must be assigned
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to <> auth.uid() THEN
        RAISE EXCEPTION 'Only assigned staff can execute this suspension case' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'suspended' AND OLD.status <> 'suspended' THEN
    IF OLD.status NOT IN ('approved', 'executing', 'suspended') THEN
      RAISE EXCEPTION 'Suspension case must be approved or executing before becoming suspended' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot execute suspension' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to <> auth.uid() THEN
        RAISE EXCEPTION 'Only assigned staff can execute this suspension case' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    NEW.executed_at := COALESCE(NEW.executed_at, now());
  END IF;

  IF NEW.status = 'restoration_pending' AND OLD.status <> 'restoration_pending' THEN
    IF OLD.status NOT IN ('suspended', 'restoration_pending') THEN
      RAISE EXCEPTION 'Only suspended cases can transition to restoration_pending' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot manage restoration' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.status = 'restored' AND OLD.status <> 'restored' THEN
    IF OLD.status NOT IN ('suspended', 'restoration_pending', 'restored') THEN
      RAISE EXCEPTION 'Case must be suspended or in restoration before being marked restored' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot manage restoration' USING ERRCODE = 'P0001';
    END IF;

    NEW.restored_at := COALESCE(NEW.restored_at, now());
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF OLD.status IN ('restored', 'rejected') THEN
      RAISE EXCEPTION 'Completed or rejected cases cannot be cancelled' USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot cancel suspension cases' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verification control: only admin can record verification
  IF NEW.verified_at IS NOT NULL AND OLD.verified_at IS NULL THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can verify suspension execution' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suspension_case_lifecycle ON public.suspension_cases;
CREATE TRIGGER trg_suspension_case_lifecycle
  BEFORE INSERT OR UPDATE ON public.suspension_cases
  FOR EACH ROW EXECUTE FUNCTION public.check_suspension_case_lifecycle();

-- B. Suspension Action Execution & Verification Guard
CREATE OR REPLACE FUNCTION public.check_suspension_action_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_status TEXT;
  v_case_assigned_to UUID;
BEGIN
  -- Fetch parent case details
  SELECT status, assigned_to 
  INTO v_case_status, v_case_assigned_to
  FROM public.suspension_cases 
  WHERE id = NEW.suspension_case_id;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot create suspension actions' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  -- If action is being executed / completed
  IF NEW.action_status IN ('completed', 'in_progress') OR NEW.performed_at IS NOT NULL THEN
    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot execute suspension actions' USING ERRCODE = 'P0001';
    END IF;

    IF v_case_status NOT IN ('approved', 'executing', 'suspended', 'restoration_pending') THEN
      RAISE EXCEPTION 'Cannot execute actions on an unapproved or inactive suspension case' USING ERRCODE = 'P0001';
    END IF;

    -- Enforce assignment restrictions for operational staff
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> auth.uid() THEN
        RAISE EXCEPTION 'Unassigned staff cannot execute this restricted action' USING ERRCODE = 'P0001';
      END IF;

      IF NEW.assigned_to IS NULL AND v_case_assigned_to IS NOT NULL AND v_case_assigned_to <> auth.uid() THEN
        RAISE EXCEPTION 'Unassigned staff cannot execute this restricted action' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF NEW.action_status = 'completed' THEN
      NEW.performed_at := COALESCE(NEW.performed_at, now());
      NEW.performed_by := COALESCE(NEW.performed_by, auth.uid());
    END IF;
  END IF;

  -- Action Verification: only Admin
  IF (NEW.action_status = 'verified' AND OLD.action_status <> 'verified') OR 
     (NEW.verified_at IS NOT NULL AND OLD.verified_at IS NULL) OR
     (NEW.verified_by IS NOT NULL AND OLD.verified_by IS NULL) THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can verify suspension actions' USING ERRCODE = 'P0001';
    END IF;
    NEW.verified_at := COALESCE(NEW.verified_at, now());
    NEW.verified_by := COALESCE(NEW.verified_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suspension_action_lifecycle ON public.suspension_actions;
CREATE TRIGGER trg_suspension_action_lifecycle
  BEFORE INSERT OR UPDATE ON public.suspension_actions
  FOR EACH ROW EXECUTE FUNCTION public.check_suspension_action_lifecycle();

-- ----------------------------------------------------------------------------
-- 7. Audit Logging Triggers
-- ----------------------------------------------------------------------------

-- A. Audit Logger for suspension_cases
CREATE OR REPLACE FUNCTION public.log_suspension_case_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'suspension_case.created',
      'suspension_cases',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'reason', NEW.reason,
        'client_id', NEW.client_id,
        'agreement_id', NEW.service_agreement_id,
        'status', NEW.status
      )
    );
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.status <> NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.write_audit_log('suspension_case.approved', 'suspension_cases', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('approved_by', NEW.approved_by));
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.write_audit_log('suspension_case.rejected', 'suspension_cases', NEW.id, to_jsonb(OLD), to_jsonb(NEW), NULL);
    ELSIF NEW.status = 'executing' THEN
      PERFORM public.write_audit_log('suspension_case.execution_started', 'suspension_cases', NEW.id, to_jsonb(OLD), to_jsonb(NEW), NULL);
    ELSIF NEW.status = 'suspended' THEN
      PERFORM public.write_audit_log('suspension_case.executed', 'suspension_cases', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('executed_at', NEW.executed_at));
    ELSIF NEW.status = 'restoration_pending' THEN
      PERFORM public.write_audit_log('suspension_case.restoration_started', 'suspension_cases', NEW.id, to_jsonb(OLD), to_jsonb(NEW), NULL);
    ELSIF NEW.status = 'restored' THEN
      PERFORM public.write_audit_log('suspension_case.restored', 'suspension_cases', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('restored_at', NEW.restored_at));
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.write_audit_log('suspension_case.cancelled', 'suspension_cases', NEW.id, to_jsonb(OLD), to_jsonb(NEW), NULL);
    END IF;
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    PERFORM public.write_audit_log(
      'suspension_case.assignment_changed',
      'suspension_cases',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_assigned_to', OLD.assigned_to, 'new_assigned_to', NEW.assigned_to)
    );
  END IF;

  IF OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL THEN
    PERFORM public.write_audit_log(
      'suspension_case.verified',
      'suspension_cases',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('verified_at', NEW.verified_at)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_suspension_case_audit ON public.suspension_cases;
CREATE TRIGGER trg_log_suspension_case_audit
  AFTER INSERT OR UPDATE ON public.suspension_cases
  FOR EACH ROW EXECUTE FUNCTION public.log_suspension_case_audit();

-- B. Audit Logger for suspension_actions
CREATE OR REPLACE FUNCTION public.log_suspension_action_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'suspension_action.created',
      'suspension_actions',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('case_id', NEW.suspension_case_id, 'action_type', NEW.action_type)
    );
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF (OLD.evidence_reference IS DISTINCT FROM NEW.evidence_reference) OR (OLD.evidence IS DISTINCT FROM NEW.evidence) THEN
    PERFORM public.write_audit_log(
      'suspension_action.evidence_recorded',
      'suspension_actions',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('evidence_reference', NEW.evidence_reference, 'evidence', NEW.evidence)
    );
  END IF;

  IF OLD.action_status <> NEW.action_status THEN
    PERFORM public.write_audit_log(
      'suspension_action.status_changed',
      'suspension_actions',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_status', OLD.action_status, 'new_status', NEW.action_status)
    );
  END IF;

  IF OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL THEN
    PERFORM public.write_audit_log(
      'suspension_action.verified',
      'suspension_actions',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('verified_by', NEW.verified_by, 'verified_at', NEW.verified_at)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_suspension_action_audit ON public.suspension_actions;
CREATE TRIGGER trg_log_suspension_action_audit
  AFTER INSERT OR UPDATE ON public.suspension_actions
  FOR EACH ROW EXECUTE FUNCTION public.log_suspension_action_audit();

-- ----------------------------------------------------------------------------
-- 8. Row-Level Security (RLS) & Delete Safety Triggers
-- ----------------------------------------------------------------------------
ALTER TABLE public.suspension_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspension_actions ENABLE ROW LEVEL SECURITY;

-- Delete Prevention Triggers (Spec 13: Operational History Must Never Be Deleted)
CREATE OR REPLACE FUNCTION public.suspension_records_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Destructive deletion of suspension records is strictly forbidden' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_no_delete_suspension_cases ON public.suspension_cases;
CREATE TRIGGER trg_no_delete_suspension_cases
  BEFORE DELETE ON public.suspension_cases
  FOR EACH ROW EXECUTE FUNCTION public.suspension_records_no_delete();

DROP TRIGGER IF EXISTS trg_no_delete_suspension_actions ON public.suspension_actions;
CREATE TRIGGER trg_no_delete_suspension_actions
  BEFORE DELETE ON public.suspension_actions
  FOR EACH ROW EXECUTE FUNCTION public.suspension_records_no_delete();

-- suspension_cases RLS:
DROP POLICY IF EXISTS "suspension_cases_select" ON public.suspension_cases;
CREATE POLICY "suspension_cases_select" ON public.suspension_cases
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance() OR (public.is_staff() AND NOT public.is_finance()));

DROP POLICY IF EXISTS "suspension_cases_insert" ON public.suspension_cases;
CREATE POLICY "suspension_cases_insert" ON public.suspension_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR 
    (
      public.is_staff() AND NOT public.is_finance() AND NOT public.is_admin()
      AND status IN ('proposed', 'pending_approval')
      AND approved_by IS NULL
      AND approved_at IS NULL
    )
  );

DROP POLICY IF EXISTS "suspension_cases_update" ON public.suspension_cases;
CREATE POLICY "suspension_cases_update" ON public.suspension_cases
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR public.is_finance() OR (public.is_staff() AND NOT public.is_finance())
  )
  WITH CHECK (
    public.is_admin() OR 
    (public.is_staff() AND NOT public.is_finance() AND NOT public.is_admin())
  );

DROP POLICY IF EXISTS "suspension_cases_delete" ON public.suspension_cases;
CREATE POLICY "suspension_cases_delete" ON public.suspension_cases
  FOR DELETE TO authenticated
  USING (false);

-- suspension_actions RLS:
DROP POLICY IF EXISTS "suspension_actions_select" ON public.suspension_actions;
CREATE POLICY "suspension_actions_select" ON public.suspension_actions
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance() OR (public.is_staff() AND NOT public.is_finance()));

DROP POLICY IF EXISTS "suspension_actions_insert" ON public.suspension_actions;
CREATE POLICY "suspension_actions_insert" ON public.suspension_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR 
    (public.is_staff() AND NOT public.is_finance() AND NOT public.is_admin())
  );

DROP POLICY IF EXISTS "suspension_actions_update" ON public.suspension_actions;
CREATE POLICY "suspension_actions_update" ON public.suspension_actions
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR public.is_finance() OR (public.is_staff() AND NOT public.is_finance())
  )
  WITH CHECK (
    public.is_admin() OR 
    (public.is_staff() AND NOT public.is_finance() AND NOT public.is_admin())
  );

DROP POLICY IF EXISTS "suspension_actions_delete" ON public.suspension_actions;
CREATE POLICY "suspension_actions_delete" ON public.suspension_actions
  FOR DELETE TO authenticated
  USING (false);

-- ----------------------------------------------------------------------------
-- 9. Explicit Privilege Grants & Privilege Hardening
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.suspension_cases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.suspension_actions FROM PUBLIC, anon, authenticated;

-- authenticated: explicit DML only (no DELETE, no TRUNCATE)
GRANT SELECT, INSERT, UPDATE ON TABLE public.suspension_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.suspension_actions TO authenticated;

-- service_role: full DML (no TRUNCATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suspension_cases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suspension_actions TO service_role;

-- Explicitly revoke TRUNCATE on all new tables for all roles
REVOKE TRUNCATE ON TABLE public.suspension_cases FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.suspension_actions FROM anon, authenticated, service_role;

COMMIT;
