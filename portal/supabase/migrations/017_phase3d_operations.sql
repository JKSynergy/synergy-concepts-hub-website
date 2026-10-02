-- ============================================================================
-- Migration 017: Phase 3D Operations (Tasks & Incidents)
-- SCH Portal / Synergy Concepts Hub
--
-- Introduces:
--   1. incidents table
--   2. tasks table
--   3. Same-client integrity triggers (system, resource, agreement, incident, suspension)
--   4. Assignee role validation triggers (Admin or Staff only)
--   5. Controlled lifecycle triggers & timestamps
--   6. Destructive deletion blockers (audit history preservation)
--   7. Integrated audit logging via existing audit_logs
--   8. Explicit RLS policies (Admin, Finance, Staff separated; Client denied)
--   9. Strict privilege hardening (no TRUNCATE, anon has 0 privileges)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: incidents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  resource_id UUID NULL REFERENCES public.resources(id) ON DELETE SET NULL,
  service_agreement_id UUID NULL REFERENCES public.service_agreements(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3 AND public.check_no_secrets_in_text(title)),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 3 AND public.check_no_secrets_in_text(description)),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'acknowledged',
    'investigating',
    'monitoring',
    'resolved',
    'closed',
    'cancelled'
  )),
  reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_to UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  resolution_notes TEXT NULL CHECK (public.check_no_secrets_in_text(resolution_notes)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Table: tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  resource_id UUID NULL REFERENCES public.resources(id) ON DELETE SET NULL,
  service_agreement_id UUID NULL REFERENCES public.service_agreements(id) ON DELETE SET NULL,
  incident_id UUID NULL REFERENCES public.incidents(id) ON DELETE SET NULL,
  suspension_case_id UUID NULL REFERENCES public.suspension_cases(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3 AND public.check_no_secrets_in_text(title)),
  description TEXT NULL CHECK (public.check_no_secrets_in_text(description)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'assigned',
    'in_progress',
    'blocked',
    'completed',
    'cancelled'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  due_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes for Query Performance & Lookups
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_incidents_client_id ON public.incidents(client_id);
CREATE INDEX IF NOT EXISTS idx_incidents_system_id ON public.incidents(system_id);
CREATE INDEX IF NOT EXISTS idx_incidents_resource_id ON public.incidents(resource_id);
CREATE INDEX IF NOT EXISTS idx_incidents_agreement_id ON public.incidents(service_agreement_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to ON public.incidents(assigned_to);

CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_system_id ON public.tasks(system_id);
CREATE INDEX IF NOT EXISTS idx_tasks_resource_id ON public.tasks(resource_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agreement_id ON public.tasks(service_agreement_id);
CREATE INDEX IF NOT EXISTS idx_tasks_incident_id ON public.tasks(incident_id);
CREATE INDEX IF NOT EXISTS idx_tasks_suspension_case_id ON public.tasks(suspension_case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);

-- ----------------------------------------------------------------------------
-- 4. Same-Client Integrity & Assignee Triggers
-- ----------------------------------------------------------------------------

-- A. Incidents Same-Client Integrity
CREATE OR REPLACE FUNCTION public.check_incident_client_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sys_client UUID;
  v_res_client UUID;
  v_agr_client UUID;
  v_assignee_role TEXT;
BEGIN
  -- Verify system belongs to incident client
  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_sys_client FROM public.systems WHERE id = NEW.system_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced system does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_sys_client IS NOT NULL AND v_sys_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Incident client_id does not match referenced system client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify resource belongs to incident client
  IF NEW.resource_id IS NOT NULL THEN
    SELECT client_id INTO v_res_client FROM public.resources WHERE id = NEW.resource_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced resource does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_res_client IS NOT NULL AND v_res_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Incident client_id does not match referenced resource client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify service agreement belongs to incident client
  IF NEW.service_agreement_id IS NOT NULL THEN
    SELECT client_id INTO v_agr_client FROM public.service_agreements WHERE id = NEW.service_agreement_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced service agreement does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_agr_client IS NOT NULL AND v_agr_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Incident client_id does not match referenced service agreement client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify assignee is Admin or Staff
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT role INTO v_assignee_role FROM public.profiles WHERE id = NEW.assigned_to;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assigned user does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_assignee_role NOT IN ('admin', 'staff') THEN
      RAISE EXCEPTION 'Operational incidents can only be assigned to Admin or Staff members' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_client_integrity ON public.incidents;
CREATE TRIGGER trg_incident_client_integrity
  BEFORE INSERT OR UPDATE OF client_id, system_id, resource_id, service_agreement_id, assigned_to ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.check_incident_client_integrity();

-- B. Tasks Same-Client Integrity
CREATE OR REPLACE FUNCTION public.check_task_client_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sys_client UUID;
  v_res_client UUID;
  v_agr_client UUID;
  v_inc_client UUID;
  v_sus_client UUID;
  v_assignee_role TEXT;
BEGIN
  -- Verify system belongs to task client
  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_sys_client FROM public.systems WHERE id = NEW.system_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced system does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_sys_client IS NOT NULL AND v_sys_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Task client_id does not match referenced system client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify resource belongs to task client
  IF NEW.resource_id IS NOT NULL THEN
    SELECT client_id INTO v_res_client FROM public.resources WHERE id = NEW.resource_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced resource does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_res_client IS NOT NULL AND v_res_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Task client_id does not match referenced resource client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify service agreement belongs to task client
  IF NEW.service_agreement_id IS NOT NULL THEN
    SELECT client_id INTO v_agr_client FROM public.service_agreements WHERE id = NEW.service_agreement_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced service agreement does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_agr_client IS NOT NULL AND v_agr_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Task client_id does not match referenced service agreement client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify incident belongs to task client
  IF NEW.incident_id IS NOT NULL THEN
    SELECT client_id INTO v_inc_client FROM public.incidents WHERE id = NEW.incident_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced incident does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_inc_client IS NOT NULL AND v_inc_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Task client_id does not match referenced incident client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify suspension case belongs to task client
  IF NEW.suspension_case_id IS NOT NULL THEN
    SELECT client_id INTO v_sus_client FROM public.suspension_cases WHERE id = NEW.suspension_case_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced suspension case does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_sus_client IS NOT NULL AND v_sus_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Task client_id does not match referenced suspension case client_id' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Verify assignee is Admin or Staff
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT role INTO v_assignee_role FROM public.profiles WHERE id = NEW.assigned_to;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assigned user does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_assignee_role NOT IN ('admin', 'staff') THEN
      RAISE EXCEPTION 'Operational tasks can only be assigned to Admin or Staff members' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_client_integrity ON public.tasks;
CREATE TRIGGER trg_task_client_integrity
  BEFORE INSERT OR UPDATE OF client_id, system_id, resource_id, service_agreement_id, incident_id, suspension_case_id, assigned_to ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.check_task_client_integrity();

-- ----------------------------------------------------------------------------
-- 5. Operational Lifecycle Guards & Timestamps
-- ----------------------------------------------------------------------------

-- A. Incident Lifecycle Guard
CREATE OR REPLACE FUNCTION public.check_incident_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot create operational incidents' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.assigned_to IS NOT NULL AND NEW.status = 'open' THEN
      NEW.status := 'acknowledged';
    END IF;

    IF NEW.status = 'acknowledged' AND NEW.acknowledged_at IS NULL THEN
      NEW.acknowledged_at := now();
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF auth.uid() IS NOT NULL AND public.is_finance() THEN
    RAISE EXCEPTION 'Finance users cannot modify operational incidents' USING ERRCODE = 'P0001';
  END IF;

  -- Closed incidents: only Admin can modify/reopen
  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Closed incidents can only be reopened or modified by an administrator' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Cancelled incidents: terminal state
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Cancelled incidents cannot be transitioned or modified' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- State transitions & timestamps
  IF NEW.status = 'acknowledged' AND OLD.status <> 'acknowledged' AND NEW.acknowledged_at IS NULL THEN
    NEW.acknowledged_at := now();
  END IF;

  IF NEW.status = 'resolved' AND OLD.status <> 'resolved' AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;

  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can close operational incidents' USING ERRCODE = 'P0001';
    END IF;
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can cancel operational incidents' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Reassignment: Admin only
  IF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NOT NULL AND OLD.assigned_to <> NEW.assigned_to THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can reassign operational incidents' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_lifecycle ON public.incidents;
CREATE TRIGGER trg_incident_lifecycle
  BEFORE INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.check_incident_lifecycle();

-- B. Task Lifecycle Guard
CREATE OR REPLACE FUNCTION public.check_task_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND public.is_finance() THEN
      RAISE EXCEPTION 'Finance users cannot create operational tasks' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'New tasks cannot directly be created as completed or cancelled' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.assigned_to IS NOT NULL AND NEW.status = 'open' THEN
      NEW.status := 'assigned';
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF auth.uid() IS NOT NULL AND public.is_finance() THEN
    RAISE EXCEPTION 'Finance users cannot execute or modify operational tasks' USING ERRCODE = 'P0001';
  END IF;

  -- Completed tasks: terminal state unless Admin
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Completed tasks cannot be modified or transitioned unless reopened by an administrator' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Cancelled tasks: terminal state unless Admin
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Cancelled tasks cannot be transitioned or modified' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- State transitions & timestamps
  IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can cancel operational tasks' USING ERRCODE = 'P0001';
    END IF;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  END IF;

  -- Reassignment: Admin only
  IF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NOT NULL AND OLD.assigned_to <> NEW.assigned_to THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can reassign operational tasks' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Staff can only update their own assigned tasks or unassigned tasks
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to <> auth.uid() THEN
      RAISE EXCEPTION 'Unassigned staff cannot update tasks assigned to another staff member' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_lifecycle ON public.tasks;
CREATE TRIGGER trg_task_lifecycle
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.check_task_lifecycle();

-- ----------------------------------------------------------------------------
-- 6. Delete Safety Blockers (Preserve Operational History)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Destructive deletion of task records is strictly forbidden. Use status cancellation or completion.' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_no_delete ON public.tasks;
CREATE TRIGGER trg_tasks_no_delete
  BEFORE DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_prevent_destructive_delete();

CREATE OR REPLACE FUNCTION public.incidents_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Destructive deletion of incident records is strictly forbidden. Use status cancellation or closure.' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_incidents_no_delete ON public.incidents;
CREATE TRIGGER trg_incidents_no_delete
  BEFORE DELETE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.incidents_prevent_destructive_delete();

-- ----------------------------------------------------------------------------
-- 7. Audit Logging Triggers
-- ----------------------------------------------------------------------------

-- A. Audit Logger for incidents
CREATE OR REPLACE FUNCTION public.log_incident_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'incident.created',
      'incidents',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'title', NEW.title,
        'client_id', NEW.client_id,
        'severity', NEW.severity,
        'status', NEW.status,
        'reported_by', NEW.reported_by,
        'assigned_to', NEW.assigned_to
      )
    );
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM public.write_audit_log(
        'incident.assigned',
        'incidents',
        NEW.id,
        NULL,
        to_jsonb(NEW),
        jsonb_build_object('assigned_to', NEW.assigned_to)
      );
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL THEN
    PERFORM public.write_audit_log(
      'incident.assigned',
      'incidents',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('assigned_to', NEW.assigned_to)
    );
  ELSIF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NOT NULL AND OLD.assigned_to <> NEW.assigned_to THEN
    PERFORM public.write_audit_log(
      'incident.reassigned',
      'incidents',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_assigned_to', OLD.assigned_to, 'new_assigned_to', NEW.assigned_to)
    );
  END IF;

  IF OLD.status <> NEW.status THEN
    PERFORM public.write_audit_log(
      'incident.status_changed',
      'incidents',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );

    IF NEW.status = 'resolved' THEN
      PERFORM public.write_audit_log('incident.resolved', 'incidents', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('resolved_at', NEW.resolved_at));
    ELSIF NEW.status = 'closed' THEN
      PERFORM public.write_audit_log('incident.closed', 'incidents', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('closed_at', NEW.closed_at));
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.write_audit_log('incident.cancelled', 'incidents', NEW.id, to_jsonb(OLD), to_jsonb(NEW), NULL);
    END IF;
  END IF;

  IF OLD.resolution_notes IS DISTINCT FROM NEW.resolution_notes AND NEW.resolution_notes IS NOT NULL THEN
    PERFORM public.write_audit_log(
      'incident.note_added',
      'incidents',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('note_type', 'resolution_notes')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_audit ON public.incidents;
CREATE TRIGGER trg_incident_audit
  AFTER INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.log_incident_audit();

-- B. Audit Logger for tasks
CREATE OR REPLACE FUNCTION public.log_task_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'task.created',
      'tasks',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'title', NEW.title,
        'client_id', NEW.client_id,
        'status', NEW.status,
        'priority', NEW.priority,
        'created_by', NEW.created_by,
        'assigned_to', NEW.assigned_to
      )
    );
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM public.write_audit_log(
        'task.assigned',
        'tasks',
        NEW.id,
        NULL,
        to_jsonb(NEW),
        jsonb_build_object('assigned_to', NEW.assigned_to)
      );
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL THEN
    PERFORM public.write_audit_log(
      'task.assigned',
      'tasks',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('assigned_to', NEW.assigned_to)
    );
  ELSIF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NOT NULL AND OLD.assigned_to <> NEW.assigned_to THEN
    PERFORM public.write_audit_log(
      'task.reassigned',
      'tasks',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_assigned_to', OLD.assigned_to, 'new_assigned_to', NEW.assigned_to)
    );
  END IF;

  IF OLD.status <> NEW.status THEN
    PERFORM public.write_audit_log(
      'task.status_changed',
      'tasks',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );

    IF NEW.status = 'completed' THEN
      PERFORM public.write_audit_log('task.completed', 'tasks', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('completed_at', NEW.completed_at));
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.write_audit_log('task.cancelled', 'tasks', NEW.id, to_jsonb(OLD), to_jsonb(NEW), jsonb_build_object('cancelled_at', NEW.cancelled_at));
    END IF;
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description AND NEW.description IS NOT NULL THEN
    PERFORM public.write_audit_log(
      'task.note_added',
      'tasks',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('note_type', 'description')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_audit ON public.tasks;
CREATE TRIGGER trg_task_audit
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_audit();

-- ----------------------------------------------------------------------------
-- 8. Row Level Security (RLS) & Granular Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Incidents Policies
DROP POLICY IF EXISTS incidents_select_admin ON public.incidents;
CREATE POLICY incidents_select_admin ON public.incidents
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS incidents_select_finance ON public.incidents;
CREATE POLICY incidents_select_finance ON public.incidents
  FOR SELECT TO authenticated
  USING (public.is_finance());

DROP POLICY IF EXISTS incidents_select_staff ON public.incidents;
CREATE POLICY incidents_select_staff ON public.incidents
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS incidents_insert_admin ON public.incidents;
CREATE POLICY incidents_insert_admin ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS incidents_insert_staff ON public.incidents;
CREATE POLICY incidents_insert_staff ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS incidents_update_admin ON public.incidents;
CREATE POLICY incidents_update_admin ON public.incidents
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS incidents_update_staff ON public.incidents;
CREATE POLICY incidents_update_staff ON public.incidents
  FOR UPDATE TO authenticated
  USING (public.is_staff() AND (assigned_to = auth.uid() OR reported_by = auth.uid() OR assigned_to IS NULL))
  WITH CHECK (public.is_staff() AND (assigned_to = auth.uid() OR reported_by = auth.uid() OR assigned_to IS NULL));

-- Tasks Policies
DROP POLICY IF EXISTS tasks_select_admin ON public.tasks;
CREATE POLICY tasks_select_admin ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS tasks_select_finance ON public.tasks;
CREATE POLICY tasks_select_finance ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_finance());

DROP POLICY IF EXISTS tasks_select_staff ON public.tasks;
CREATE POLICY tasks_select_staff ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS tasks_insert_admin ON public.tasks;
CREATE POLICY tasks_insert_admin ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tasks_insert_staff ON public.tasks;
CREATE POLICY tasks_insert_staff ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS tasks_update_admin ON public.tasks;
CREATE POLICY tasks_update_admin ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tasks_update_staff ON public.tasks;
CREATE POLICY tasks_update_staff ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_staff() AND (assigned_to = auth.uid() OR created_by = auth.uid() OR assigned_to IS NULL))
  WITH CHECK (public.is_staff() AND (assigned_to = auth.uid() OR created_by = auth.uid() OR assigned_to IS NULL));

-- ----------------------------------------------------------------------------
-- 9. Explicit Privilege Hardening
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.incidents FROM anon;
REVOKE ALL ON public.tasks FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.incidents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;

REVOKE DELETE, TRUNCATE ON public.incidents FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.tasks FROM authenticated, anon;

GRANT ALL ON public.incidents TO service_role;
GRANT ALL ON public.tasks TO service_role;

REVOKE TRUNCATE ON public.incidents FROM service_role;
REVOKE TRUNCATE ON public.tasks FROM service_role;

COMMIT;
