-- ============================================================================
-- Migration 039: Quote intake hardening
-- SCH Portal / Synergy Concepts Hub
--
-- The public /api/quote endpoint (marketing-site enquiry and quote forms) wrote
-- a lead and then a booking in two separate requests, with no duplicate or
-- rate protection. This migration moves the write into one atomic function:
--
--   1. bookings.lead_id: the booking created for an enquiry now points at its
--      lead (nullable, ON DELETE SET NULL). Older bookings keep lead_id NULL.
--   2. quote_intake_events: one row per accepted submission, keyed by a hash of
--      the email and of the client IP (no raw addresses stored). Used only for
--      rate limiting, and pruned after two days. Service role only.
--   3. Unique request id: bookings.metadata->>'request_id' is unique when set,
--      so a retried submission (same client request id) is stored once.
--   4. submit_quote_request(p jsonb): rate limit, idempotency, lead + booking
--      (+ reference ENQ-YYYY-NNNN) in one transaction. Callable only by the
--      service role (the API route); never by anon or signed-in users.
--
-- Input is validated by the API route (lib/quote/validate.ts) before this is
-- called; the function re-checks the essentials so it is safe on its own.
-- Additive only: no existing rows, policies or functions are changed.
-- ============================================================================

BEGIN;

-- 1. Lead link on bookings ----------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bookings_lead_id_idx ON public.bookings (lead_id) WHERE lead_id IS NOT NULL;

-- 2. Rate-limit events ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_intake_events (
  id BIGSERIAL PRIMARY KEY,
  email_hash TEXT NOT NULL CHECK (char_length(email_hash) BETWEEN 16 AND 128),
  ip_hash TEXT NULL CHECK (ip_hash IS NULL OR char_length(ip_hash) BETWEEN 16 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_intake_events_email_idx ON public.quote_intake_events (email_hash, created_at);
CREATE INDEX IF NOT EXISTS quote_intake_events_ip_idx ON public.quote_intake_events (ip_hash, created_at) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS quote_intake_events_created_idx ON public.quote_intake_events (created_at);
ALTER TABLE public.quote_intake_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_intake_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.quote_intake_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.quote_intake_events_id_seq TO service_role;

-- 3. One booking per client request id ---------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS bookings_request_id_key
  ON public.bookings ((metadata->>'request_id'))
  WHERE metadata ? 'request_id';

-- 4. Atomic intake ----------------------------------------------------------------
-- p: { name, email, phone?, service?, message?, request_id?, email_hash, ip_hash?,
--      business?, title? }
-- Returns { booking_id, lead_id, reference, duplicate }.
-- Raises 'rate_limited' (P0001) when limits are exceeded, 'invalid_input' (22023)
-- for malformed input.
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
  v_existing RECORD;
  v_lead_id UUID;
  v_booking_id UUID;
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
     OR (v_request_id IS NOT NULL AND v_request_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  v_request_id := lower(v_request_id);

  -- Idempotency: the same request id returns the original result.
  IF v_request_id IS NOT NULL THEN
    SELECT id, lead_id, metadata->>'reference' AS reference INTO v_existing
    FROM public.bookings WHERE metadata->>'request_id' = v_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_existing.id, 'lead_id', v_existing.lead_id,
                                'reference', v_existing.reference, 'duplicate', true);
    END IF;
  END IF;

  -- Rate limits: 5 per email and 20 per IP in a rolling hour.
  IF (SELECT count(*) FROM public.quote_intake_events
      WHERE email_hash = v_email_hash AND created_at > now() - interval '1 hour') >= 5
     OR (v_ip_hash IS NOT NULL AND (SELECT count(*) FROM public.quote_intake_events
      WHERE ip_hash = v_ip_hash AND created_at > now() - interval '1 hour') >= 20) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  -- Keep only what rate limiting needs.
  DELETE FROM public.quote_intake_events WHERE created_at < now() - interval '2 days';

  BEGIN
    INSERT INTO public.quote_intake_events (email_hash, ip_hash) VALUES (v_email_hash, v_ip_hash);

    INSERT INTO public.leads (name, email, phone, service_interest, message, source, status)
    VALUES (v_name, v_email, v_phone, v_service, v_message, 'marketing_site', 'new')
    RETURNING id INTO v_lead_id;

    v_reference := public.next_document_number('enquiry', 'ENQ');

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
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent retry with the same request id won the race: return its result.
    SELECT id, lead_id, metadata->>'reference' AS reference INTO v_existing
    FROM public.bookings WHERE metadata->>'request_id' = v_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_existing.id, 'lead_id', v_existing.lead_id,
                                'reference', v_existing.reference, 'duplicate', true);
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'lead_id', v_lead_id,
                            'reference', v_reference, 'duplicate', false);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_quote_request(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quote_request(JSONB) TO service_role;

COMMIT;
