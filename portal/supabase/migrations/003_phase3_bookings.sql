-- Phase 3: bookings, service catalog policies, and public leads (quote requests).

-- ── Leads (public quote requests, no account required) ──
CREATE TYPE public.lead_status AS ENUM (
  'new',
  'contacted',
  'converted',
  'archived'
);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  service_interest text,
  message text,
  status public.lead_status NOT NULL DEFAULT 'new',
  source text DEFAULT 'marketing_site',
  converted_client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Only staff can read/update leads. Inserts happen server-side via the
-- service-role client (the public /api/quote route), so no anon policy needed.
CREATE POLICY "leads_select_staff" ON public.leads
  FOR SELECT USING (public.is_staff());
CREATE POLICY "leads_update_staff" ON public.leads
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "leads_delete_staff" ON public.leads
  FOR DELETE USING (public.is_staff());

-- ── Service catalog policies ──
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see active services; staff can see all.
CREATE POLICY "services_select" ON public.service_catalog
  FOR SELECT USING (is_active OR public.is_staff());
CREATE POLICY "services_insert_staff" ON public.service_catalog
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "services_update_staff" ON public.service_catalog
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "services_delete_staff" ON public.service_catalog
  FOR DELETE USING (public.is_staff());

-- ── Bookings write policies ──
-- Clients can create bookings for themselves.
CREATE POLICY "bookings_insert_own" ON public.bookings
  FOR INSERT WITH CHECK (client_id = auth.uid() OR public.is_staff());

-- Staff can update any booking; clients can update their own (e.g. cancel).
CREATE POLICY "bookings_update_staff_or_owner" ON public.bookings
  FOR UPDATE USING (public.is_staff() OR client_id = auth.uid());

CREATE POLICY "bookings_delete_staff" ON public.bookings
  FOR DELETE USING (public.is_staff());

-- updated_at trigger for service_catalog and leads not needed (no updated_at col);
-- bookings already has the trigger from migration 001.
