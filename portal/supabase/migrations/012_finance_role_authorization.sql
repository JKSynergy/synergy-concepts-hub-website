-- 012: Finance role authorization, finance-table RLS, service-catalogue writes, invoice lifecycle.
--
-- Roles after this migration
--   admin    everything (unchanged)
--   finance  finance tables (read + create/edit/record payments), read-only Clients (client profiles) and Projects
--   staff    operational data; NO access to invoices, line items, payments, receipts; read-only Services
--   client   own data only (unchanged)
-- Roles are assigned only by an admin (guard_profile_update, migration 010, is unchanged).

-- ---------------------------------------------------------------------
-- 1. Helper functions (same pattern as is_admin(): SECURITY DEFINER, archived users excluded)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_finance()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'finance' AND archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_finance()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'finance') AND archived_at IS NULL
  );
$$;

-- is_staff() (admin/staff) is deliberately NOT changed: finance users do not
-- get operational staff rights (leads, bookings, internal notes, hidden deliverables).

-- ---------------------------------------------------------------------
-- 2. Finance tables: admin/finance read + write; owning client keeps its limited read.
--    Ordinary staff no longer read any financial record.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "invoices_select_visible" ON public.invoices;
CREATE POLICY "invoices_select_visible" ON public.invoices
  FOR SELECT USING (
    public.can_access_finance()
    OR (client_id = auth.uid() AND status <> 'draft')
  );
DROP POLICY IF EXISTS "invoices_insert_admin" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_finance" ON public.invoices;
CREATE POLICY "invoices_insert_finance" ON public.invoices
  FOR INSERT WITH CHECK (public.can_access_finance());
DROP POLICY IF EXISTS "invoices_update_admin" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_finance" ON public.invoices;
CREATE POLICY "invoices_update_finance" ON public.invoices
  FOR UPDATE USING (public.can_access_finance()) WITH CHECK (public.can_access_finance());
-- Deleting a draft stays admin-only (invoices_delete_admin from 010 is untouched).

DROP POLICY IF EXISTS "line_items_select_visible" ON public.invoice_line_items;
CREATE POLICY "line_items_select_visible" ON public.invoice_line_items
  FOR SELECT USING (
    public.can_access_finance()
    OR EXISTS (SELECT 1 FROM public.invoices i
               WHERE i.id = invoice_id AND i.client_id = auth.uid() AND i.status <> 'draft')
  );
DROP POLICY IF EXISTS "line_items_insert_admin" ON public.invoice_line_items;
DROP POLICY IF EXISTS "line_items_insert_finance" ON public.invoice_line_items;
CREATE POLICY "line_items_insert_finance" ON public.invoice_line_items
  FOR INSERT WITH CHECK (public.can_access_finance());
DROP POLICY IF EXISTS "line_items_update_admin" ON public.invoice_line_items;
DROP POLICY IF EXISTS "line_items_update_finance" ON public.invoice_line_items;
CREATE POLICY "line_items_update_finance" ON public.invoice_line_items
  FOR UPDATE USING (public.can_access_finance()) WITH CHECK (public.can_access_finance());
DROP POLICY IF EXISTS "line_items_delete_admin" ON public.invoice_line_items;
DROP POLICY IF EXISTS "line_items_delete_finance" ON public.invoice_line_items;
CREATE POLICY "line_items_delete_finance" ON public.invoice_line_items
  FOR DELETE USING (public.can_access_finance());

DROP POLICY IF EXISTS "payments_select_visible" ON public.payments;
CREATE POLICY "payments_select_visible" ON public.payments
  FOR SELECT USING (
    public.can_access_finance()
    OR (paid_at IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.invoices i
          WHERE i.id = invoice_id AND i.client_id = auth.uid() AND i.status <> 'draft'))
  );
DROP POLICY IF EXISTS "payments_insert_admin" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_finance" ON public.payments;
CREATE POLICY "payments_insert_finance" ON public.payments
  FOR INSERT WITH CHECK (public.can_access_finance());
DROP POLICY IF EXISTS "payments_update_admin" ON public.payments;
DROP POLICY IF EXISTS "payments_update_finance" ON public.payments;
CREATE POLICY "payments_update_finance" ON public.payments
  FOR UPDATE USING (public.can_access_finance()) WITH CHECK (public.can_access_finance());
-- Nobody deletes payments (no DELETE policy), as in 010.

DROP POLICY IF EXISTS "receipts_select_visible" ON public.receipts;
CREATE POLICY "receipts_select_visible" ON public.receipts
  FOR SELECT USING (
    public.can_access_finance()
    OR EXISTS (SELECT 1 FROM public.invoices i
               WHERE i.id = invoice_id AND i.client_id = auth.uid() AND i.status <> 'draft')
  );

-- Document-number RPCs: callable by admin or finance (or the service role).
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_access_finance() THEN
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
  IF auth.uid() IS NOT NULL AND NOT public.can_access_finance() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.next_document_number('receipt', 'RCP');
END;
$$;
REVOKE ALL ON FUNCTION public.generate_receipt_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Finance may READ client profiles and projects (needed for invoicing), nothing more.
--    No write policy is added; guard_profile_update already blocks role changes by non-admins.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_finance_clients" ON public.profiles;
CREATE POLICY "profiles_select_finance_clients" ON public.profiles
  FOR SELECT USING (public.is_finance() AND role = 'client');

DROP POLICY IF EXISTS "projects_select_finance" ON public.projects;
CREATE POLICY "projects_select_finance" ON public.projects
  FOR SELECT USING (public.is_finance());

DROP POLICY IF EXISTS "milestones_select_finance" ON public.project_milestones;
CREATE POLICY "milestones_select_finance" ON public.project_milestones
  FOR SELECT USING (public.is_finance());

-- ---------------------------------------------------------------------
-- 4. Service catalogue: everyone who could read still reads; only admin writes.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "services_insert_staff" ON public.service_catalog;
DROP POLICY IF EXISTS "services_update_staff" ON public.service_catalog;
DROP POLICY IF EXISTS "services_delete_staff" ON public.service_catalog;
DROP POLICY IF EXISTS "services_insert_admin" ON public.service_catalog;
DROP POLICY IF EXISTS "services_update_admin" ON public.service_catalog;
DROP POLICY IF EXISTS "services_delete_admin" ON public.service_catalog;
CREATE POLICY "services_insert_admin" ON public.service_catalog
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "services_update_admin" ON public.service_catalog
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "services_delete_admin" ON public.service_catalog
  FOR DELETE USING (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Invoice lifecycle (database is the source of truth; applies to every caller
--    including the service role). Adds two rules to the 010 status guard:
--      * an issued invoice (anything other than draft) can never return to draft
--      * an invoice that is paid or partially paid, or has recorded payments, cannot be cancelled
--    All 010 rules are kept. No void/correction workflow is introduced.
-- ---------------------------------------------------------------------
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

  IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'An issued invoice cannot return to draft.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'cancelled' AND (OLD.status IN ('paid', 'partially paid') OR v_paid > 0) THEN
    RAISE EXCEPTION 'A paid or partially paid invoice cannot be cancelled.' USING ERRCODE = 'check_violation';
  END IF;
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
