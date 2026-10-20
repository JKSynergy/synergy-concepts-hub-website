-- ============================================================================
-- Migration 037: Itemised service billing
-- SCH Portal / Synergy Concepts Hub
--
-- Introduces:
--   1. service_packages + service_package_items
--        Reusable price breakdowns. kind = 'recurring' (a standard monthly fee
--        split into its parts) or 'per_request' (a rate card used to price
--        one-off maintenance work).
--   2. recurring_charge_items (+ recurring_charges.package_id)
--        The breakdown actually billed for one client's recurring charge.
--        Copied from a package, then editable per client. Its total must equal
--        the charge amount, so the standard fee never drifts.
--   3. Presentation fields on invoice_line_items (section, detail, unit,
--        service period, position) and on invoices (document_style, service
--        period). Totals are still computed only by the database (010).
--   4. support_requests + support_request_items
--        Every time a client contacts SCH: priority, channel, response times,
--        work done. 'covered' requests feed the service record of a managed
--        client's invoice; 'chargeable' requests are quoted per job, the
--        client's agreement to the quote is recorded (quote_agreed_at), and
--        each finished job is invoiced.
--   5. RPCs (single transaction each):
--        replace_service_package_items, replace_recurring_charge_items,
--        replace_support_request_items, invoice_support_requests,
--        invoice_service_record (what an itemised invoice PDF prints)
--   6. RLS: prices are Admin/Finance only. Operational staff may log and work
--        support requests but never see their prices.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Packages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 120),
  kind TEXT NOT NULL DEFAULT 'recurring' CHECK (kind IN ('recurring', 'per_request')),
  currency VARCHAR(3) NOT NULL DEFAULT 'UGX' CHECK (currency IN ('UGX', 'USD')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN (
    'monthly', 'quarterly', 'semi_annual', 'annual', 'custom'
  )),
  description TEXT NULL CHECK (public.check_no_secrets_in_text(description)),
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shared shape of a breakdown line (package, recurring charge, support request).
-- Kept as plain columns on each table; validated identically below.
CREATE TABLE IF NOT EXISTS public.service_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  section TEXT NULL CHECK (section IS NULL OR char_length(trim(section)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 2 AND char_length(description) <= 200),
  detail TEXT NULL CHECK (detail IS NULL OR char_length(detail) <= 400),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NULL CHECK (unit IS NULL OR char_length(unit) <= 24),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Recurring charge breakdown
-- ----------------------------------------------------------------------------
ALTER TABLE public.recurring_charges
  ADD COLUMN IF NOT EXISTS package_id UUID NULL REFERENCES public.service_packages(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.recurring_charge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_charge_id UUID NOT NULL REFERENCES public.recurring_charges(id) ON DELETE CASCADE,
  section TEXT NULL CHECK (section IS NULL OR char_length(trim(section)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 2 AND char_length(description) <= 200),
  detail TEXT NULL CHECK (detail IS NULL OR char_length(detail) <= 400),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NULL CHECK (unit IS NULL OR char_length(unit) <= 24),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Invoice presentation fields
-- ----------------------------------------------------------------------------
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS section TEXT NULL CHECK (section IS NULL OR char_length(section) <= 160),
  ADD COLUMN IF NOT EXISTS detail TEXT NULL CHECK (detail IS NULL OR char_length(detail) <= 400),
  ADD COLUMN IF NOT EXISTS unit TEXT NULL CHECK (unit IS NULL OR char_length(unit) <= 24),
  ADD COLUMN IF NOT EXISTS period_start DATE NULL,
  ADD COLUMN IF NOT EXISTS period_end DATE NULL,
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_line_items
  DROP CONSTRAINT IF EXISTS line_items_period_valid;
ALTER TABLE public.invoice_line_items
  ADD CONSTRAINT line_items_period_valid
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_style TEXT NOT NULL DEFAULT 'standard'
    CHECK (document_style IN ('standard', 'service')),
  ADD COLUMN IF NOT EXISTS service_period_start DATE NULL,
  ADD COLUMN IF NOT EXISTS service_period_end DATE NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_service_period_valid;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_service_period_valid
  CHECK (service_period_end IS NULL OR service_period_start IS NULL OR service_period_end >= service_period_start);

-- ----------------------------------------------------------------------------
-- 4. Support requests
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.support_request_seq;

CREATE TABLE IF NOT EXISTS public.support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  service_agreement_id UUID NULL REFERENCES public.service_agreements(id) ON DELETE SET NULL,
  rate_package_id UUID NULL REFERENCES public.service_packages(id) ON DELETE SET NULL,
  summary TEXT NOT NULL CHECK (
    char_length(trim(summary)) >= 3 AND char_length(summary) <= 300
    AND public.check_no_secrets_in_text(summary)
  ),
  work_done TEXT NULL CHECK (
    (work_done IS NULL OR char_length(work_done) <= 4000)
    AND public.check_no_secrets_in_text(work_done)
  ),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'change')),
  channel TEXT NOT NULL DEFAULT 'phone' CHECK (channel IN (
    'phone', 'whatsapp', 'email', 'portal', 'on_site', 'other'
  )),
  billing TEXT NOT NULL DEFAULT 'chargeable' CHECK (billing IN ('covered', 'chargeable', 'no_charge')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'resolved', 'invoiced', 'cancelled'
  )),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  -- When the client agreed the quoted price (chargeable work). Cleared
  -- whenever the quote is changed, so it always refers to the current quote.
  quote_agreed_at TIMESTAMPTZ NULL,
  invoice_id UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  recorded_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_support_response_order CHECK (first_response_at IS NULL OR first_response_at >= requested_at),
  CONSTRAINT chk_support_resolved_order CHECK (resolved_at IS NULL OR resolved_at >= requested_at),
  CONSTRAINT chk_support_resolved_has_time CHECK (status NOT IN ('resolved', 'invoiced') OR resolved_at IS NOT NULL),
  CONSTRAINT chk_support_quote_order CHECK (quote_agreed_at IS NULL OR quote_agreed_at >= requested_at)
);

CREATE TABLE IF NOT EXISTS public.support_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  support_request_id UUID NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
  section TEXT NULL CHECK (section IS NULL OR char_length(trim(section)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 2 AND char_length(description) <= 200),
  detail TEXT NULL CHECK (detail IS NULL OR char_length(detail) <= 400),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NULL CHECK (unit IS NULL OR char_length(unit) <= 24),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_service_package_items_package ON public.service_package_items(package_id, position);
CREATE INDEX IF NOT EXISTS idx_recurring_charge_items_charge ON public.recurring_charge_items(recurring_charge_id, position);
CREATE INDEX IF NOT EXISTS idx_recurring_charges_package ON public.recurring_charges(package_id);
CREATE INDEX IF NOT EXISTS idx_support_requests_client ON public.support_requests(client_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_system ON public.support_requests(system_id);
CREATE INDEX IF NOT EXISTS idx_support_requests_agreement ON public.support_requests(service_agreement_id);
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON public.support_requests(status);
CREATE INDEX IF NOT EXISTS idx_support_requests_invoice ON public.support_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_support_request_items_request ON public.support_request_items(support_request_id, position);

-- ----------------------------------------------------------------------------
-- 6. Triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_service_packages_updated_at ON public.service_packages;
CREATE TRIGGER trg_service_packages_updated_at
  BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_support_requests_updated_at ON public.support_requests;
CREATE TRIGGER trg_support_requests_updated_at
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reference SR-YYYY-0001 assigned on insert; never changes. Client, system,
-- agreement and invoice must all belong to the same client.
CREATE OR REPLACE FUNCTION public.support_requests_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reference := 'SR-' || to_char(COALESCE(NEW.requested_at, now()), 'YYYY') || '-'
      || lpad(nextval('public.support_request_seq')::text, 4, '0');
    IF NEW.recorded_by IS NULL THEN
      NEW.recorded_by := auth.uid();
    END IF;
  ELSE
    IF NEW.reference IS DISTINCT FROM OLD.reference THEN
      RAISE EXCEPTION 'Support request reference cannot change' USING ERRCODE = 'check_violation';
    END IF;
    -- Its draft invoice was deleted (FK set invoice_id to NULL): the work is
    -- billable again.
    IF OLD.status = 'invoiced' AND OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = OLD.invoice_id) THEN
      NEW.status := 'resolved';
    ELSIF OLD.status = 'invoiced' AND (
         NEW.status IS DISTINCT FROM OLD.status
      OR NEW.billing IS DISTINCT FROM OLD.billing
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    ) AND OLD.invoice_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.invoices WHERE id = OLD.invoice_id) THEN
      RAISE EXCEPTION 'An invoiced support request cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Quote agreement is a pricing decision: Admin/Finance only, and only on
  -- chargeable work that has a quote.
  IF (TG_OP = 'INSERT' AND NEW.quote_agreed_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.quote_agreed_at IS DISTINCT FROM OLD.quote_agreed_at) THEN
    IF NOT public.can_access_finance() THEN
      RAISE EXCEPTION 'Only Admin or Finance can record quote agreement' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.quote_agreed_at IS NOT NULL AND (
         NEW.billing <> 'chargeable'
      OR NOT EXISTS (SELECT 1 FROM public.support_request_items WHERE support_request_id = NEW.id)
    ) THEN
      RAISE EXCEPTION 'Only a chargeable request with a quote can be agreed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.billing <> 'chargeable' THEN
    NEW.quote_agreed_at := NULL;
  END IF;

  IF NEW.status = 'invoiced' AND NEW.invoice_id IS NULL AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'A request is invoiced only by creating its invoice' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_owner FROM public.systems WHERE id = NEW.system_id;
    IF v_owner IS NOT NULL AND v_owner <> NEW.client_id THEN
      RAISE EXCEPTION 'Support request system must belong to the client' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.service_agreement_id IS NOT NULL THEN
    SELECT client_id INTO v_owner FROM public.service_agreements WHERE id = NEW.service_agreement_id;
    IF v_owner IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'Support request agreement must belong to the client' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT client_id INTO v_owner FROM public.invoices WHERE id = NEW.invoice_id;
    IF v_owner IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'Support request invoice must belong to the client' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_requests_guard ON public.support_requests;
CREATE TRIGGER trg_support_requests_guard
  BEFORE INSERT OR UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.support_requests_guard();

-- Priced work of an invoiced request is frozen.
CREATE OR REPLACE FUNCTION public.support_request_items_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.support_request_id ELSE NEW.support_request_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.support_requests WHERE id = v_request AND status = 'invoiced') THEN
    RAISE EXCEPTION 'Charges of an invoiced support request cannot change' USING ERRCODE = 'check_violation';
  END IF;
  -- Any change to the quote withdraws the client's agreement to it.
  UPDATE public.support_requests SET quote_agreed_at = NULL
   WHERE id = v_request AND quote_agreed_at IS NOT NULL;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_request_items_guard ON public.support_request_items;
CREATE TRIGGER trg_support_request_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.support_request_items
  FOR EACH ROW EXECUTE FUNCTION public.support_request_items_guard();

-- ----------------------------------------------------------------------------
-- 7. RPCs
-- ----------------------------------------------------------------------------
-- Items JSON: [{section, description, detail, quantity, unit, unit_price}, ...]
-- Order in the array becomes position.

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
  INSERT INTO public.service_package_items (package_id, section, description, detail, quantity, unit, unit_price, position)
  SELECT p_package_id,
         NULLIF(trim(e->>'section'), ''),
         trim(e->>'description'),
         NULLIF(trim(e->>'detail'), ''),
         COALESCE((e->>'quantity')::numeric, 1),
         NULLIF(trim(e->>'unit'), ''),
         COALESCE((e->>'unit_price')::numeric, 0),
         (ord - 1)::int
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord);

  SELECT COALESCE(SUM(ROUND(quantity * unit_price, 2)), 0) INTO v_total
  FROM public.service_package_items WHERE package_id = p_package_id;
  UPDATE public.service_packages SET updated_at = now() WHERE id = p_package_id;
  RETURN v_total;
END;
$$;

-- The breakdown of a client's recurring charge must add up to the charge amount.
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
    INSERT INTO public.recurring_charge_items (recurring_charge_id, section, description, detail, quantity, unit, unit_price, position)
    SELECT p_charge_id,
           NULLIF(trim(e->>'section'), ''),
           trim(e->>'description'),
           NULLIF(trim(e->>'detail'), ''),
           COALESCE((e->>'quantity')::numeric, 1),
           NULLIF(trim(e->>'unit'), ''),
           COALESCE((e->>'unit_price')::numeric, 0),
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

CREATE OR REPLACE FUNCTION public.replace_support_request_items(p_request_id UUID, p_items JSONB)
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
  PERFORM 1 FROM public.support_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Support request not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Replacing the lines withdraws any agreement (support_request_items_guard).
  DELETE FROM public.support_request_items WHERE support_request_id = p_request_id;
  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.support_request_items (support_request_id, section, description, detail, quantity, unit, unit_price, position)
    SELECT p_request_id,
           NULLIF(trim(e->>'section'), ''),
           trim(e->>'description'),
           NULLIF(trim(e->>'detail'), ''),
           COALESCE((e->>'quantity')::numeric, 1),
           NULLIF(trim(e->>'unit'), ''),
           COALESCE((e->>'unit_price')::numeric, 0),
           (ord - 1)::int
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord);
  END IF;

  SELECT COALESCE(SUM(ROUND(quantity * unit_price, 2)), 0) INTO v_total
  FROM public.support_request_items WHERE support_request_id = p_request_id;
  RETURN v_total;
END;
$$;

-- One draft invoice from one or more resolved, chargeable requests of one client.
-- Each request becomes a section of the invoice; all in one transaction.
CREATE OR REPLACE FUNCTION public.invoice_support_requests(
  p_request_ids UUID[],
  p_currency TEXT DEFAULT 'UGX',
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_client UUID;
  v_count INTEGER;
  v_bad TEXT;
  v_invoice UUID;
  v_start DATE;
  v_end DATE;
BEGIN
  IF NOT public.can_access_finance() THEN
    RAISE EXCEPTION 'Admin or Finance access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_request_ids IS NULL OR cardinality(p_request_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one support request' USING ERRCODE = 'check_violation';
  END IF;
  IF p_currency NOT IN ('UGX', 'USD') THEN
    RAISE EXCEPTION 'Unsupported currency' USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the requests so two people cannot invoice the same work.
  PERFORM 1 FROM public.support_requests WHERE id = ANY(p_request_ids) FOR UPDATE;

  SELECT count(*), min(client_id::text)::uuid INTO v_count, v_client
  FROM public.support_requests WHERE id = ANY(p_request_ids);
  IF v_count <> cardinality(p_request_ids) THEN
    RAISE EXCEPTION 'One or more support requests were not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF (SELECT count(DISTINCT client_id) FROM public.support_requests WHERE id = ANY(p_request_ids)) > 1 THEN
    RAISE EXCEPTION 'All requests on one invoice must belong to the same client' USING ERRCODE = 'check_violation';
  END IF;

  SELECT reference INTO v_bad FROM public.support_requests
  WHERE id = ANY(p_request_ids) AND (status <> 'resolved' OR billing <> 'chargeable') LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '% is not a resolved, chargeable request', v_bad USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.reference INTO v_bad FROM public.support_requests r
  WHERE r.id = ANY(p_request_ids)
    AND NOT EXISTS (SELECT 1 FROM public.support_request_items i WHERE i.support_request_id = r.id)
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '% has no quote yet', v_bad USING ERRCODE = 'check_violation';
  END IF;

  SELECT reference INTO v_bad FROM public.support_requests
  WHERE id = ANY(p_request_ids) AND quote_agreed_at IS NULL LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'The client has not agreed the quote for % yet', v_bad USING ERRCODE = 'check_violation';
  END IF;

  SELECT min(requested_at)::date, max(COALESCE(resolved_at, requested_at))::date INTO v_start, v_end
  FROM public.support_requests WHERE id = ANY(p_request_ids);

  INSERT INTO public.invoices (client_id, status, issue_date, due_date, currency, document_style,
                               service_period_start, service_period_end, notes)
  VALUES (v_client, 'draft', current_date, COALESCE(p_due_date, current_date + 14), p_currency, 'service',
          v_start, v_end, 'Maintenance work billed per job, as quoted and agreed.')
  RETURNING id INTO v_invoice;

  INSERT INTO public.invoice_line_items (invoice_id, section, description, detail, quantity, unit_price, unit,
                                         period_start, period_end, position)
  SELECT v_invoice,
         r.reference || ' · ' || r.summary,
         i.description,
         i.detail,
         i.quantity,
         i.unit_price,
         i.unit,
         r.requested_at::date,
         COALESCE(r.resolved_at, r.requested_at)::date,
         (row_number() OVER (ORDER BY r.requested_at, r.reference, i.position))::int
  FROM public.support_requests r
  JOIN public.support_request_items i ON i.support_request_id = r.id
  WHERE r.id = ANY(p_request_ids);

  UPDATE public.support_requests
     SET status = 'invoiced', invoice_id = v_invoice
   WHERE id = ANY(p_request_ids);

  RETURN v_invoice;
END;
$$;

-- What an itemised invoice prints besides its lines: the agreement, the
-- support requests it covers or bills, and (for agreement invoices) the
-- incident and backup records of its service period. Callable by anyone who
-- may see the invoice document (finance/admin, or the client once issued),
-- so the PDF never needs the service-role key. Returns only what is printed.
CREATE OR REPLACE FUNCTION public.invoice_service_record(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  agr public.service_agreements%ROWTYPE;
  v_has_agr BOOLEAN := false;
  v_requests JSONB;
  v_incidents JSONB := NULL;
  v_backups JSONB := NULL;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT (public.can_access_finance() OR (inv.client_id = auth.uid() AND inv.status <> 'draft')) THEN
    RETURN NULL;
  END IF;

  IF inv.agreement_id IS NOT NULL THEN
    SELECT * INTO agr FROM public.service_agreements WHERE id = inv.agreement_id;
    v_has_agr := FOUND;
  END IF;

  IF v_has_agr AND inv.service_period_start IS NOT NULL AND inv.service_period_end IS NOT NULL THEN
    -- Covered work for this client in the period (Kampala days, UTC+3).
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'reference', r.reference, 'summary', r.summary, 'work_done', r.work_done,
             'priority', r.priority, 'billing', r.billing, 'status', r.status,
             'requested_at', r.requested_at, 'first_response_at', r.first_response_at,
             'resolved_at', r.resolved_at) ORDER BY r.requested_at), '[]'::jsonb)
      INTO v_requests
      FROM public.support_requests r
     WHERE r.client_id = inv.client_id
       AND r.billing = 'covered'
       AND (r.service_agreement_id IS NULL OR r.service_agreement_id = agr.id)
       AND ((r.requested_at AT TIME ZONE 'UTC') + interval '3 hours')::date
           BETWEEN inv.service_period_start AND inv.service_period_end;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('severity', i.severity, 'opened_at', i.opened_at)), '[]'::jsonb)
      INTO v_incidents
      FROM public.incidents i
     WHERE (i.service_agreement_id = agr.id OR (agr.system_id IS NOT NULL AND i.system_id = agr.system_id))
       AND i.status <> 'cancelled'
       AND ((i.opened_at AT TIME ZONE 'UTC') + interval '3 hours')::date
           BETWEEN inv.service_period_start AND inv.service_period_end;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('status', b.status)), '[]'::jsonb)
      INTO v_backups
      FROM public.backup_events b
     WHERE (b.service_agreement_id = agr.id OR (agr.system_id IS NOT NULL AND b.system_id = agr.system_id))
       AND ((COALESCE(b.completed_at, b.started_at, b.created_at) AT TIME ZONE 'UTC') + interval '3 hours')::date
           BETWEEN inv.service_period_start AND inv.service_period_end;
  ELSE
    -- Work billed on this invoice.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'reference', r.reference, 'summary', r.summary, 'work_done', r.work_done,
             'priority', r.priority, 'billing', r.billing, 'status', r.status,
             'requested_at', r.requested_at, 'first_response_at', r.first_response_at,
             'resolved_at', r.resolved_at, 'quote_agreed_at', r.quote_agreed_at,
             'channel', r.channel) ORDER BY r.requested_at), '[]'::jsonb)
      INTO v_requests
      FROM public.support_requests r
     WHERE r.invoice_id = inv.id;
  END IF;

  RETURN jsonb_build_object(
    'agreement', CASE WHEN v_has_agr THEN jsonb_build_object(
        'name', agr.name, 'contract_reference', agr.contract_reference, 'billing_cycle', agr.billing_cycle)
      ELSE NULL END,
    'requests', v_requests,
    'incidents', v_incidents,
    'backups', v_backups
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_service_record(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_service_record(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.replace_service_package_items(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_recurring_charge_items(UUID, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_support_request_items(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_support_requests(UUID[], TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_service_package_items(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_recurring_charge_items(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_support_request_items(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_support_requests(UUID[], TEXT, DATE) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_charge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_request_items ENABLE ROW LEVEL SECURITY;

-- Packages & breakdowns: prices, so Admin/Finance only.
DROP POLICY IF EXISTS service_packages_finance ON public.service_packages;
CREATE POLICY service_packages_finance ON public.service_packages
  FOR ALL TO authenticated
  USING (public.can_access_finance()) WITH CHECK (public.can_access_finance());

DROP POLICY IF EXISTS service_package_items_finance ON public.service_package_items;
CREATE POLICY service_package_items_finance ON public.service_package_items
  FOR ALL TO authenticated
  USING (public.can_access_finance()) WITH CHECK (public.can_access_finance());

DROP POLICY IF EXISTS recurring_charge_items_finance ON public.recurring_charge_items;
CREATE POLICY recurring_charge_items_finance ON public.recurring_charge_items
  FOR ALL TO authenticated
  USING (public.can_access_finance()) WITH CHECK (public.can_access_finance());

-- Support requests carry no prices: admin, finance and operational staff work them.
DROP POLICY IF EXISTS support_requests_select ON public.support_requests;
CREATE POLICY support_requests_select ON public.support_requests
  FOR SELECT TO authenticated
  USING (public.can_access_finance() OR public.is_staff());

DROP POLICY IF EXISTS support_requests_insert ON public.support_requests;
CREATE POLICY support_requests_insert ON public.support_requests
  FOR INSERT TO authenticated
  WITH CHECK ((public.can_access_finance() OR public.is_staff()) AND status <> 'invoiced');

DROP POLICY IF EXISTS support_requests_update ON public.support_requests;
CREATE POLICY support_requests_update ON public.support_requests
  FOR UPDATE TO authenticated
  USING (public.can_access_finance() OR public.is_staff())
  WITH CHECK (
    public.can_access_finance()
    OR (public.is_staff() AND status <> 'invoiced' AND invoice_id IS NULL)
  );

DROP POLICY IF EXISTS support_requests_delete ON public.support_requests;
CREATE POLICY support_requests_delete ON public.support_requests
  FOR DELETE TO authenticated
  USING (public.is_admin() AND status <> 'invoiced');

-- Priced work: Admin/Finance only.
DROP POLICY IF EXISTS support_request_items_finance ON public.support_request_items;
CREATE POLICY support_request_items_finance ON public.support_request_items
  FOR ALL TO authenticated
  USING (public.can_access_finance()) WITH CHECK (public.can_access_finance());

-- ----------------------------------------------------------------------------
-- 9. Privileges
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.service_packages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_package_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recurring_charge_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_request_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.support_request_seq FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_package_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_charge_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_request_items TO authenticated;
GRANT USAGE ON SEQUENCE public.support_request_seq TO authenticated;

GRANT ALL ON TABLE public.service_packages TO service_role;
GRANT ALL ON TABLE public.service_package_items TO service_role;
GRANT ALL ON TABLE public.recurring_charge_items TO service_role;
GRANT ALL ON TABLE public.support_requests TO service_role;
GRANT ALL ON TABLE public.support_request_items TO service_role;
GRANT USAGE ON SEQUENCE public.support_request_seq TO service_role;

COMMIT;
