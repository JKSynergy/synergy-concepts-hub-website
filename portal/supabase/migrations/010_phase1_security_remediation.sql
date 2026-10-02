BEGIN;
-- =====================================================================
-- 010_phase1_security_remediation.sql
-- Phase 1: security, authorization, payment integrity and data integrity.
--
-- This migration is ADDITIVE: it does not edit migrations 001-009. It
-- replaces policies/functions/triggers by name and is safe to run once on
-- top of the state produced by 001-009 (008 and 009 must already be applied,
-- because 'partially paid' is used at run time by the trigger functions).
--
-- Findings covered (IDs refer to docs/PHASE1-REMEDIATION.md):
--   R1  profiles.role self-escalation           (profiles_update_own)
--   R2  sign-up metadata could choose the role  (handle_new_user)
--   R5  internal project updates readable by clients (RLS)
--   R5b hidden deliverables readable by clients (RLS)
--   R7  staff could write finance tables        (RLS)
--   R8  payment/invoice integrity               (triggers, unique index)
--   R9  cascade deletion of financial history   (FKs, delete guard)
--   R15 one authoritative totals calculation    (triggers)
--   R16 safe invoice/receipt numbering          (counter table)
--   R17 audit_logs never written, no RLS        (RLS + triggers)
--   plus: client edits of milestones/bookings, update author spoofing,
--         academy_courses staff writes, draft invoices visible to clients.
--
-- PRE-CHECK: the unique index on payments.paystack_reference cannot be
-- created if duplicate rows already exist (webhook retries could have created
-- them). This migration STOPS with a clear message instead of deleting
-- financial rows. See the deployment notes for the query to review them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- is_staff(): admin/staff who are not archived. (same name/signature as 002)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff') AND archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND archived_at IS NULL
  );
$$;

ALTER FUNCTION public.owns_project(uuid) SET search_path = public;

-- ---------------------------------------------------------------------
-- 1. Audit log: structure, RLS, immutability, writer
-- ---------------------------------------------------------------------
ALTER TABLE public.audit_logs ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS details jsonb;

CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policy: only SECURITY DEFINER functions and the
-- service-role key can write. Make that explicit at the privilege level too.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;

-- Append-only: rows cannot be edited or deleted. The single allowed change is
-- the FK action that nulls actor_id when a profile is removed.
CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
     AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_change ON public.audit_logs;
CREATE TRIGGER audit_logs_no_change
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action text,
  p_table text,
  p_record uuid,
  p_old jsonb,
  p_new jsonb,
  p_details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT role::text INTO v_role FROM public.profiles WHERE id = v_actor;
  END IF;
  INSERT INTO public.audit_logs (actor_id, actor_role, action, table_name, record_id, old_data, new_data, details)
  VALUES (v_actor, v_role, p_action, p_table, p_record, p_old, p_new, p_details);
END;
$$;
REVOKE ALL ON FUNCTION public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 2. Profiles: role lock, sign-up trigger, archive
-- ---------------------------------------------------------------------
-- A user may only update their own row; only an admin may update others.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Column guard. RLS cannot restrict columns, so this trigger does.
-- auth.uid() IS NULL means a trusted server context (service_role key or the
-- SQL editor); anonymous callers never reach here because no policy lets them
-- update profiles.
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profile id cannot be changed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND OLD.id = v_caller THEN
      RAISE EXCEPTION 'administrators cannot change their own role' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role can only be changed by an administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.external_portal_url IS DISTINCT FROM OLD.external_portal_url
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
     OR NEW.archived_by IS DISTINCT FROM OLD.archived_by THEN
    RAISE EXCEPTION 'this profile field can only be changed by an administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_update ON public.profiles;
CREATE TRIGGER profiles_guard_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- Sign-up never trusts user-supplied metadata for the role. Every new account
-- is a client; staff/admin roles are assigned server-side (service role) only.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'client');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.write_audit_log('profile.role_changed', 'profiles', NEW.id,
      jsonb_build_object('role', OLD.role), jsonb_build_object('role', NEW.role), NULL);
  END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    PERFORM public.write_audit_log(
      CASE WHEN NEW.archived_at IS NULL THEN 'profile.restored' ELSE 'profile.archived' END,
      'profiles', NEW.id,
      jsonb_build_object('archived_at', OLD.archived_at),
      jsonb_build_object('archived_at', NEW.archived_at), NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_audit_profile_changes ON public.profiles;
CREATE TRIGGER zz_audit_profile_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role OR OLD.archived_at IS DISTINCT FROM NEW.archived_at)
  EXECUTE FUNCTION public.audit_profile_changes();

-- ---------------------------------------------------------------------
-- 3. Project data isolation (internal notes, hidden deliverables)
-- ---------------------------------------------------------------------
-- Clients only see updates that are not internal; staff see everything.
DROP POLICY IF EXISTS "updates_select_own" ON public.project_updates;
CREATE POLICY "updates_select_visible" ON public.project_updates
  FOR SELECT USING (
    public.is_staff()
    OR (is_internal = false AND public.owns_project(project_id))
  );

-- Inserting: author must be the caller (no impersonation); clients can only
-- post non-internal comments on their own projects.
DROP POLICY IF EXISTS "updates_insert_staff_or_owner" ON public.project_updates;
CREATE POLICY "updates_insert_staff_or_owner" ON public.project_updates
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND (public.is_staff() OR (public.owns_project(project_id) AND is_internal = false))
  );

-- Clients only see deliverables that are marked visible on projects they own.
DROP POLICY IF EXISTS "deliverables_select_own" ON public.deliverables;
CREATE POLICY "deliverables_select_visible" ON public.deliverables
  FOR SELECT USING (
    public.is_staff()
    OR (is_visible_to_client = true AND public.owns_project(project_id))
  );

-- Milestones: a client may only approve or request changes on a milestone
-- that staff have submitted, and may change nothing else.
CREATE OR REPLACE FUNCTION public.guard_milestone_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff() THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'completed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'completed_at') THEN
    RAISE EXCEPTION 'clients may only respond to a submitted milestone' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status IS DISTINCT FROM 'submitted' OR NEW.status NOT IN ('approved', 'revision_requested') THEN
    RAISE EXCEPTION 'clients may only approve or request changes on a submitted milestone' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS milestones_guard_update ON public.project_milestones;
CREATE TRIGGER milestones_guard_update
  BEFORE UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.guard_milestone_update();

-- Bookings: a client creates 'pending' requests for themselves and may only
-- cancel their own booking; every other change is staff-only.
CREATE OR REPLACE FUNCTION public.guard_booking_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'clients can only create pending bookings' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at')
     OR NEW.status IS DISTINCT FROM 'cancelled'
     OR OLD.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'clients may only cancel a pending or confirmed booking' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_guard_write ON public.bookings;
CREATE TRIGGER bookings_guard_write
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_write();

-- Older policies (001, 004) inline the role check instead of using is_staff() /
-- is_admin(), so an archived staff member would still pass them. Recreate them
-- on the shared helpers so archiving revokes database access consistently.
DROP POLICY IF EXISTS "bookings_select_own" ON public.bookings;
CREATE POLICY "bookings_select_own" ON public.bookings
  FOR SELECT USING (client_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT USING (client_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "milestones_select_own" ON public.project_milestones;
CREATE POLICY "milestones_select_own" ON public.project_milestones
  FOR SELECT USING (public.is_staff() OR public.owns_project(project_id));

DROP POLICY IF EXISTS "project_assignments_select_staff" ON public.project_assignments;
CREATE POLICY "project_assignments_select_staff" ON public.project_assignments
  FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "project_assignments_insert_admin" ON public.project_assignments;
CREATE POLICY "project_assignments_insert_admin" ON public.project_assignments
  FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "project_assignments_delete_admin" ON public.project_assignments;
CREATE POLICY "project_assignments_delete_admin" ON public.project_assignments
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "academy_courses_select_all" ON public.academy_courses;
CREATE POLICY "academy_courses_select_all" ON public.academy_courses
  FOR SELECT USING (is_active = true OR public.is_staff());

-- Academy courses: the app treats academy as admin-only (middleware); make the
-- database agree. Reading active courses is unchanged.
DROP POLICY IF EXISTS "academy_courses_manage_staff" ON public.academy_courses;
DROP POLICY IF EXISTS "academy_courses_manage_admin" ON public.academy_courses;
CREATE POLICY "academy_courses_manage_admin" ON public.academy_courses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Finance policies: admin writes, owner/staff reads, no drafts for clients
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "invoices_insert_staff" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_staff" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_staff" ON public.invoices;
DROP POLICY IF EXISTS "invoices_select_own" ON public.invoices;
CREATE POLICY "invoices_select_visible" ON public.invoices
  FOR SELECT USING (
    public.is_staff()
    OR (client_id = auth.uid() AND status <> 'draft')
  );
CREATE POLICY "invoices_insert_admin" ON public.invoices
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "invoices_update_admin" ON public.invoices
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "invoices_delete_admin" ON public.invoices
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "line_items_insert_staff" ON public.invoice_line_items;
DROP POLICY IF EXISTS "line_items_update_staff" ON public.invoice_line_items;
DROP POLICY IF EXISTS "line_items_delete_staff" ON public.invoice_line_items;
DROP POLICY IF EXISTS "line_items_select_own" ON public.invoice_line_items;
CREATE POLICY "line_items_select_visible" ON public.invoice_line_items
  FOR SELECT USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.invoices i
               WHERE i.id = invoice_id AND i.client_id = auth.uid() AND i.status <> 'draft')
  );
CREATE POLICY "line_items_insert_admin" ON public.invoice_line_items
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "line_items_update_admin" ON public.invoice_line_items
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "line_items_delete_admin" ON public.invoice_line_items
  FOR DELETE USING (public.is_admin());

-- Payments: clients see only settled payments on their own non-draft
-- invoices. Nobody deletes payments through the API (records are permanent);
-- receipts are created by trigger only.
DROP POLICY IF EXISTS "payments_insert_staff" ON public.payments;
DROP POLICY IF EXISTS "payments_update_staff" ON public.payments;
DROP POLICY IF EXISTS "payments_delete_staff" ON public.payments;
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_visible" ON public.payments
  FOR SELECT USING (
    public.is_staff()
    OR (paid_at IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.invoices i
          WHERE i.id = invoice_id AND i.client_id = auth.uid() AND i.status <> 'draft'))
  );
CREATE POLICY "payments_insert_admin" ON public.payments
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "payments_update_admin" ON public.payments
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "receipts_insert_staff" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update_staff" ON public.receipts;
DROP POLICY IF EXISTS "receipts_delete_staff" ON public.receipts;
DROP POLICY IF EXISTS "receipts_select_own" ON public.receipts;
CREATE POLICY "receipts_select_visible" ON public.receipts
  FOR SELECT USING (
    public.is_staff()
    OR EXISTS (SELECT 1 FROM public.invoices i
               WHERE i.id = invoice_id AND i.client_id = auth.uid() AND i.status <> 'draft')
  );

-- ---------------------------------------------------------------------
-- 5. Do not let deleting a client cascade into financial / project history
-- ---------------------------------------------------------------------
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_client_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id)
  REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_client_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id)
  REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_payment_id_fkey;
ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_payment_id_fkey FOREIGN KEY (payment_id)
  REFERENCES public.payments(id) ON DELETE RESTRICT;
ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_invoice_id_fkey;
ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_invoice_id_fkey FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id) ON DELETE RESTRICT;

-- An invoice may only be deleted while it is a draft with no payments.
-- Everything else is cancelled, not destroyed. Applies to every caller,
-- including the service role.
CREATE OR REPLACE FUNCTION public.guard_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' OR EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = OLD.id) THEN
    RAISE EXCEPTION 'Only draft invoices without payments can be deleted. Cancel the invoice instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public.write_audit_log('invoice.deleted', 'invoices', OLD.id,
    jsonb_build_object('invoice_number', OLD.invoice_number, 'client_id', OLD.client_id, 'status', OLD.status),
    NULL, NULL);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS invoices_guard_delete ON public.invoices;
CREATE TRIGGER invoices_guard_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_delete();

-- ---------------------------------------------------------------------
-- 6. Numbering: atomic per-year counters (never reused, no race)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_counters (
  kind text NOT NULL,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, year)
);
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_counters FROM anon, authenticated;

INSERT INTO public.document_counters (kind, year, last_number)
SELECT 'invoice',
       substring(invoice_number FROM '^SCH-([0-9]{4})-[0-9]+$')::int,
       max(substring(invoice_number FROM '^SCH-[0-9]{4}-([0-9]+)$')::int)
FROM public.invoices
WHERE invoice_number ~ '^SCH-[0-9]{4}-[0-9]+$'
GROUP BY 2
ON CONFLICT (kind, year) DO UPDATE
  SET last_number = GREATEST(public.document_counters.last_number, EXCLUDED.last_number);

INSERT INTO public.document_counters (kind, year, last_number)
SELECT 'receipt',
       substring(receipt_number FROM '^RCP-([0-9]{4})-[0-9]+$')::int,
       max(substring(receipt_number FROM '^RCP-[0-9]{4}-([0-9]+)$')::int)
FROM public.receipts
WHERE receipt_number ~ '^RCP-[0-9]{4}-[0-9]+$'
GROUP BY 2
ON CONFLICT (kind, year) DO UPDATE
  SET last_number = GREATEST(public.document_counters.last_number, EXCLUDED.last_number);

CREATE OR REPLACE FUNCTION public.next_document_number(p_kind text, p_prefix text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := extract(year FROM current_date)::int;
  v_next integer;
BEGIN
  INSERT INTO public.document_counters AS c (kind, year, last_number)
  VALUES (p_kind, v_year, 1)
  ON CONFLICT (kind, year) DO UPDATE SET last_number = c.last_number + 1
  RETURNING c.last_number INTO v_next;
  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_document_number(text, text) FROM PUBLIC;

-- Same names and signatures as 003; the callable RPC now takes the atomic path
-- and is restricted to admins (or the service role).
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.next_document_number('invoice', 'SCH');
END;
$$;
REVOKE ALL ON FUNCTION public.generate_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.next_document_number('receipt', 'RCP');
END;
$$;
REVOKE ALL ON FUNCTION public.generate_receipt_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number() TO authenticated, service_role;

-- Invoice number is assigned on insert when not supplied, and can never change.
CREATE OR REPLACE FUNCTION public.invoices_number_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
      NEW.invoice_number := public.next_document_number('invoice', 'SCH');
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
    RAISE EXCEPTION 'invoice number cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  -- An issued invoice, or one with payments, cannot be moved to another client.
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND (OLD.status <> 'draft' OR EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = OLD.id)) THEN
    RAISE EXCEPTION 'The client of an issued invoice cannot be changed.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_1_number_guard ON public.invoices;
CREATE TRIGGER invoices_1_number_guard
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_number_guard();

-- ---------------------------------------------------------------------
-- 7. ONE authoritative totals calculation (the database)
--    line item amount = round(quantity * unit_price, 2)
--    subtotal        = sum(line item amounts)
--    tax_amount      = round(subtotal * tax_rate / 100, 2)
--    total           = subtotal + tax_amount
--    Application code and pages only display these stored values.
-- ---------------------------------------------------------------------
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_tax_rate_range;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_tax_rate_range CHECK (tax_rate >= 0 AND tax_rate <= 100) NOT VALID;
ALTER TABLE public.invoice_line_items
  DROP CONSTRAINT IF EXISTS line_items_values_valid;
ALTER TABLE public.invoice_line_items
  ADD CONSTRAINT line_items_values_valid CHECK (quantity > 0 AND unit_price >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION public.invoices_compute_totals()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.subtotal := 0;
    NEW.tax_amount := 0;
    NEW.total := 0;
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
  FROM public.invoice_line_items WHERE invoice_id = NEW.id;
  v_tax := ROUND(v_subtotal * COALESCE(NEW.tax_rate, 0) / 100, 2);

  IF (v_subtotal + v_tax) IS DISTINCT FROM OLD.total
     AND EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = NEW.id AND paid_at IS NOT NULL) THEN
    RAISE EXCEPTION 'The total of an invoice cannot change after a payment has been recorded.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.subtotal := v_subtotal;
  NEW.tax_amount := v_tax;
  NEW.total := v_subtotal + v_tax;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_2_totals ON public.invoices;
CREATE TRIGGER invoices_2_totals
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_compute_totals();

-- Line item amounts are derived, and cannot change once payments exist.
CREATE OR REPLACE FUNCTION public.line_items_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice uuid;
BEGIN
  v_invoice := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  IF EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = v_invoice AND paid_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Line items cannot change after a payment has been recorded.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.amount := ROUND(NEW.quantity * NEW.unit_price, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS line_items_before_write ON public.invoice_line_items;
CREATE TRIGGER line_items_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.line_items_before_write();

-- After a line item changes, touch the invoice so the totals trigger above
-- recomputes the header. (Replaces the 003 version, which did its own math.)
CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_id uuid;
BEGIN
  inv_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  UPDATE public.invoices SET updated_at = now() WHERE id = inv_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Backfill: re-derive line item amounts and invoice totals for existing rows
-- that have no recorded payments (rows with payments are left untouched).
UPDATE public.invoice_line_items li
SET amount = ROUND(li.quantity * li.unit_price, 2)
WHERE li.amount IS DISTINCT FROM ROUND(li.quantity * li.unit_price, 2)
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = li.invoice_id AND p.paid_at IS NOT NULL);

-- Re-derive the header totals of every invoice that has no settled payment
-- (touching the row fires the totals trigger). Invoices that already have
-- payments are deliberately left alone; compare them manually if needed:
--   SELECT id, invoice_number, total,
--          (SELECT COALESCE(SUM(amount),0) FROM public.invoice_line_items WHERE invoice_id = i.id) AS items_sum
--   FROM public.invoices i;
UPDATE public.invoices i
SET updated_at = updated_at
WHERE NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id AND p.paid_at IS NOT NULL);

-- ---------------------------------------------------------------------
-- 8. Payment integrity
-- ---------------------------------------------------------------------
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0) NOT VALID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE paystack_reference IS NOT NULL
    GROUP BY paystack_reference HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate payments.paystack_reference values exist. Review them (SELECT paystack_reference, count(*) FROM public.payments WHERE paystack_reference IS NOT NULL GROUP BY 1 HAVING count(*) > 1) and resolve them deliberately before applying migration 010. No rows were changed.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_paystack_reference_key
  ON public.payments (paystack_reference) WHERE paystack_reference IS NOT NULL;

-- Settling a payment (paid_at set) is checked against the invoice under a row
-- lock, so concurrent payments cannot overpay, and a draft, cancelled or
-- fully paid invoice can never receive a payment. A settled payment is frozen.
CREATE OR REPLACE FUNCTION public.payments_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.invoice_status;
  v_total numeric;
  v_paid_others numeric;
  v_settling boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.paid_at IS NOT NULL THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.paystack_reference IS DISTINCT FROM OLD.paystack_reference THEN
      RAISE EXCEPTION 'A settled payment cannot be changed.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  v_settling := NEW.paid_at IS NOT NULL;
  IF v_settling THEN
    SELECT status, total INTO v_status, v_total
    FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_status IN ('draft', 'cancelled', 'paid') THEN
      RAISE EXCEPTION 'This invoice cannot receive a payment (status: %).', v_status
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_others
    FROM public.payments
    WHERE invoice_id = NEW.invoice_id AND paid_at IS NOT NULL AND id <> NEW.id;
    IF v_paid_others + NEW.amount > v_total THEN
      RAISE EXCEPTION 'Payment exceeds the outstanding balance of this invoice.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_1_guard ON public.payments;
CREATE TRIGGER payments_1_guard
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_guard();

-- Receipt + invoice status when a payment is settled (replaces 009).
CREATE OR REPLACE FUNCTION public.handle_payment_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_paid numeric;
  v_inv_total numeric;
  v_new_status public.invoice_status;
  v_newly_settled boolean := false;
BEGIN
  IF NEW.paid_at IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      v_newly_settled := true;
    ELSIF OLD.paid_at IS NULL THEN
      v_newly_settled := true;
    END IF;
  END IF;

  IF v_newly_settled THEN
    INSERT INTO public.receipts (payment_id, invoice_id, receipt_number)
    VALUES (NEW.id, NEW.invoice_id, public.next_document_number('receipt', 'RCP'));

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments WHERE invoice_id = NEW.invoice_id AND paid_at IS NOT NULL;
    SELECT COALESCE(total, 0) INTO v_inv_total FROM public.invoices WHERE id = NEW.invoice_id;

    IF v_inv_total > 0 AND v_total_paid >= v_inv_total THEN
      v_new_status := 'paid';
    ELSE
      v_new_status := 'partially paid';
    END IF;

    UPDATE public.invoices
    SET status = v_new_status
    WHERE id = NEW.invoice_id AND status IN ('sent', 'overdue', 'partially paid');
  END IF;
  RETURN NEW;
END;
$$;

-- Manual status changes must agree with the recorded payments (an invoice
-- cannot be set to paid without payments, or moved back once payments exist).
CREATE OR REPLACE FUNCTION public.invoices_status_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid numeric;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.payments WHERE invoice_id = NEW.id AND paid_at IS NOT NULL;

  IF NEW.status = 'paid' AND NOT (NEW.total > 0 AND v_paid >= NEW.total) THEN
    RAISE EXCEPTION 'Invoice cannot be marked paid: recorded payments (%) do not cover the total (%).', v_paid, NEW.total
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'partially paid' AND NOT (v_paid > 0 AND v_paid < NEW.total) THEN
    RAISE EXCEPTION 'Invoice cannot be marked partially paid: recorded payments (%) vs total (%).', v_paid, NEW.total
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('draft', 'sent', 'overdue') AND v_paid > 0 THEN
    RAISE EXCEPTION 'Invoice already has recorded payments and cannot return to %.', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_3_status_guard ON public.invoices;
CREATE TRIGGER invoices_3_status_guard
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_status_guard();

-- ---------------------------------------------------------------------
-- 9. Audit triggers for financial events
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_invoice_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log('invoice.created', 'invoices', NEW.id, NULL,
      jsonb_build_object('invoice_number', NEW.invoice_number, 'client_id', NEW.client_id, 'status', NEW.status), NULL);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit_log('invoice.status_changed', 'invoices', NEW.id,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status),
      jsonb_build_object('invoice_number', NEW.invoice_number, 'total', NEW.total));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_audit_invoice_changes ON public.invoices;
CREATE TRIGGER zz_audit_invoice_changes
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_invoice_changes();

CREATE OR REPLACE FUNCTION public.audit_payment_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      CASE WHEN NEW.paid_at IS NULL THEN 'payment.initiated' ELSE 'payment.recorded' END,
      'payments', NEW.id, NULL,
      jsonb_build_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount, 'method', NEW.method,
                         'paystack_reference', NEW.paystack_reference), NULL);
  ELSIF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    PERFORM public.write_audit_log('payment.settled', 'payments', NEW.id,
      jsonb_build_object('paid_at', OLD.paid_at),
      jsonb_build_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount, 'paid_at', NEW.paid_at,
                         'paystack_reference', NEW.paystack_reference), NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_audit_payment_changes ON public.payments;
CREATE TRIGGER zz_audit_payment_changes
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_changes();

COMMIT;
