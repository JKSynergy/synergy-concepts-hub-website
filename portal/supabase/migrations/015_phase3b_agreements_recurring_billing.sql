-- ============================================================================
-- Migration 015: Phase 3B Service Agreements & Recurring Billing
-- SCH Portal / Synergy Concepts Hub
--
-- Introduces:
--   1. service_agreements
--   2. agreement_resources
--   3. recurring_charges
--   4. recurring_charge_runs
--   5. Additive invoices fields: currency (default 'UGX'), agreement_id, recurring_charge_id
--   6. Same-client integrity triggers
--   7. Derived billing standing function (derive_agreement_billing_standing)
--   8. staff_service_agreements_view (zero financial leakage)
--   9. Explicit RLS policies (staff denied financial amounts)
--  10. Strict privilege hardening (no TRUNCATE, anon has 0 privileges)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: service_agreements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  service_type TEXT NOT NULL CHECK (service_type IN (
    'managed_service', 'maintenance', 'hosting', 'sla_support', 'domain_management',
    'security_monitoring', 'retainer', 'custom'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'suspended', 'reactivation_pending', 'ended', 'terminated'
  )),
  start_date DATE NOT NULL,
  end_date DATE NULL,
  renewal_date DATE NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN (
    'monthly', 'quarterly', 'semi_annual', 'annual', 'custom'
  )),
  payment_timing TEXT NOT NULL DEFAULT 'month_end' CHECK (payment_timing IN (
    'month_end', 'advance', 'net_15', 'net_30', 'custom'
  )),
  default_grace_days INTEGER NOT NULL DEFAULT 7 CHECK (default_grace_days >= 0),
  notice_days INTEGER NOT NULL DEFAULT 3 CHECK (notice_days >= 0),
  responsible_staff_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  contract_reference TEXT NULL CHECK (public.check_no_secrets_in_text(contract_reference)),
  operational_notes TEXT NULL CHECK (public.check_no_secrets_in_text(operational_notes)),
  terminated_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_agreement_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ----------------------------------------------------------------------------
-- 2. Table: agreement_resources (Many-to-Many Agreement <-> Resources)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agreement_resources (
  agreement_id UUID NOT NULL REFERENCES public.service_agreements(id) ON DELETE RESTRICT,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT NULL CHECK (public.check_no_secrets_in_text(notes)),
  PRIMARY KEY (agreement_id, resource_id)
);

-- ----------------------------------------------------------------------------
-- 3. Table: recurring_charges (Recurring Commercial Billing Schedules)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.service_agreements(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  description TEXT NULL CHECK (public.check_no_secrets_in_text(description)),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'UGX' CHECK (currency IN ('UGX', 'USD')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN (
    'monthly', 'quarterly', 'semi_annual', 'annual', 'custom'
  )),
  payment_timing TEXT NOT NULL DEFAULT 'month_end' CHECK (payment_timing IN (
    'month_end', 'advance', 'net_15', 'net_30', 'custom'
  )),
  active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_charge_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ----------------------------------------------------------------------------
-- 4. Invoices Additive Alterations (Currency & Phase 3B Relationships)
-- ----------------------------------------------------------------------------
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UGX' CHECK (currency IN ('UGX', 'USD')),
  ADD COLUMN IF NOT EXISTS agreement_id UUID NULL REFERENCES public.service_agreements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurring_charge_id UUID NULL REFERENCES public.recurring_charges(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 5. Table: recurring_charge_runs (Idempotent Billing Period Records)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_charge_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_charge_id UUID NOT NULL REFERENCES public.recurring_charges(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'voided')),
  CONSTRAINT uq_recurring_charge_run_period UNIQUE (recurring_charge_id, period_start, period_end),
  CONSTRAINT chk_run_period_dates CHECK (period_end >= period_start)
);

-- ----------------------------------------------------------------------------
-- 6. Indexes for Performance and Queries
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_service_agreements_client_id ON public.service_agreements(client_id);
CREATE INDEX IF NOT EXISTS idx_service_agreements_system_id ON public.service_agreements(system_id);
CREATE INDEX IF NOT EXISTS idx_service_agreements_status ON public.service_agreements(status);
CREATE INDEX IF NOT EXISTS idx_service_agreements_archived ON public.service_agreements(archived_at);

CREATE INDEX IF NOT EXISTS idx_agreement_resources_resource_id ON public.agreement_resources(resource_id);

CREATE INDEX IF NOT EXISTS idx_recurring_charges_agreement_id ON public.recurring_charges(agreement_id);
CREATE INDEX IF NOT EXISTS idx_recurring_charges_active ON public.recurring_charges(active);

CREATE INDEX IF NOT EXISTS idx_recurring_charge_runs_charge ON public.recurring_charge_runs(recurring_charge_id);
CREATE INDEX IF NOT EXISTS idx_recurring_charge_runs_invoice ON public.recurring_charge_runs(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoices_agreement_id ON public.invoices(agreement_id);
CREATE INDEX IF NOT EXISTS idx_invoices_recurring_charge_id ON public.invoices(recurring_charge_id);
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON public.invoices(currency);

-- ----------------------------------------------------------------------------
-- 7. Integrity Triggers
-- ----------------------------------------------------------------------------

-- A. Agreement System Same-Client Integrity
CREATE OR REPLACE FUNCTION public.check_agreement_client_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_system_client UUID;
BEGIN
  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_system_client FROM public.systems WHERE id = NEW.system_id;
    IF v_system_client IS NOT NULL AND v_system_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Agreement system must belong to the agreement client' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agreement_client_integrity ON public.service_agreements;
CREATE TRIGGER trg_agreement_client_integrity
  BEFORE INSERT OR UPDATE OF client_id, system_id ON public.service_agreements
  FOR EACH ROW EXECUTE FUNCTION public.check_agreement_client_integrity();

-- B. Agreement Resource Same-Client Integrity
CREATE OR REPLACE FUNCTION public.check_agreement_resource_client_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_agreement_client UUID;
  v_resource_client UUID;
  v_resource_system UUID;
  v_system_client UUID;
BEGIN
  SELECT client_id INTO v_agreement_client FROM public.service_agreements WHERE id = NEW.agreement_id;
  IF v_agreement_client IS NULL THEN
    RAISE EXCEPTION 'Referenced agreement does not exist' USING ERRCODE = 'P0001';
  END IF;

  SELECT client_id, system_id INTO v_resource_client, v_resource_system FROM public.resources WHERE id = NEW.resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced resource does not exist' USING ERRCODE = 'P0001';
  END IF;

  -- 1. If resource has direct client_id, it must match agreement client_id
  IF v_resource_client IS NOT NULL AND v_resource_client <> v_agreement_client THEN
    RAISE EXCEPTION 'Resource client ownership must match agreement client' USING ERRCODE = 'P0001';
  END IF;

  -- 2. If resource has attached system, system client_id must match agreement client_id
  IF v_resource_system IS NOT NULL THEN
    SELECT client_id INTO v_system_client FROM public.systems WHERE id = v_resource_system;
    IF v_system_client IS NOT NULL AND v_system_client <> v_agreement_client THEN
      RAISE EXCEPTION 'Resource attached system client must match agreement client' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agreement_resource_client_integrity ON public.agreement_resources;
CREATE TRIGGER trg_agreement_resource_client_integrity
  BEFORE INSERT OR UPDATE OF agreement_id, resource_id ON public.agreement_resources
  FOR EACH ROW EXECUTE FUNCTION public.check_agreement_resource_client_integrity();

-- C. Invoice Agreement & Recurring Charge Same-Client Integrity
CREATE OR REPLACE FUNCTION public.check_invoice_agreement_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_agreement_client UUID;
  v_charge_agreement UUID;
  v_charge_currency VARCHAR(3);
BEGIN
  IF NEW.agreement_id IS NOT NULL THEN
    SELECT client_id INTO v_agreement_client FROM public.service_agreements WHERE id = NEW.agreement_id;
    IF v_agreement_client IS NOT NULL AND v_agreement_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Invoice client must match agreement client' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.recurring_charge_id IS NOT NULL THEN
    SELECT agreement_id, currency INTO v_charge_agreement, v_charge_currency 
    FROM public.recurring_charges WHERE id = NEW.recurring_charge_id;

    IF v_charge_agreement IS NOT NULL AND NEW.agreement_id IS NOT NULL AND v_charge_agreement <> NEW.agreement_id THEN
      RAISE EXCEPTION 'Invoice recurring charge must belong to the linked agreement' USING ERRCODE = 'P0001';
    END IF;

    IF v_charge_currency IS NOT NULL AND NEW.currency <> v_charge_currency THEN
      RAISE EXCEPTION 'Invoice currency must match recurring charge currency' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_agreement_integrity ON public.invoices;
CREATE TRIGGER trg_invoice_agreement_integrity
  BEFORE INSERT OR UPDATE OF client_id, agreement_id, recurring_charge_id, currency ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.check_invoice_agreement_integrity();

-- D. Updated_at Triggers
DROP TRIGGER IF EXISTS set_service_agreements_updated_at ON public.service_agreements;
CREATE TRIGGER set_service_agreements_updated_at
  BEFORE UPDATE ON public.service_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_recurring_charges_updated_at ON public.recurring_charges;
CREATE TRIGGER set_recurring_charges_updated_at
  BEFORE UPDATE ON public.recurring_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Derived Billing Standing Helper Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_agreement_billing_standing(p_agreement_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_status TEXT;
  v_grace_days INTEGER;
  v_notice_days INTEGER;
  v_record RECORD;
  v_days_overdue INTEGER;
  v_has_open_invoice BOOLEAN := false;
  v_has_due_invoice BOOLEAN := false;
  v_has_grace_invoice BOOLEAN := false;
  v_has_notice_invoice BOOLEAN := false;
  v_has_suspension_eligible BOOLEAN := false;
BEGIN
  SELECT status, default_grace_days, notice_days
  INTO v_status, v_grace_days, v_notice_days
  FROM public.service_agreements
  WHERE id = p_agreement_id;

  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;

  -- Lifecycle states take precedence
  IF v_status = 'draft' THEN
    RETURN 'DRAFT';
  ELSIF v_status = 'suspended' THEN
    RETURN 'SUSPENDED';
  ELSIF v_status IN ('ended', 'terminated') THEN
    RETURN 'TERMINATED';
  END IF;

  -- Inspect open/unpaid issued invoices linked to this agreement
  FOR v_record IN
    SELECT due_date, status
    FROM public.invoices
    WHERE agreement_id = p_agreement_id
      AND status IN ('sent', 'overdue', 'partially paid')
  LOOP
    v_has_open_invoice := true;

    IF v_record.due_date IS NOT NULL AND CURRENT_DATE > v_record.due_date THEN
      v_days_overdue := CURRENT_DATE - v_record.due_date;
      IF v_days_overdue <= v_grace_days THEN
        v_has_grace_invoice := true;
      ELSIF v_days_overdue <= (v_grace_days + v_notice_days) THEN
        v_has_notice_invoice := true;
      ELSE
        v_has_suspension_eligible := true;
      END IF;
    ELSE
      v_has_due_invoice := true;
    END IF;
  END LOOP;

  -- Determine severity level
  IF v_has_suspension_eligible THEN
    RETURN 'SUSPENSION_ELIGIBLE';
  ELSIF v_has_notice_invoice THEN
    RETURN 'NOTICE';
  ELSIF v_has_grace_invoice THEN
    RETURN 'OVERDUE_GRACE';
  ELSIF v_has_due_invoice THEN
    RETURN 'DUE';
  ELSE
    RETURN 'CURRENT';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- 9. Staff-Safe Service Agreements View (Zero Financial Leakage)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.staff_service_agreements_view AS
SELECT
  sa.id,
  sa.client_id,
  sa.system_id,
  sa.name,
  sa.service_type,
  sa.status,
  sa.start_date,
  sa.end_date,
  sa.renewal_date,
  sa.billing_cycle,
  sa.payment_timing,
  sa.default_grace_days,
  sa.notice_days,
  sa.responsible_staff_id,
  sa.operational_notes,
  sa.archived_at,
  sa.terminated_at,
  public.derive_agreement_billing_standing(sa.id) AS billing_standing,
  sa.created_at,
  sa.updated_at
FROM public.service_agreements sa;

-- ----------------------------------------------------------------------------
-- 10. Row-Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_charge_runs ENABLE ROW LEVEL SECURITY;

-- service_agreements policies:
-- Staff, Finance, Admin can view operational details
DROP POLICY IF EXISTS "service_agreements_select" ON public.service_agreements;
CREATE POLICY "service_agreements_select" ON public.service_agreements
  FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_finance() OR public.is_admin());

DROP POLICY IF EXISTS "service_agreements_insert" ON public.service_agreements;
CREATE POLICY "service_agreements_insert" ON public.service_agreements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "service_agreements_update" ON public.service_agreements;
CREATE POLICY "service_agreements_update" ON public.service_agreements
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR 
    public.is_finance() OR 
    (public.is_staff() AND NOT public.is_finance() AND NOT public.is_admin())
  )
  WITH CHECK (
    public.is_admin() OR 
    public.is_finance() OR 
    (
      public.is_staff() AND NOT public.is_finance() AND NOT public.is_admin()
      AND client_id = (SELECT sa.client_id FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND system_id IS NOT DISTINCT FROM (SELECT sa.system_id FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND name = (SELECT sa.name FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND service_type = (SELECT sa.service_type FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND status = (SELECT sa.status FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND start_date = (SELECT sa.start_date FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND end_date IS NOT DISTINCT FROM (SELECT sa.end_date FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND renewal_date IS NOT DISTINCT FROM (SELECT sa.renewal_date FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND billing_cycle = (SELECT sa.billing_cycle FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND payment_timing = (SELECT sa.payment_timing FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND default_grace_days = (SELECT sa.default_grace_days FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
      AND notice_days = (SELECT sa.notice_days FROM public.service_agreements sa WHERE sa.id = service_agreements.id)
    )
  );

DROP POLICY IF EXISTS "service_agreements_delete" ON public.service_agreements;
CREATE POLICY "service_agreements_delete" ON public.service_agreements
  FOR DELETE TO authenticated
  USING (false);

-- agreement_resources policies:
DROP POLICY IF EXISTS "agreement_resources_select" ON public.agreement_resources;
CREATE POLICY "agreement_resources_select" ON public.agreement_resources
  FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_finance() OR public.is_admin());

DROP POLICY IF EXISTS "agreement_resources_insert" ON public.agreement_resources;
CREATE POLICY "agreement_resources_insert" ON public.agreement_resources
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "agreement_resources_update" ON public.agreement_resources;
CREATE POLICY "agreement_resources_update" ON public.agreement_resources
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_finance())
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "agreement_resources_delete" ON public.agreement_resources;
CREATE POLICY "agreement_resources_delete" ON public.agreement_resources
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_finance());

-- recurring_charges policies (Strict Anti-Leak: Finance and Admin ONLY):
DROP POLICY IF EXISTS "recurring_charges_select" ON public.recurring_charges;
CREATE POLICY "recurring_charges_select" ON public.recurring_charges
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "recurring_charges_insert" ON public.recurring_charges;
CREATE POLICY "recurring_charges_insert" ON public.recurring_charges
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "recurring_charges_update" ON public.recurring_charges;
CREATE POLICY "recurring_charges_update" ON public.recurring_charges
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_finance())
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "recurring_charges_delete" ON public.recurring_charges;
CREATE POLICY "recurring_charges_delete" ON public.recurring_charges
  FOR DELETE TO authenticated
  USING (false);

-- recurring_charge_runs policies (Finance and Admin ONLY):
DROP POLICY IF EXISTS "recurring_charge_runs_select" ON public.recurring_charge_runs;
CREATE POLICY "recurring_charge_runs_select" ON public.recurring_charge_runs
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "recurring_charge_runs_insert" ON public.recurring_charge_runs;
CREATE POLICY "recurring_charge_runs_insert" ON public.recurring_charge_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS "recurring_charge_runs_update" ON public.recurring_charge_runs;
CREATE POLICY "recurring_charge_runs_update" ON public.recurring_charge_runs
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "recurring_charge_runs_delete" ON public.recurring_charge_runs;
CREATE POLICY "recurring_charge_runs_delete" ON public.recurring_charge_runs
  FOR DELETE TO authenticated
  USING (false);

-- ----------------------------------------------------------------------------
-- 11. Explicit Privilege Grants & Privilege Hardening
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.service_agreements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agreement_resources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recurring_charges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recurring_charge_runs FROM PUBLIC, anon, authenticated;

-- authenticated: explicit DML only
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_agreements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agreement_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.recurring_charges TO authenticated;
GRANT SELECT, INSERT ON TABLE public.recurring_charge_runs TO authenticated;

-- service_role: full DML
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_agreements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agreement_resources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_charges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_charge_runs TO service_role;

-- Revoke TRUNCATE on all new tables for all roles
REVOKE TRUNCATE ON TABLE public.service_agreements FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.agreement_resources FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.recurring_charges FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.recurring_charge_runs FROM anon, authenticated, service_role;

-- Grant access to derived standing function and view
GRANT EXECUTE ON FUNCTION public.derive_agreement_billing_standing(UUID) TO authenticated, service_role;
GRANT SELECT ON public.staff_service_agreements_view TO authenticated, service_role;

COMMIT;
