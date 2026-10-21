-- ============================================================================
-- Migration 040: Synergy Capture Films quotations
-- SCH Portal / Synergy Concepts Hub
--
--   1. quote_catalogs: versioned price list (JSON) per business, with the
--      configured UGX-per-USD rate. Rows are immutable: every change to prices
--      or the rate publishes a new version (who, when, note), so the table is
--      its own audit trail. The newest version is the active one.
--      Seed: version 1 = the price list supplied by the business (Oct 2026),
--      with NO exchange rate (USD stays unavailable until an admin sets one).
--   2. quote_requests: what the customer saw when they submitted (selections,
--      UGX unit prices and line totals, USD values and the rate used, estimate,
--      special-quotation items, event details, logistics, contact). Immutable:
--      only the lead/booking links may be cleared (ON DELETE SET NULL).
--   3. quote_reviews: staff review history (discount, adjusted amount,
--      logistics charge, final amount and currency). Append-only; the customer
--      submission is never changed. Admin only.
--   4. publish_quote_catalog(), add_quote_review(): admin-only writes.
--   5. submit_quote_request() (migration 039) also records a structured
--      quotation in the same transaction when p.quote is present, and refuses
--      it if the price list changed after the customer loaded it.
--
-- Prices are computed by the API (lib/quote/pricing.ts) from the active
-- catalogue; the database stores the computed snapshot and checks that it was
-- computed against the active version.
-- ============================================================================

BEGIN;

-- 1. Catalogue ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business TEXT NOT NULL CHECK (business IN ('capture_films')),
  version INTEGER NOT NULL CHECK (version >= 1),
  catalog JSONB NOT NULL CHECK (jsonb_typeof(catalog) = 'object' AND catalog->>'currency' = 'UGX'),
  ugx_per_usd NUMERIC(14, 4) NULL CHECK (ugx_per_usd IS NULL OR (ugx_per_usd > 0 AND ugx_per_usd < 1000000)),
  note TEXT NULL CHECK (note IS NULL OR char_length(note) <= 500),
  published_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business, version)
);

CREATE OR REPLACE FUNCTION public.quote_catalogs_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.published_by IS NULL AND OLD.published_by IS NOT NULL
     AND (NEW.id, NEW.business, NEW.version, NEW.catalog, NEW.ugx_per_usd, NEW.note, NEW.published_at)
         IS NOT DISTINCT FROM (OLD.id, OLD.business, OLD.version, OLD.catalog, OLD.ugx_per_usd, OLD.note, OLD.published_at) THEN
    RETURN NEW; -- publisher's profile removed (ON DELETE SET NULL)
  END IF;
  RAISE EXCEPTION 'A published price list cannot be changed; publish a new version' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS quote_catalogs_no_change ON public.quote_catalogs;
CREATE TRIGGER quote_catalogs_no_change BEFORE UPDATE OR DELETE ON public.quote_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.quote_catalogs_immutable();

-- 2. Requests ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  request_id TEXT NULL UNIQUE,
  business TEXT NOT NULL CHECK (business IN ('capture_films')),
  booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  catalog_id UUID NOT NULL REFERENCES public.quote_catalogs(id),
  catalog_version INTEGER NOT NULL,
  event_category TEXT NOT NULL CHECK (char_length(event_category) BETWEEN 2 AND 40),
  event_label TEXT NOT NULL CHECK (char_length(event_label) BETWEEN 2 AND 80),
  currency TEXT NOT NULL CHECK (currency IN ('UGX', 'USD')),
  ugx_per_usd NUMERIC(14, 4) NULL CHECK (ugx_per_usd IS NULL OR ugx_per_usd > 0),
  services TEXT[] NOT NULL CHECK (cardinality(services) BETWEEN 1 AND 5),
  lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  special_items JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(special_items) = 'array'),
  deliverables JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(deliverables) = 'object'),
  estimate_ugx BIGINT NOT NULL CHECK (estimate_ugx >= 0),
  estimate_usd NUMERIC(16, 2) NULL CHECK (estimate_usd IS NULL OR estimate_usd >= 0),
  event_details JSONB NOT NULL CHECK (jsonb_typeof(event_details) = 'object'),
  logistics TEXT NOT NULL CHECK (logistics IN ('kampala', 'upcountry_client', 'upcountry_quote')),
  contact JSONB NOT NULL CHECK (jsonb_typeof(contact) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((currency = 'USD') = (estimate_usd IS NOT NULL)),
  CHECK (currency = 'UGX' OR ugx_per_usd IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS quote_requests_booking_idx ON public.quote_requests (booking_id);
CREATE INDEX IF NOT EXISTS quote_requests_created_idx ON public.quote_requests (created_at DESC);

CREATE OR REPLACE FUNCTION public.quote_requests_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.booking_id IS NULL OR NEW.booking_id IS NOT DISTINCT FROM OLD.booking_id)
     AND (NEW.lead_id IS NULL OR NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id)
     AND (NEW.id, NEW.reference, NEW.request_id, NEW.business, NEW.catalog_id, NEW.catalog_version, NEW.event_category,
          NEW.event_label, NEW.currency, NEW.ugx_per_usd, NEW.services, NEW.lines, NEW.special_items, NEW.deliverables,
          NEW.estimate_ugx, NEW.estimate_usd, NEW.event_details, NEW.logistics, NEW.contact, NEW.created_at)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.reference, OLD.request_id, OLD.business, OLD.catalog_id, OLD.catalog_version, OLD.event_category,
          OLD.event_label, OLD.currency, OLD.ugx_per_usd, OLD.services, OLD.lines, OLD.special_items, OLD.deliverables,
          OLD.estimate_ugx, OLD.estimate_usd, OLD.event_details, OLD.logistics, OLD.contact, OLD.created_at) THEN
    RETURN NEW; -- only a lead/booking link was cleared
  END IF;
  RAISE EXCEPTION 'A submitted quotation request cannot be changed' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS quote_requests_no_change ON public.quote_requests;
CREATE TRIGGER quote_requests_no_change BEFORE UPDATE OR DELETE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.quote_requests_immutable();

-- 3. Reviews -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES public.quote_requests(id),
  discount_ugx BIGINT NOT NULL DEFAULT 0 CHECK (discount_ugx >= 0),
  adjusted_ugx BIGINT NOT NULL CHECK (adjusted_ugx >= 0),
  logistics_ugx BIGINT NOT NULL DEFAULT 0 CHECK (logistics_ugx >= 0),
  final_ugx BIGINT NOT NULL CHECK (final_ugx >= 0),
  final_currency TEXT NOT NULL CHECK (final_currency IN ('UGX', 'USD')),
  final_ugx_per_usd NUMERIC(14, 4) NULL CHECK (final_ugx_per_usd IS NULL OR final_ugx_per_usd > 0),
  final_amount NUMERIC(16, 2) NOT NULL CHECK (final_amount >= 0),
  notes TEXT NULL CHECK (notes IS NULL OR char_length(notes) <= 2000),
  reviewed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (final_ugx = adjusted_ugx + logistics_ugx),
  CHECK ((final_currency = 'USD') = (final_ugx_per_usd IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS quote_reviews_request_idx ON public.quote_reviews (quote_request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.quote_reviews_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.reviewed_by IS NULL AND OLD.reviewed_by IS NOT NULL
     AND (NEW.id, NEW.quote_request_id, NEW.discount_ugx, NEW.adjusted_ugx, NEW.logistics_ugx, NEW.final_ugx,
          NEW.final_currency, NEW.final_ugx_per_usd, NEW.final_amount, NEW.notes, NEW.created_at)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.quote_request_id, OLD.discount_ugx, OLD.adjusted_ugx, OLD.logistics_ugx, OLD.final_ugx,
          OLD.final_currency, OLD.final_ugx_per_usd, OLD.final_amount, OLD.notes, OLD.created_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A quotation review cannot be changed; add a new review' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS quote_reviews_no_change ON public.quote_reviews;
CREATE TRIGGER quote_reviews_no_change BEFORE UPDATE OR DELETE ON public.quote_reviews
  FOR EACH ROW EXECUTE FUNCTION public.quote_reviews_append_only();

-- Access: staff and admins read; all writes go through the functions below.
ALTER TABLE public.quote_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_catalogs, public.quote_requests, public.quote_reviews FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.quote_catalogs, public.quote_requests, public.quote_reviews FROM authenticated;
GRANT SELECT ON public.quote_catalogs, public.quote_requests, public.quote_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quote_catalogs, public.quote_requests, public.quote_reviews TO service_role;

DROP POLICY IF EXISTS quote_catalogs_select_staff ON public.quote_catalogs;
CREATE POLICY quote_catalogs_select_staff ON public.quote_catalogs FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS quote_requests_select_staff ON public.quote_requests;
CREATE POLICY quote_requests_select_staff ON public.quote_requests FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS quote_reviews_select_staff ON public.quote_reviews;
CREATE POLICY quote_reviews_select_staff ON public.quote_reviews FOR SELECT TO authenticated USING (public.is_staff());

-- 4a. Publish a new catalogue version (admin only) ------------------------------
CREATE OR REPLACE FUNCTION public.publish_quote_catalog(
  p_business TEXT, p_catalog JSONB, p_ugx_per_usd NUMERIC, p_note TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change the price list' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_catalog IS NULL OR jsonb_typeof(p_catalog) <> 'object' OR p_catalog->>'currency' <> 'UGX'
     OR jsonb_typeof(p_catalog->'events') <> 'array' OR jsonb_typeof(p_catalog->'services') <> 'array'
     OR jsonb_typeof(p_catalog->'extras') <> 'array' THEN
    RAISE EXCEPTION 'Invalid price list' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('quote_catalogs:' || p_business));
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM public.quote_catalogs WHERE business = p_business;
  INSERT INTO public.quote_catalogs (business, version, catalog, ugx_per_usd, note, published_by)
  VALUES (p_business, v_version, p_catalog, p_ugx_per_usd, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  RETURN v_version;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_quote_catalog(TEXT, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_quote_catalog(TEXT, JSONB, NUMERIC, TEXT) TO authenticated;

-- 4b. Add a staff review (admin only) --------------------------------------------
CREATE OR REPLACE FUNCTION public.add_quote_review(
  p_quote_request_id UUID, p_discount_ugx BIGINT, p_adjusted_ugx BIGINT, p_logistics_ugx BIGINT,
  p_final_currency TEXT, p_ugx_per_usd NUMERIC, p_notes TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.quote_requests%ROWTYPE;
  v_final_ugx BIGINT;
  v_amount NUMERIC(16, 2);
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can review a quotation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_req FROM public.quote_requests WHERE id = p_quote_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation request not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_discount_ugx IS NULL OR p_discount_ugx < 0 OR p_discount_ugx > v_req.estimate_ugx THEN
    RAISE EXCEPTION 'The discount must be between zero and the customer estimate' USING ERRCODE = 'check_violation';
  END IF;
  IF p_adjusted_ugx IS NULL OR p_adjusted_ugx < 0 OR coalesce(p_logistics_ugx, 0) < 0 THEN
    RAISE EXCEPTION 'Amounts cannot be negative' USING ERRCODE = 'check_violation';
  END IF;
  IF p_final_currency NOT IN ('UGX', 'USD') THEN
    RAISE EXCEPTION 'Unsupported currency' USING ERRCODE = 'check_violation';
  END IF;
  IF p_final_currency = 'USD' AND (p_ugx_per_usd IS NULL OR p_ugx_per_usd <= 0) THEN
    RAISE EXCEPTION 'A USD quotation needs an exchange rate' USING ERRCODE = 'check_violation';
  END IF;
  v_final_ugx := p_adjusted_ugx + coalesce(p_logistics_ugx, 0);
  v_amount := CASE WHEN p_final_currency = 'USD' THEN round(v_final_ugx::numeric / p_ugx_per_usd, 2) ELSE v_final_ugx END;
  INSERT INTO public.quote_reviews (quote_request_id, discount_ugx, adjusted_ugx, logistics_ugx, final_ugx,
                                    final_currency, final_ugx_per_usd, final_amount, notes, reviewed_by)
  VALUES (p_quote_request_id, p_discount_ugx, p_adjusted_ugx, coalesce(p_logistics_ugx, 0), v_final_ugx,
          p_final_currency, CASE WHEN p_final_currency = 'USD' THEN p_ugx_per_usd END, v_amount,
          nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.add_quote_review(UUID, BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_quote_review(UUID, BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, TEXT) TO authenticated;

-- 5. Intake with an optional structured quotation ----------------------------------
-- p.quote (when present): { business, catalog_id, catalog_version, event_category,
--   event_label, currency, ugx_per_usd, services[], lines[], special_items[],
--   deliverables{}, estimate_ugx, estimate_usd, event_details{}, logistics, contact{} }
CREATE OR REPLACE FUNCTION public.submit_quote_request(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p->>'name', ''));
  v_email TEXT := btrim(coalesce(p->>'email', ''));
  v_phone TEXT := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_service TEXT := nullif(btrim(coalesce(p->>'service', '')), '');
  v_message TEXT := nullif(btrim(coalesce(p->>'message', '')), '');
  v_email_hash TEXT := p->>'email_hash';
  v_ip_hash TEXT := nullif(p->>'ip_hash', '');
  v_request_id TEXT := nullif(p->>'request_id', '');
  v_business TEXT := nullif(btrim(coalesce(p->>'business', '')), '');
  v_title TEXT := nullif(btrim(coalesce(p->>'title', '')), '');
  v_q JSONB := p->'quote';
  v_active RECORD;
  v_existing RECORD;
  v_lead_id UUID;
  v_booking_id UUID;
  v_quote_id UUID;
  v_reference TEXT;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 120
     OR char_length(v_email) NOT BETWEEN 3 AND 254 OR position('@' IN v_email) < 2
     OR (v_phone IS NOT NULL AND char_length(v_phone) > 40)
     OR (v_service IS NOT NULL AND char_length(v_service) > 60)
     OR (v_message IS NOT NULL AND char_length(v_message) > 8000)
     OR (v_title IS NOT NULL AND char_length(v_title) > 200)
     OR (v_business IS NOT NULL AND char_length(v_business) > 80)
     OR v_email_hash IS NULL OR char_length(v_email_hash) NOT BETWEEN 16 AND 128
     OR (v_request_id IS NOT NULL AND v_request_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     OR (v_q IS NOT NULL AND (jsonb_typeof(v_q) <> 'object' OR v_request_id IS NULL OR v_phone IS NULL)) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  v_request_id := lower(v_request_id);

  IF v_request_id IS NOT NULL THEN
    SELECT id, lead_id, metadata->>'reference' AS reference INTO v_existing
    FROM public.bookings WHERE metadata->>'request_id' = v_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_existing.id, 'lead_id', v_existing.lead_id,
                                'reference', v_existing.reference, 'duplicate', true);
    END IF;
  END IF;

  IF v_q IS NOT NULL THEN
    SELECT id, version INTO v_active FROM public.quote_catalogs
    WHERE business = v_q->>'business' ORDER BY version DESC LIMIT 1;
    IF NOT FOUND OR v_active.id::text <> v_q->>'catalog_id' OR v_active.version <> (v_q->>'catalog_version')::int THEN
      RAISE EXCEPTION 'catalog_changed' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF (SELECT count(*) FROM public.quote_intake_events
      WHERE email_hash = v_email_hash AND created_at > now() - interval '1 hour') >= 5
     OR (v_ip_hash IS NOT NULL AND (SELECT count(*) FROM public.quote_intake_events
      WHERE ip_hash = v_ip_hash AND created_at > now() - interval '1 hour') >= 20) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.quote_intake_events WHERE created_at < now() - interval '2 days';

  BEGIN
    INSERT INTO public.quote_intake_events (email_hash, ip_hash) VALUES (v_email_hash, v_ip_hash);

    INSERT INTO public.leads (name, email, phone, service_interest, message, source, status)
    VALUES (v_name, v_email, v_phone, v_service, v_message, 'marketing_site', 'new')
    RETURNING id INTO v_lead_id;

    v_reference := CASE WHEN v_q IS NOT NULL THEN public.next_document_number('quote', 'SCF')
                        ELSE public.next_document_number('enquiry', 'ENQ') END;

    INSERT INTO public.bookings (client_id, lead_id, type, status, title, description, metadata)
    VALUES (
      NULL, v_lead_id, 'custom_request', 'pending',
      coalesce(v_title, 'Quote request: ' || coalesce(v_service, 'Custom project')),
      v_message,
      jsonb_strip_nulls(jsonb_build_object(
        'lead_name', v_name, 'lead_email', v_email, 'lead_phone', v_phone,
        'service_interest', v_service, 'business', v_business,
        'reference', v_reference, 'request_id', v_request_id))
    )
    RETURNING id INTO v_booking_id;

    IF v_q IS NOT NULL THEN
      INSERT INTO public.quote_requests (
        reference, request_id, business, booking_id, lead_id, catalog_id, catalog_version,
        event_category, event_label, currency, ugx_per_usd, services, lines, special_items, deliverables,
        estimate_ugx, estimate_usd, event_details, logistics, contact)
      VALUES (
        v_reference, v_request_id, v_q->>'business', v_booking_id, v_lead_id, v_active.id, v_active.version,
        v_q->>'event_category', v_q->>'event_label', v_q->>'currency', (v_q->>'ugx_per_usd')::numeric,
        ARRAY(SELECT jsonb_array_elements_text(v_q->'services')),
        v_q->'lines', coalesce(v_q->'special_items', '[]'), coalesce(v_q->'deliverables', '{}'),
        (v_q->>'estimate_ugx')::bigint, (v_q->>'estimate_usd')::numeric,
        v_q->'event_details', v_q->>'logistics', v_q->'contact')
      RETURNING id INTO v_quote_id;

      UPDATE public.bookings SET metadata = metadata || jsonb_build_object('quote_request_id', v_quote_id)
      WHERE id = v_booking_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, lead_id, metadata->>'reference' AS reference INTO v_existing
    FROM public.bookings WHERE metadata->>'request_id' = v_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_existing.id, 'lead_id', v_existing.lead_id,
                                'reference', v_existing.reference, 'duplicate', true);
    END IF;
    RAISE;
  END;

  RETURN jsonb_strip_nulls(jsonb_build_object('booking_id', v_booking_id, 'lead_id', v_lead_id,
                            'reference', v_reference, 'duplicate', false, 'quote_request_id', v_quote_id));
END;
$$;
REVOKE ALL ON FUNCTION public.submit_quote_request(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quote_request(JSONB) TO service_role;

-- 6. Seed: version 1, the price list supplied by the business (no exchange rate) ---
-- Kept identical to portal/lib/quote/capture-films-catalog.v1.json (checked by tests).
INSERT INTO public.quote_catalogs (business, version, catalog, ugx_per_usd, note)
SELECT 'capture_films', 1, $cat${"schema":1,"currency":"UGX","events":[{"id":"wedding","label":"Wedding"},{"id":"kwanjula","label":"Kwanjula / Introduction"},{"id":"kukyala","label":"Kukyala"},{"id":"other","label":"Other event"}],"services":[{"id":"photography","label":"Photography","prices":{"wedding":2000000,"kwanjula":2000000,"kukyala":1000000,"other":1000000},"deliverables":{"wedding":["200 edited and printed photographs","One 12×12-inch photo book containing the printed photographs","One 12×16-inch framed print"],"kwanjula":["200 edited and printed photographs","One 12×12-inch photo book containing the printed photographs","One 12×16-inch framed print"],"kukyala":["100–150 edited photographs delivered as soft copies","Photo book available on request (quoted separately)"],"other":["Edited photographs delivered as soft copies"]}},{"id":"videography","label":"Videography","prices":{"wedding":2000000,"kwanjula":2000000,"kukyala":1000000,"other":1000000},"deliverables":{"wedding":["Standard HD long video delivered on a flash disk"],"kwanjula":["Standard HD long video delivered on a flash disk"],"kukyala":["Standard HD long video delivered on a flash disk"],"other":["Standard HD long video delivered on a flash disk"]}}],"extras":[{"id":"video_4k","label":"4K video upgrade","requires":["videography"],"pricing":{"wedding":{"type":"fixed","amount":1500000},"kwanjula":{"type":"fixed","amount":1500000},"kukyala":{"type":"fixed","amount":1500000},"other":{"type":"fixed","amount":1500000}}},{"id":"edit_25","label":"Special 25-minute edited video","requires":["videography"],"pricing":{"wedding":{"type":"fixed","amount":1000000},"kwanjula":{"type":"fixed","amount":1000000}}},{"id":"edit_45","label":"Special 45-minute edited video","requires":["videography"],"pricing":{"wedding":{"type":"fixed","amount":1000000},"kwanjula":{"type":"fixed","amount":1000000}}},{"id":"memory_lane","label":"Memory Lane","pricing":{"wedding":{"type":"fixed","amount":600000},"kwanjula":{"type":"fixed","amount":600000}}},{"id":"love_story","label":"Love Story","pricing":{"wedding":{"type":"fixed","amount":700000}}},{"id":"same_day_edit","label":"Same-day edit / highlights","pricing":{"wedding":{"type":"fixed","amount":700000},"kwanjula":{"type":"fixed","amount":700000}}},{"id":"social_reel","label":"Social media content","unit":"reel","pricing":{"other":{"type":"per_unit","amount":150000,"min":1,"max":50}}},{"id":"drone","label":"Drone coverage","note":"Subject to venue suitability, conditions, availability and approval.","pricing":{"wedding":{"type":"fixed","amount":500000},"kwanjula":{"type":"fixed","amount":500000},"kukyala":{"type":"fixed","amount":500000},"other":{"type":"fixed","amount":500000}}},{"id":"live_streaming","label":"Live streaming","pricing":{"wedding":{"type":"special_quote"},"kwanjula":{"type":"special_quote"},"kukyala":{"type":"special_quote"},"other":{"type":"special_quote"}}},{"id":"extra_photographer","label":"Extra photographer","pricing":{"wedding":{"type":"fixed","amount":700000},"kwanjula":{"type":"fixed","amount":700000},"kukyala":{"type":"fixed","amount":700000},"other":{"type":"fixed","amount":500000}}},{"id":"extra_videographer","label":"Extra videographer","pricing":{"wedding":{"type":"fixed","amount":700000},"kwanjula":{"type":"fixed","amount":700000},"kukyala":{"type":"fixed","amount":700000},"other":{"type":"fixed","amount":500000}}},{"id":"screens","label":"Screens","pricing":{"wedding":{"type":"special_quote"},"kwanjula":{"type":"special_quote"},"kukyala":{"type":"special_quote"},"other":{"type":"special_quote"}}},{"id":"photo_book","label":"Additional photo book","pricing":{"wedding":{"type":"fixed","amount":1000000},"kwanjula":{"type":"fixed","amount":1000000},"kukyala":{"type":"on_request"},"other":{"type":"fixed","amount":1000000}}},{"id":"framed_print","label":"Additional framed print","pricing":{"wedding":{"type":"fixed","amount":200000},"kwanjula":{"type":"fixed","amount":200000},"kukyala":{"type":"on_request"}}}],"logistics":{"kampala":"Within our Kampala service area, Synergy Capture Films provides transport for the team. No separate transport charge is added.","upcountry":"Outside Kampala, you provide transport and accommodation for the team, or ask us for a separate logistics quotation based on the location.","area":"Our team confirms whether your venue is within the Kampala service area."},"notes":{"usd":"USD prices are indicative conversions of our UGX price list using the exchange rate set by Synergy Capture Films.","request":"This is a quotation request, not a booking or payment. Our team reviews it and confirms the quotation with you."}}$cat$::jsonb, NULL, 'Initial price list supplied by the business (Oct 2026)'
WHERE NOT EXISTS (SELECT 1 FROM public.quote_catalogs WHERE business = 'capture_films');

COMMIT;
