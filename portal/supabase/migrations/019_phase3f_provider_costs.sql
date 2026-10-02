-- ============================================================================
-- Migration 019: Phase 3F Provider Costs, Renewals & Service Margin
-- SCH Portal / Synergy Concepts Hub
--
-- Introduces:
--   1. provider_costs (recorded provider/infrastructure cost evidence)
--   2. Explicit allocation model (client | overhead) with strict consistency
--   3. Same-client integrity triggers across resource/system/agreement links
--   4. Cost status lifecycle guard + paid_at timestamps + binding immutability
--   5. Destructive-delete blocker (financial history is preserved)
--   6. Integrated audit logging via existing public.audit_logs
--   7. derive_cost_renewal_state() (deterministic renewal classification)
--   8. provider_cost_overview view (Admin/Finance financial view)
--   9. staff_provider_costs_view (Staff operational context — ZERO amounts)
--  10. service_margin_view (same-currency revenue minus allocated cost)
--  11. Explicit RLS policies (Admin/Finance only on raw table)
--  12. Strict privilege hardening (no TRUNCATE, anon has 0 privileges)
--
-- Phase 3F is a COST AND COMMERCIAL VISIBILITY layer. It records provider-side
-- costs and derives service margins. It is NOT a general accounting/GL system
-- and contains NO automation: no cron, no scheduled workers, no automatic cost
-- generation, no provider API calls, no FX conversion.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: provider_costs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationship anchors (all nullable — a cost may be pure SCH overhead)
  provider_account_id UUID NULL REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  resource_id UUID NULL REFERENCES public.resources(id) ON DELETE SET NULL,
  system_id UUID NULL REFERENCES public.systems(id) ON DELETE SET NULL,
  client_id UUID NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  service_agreement_id UUID NULL REFERENCES public.service_agreements(id) ON DELETE SET NULL,

  -- Explicit allocation model: client-allocated cost vs SCH overhead
  allocation_type TEXT NOT NULL DEFAULT 'client' CHECK (allocation_type IN ('client', 'overhead')),

  -- Controlled cost taxonomy (no unrestricted accounting chart)
  cost_type TEXT NOT NULL CHECK (cost_type IN (
    'hosting', 'database', 'storage', 'domain', 'email', 'software', 'infrastructure', 'other'
  )),

  description TEXT NOT NULL CHECK (
    char_length(trim(description)) >= 2
    AND public.check_no_secrets_in_text(description)
  ),

  -- Money: numeric/decimal, non-negative, currency-bound (UGX/USD only)
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'UGX' CHECK (currency IN ('UGX', 'USD')),

  -- Provider billing/service period (recorded facts, no proration)
  billing_period_start DATE NULL,
  billing_period_end DATE NULL,

  -- Lifecycle timestamps
  incurred_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NULL,
  paid_at TIMESTAMPTZ NULL,

  -- Provider-side cost record status (not a client payment record)
  status TEXT NOT NULL DEFAULT 'estimated' CHECK (status IN (
    'estimated', 'accrued', 'due', 'paid', 'cancelled'
  )),

  -- Renewal governance (deterministic; no auto-renewal)
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  renewal_date DATE NULL,
  renewal_notes TEXT NULL CHECK (public.check_no_secrets_in_text(renewal_notes)),

  notes TEXT NULL CHECK (public.check_no_secrets_in_text(notes)),

  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_provider_cost_period CHECK (
    billing_period_end IS NULL OR billing_period_start IS NULL
    OR billing_period_end >= billing_period_start
  ),
  -- Client-allocated costs MUST name the client; overhead costs MAY be clientless
  CONSTRAINT chk_provider_cost_allocation CHECK (
    allocation_type <> 'client' OR client_id IS NOT NULL
  )
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_provider_costs_client ON public.provider_costs(client_id);
CREATE INDEX IF NOT EXISTS idx_provider_costs_account ON public.provider_costs(provider_account_id);
CREATE INDEX IF NOT EXISTS idx_provider_costs_resource ON public.provider_costs(resource_id);
CREATE INDEX IF NOT EXISTS idx_provider_costs_system ON public.provider_costs(system_id);
CREATE INDEX IF NOT EXISTS idx_provider_costs_agreement ON public.provider_costs(service_agreement_id);
CREATE INDEX IF NOT EXISTS idx_provider_costs_status ON public.provider_costs(status);
CREATE INDEX IF NOT EXISTS idx_provider_costs_currency ON public.provider_costs(currency);
CREATE INDEX IF NOT EXISTS idx_provider_costs_renewal ON public.provider_costs(renewal_date) WHERE is_recurring;

-- ----------------------------------------------------------------------------
-- 3. Same-Client & Relationship Integrity
-- ----------------------------------------------------------------------------
-- Rules (database-enforced):
--   * allocation_type='client' requires client_id (CHECK also enforces).
--   * A cost referencing a resource/system/agreement owned by a client must
--     carry that same client_id; a client-owned resource cannot be charged as
--     SCH overhead.
--   * resource → system → client and resource → provider_account chains are
--     kept consistent; system_id and provider_account_id are derived from the
--     resource when left unset.
--   * An explicitly supplied system_id/provider_account_id that disagrees with
--     the resource's own links is rejected.
CREATE OR REPLACE FUNCTION public.check_provider_cost_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res_client UUID;
  v_res_system UUID;
  v_res_account UUID;
  v_sys_client UUID;
  v_agr_client UUID;
BEGIN
  -- Resource consistency + derivation
  IF NEW.resource_id IS NOT NULL THEN
    SELECT client_id, system_id, provider_account_id
      INTO v_res_client, v_res_system, v_res_account
    FROM public.resources WHERE id = NEW.resource_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced resource does not exist' USING ERRCODE = 'P0001';
    END IF;

    -- Client-owned resource: cost must be client-allocated to that client.
    IF v_res_client IS NOT NULL THEN
      IF NEW.allocation_type = 'overhead' THEN
        RAISE EXCEPTION 'A client-owned resource cannot be recorded as SCH overhead' USING ERRCODE = 'P0001';
      END IF;
      IF NEW.client_id IS NULL THEN
        NEW.client_id := v_res_client;
      ELSIF NEW.client_id <> v_res_client THEN
        RAISE EXCEPTION 'Provider cost client_id does not match referenced resource client_id' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- Derive system_id from the resource when not supplied; reject mismatch.
    IF v_res_system IS NOT NULL THEN
      IF NEW.system_id IS NULL THEN
        NEW.system_id := v_res_system;
      ELSIF NEW.system_id <> v_res_system THEN
        RAISE EXCEPTION 'Provider cost system_id does not match the referenced resource system' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- Derive provider_account_id from the resource when not supplied; reject mismatch.
    IF v_res_account IS NOT NULL THEN
      IF NEW.provider_account_id IS NULL THEN
        NEW.provider_account_id := v_res_account;
      ELSIF NEW.provider_account_id <> v_res_account THEN
        RAISE EXCEPTION 'Provider cost provider_account_id does not match the referenced resource account' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- System consistency
  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_sys_client FROM public.systems WHERE id = NEW.system_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced system does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF v_sys_client IS NOT NULL THEN
      IF NEW.allocation_type = 'overhead' THEN
        RAISE EXCEPTION 'A client-owned system cannot be recorded as SCH overhead' USING ERRCODE = 'P0001';
      END IF;
      IF NEW.client_id IS NULL THEN
        NEW.client_id := v_sys_client;
      ELSIF NEW.client_id <> v_sys_client THEN
        RAISE EXCEPTION 'Provider cost client_id does not match referenced system client_id' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- Service agreement consistency (agreements always have a client)
  IF NEW.service_agreement_id IS NOT NULL THEN
    SELECT client_id INTO v_agr_client FROM public.service_agreements WHERE id = NEW.service_agreement_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced service agreement does not exist' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.client_id IS NULL THEN
      NEW.client_id := v_agr_client;
    ELSIF NEW.client_id <> v_agr_client THEN
      RAISE EXCEPTION 'Provider cost client_id does not match referenced service agreement client_id' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.allocation_type = 'overhead' THEN
      RAISE EXCEPTION 'An SCH overhead cost cannot be attached to a client service agreement' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- A cost allocated to a client must be a client allocation
  IF NEW.client_id IS NOT NULL AND NEW.allocation_type <> 'client' THEN
    RAISE EXCEPTION 'Provider costs bound to a client must use allocation_type client' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_cost_integrity ON public.provider_costs;
CREATE TRIGGER trg_provider_cost_integrity
  BEFORE INSERT OR UPDATE OF client_id, resource_id, system_id, provider_account_id, service_agreement_id, allocation_type ON public.provider_costs
  FOR EACH ROW EXECUTE FUNCTION public.check_provider_cost_integrity();

-- ----------------------------------------------------------------------------
-- 4. Lifecycle Guard & Timestamps
-- ----------------------------------------------------------------------------
-- * Staff may never write provider cost records (financial anti-leak).
-- * paid_at auto-populates when status becomes 'paid'.
-- * 'cancelled' is terminal: a cancelled cost cannot be reactivated — record a
--   corrected cost instead.
-- * client/resource/provider_account/agreement bindings are immutable after
--   recording (reallocation requires a corrective record, keeping the audit
--   trail honest).
CREATE OR REPLACE FUNCTION public.check_provider_cost_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Note: is_staff() is true for admin too — the write block targets the
  -- plain 'staff' role only (admin retains full management authority).
  IF auth.uid() IS NOT NULL AND public.is_staff() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Staff users cannot create or modify provider costs' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
    IF NEW.status = 'cancelled' THEN
      RAISE EXCEPTION 'New provider costs cannot be created as cancelled' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled provider costs cannot be reactivated; record a corrected cost' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.provider_account_id IS DISTINCT FROM OLD.provider_account_id
     OR NEW.service_agreement_id IS DISTINCT FROM OLD.service_agreement_id THEN
    RAISE EXCEPTION 'Provider cost client, resource, account and agreement bindings cannot be changed after recording' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;

  IF NEW.status <> 'paid' AND NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    RAISE EXCEPTION 'paid_at is only valid on a paid provider cost' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_cost_lifecycle ON public.provider_costs;
CREATE TRIGGER trg_provider_cost_lifecycle
  BEFORE INSERT OR UPDATE ON public.provider_costs
  FOR EACH ROW EXECUTE FUNCTION public.check_provider_cost_lifecycle();

-- ----------------------------------------------------------------------------
-- 5. Delete Safety (Provider Costs Are Financial History)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_costs_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Destructive deletion of provider cost records is strictly forbidden. Cancel the cost or record a correction instead.' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_costs_no_delete ON public.provider_costs;
CREATE TRIGGER trg_provider_costs_no_delete
  BEFORE DELETE ON public.provider_costs
  FOR EACH ROW EXECUTE FUNCTION public.provider_costs_prevent_destructive_delete();

-- ----------------------------------------------------------------------------
-- 6. Audit Logging (existing audit_logs — no second audit system)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_provider_cost_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_cost.created',
      'provider_costs',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'client_id', NEW.client_id,
        'resource_id', NEW.resource_id,
        'provider_account_id', NEW.provider_account_id,
        'allocation_type', NEW.allocation_type,
        'cost_type', NEW.cost_type,
        'currency', NEW.currency,
        'status', NEW.status,
        'created_by', NEW.created_by
      )
    );
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF OLD.status <> NEW.status THEN
    PERFORM public.write_audit_log(
      'provider_cost.status_changed',
      'provider_costs',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
    IF NEW.status = 'cancelled' THEN
      PERFORM public.write_audit_log(
        'provider_cost.cancelled',
        'provider_costs',
        NEW.id,
        to_jsonb(OLD),
        to_jsonb(NEW),
        NULL
      );
    END IF;
  END IF;

  IF OLD.allocation_type <> NEW.allocation_type OR OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    PERFORM public.write_audit_log(
      'provider_cost.allocated',
      'provider_costs',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('allocation_type', NEW.allocation_type, 'client_id', NEW.client_id)
    );
  END IF;

  IF OLD.renewal_date IS DISTINCT FROM NEW.renewal_date OR OLD.is_recurring <> NEW.is_recurring THEN
    PERFORM public.write_audit_log(
      'provider_cost.renewal_updated',
      'provider_costs',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('is_recurring', NEW.is_recurring, 'renewal_date', NEW.renewal_date)
    );
  END IF;

  IF to_jsonb(OLD) - 'updated_at' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' THEN
    PERFORM public.write_audit_log(
      'provider_cost.updated',
      'provider_costs',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_cost_audit ON public.provider_costs;
CREATE TRIGGER trg_provider_cost_audit
  AFTER INSERT OR UPDATE ON public.provider_costs
  FOR EACH ROW EXECUTE FUNCTION public.log_provider_cost_audit();

-- ----------------------------------------------------------------------------
-- 7. Deterministic Renewal Classification
-- ----------------------------------------------------------------------------
-- Renewal states (documented operational defaults — no automation):
--   'no_renewal' not recurring, cancelled, or no renewal_date recorded
--   'overdue'    renewal_date is in the past
--   'due'        renewal_date within the next 7 days (inclusive of today)
--   'upcoming'   renewal_date more than 7 days ahead
CREATE OR REPLACE FUNCTION public.derive_cost_renewal_state(
  p_renewal_date DATE,
  p_is_recurring BOOLEAN,
  p_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF p_status = 'cancelled' OR NOT COALESCE(p_is_recurring, false) OR p_renewal_date IS NULL THEN
    RETURN 'no_renewal';
  END IF;
  IF p_renewal_date < CURRENT_DATE THEN
    RETURN 'overdue';
  ELSIF p_renewal_date <= CURRENT_DATE + 7 THEN
    RETURN 'due';
  END IF;
  RETURN 'upcoming';
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Admin/Finance Cost Overview (financial fields + renewal state + labels)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.provider_cost_overview AS
SELECT
  c.id,
  c.provider_account_id,
  c.resource_id,
  c.system_id,
  c.client_id,
  c.service_agreement_id,
  c.allocation_type,
  c.cost_type,
  c.description,
  c.amount,
  c.currency,
  c.billing_period_start,
  c.billing_period_end,
  c.incurred_at,
  c.due_at,
  c.paid_at,
  c.status,
  c.is_recurring,
  c.renewal_date,
  public.derive_cost_renewal_state(c.renewal_date, c.is_recurring, c.status) AS renewal_state,
  c.renewal_notes,
  c.notes,
  c.created_by,
  c.created_at,
  c.updated_at,
  pa.account_name AS provider_account_name,
  pr.name AS provider_name,
  r.name AS resource_name,
  r.resource_type,
  s.name AS system_name,
  sa.name AS agreement_name,
  cp.company_name AS client_company,
  cp.email AS client_email
FROM public.provider_costs c
LEFT JOIN public.provider_accounts pa ON pa.id = c.provider_account_id
LEFT JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.resources r ON r.id = c.resource_id
LEFT JOIN public.systems s ON s.id = c.system_id
LEFT JOIN public.service_agreements sa ON sa.id = c.service_agreement_id
LEFT JOIN public.profiles cp ON cp.id = c.client_id
WHERE public.is_admin() OR public.is_finance();

-- ----------------------------------------------------------------------------
-- 9. Staff-Safe Provider Cost View (ZERO financial figures)
-- ----------------------------------------------------------------------------
-- Exposes operational context only: provider/account labels, resource/system,
-- cost category, allocation shape, status and renewal timing. Deliberately
-- excludes amount, currency, description/notes (may mention figures), and any
-- margin/revenue data. The role guard keeps clients at zero rows.
CREATE OR REPLACE VIEW public.staff_provider_costs_view AS
SELECT
  c.id,
  c.provider_account_id,
  c.resource_id,
  c.system_id,
  c.client_id,
  c.service_agreement_id,
  c.allocation_type,
  c.cost_type,
  c.status,
  c.is_recurring,
  c.renewal_date,
  public.derive_cost_renewal_state(c.renewal_date, c.is_recurring, c.status) AS renewal_state,
  c.created_at,
  pa.account_name AS provider_account_name,
  pr.name AS provider_name,
  r.name AS resource_name,
  r.resource_type,
  s.name AS system_name,
  cp.company_name AS client_company,
  cp.email AS client_email
FROM public.provider_costs c
LEFT JOIN public.provider_accounts pa ON pa.id = c.provider_account_id
LEFT JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.resources r ON r.id = c.resource_id
LEFT JOIN public.systems s ON s.id = c.system_id
LEFT JOIN public.profiles cp ON cp.id = c.client_id
WHERE public.is_admin() OR public.is_finance() OR public.is_staff();

-- ----------------------------------------------------------------------------
-- 10. Service Margin View (deterministic, same-currency only)
-- ----------------------------------------------------------------------------
-- Revenue source: active recurring_charges on each service agreement
--   (existing commercial source of truth — nothing is duplicated).
-- Cost source: non-cancelled, client-allocated provider_costs linked to the
--   agreement.
-- Currencies are never combined: rows are per (agreement, currency) and a
--   margin is only computed when same-currency revenue exists and is positive.
--   Otherwise margin columns are NULL and margin_state = 'unavailable'.
CREATE OR REPLACE VIEW public.service_margin_view AS
WITH rev AS (
  SELECT agreement_id, currency, SUM(amount) AS revenue
  FROM public.recurring_charges
  WHERE active
  GROUP BY agreement_id, currency
),
cost AS (
  SELECT service_agreement_id AS agreement_id, currency, SUM(amount) AS allocated_cost
  FROM public.provider_costs
  WHERE status <> 'cancelled'
    AND allocation_type = 'client'
    AND service_agreement_id IS NOT NULL
  GROUP BY service_agreement_id, currency
),
keys AS (
  SELECT agreement_id, currency FROM rev
  UNION
  SELECT agreement_id, currency FROM cost
)
SELECT
  k.agreement_id,
  sa.name AS agreement_name,
  sa.client_id,
  sa.status AS agreement_status,
  cp.company_name AS client_company,
  cp.email AS client_email,
  k.currency,
  rev.revenue AS service_revenue,
  COALESCE(cost.allocated_cost, 0) AS allocated_cost,
  CASE
    WHEN rev.revenue IS NULL OR rev.revenue <= 0 THEN NULL
    ELSE rev.revenue - COALESCE(cost.allocated_cost, 0)
  END AS margin_amount,
  CASE
    WHEN rev.revenue IS NULL OR rev.revenue <= 0 THEN NULL
    ELSE ROUND(((rev.revenue - COALESCE(cost.allocated_cost, 0)) / rev.revenue) * 100, 2)
  END AS margin_pct,
  CASE
    WHEN rev.revenue IS NULL OR rev.revenue <= 0 THEN 'unavailable'
    ELSE 'computed'
  END AS margin_state
FROM keys k
JOIN public.service_agreements sa ON sa.id = k.agreement_id
LEFT JOIN public.profiles cp ON cp.id = sa.client_id
LEFT JOIN rev ON rev.agreement_id = k.agreement_id AND rev.currency = k.currency
LEFT JOIN cost ON cost.agreement_id = k.agreement_id AND cost.currency = k.currency
WHERE public.is_admin() OR public.is_finance();

-- ----------------------------------------------------------------------------
-- 11. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_costs ENABLE ROW LEVEL SECURITY;

-- Staff and clients get NO policy on the raw table: financial amounts are
-- Admin/Finance only. Staff context comes through staff_provider_costs_view.
DROP POLICY IF EXISTS provider_costs_select_admin ON public.provider_costs;
CREATE POLICY provider_costs_select_admin ON public.provider_costs
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS provider_costs_select_finance ON public.provider_costs;
CREATE POLICY provider_costs_select_finance ON public.provider_costs
  FOR SELECT TO authenticated
  USING (public.is_finance());

DROP POLICY IF EXISTS provider_costs_insert_admin_finance ON public.provider_costs;
CREATE POLICY provider_costs_insert_admin_finance ON public.provider_costs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS provider_costs_update_admin_finance ON public.provider_costs;
CREATE POLICY provider_costs_update_admin_finance ON public.provider_costs
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_finance())
  WITH CHECK (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS provider_costs_delete_none ON public.provider_costs;
CREATE POLICY provider_costs_delete_none ON public.provider_costs
  FOR DELETE TO authenticated
  USING (false);

-- ----------------------------------------------------------------------------
-- 12. Explicit Privilege Hardening
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.provider_costs FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.provider_costs TO authenticated;
REVOKE DELETE, TRUNCATE ON public.provider_costs FROM authenticated, anon;

GRANT ALL ON public.provider_costs TO service_role;
REVOKE TRUNCATE ON public.provider_costs FROM service_role;

-- Views: no anonymous access; authenticated may query (role guards inside each
-- view keep clients at zero rows and staff away from financial figures).
-- Supabase default privileges may grant ALL (incl. TRUNCATE) on new views —
-- revoke everything first, then grant SELECT only.
REVOKE ALL ON public.provider_cost_overview FROM anon, authenticated, service_role;
REVOKE ALL ON public.staff_provider_costs_view FROM anon, authenticated, service_role;
REVOKE ALL ON public.service_margin_view FROM anon, authenticated, service_role;

GRANT SELECT ON public.provider_cost_overview TO authenticated, service_role;
GRANT SELECT ON public.staff_provider_costs_view TO authenticated, service_role;
GRANT SELECT ON public.service_margin_view TO authenticated, service_role;

COMMIT;
