-- ============================================================================
-- Migration 038: Agreements as contracts, billed per period
-- SCH Portal / Synergy Concepts Hub
--
-- An agreement now records the whole service contract (what a proposal such
-- as Elgon's "Managed System Care" contains), and is billed from itself:
--
--   1. Contract fields on service_agreements: scope included / not included,
--      support response targets, invoice timing (in advance / in arrears),
--      payment due days, proposal + acceptance (sent, accepted by, signed
--      PDF). New lifecycle states 'sent' and 'accepted' before 'active'.
--      Only Admin/Finance can change contract terms.
--   2. Packages become agreement templates: they carry the default scope,
--      response targets and an optional annual-commitment discount.
--   3. Discount lines (kind = 'discount', negative unit price) on package,
--      charge and invoice lines. Totals are still computed by the database.
--   4. agreement_charge_period(): the billing periods of a recurring charge,
--      anchored at its start date (calendar months for a 1st-of-month start).
--   5. bill_agreement_period(): one invoice per charge per period, built from
--      the charge's breakdown, optionally issued ('sent') in the same
--      transaction. The existing recurring_charge_runs unique key keeps it
--      idempotent.
--   6. agreement_period_record() for previews; invoice_service_record() now
--      also returns the agreement's targets and exclusions.
--   7. Private 'agreement-documents' bucket for signed agreements (PDF only).
--   8. Seed packages: Managed System Care (UGX) and Hosting Starter (USD).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Discount lines
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_package_items
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'charge';
ALTER TABLE public.recurring_charge_items
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'charge';
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'charge';

ALTER TABLE public.service_package_items DROP CONSTRAINT IF EXISTS service_package_items_unit_price_check;
ALTER TABLE public.service_package_items DROP CONSTRAINT IF EXISTS service_package_items_kind_price;
ALTER TABLE public.service_package_items ADD CONSTRAINT service_package_items_kind_price CHECK (
  (kind = 'charge' AND unit_price >= 0) OR (kind = 'discount' AND unit_price < 0)
);
ALTER TABLE public.recurring_charge_items DROP CONSTRAINT IF EXISTS recurring_charge_items_unit_price_check;
ALTER TABLE public.recurring_charge_items DROP CONSTRAINT IF EXISTS recurring_charge_items_kind_price;
ALTER TABLE public.recurring_charge_items ADD CONSTRAINT recurring_charge_items_kind_price CHECK (
  (kind = 'charge' AND unit_price >= 0) OR (kind = 'discount' AND unit_price < 0)
);
ALTER TABLE public.invoice_line_items DROP CONSTRAINT IF EXISTS line_items_values_valid;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT line_items_values_valid CHECK (
  quantity > 0 AND (
    (kind = 'charge' AND unit_price >= 0) OR (kind = 'discount' AND unit_price < 0)
  )
) NOT VALID;

-- ----------------------------------------------------------------------------
-- 2. Response targets (shared validator)
--    [{"priority":"critical","example":"…","target":"Within 2 business hours","hours":2}, …]
--    hours = business hours (Mon–Fri 08:00–17:00 EAT); null = no time target.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.valid_response_targets(p JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  e JSONB;
BEGIN
  IF p IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 8 THEN
    RETURN false;
  END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(e) <> 'object'
       OR NOT (e->>'priority' = ANY (ARRAY['critical', 'high', 'normal', 'change']))
       OR char_length(COALESCE(e->>'target', '')) NOT BETWEEN 1 AND 120
       OR char_length(COALESCE(e->>'example', '')) > 200
       OR (e ? 'hours' AND jsonb_typeof(e->'hours') NOT IN ('number', 'null'))
       OR (jsonb_typeof(e->'hours') = 'number' AND ((e->>'hours')::numeric <= 0 OR (e->>'hours')::numeric > 400)) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Packages as agreement templates
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS scope_included TEXT NULL,
  ADD COLUMN IF NOT EXISTS scope_excluded TEXT NULL,
  ADD COLUMN IF NOT EXISTS response_targets JSONB NULL,
  ADD COLUMN IF NOT EXISTS annual_discount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.service_packages DROP CONSTRAINT IF EXISTS service_packages_contract_valid;
ALTER TABLE public.service_packages ADD CONSTRAINT service_packages_contract_valid CHECK (
  annual_discount >= 0
  AND (scope_included IS NULL OR char_length(scope_included) <= 4000)
  AND (scope_excluded IS NULL OR char_length(scope_excluded) <= 4000)
  AND public.check_no_secrets_in_text(scope_included)
  AND public.check_no_secrets_in_text(scope_excluded)
  AND public.valid_response_targets(response_targets)
);

-- ----------------------------------------------------------------------------
-- 4. Agreements as contracts
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_agreements
  ADD COLUMN IF NOT EXISTS package_id UUID NULL REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_included TEXT NULL,
  ADD COLUMN IF NOT EXISTS scope_excluded TEXT NULL,
  ADD COLUMN IF NOT EXISTS response_targets JSONB NULL,
  ADD COLUMN IF NOT EXISTS invoice_timing TEXT NOT NULL DEFAULT 'in_arrears',
  ADD COLUMN IF NOT EXISTS payment_due_days INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS accepted_by_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS signed_document_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS signed_document_name TEXT NULL;

ALTER TABLE public.service_agreements DROP CONSTRAINT IF EXISTS service_agreements_status_check;
ALTER TABLE public.service_agreements ADD CONSTRAINT service_agreements_status_check CHECK (status IN (
  'draft', 'sent', 'accepted', 'active', 'suspended', 'reactivation_pending', 'ended', 'terminated'
));

ALTER TABLE public.service_agreements DROP CONSTRAINT IF EXISTS service_agreements_contract_valid;
ALTER TABLE public.service_agreements ADD CONSTRAINT service_agreements_contract_valid CHECK (
  invoice_timing IN ('in_advance', 'in_arrears')
  AND payment_due_days BETWEEN 0 AND 120
  AND (scope_included IS NULL OR char_length(scope_included) <= 4000)
  AND (scope_excluded IS NULL OR char_length(scope_excluded) <= 4000)
  AND public.check_no_secrets_in_text(scope_included)
  AND public.check_no_secrets_in_text(scope_excluded)
  AND public.valid_response_targets(response_targets)
  AND (accepted_by_name IS NULL OR char_length(trim(accepted_by_name)) BETWEEN 2 AND 120)
  AND (accepted_by_title IS NULL OR char_length(accepted_by_title) <= 120)
  AND (signed_document_name IS NULL OR char_length(signed_document_name) <= 200)
  AND (signed_document_path IS NULL OR signed_document_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,220}$')
);

-- Contract terms are commercial: only Admin/Finance may set or change them.
-- Acceptance needs a name and a time; a sent proposal records when.
CREATE OR REPLACE FUNCTION public.service_agreements_contract_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.package_id IS DISTINCT FROM OLD.package_id
    OR NEW.scope_included IS DISTINCT FROM OLD.scope_included
    OR NEW.scope_excluded IS DISTINCT FROM OLD.scope_excluded
    OR NEW.response_targets IS DISTINCT FROM OLD.response_targets
    OR NEW.invoice_timing IS DISTINCT FROM OLD.invoice_timing
    OR NEW.payment_due_days IS DISTINCT FROM OLD.payment_due_days
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.accepted_by_name IS DISTINCT FROM OLD.accepted_by_name
    OR NEW.accepted_by_title IS DISTINCT FROM OLD.accepted_by_title
    OR NEW.signed_document_path IS DISTINCT FROM OLD.signed_document_path
    OR NEW.signed_document_name IS DISTINCT FROM OLD.signed_document_name
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('draft', 'sent', 'accepted'))
  ) AND NOT public.can_access_finance() AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Only Admin or Finance can change agreement terms' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  IF NEW.status = 'accepted' AND (NEW.accepted_at IS NULL OR NEW.accepted_by_name IS NULL) THEN
    RAISE EXCEPTION 'Record who accepted the agreement and when' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.accepted_at IS NOT NULL AND NEW.accepted_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Acceptance time cannot be in the future' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.signed_document_path IS NOT NULL AND split_part(NEW.signed_document_path, '/', 1) <> NEW.id::text THEN
    RAISE EXCEPTION 'Signed document must be stored under this agreement' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_agreements_contract_guard ON public.service_agreements;
CREATE TRIGGER trg_service_agreements_contract_guard
  BEFORE INSERT OR UPDATE ON public.service_agreements
  FOR EACH ROW EXECUTE FUNCTION public.service_agreements_contract_guard();

-- A proposal (sent/accepted, not yet active) has no billing standing yet.
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

  IF v_status = 'draft' THEN
    RETURN 'DRAFT';
  ELSIF v_status IN ('sent', 'accepted') THEN
    RETURN 'PROPOSAL';
  ELSIF v_status = 'suspended' THEN
    RETURN 'SUSPENDED';
  ELSIF v_status IN ('ended', 'terminated') THEN
    RETURN 'TERMINATED';
  END IF;

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

-- Staff-safe view: append the (price-free) contract fields.
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
  sa.updated_at,
  sa.contract_reference,
  sa.scope_included,
  sa.scope_excluded,
  sa.response_targets,
  sa.invoice_timing,
  sa.payment_due_days,
  sa.sent_at,
  sa.accepted_at,
  sa.accepted_by_name,
  sa.accepted_by_title,
  (sa.signed_document_path IS NOT NULL) AS has_signed_document
FROM public.service_agreements sa;

-- ----------------------------------------------------------------------------
-- 5. Breakdown RPCs: carry the line kind (a negative price is a discount)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_service_package_items(p_package_id UUID, p_items JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(14, 2);
BEGIN
  IF NOT public.can_access_finance() THEN
    RAISE EXCEPTION 'Admin or Finance access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A package needs at least one line' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.service_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found' USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.service_package_items WHERE package_id = p_package_id;
  INSERT INTO public.service_package_items (package_id, section, description, detail, quantity, unit, unit_price, kind, position)
  SELECT p_package_id,
         NULLIF(trim(e->>'section'), ''),
         trim(e->>'description'),
         NULLIF(trim(e->>'detail'), ''),
         COALESCE((e->>'quantity')::numeric, 1),
         NULLIF(trim(e->>'unit'), ''),
         COALESCE((e->>'unit_price')::numeric, 0),
         CASE WHEN COALESCE((e->>'unit_price')::numeric, 0) < 0 THEN 'discount' ELSE 'charge' END,
         (ord - 1)::int
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord);

  SELECT COALESCE(SUM(ROUND(quantity * unit_price, 2)), 0) INTO v_total
  FROM public.service_package_items WHERE package_id = p_package_id;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'Discounts cannot exceed the package total' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.service_packages SET updated_at = now() WHERE id = p_package_id;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_recurring_charge_items(
  p_charge_id UUID, p_items JSONB, p_package_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC(14, 2);
  v_currency TEXT;
  v_total NUMERIC(14, 2);
  v_pkg_currency TEXT;
BEGIN
  IF NOT public.can_access_finance() THEN
    RAISE EXCEPTION 'Admin or Finance access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT amount, currency INTO v_amount, v_currency
  FROM public.recurring_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring charge not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_package_id IS NOT NULL THEN
    SELECT currency INTO v_pkg_currency FROM public.service_packages WHERE id = p_package_id;
    IF v_pkg_currency IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION 'Package currency must match the charge currency' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  DELETE FROM public.recurring_charge_items WHERE recurring_charge_id = p_charge_id;

  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.recurring_charge_items (recurring_charge_id, section, description, detail, quantity, unit, unit_price, kind, position)
    SELECT p_charge_id,
           NULLIF(trim(e->>'section'), ''),
           trim(e->>'description'),
           NULLIF(trim(e->>'detail'), ''),
           COALESCE((e->>'quantity')::numeric, 1),
           NULLIF(trim(e->>'unit'), ''),
           COALESCE((e->>'unit_price')::numeric, 0),
           CASE WHEN COALESCE((e->>'unit_price')::numeric, 0) < 0 THEN 'discount' ELSE 'charge' END,
           (ord - 1)::int
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord);

    SELECT COALESCE(SUM(ROUND(quantity * unit_price, 2)), 0) INTO v_total
    FROM public.recurring_charge_items WHERE recurring_charge_id = p_charge_id;
    IF v_total <> v_amount THEN
      RAISE EXCEPTION 'Breakdown totals % but the charge is % %', v_total, v_currency, v_amount
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_total := 0;
  END IF;

  UPDATE public.recurring_charges
     SET package_id = p_package_id, updated_at = now()
   WHERE id = p_charge_id;
  RETURN v_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Billing periods
--    Period n of a charge = [start + n·k months, start + (n+1)·k months − 1 day],
--    cut at the charge's end date. k = 1 / 3 / 6 / 12 by billing cycle.
--    Month arithmetic is always from the start date (Jan 31 → Feb 28 → Mar 31).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_cycle_months(p_cycle TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_cycle WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'semi_annual' THEN 6 WHEN 'annual' THEN 12 END
$$;

CREATE OR REPLACE FUNCTION public.agreement_charge_period(p_charge_id UUID, p_period_start DATE)
RETURNS TABLE (period_start DATE, period_end DATE)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  ch public.recurring_charges%ROWTYPE;
  k INTEGER;
  months INTEGER;
  n INTEGER;
  v_end DATE;
BEGIN
  SELECT * INTO ch FROM public.recurring_charges WHERE id = p_charge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring charge not found' USING ERRCODE = 'no_data_found';
  END IF;
  k := public.billing_cycle_months(ch.billing_cycle);
  IF k IS NULL THEN
    RAISE EXCEPTION 'Custom billing cycles are invoiced manually' USING ERRCODE = 'check_violation';
  END IF;
  months := (EXTRACT(YEAR FROM p_period_start)::int - EXTRACT(YEAR FROM ch.start_date)::int) * 12
          + (EXTRACT(MONTH FROM p_period_start)::int - EXTRACT(MONTH FROM ch.start_date)::int);
  IF months < 0 OR months % k <> 0 THEN
    RAISE EXCEPTION '% is not the start of a billing period', p_period_start USING ERRCODE = 'check_violation';
  END IF;
  n := months / k;
  IF (ch.start_date + make_interval(months => n * k))::date <> p_period_start THEN
    RAISE EXCEPTION '% is not the start of a billing period', p_period_start USING ERRCODE = 'check_violation';
  END IF;
  IF ch.end_date IS NOT NULL AND p_period_start > ch.end_date THEN
    RAISE EXCEPTION 'The charge ended on %', ch.end_date USING ERRCODE = 'check_violation';
  END IF;
  v_end := (ch.start_date + make_interval(months => (n + 1) * k))::date - 1;
  IF ch.end_date IS NOT NULL AND ch.end_date < v_end THEN
    v_end := ch.end_date;
  END IF;
  period_start := p_period_start;
  period_end := v_end;
  RETURN NEXT;
END;
$$;

-- One invoice for one period of one recurring charge, from its breakdown.
-- p_send issues it immediately (status 'sent') in the same transaction.
CREATE OR REPLACE FUNCTION public.bill_agreement_period(
  p_charge_id UUID,
  p_period_start DATE,
  p_send BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ch public.recurring_charges%ROWTYPE;
  agr public.service_agreements%ROWTYPE;
  v_start DATE;
  v_end DATE;
  v_existing TEXT;
  v_invoice UUID;
  v_total NUMERIC;
BEGIN
  IF NOT public.can_access_finance() THEN
    RAISE EXCEPTION 'Admin or Finance access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO ch FROM public.recurring_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring charge not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO agr FROM public.service_agreements WHERE id = ch.agreement_id;
  IF agr.status NOT IN ('active', 'reactivation_pending') THEN
    RAISE EXCEPTION 'The agreement is %; only an active agreement is billed', agr.status USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ch.active THEN
    RAISE EXCEPTION 'This charge is inactive' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.period_start, p.period_end INTO v_start, v_end
  FROM public.agreement_charge_period(p_charge_id, p_period_start) p;

  IF v_start > current_date + 45 THEN
    RAISE EXCEPTION 'That period is too far ahead to invoice' USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.invoice_number INTO v_existing
  FROM public.recurring_charge_runs r JOIN public.invoices i ON i.id = r.invoice_id
  WHERE r.recurring_charge_id = p_charge_id AND r.period_start = v_start AND r.period_end = v_end;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This period is already invoiced (%)', v_existing USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.invoices (client_id, agreement_id, recurring_charge_id, currency, status, issue_date, due_date,
                               document_style, service_period_start, service_period_end, notes)
  VALUES (agr.client_id, agr.id, ch.id, ch.currency, 'draft', current_date, current_date + agr.payment_due_days,
          'service', v_start, v_end,
          'Billed under ' || agr.name || COALESCE(' (' || agr.contract_reference || ')', '') || '.')
  RETURNING id INTO v_invoice;

  IF EXISTS (SELECT 1 FROM public.recurring_charge_items WHERE recurring_charge_id = ch.id) THEN
    INSERT INTO public.invoice_line_items (invoice_id, section, description, detail, quantity, unit, unit_price, kind,
                                           period_start, period_end, position)
    SELECT v_invoice, i.section, i.description, i.detail, i.quantity, i.unit, i.unit_price, i.kind,
           v_start, v_end, i.position
    FROM public.recurring_charge_items i
    WHERE i.recurring_charge_id = ch.id;
  ELSE
    INSERT INTO public.invoice_line_items (invoice_id, section, description, detail, quantity, unit, unit_price,
                                           period_start, period_end, position)
    VALUES (v_invoice, NULL, ch.name, ch.description, 1, NULL, ch.amount, v_start, v_end, 0);
  END IF;

  SELECT total INTO v_total FROM public.invoices WHERE id = v_invoice;
  IF v_total <> ch.amount THEN
    RAISE EXCEPTION 'Invoice total % does not match the charge %', v_total, ch.amount USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.recurring_charge_runs (recurring_charge_id, period_start, period_end, invoice_id, status)
  VALUES (ch.id, v_start, v_end, v_invoice, 'generated');

  IF p_send THEN
    UPDATE public.invoices SET status = 'sent' WHERE id = v_invoice;
  END IF;

  RETURN v_invoice;
END;
$$;

-- One step from a package (or a custom amount) to a billable agreement:
-- the agreement with the package's scope and targets, its recurring charge
-- and the charge's breakdown. Annual plan = each line × 12 (monthly units
-- become "months") less the package's annual-commitment discount.
CREATE OR REPLACE FUNCTION public.create_agreement_from_package(
  p_client_id UUID,
  p_name TEXT,
  p_start_date DATE,
  p_plan TEXT DEFAULT 'monthly',
  p_package_id UUID DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_system_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_invoice_timing TEXT DEFAULT 'in_arrears',
  p_payment_due_days INTEGER DEFAULT 14,
  p_contract_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  pkg public.service_packages%ROWTYPE;
  v_agreement UUID;
  v_charge UUID;
  v_mult INTEGER;
  v_items JSONB := '[]'::jsonb;
  v_amount NUMERIC(14, 2);
  v_currency TEXT;
BEGIN
  IF NOT public.can_access_finance() THEN
    RAISE EXCEPTION 'Admin or Finance access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_plan NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Plan must be monthly or annual' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'A new agreement starts as a draft or active' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client_id AND role = 'client') THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'no_data_found';
  END IF;
  v_mult := CASE p_plan WHEN 'annual' THEN 12 ELSE 1 END;

  IF p_package_id IS NOT NULL THEN
    SELECT * INTO pkg FROM public.service_packages WHERE id = p_package_id AND archived_at IS NULL;
    IF NOT FOUND OR pkg.kind <> 'recurring' THEN
      RAISE EXCEPTION 'Monthly package not found' USING ERRCODE = 'no_data_found';
    END IF;
    v_currency := pkg.currency;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'section', i.section, 'description', i.description, 'detail', i.detail,
             'quantity', CASE WHEN i.kind = 'discount' THEN i.quantity ELSE i.quantity * v_mult END,
             'unit', CASE WHEN v_mult > 1 AND i.kind = 'charge' AND lower(i.unit) = 'month' THEN 'months' ELSE i.unit END,
             'unit_price', i.unit_price) ORDER BY i.position), '[]'::jsonb)
      INTO v_items
      FROM public.service_package_items i WHERE i.package_id = pkg.id;
    IF v_mult > 1 AND pkg.annual_discount > 0 THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'description', 'Annual commitment discount', 'quantity', 1, 'unit_price', -pkg.annual_discount));
    END IF;
    SELECT COALESCE(SUM(ROUND((e->>'quantity')::numeric * (e->>'unit_price')::numeric, 2)), 0)
      INTO v_amount FROM jsonb_array_elements(v_items) e;
  ELSE
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RAISE EXCEPTION 'Enter the amount per period' USING ERRCODE = 'check_violation';
    END IF;
    v_amount := p_amount;
    v_currency := COALESCE(p_currency, 'UGX');
  END IF;

  INSERT INTO public.service_agreements (
    client_id, system_id, name, service_type, status, start_date, billing_cycle, payment_timing,
    contract_reference, package_id, scope_included, scope_excluded, response_targets,
    invoice_timing, payment_due_days)
  VALUES (
    p_client_id, p_system_id, trim(p_name),
    CASE WHEN p_package_id IS NULL THEN 'custom' ELSE 'managed_service' END,
    p_status, p_start_date, p_plan,
    CASE p_invoice_timing WHEN 'in_advance' THEN 'advance' ELSE 'month_end' END,
    NULLIF(trim(COALESCE(p_contract_reference, '')), ''), p_package_id,
    pkg.scope_included, pkg.scope_excluded, pkg.response_targets,
    p_invoice_timing, p_payment_due_days)
  RETURNING id INTO v_agreement;

  INSERT INTO public.recurring_charges (agreement_id, name, description, amount, currency, billing_cycle,
                                        payment_timing, start_date, package_id)
  VALUES (v_agreement, trim(p_name), pkg.description, v_amount, v_currency, p_plan,
          CASE p_invoice_timing WHEN 'in_advance' THEN 'advance' ELSE 'month_end' END, p_start_date, p_package_id)
  RETURNING id INTO v_charge;

  IF jsonb_array_length(v_items) > 0 THEN
    PERFORM public.replace_recurring_charge_items(v_charge, v_items, p_package_id);
  END IF;
  RETURN v_agreement;
END;
$$;
REVOKE ALL ON FUNCTION public.create_agreement_from_package(UUID, TEXT, DATE, TEXT, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_agreement_from_package(UUID, TEXT, DATE, TEXT, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. What a service invoice prints besides its lines
-- ----------------------------------------------------------------------------
-- Internal: the agreement's support, incident and backup records of a period.
CREATE OR REPLACE FUNCTION public._agreement_period_record(p_agreement_id UUID, p_start DATE, p_end DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agr public.service_agreements%ROWTYPE;
  v_requests JSONB;
  v_incidents JSONB;
  v_backups JSONB;
BEGIN
  SELECT * INTO agr FROM public.service_agreements WHERE id = p_agreement_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Covered work for this client in the period (Kampala days, UTC+3).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'reference', r.reference, 'summary', r.summary, 'work_done', r.work_done,
           'priority', r.priority, 'billing', r.billing, 'status', r.status, 'channel', r.channel,
           'requested_at', r.requested_at, 'first_response_at', r.first_response_at,
           'resolved_at', r.resolved_at) ORDER BY r.requested_at), '[]'::jsonb)
    INTO v_requests
    FROM public.support_requests r
   WHERE r.client_id = agr.client_id
     AND r.billing = 'covered'
     AND (r.service_agreement_id IS NULL OR r.service_agreement_id = agr.id)
     AND ((r.requested_at AT TIME ZONE 'UTC') + interval '3 hours')::date BETWEEN p_start AND p_end;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('severity', i.severity, 'opened_at', i.opened_at)), '[]'::jsonb)
    INTO v_incidents
    FROM public.incidents i
   WHERE (i.service_agreement_id = agr.id OR (agr.system_id IS NOT NULL AND i.system_id = agr.system_id))
     AND i.status <> 'cancelled'
     AND ((i.opened_at AT TIME ZONE 'UTC') + interval '3 hours')::date BETWEEN p_start AND p_end;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', b.status)), '[]'::jsonb)
    INTO v_backups
    FROM public.backup_events b
   WHERE (b.service_agreement_id = agr.id OR (agr.system_id IS NOT NULL AND b.system_id = agr.system_id))
     AND ((COALESCE(b.completed_at, b.started_at, b.created_at) AT TIME ZONE 'UTC') + interval '3 hours')::date
         BETWEEN p_start AND p_end;

  RETURN jsonb_build_object(
    'agreement', jsonb_build_object(
      'name', agr.name, 'contract_reference', agr.contract_reference, 'billing_cycle', agr.billing_cycle,
      'response_targets', agr.response_targets, 'scope_excluded', agr.scope_excluded),
    'requests', v_requests,
    'incidents', v_incidents,
    'backups', v_backups
  );
END;
$$;
REVOKE ALL ON FUNCTION public._agreement_period_record(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;

-- Preview of a period before it is invoiced: Admin/Finance only.
CREATE OR REPLACE FUNCTION public.agreement_period_record(p_agreement_id UUID, p_start DATE, p_end DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_finance() THEN
    RAISE EXCEPTION 'Admin or Finance access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._agreement_period_record(p_agreement_id, p_start, p_end);
END;
$$;
REVOKE ALL ON FUNCTION public.agreement_period_record(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agreement_period_record(UUID, DATE, DATE) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invoice_service_record(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  v_requests JSONB;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT (public.can_access_finance() OR (inv.client_id = auth.uid() AND inv.status <> 'draft')) THEN
    RETURN NULL;
  END IF;

  IF inv.agreement_id IS NOT NULL AND inv.service_period_start IS NOT NULL AND inv.service_period_end IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.service_agreements WHERE id = inv.agreement_id) THEN
    RETURN public._agreement_period_record(inv.agreement_id, inv.service_period_start, inv.service_period_end);
  END IF;

  -- Work billed on this invoice (one-off jobs).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'reference', r.reference, 'summary', r.summary, 'work_done', r.work_done,
           'priority', r.priority, 'billing', r.billing, 'status', r.status,
           'requested_at', r.requested_at, 'first_response_at', r.first_response_at,
           'resolved_at', r.resolved_at, 'quote_agreed_at', r.quote_agreed_at,
           'channel', r.channel) ORDER BY r.requested_at), '[]'::jsonb)
    INTO v_requests
    FROM public.support_requests r
   WHERE r.invoice_id = inv.id;

  RETURN jsonb_build_object('agreement', NULL, 'requests', v_requests, 'incidents', NULL, 'backups', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_service_record(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_service_record(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.agreement_charge_period(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agreement_charge_period(UUID, DATE) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bill_agreement_period(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bill_agreement_period(UUID, DATE, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.valid_response_targets(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_cycle_months(TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Signed agreements: private bucket, PDF only, 10 MB. Accessed only
--    through server actions that check the caller (service role + signed URL).
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('agreement-documents', 'agreement-documents', false, 10485760, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf']::text[];

-- ----------------------------------------------------------------------------
-- 9. Seed packages (only when a package of that name does not exist yet)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.service_packages WHERE lower(name) = 'managed system care') THEN
    INSERT INTO public.service_packages (name, kind, currency, billing_cycle, description,
                                         scope_included, scope_excluded, response_targets, annual_discount)
    VALUES (
      'Managed System Care', 'recurring', 'UGX', 'monthly',
      'Ongoing maintenance, managed hosting and operational support for a business system Synergy built.',
      E'Maintenance of the existing system functionality\nTechnical support relating to the existing system\nManaged database and application hosting\nRoutine database administration\nBackup administration and recovery assistance\nTechnical troubleshooting for users\nRoutine monitoring and preventive technical maintenance\nDeployment support for maintenance releases',
      E'New modules or major new functionality\nNew integrations with third-party systems\nMajor changes to existing business processes\nNew reports or dashboards requiring substantial development\nMajor user-interface redesigns\nLarge-scale data migration, cleansing or restructuring\nHardware, computers, printers, local networks or internet connectivity\nThird-party services or subscriptions outside the managed infrastructure\nTraining programmes for large groups of new staff\nWork resulting from unauthorised modification of the system\nOn-site visits, unless specifically agreed',
      '[{"priority":"critical","example":"System unavailable or major business function stopped","target":"Within 2 business hours","hours":2},
        {"priority":"high","example":"Significant function impaired but system partially usable","target":"Within 4 business hours","hours":4},
        {"priority":"normal","example":"Minor defect, user issue or non-critical technical problem","target":"Within 1 business day","hours":9},
        {"priority":"change","example":"New feature or material change to the system","target":"Assessment and quotation","hours":null}]'::jsonb,
      1700000
    ) RETURNING id INTO v_id;

    INSERT INTO public.service_package_items (package_id, section, description, detail, quantity, unit, unit_price, position) VALUES
      (v_id, 'Managed System Maintenance & Operational Support', 'Routine health checks & preventive maintenance', 'Weekly system health review, error-log review, routine technical updates.', 4, 'checks', 50000, 0),
      (v_id, 'Managed System Maintenance & Operational Support', 'Database maintenance & technical administration', 'Integrity checks, storage housekeeping, query performance review.', 1, 'month', 150000, 1),
      (v_id, 'Managed System Maintenance & Operational Support', 'Defect correction & performance investigation', 'Investigation and correction of defects affecting existing functionality.', 1, 'month', 150000, 2),
      (v_id, 'Managed System Maintenance & Operational Support', 'Remote technical support — users', 'User and access troubleshooting; incident response per agreed targets.', 1, 'month', 150000, 3),
      (v_id, 'Managed System Maintenance & Operational Support', 'Maintenance releases & deployment support', NULL, 1, 'month', 100000, 4),
      (v_id, 'Managed Hosting & Database Infrastructure', 'Production application hosting', 'Application runtime, deployment environment and configuration management.', 1, 'month', 90000, 5),
      (v_id, 'Managed Hosting & Database Infrastructure', 'Production database hosting', NULL, 1, 'month', 80000, 6),
      (v_id, 'Managed Hosting & Database Infrastructure', 'Daily database backups & backup administration', 'Automated daily backups, retention management and restore readiness.', 1, 'month', 31000, 7),
      (v_id, 'Managed Hosting & Database Infrastructure', 'Resource monitoring & recovery assistance', 'Uptime checks, hosting and database resource monitoring, alerting.', 1, 'month', 49000, 8);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.service_packages WHERE lower(name) = 'hosting starter') THEN
    INSERT INTO public.service_packages (name, kind, currency, billing_cycle, description,
                                         scope_included, scope_excluded, response_targets, annual_discount)
    VALUES (
      'Hosting Starter', 'recurring', 'USD', 'monthly',
      'Managed hosting for a website or small web application.',
      E'Application hosting and deployment environment\nDatabase hosting with daily backups\nUptime monitoring and SSL certificate management\nInfrastructure troubleshooting',
      E'Development, new features or content changes — quoted per job\nThird-party subscriptions and domains unless agreed\nOn-site visits',
      '[{"priority":"critical","example":"Site or application down","target":"Within 4 business hours","hours":4},
        {"priority":"normal","example":"Non-critical hosting issue","target":"Within 1 business day","hours":9}]'::jsonb,
      0
    ) RETURNING id INTO v_id;

    INSERT INTO public.service_package_items (package_id, section, description, detail, quantity, unit, unit_price, position) VALUES
      (v_id, NULL, 'Application hosting', 'Runtime, deployment environment and SSL.', 1, 'month', 18, 0),
      (v_id, NULL, 'Database hosting & daily backups', NULL, 1, 'month', 8, 1),
      (v_id, NULL, 'Uptime monitoring', 'Checks every few minutes with alerting.', 1, 'month', 4, 2);
  END IF;
END;
$$;

COMMIT;
