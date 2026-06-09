-- Fix: quote-request bookings fail to insert because client_id is NOT NULL.
-- The public /api/quote route creates bookings with client_id = null so they
-- appear in the admin dashboard before the lead is converted to a client.

ALTER TABLE public.bookings ALTER COLUMN client_id DROP NOT NULL;

-- Also change ON DELETE behaviour so deleting a profile unlinks rather than
-- removes a booking (safer now that unlinked quote rows are expected).
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_client_id_fkey,
  ADD CONSTRAINT bookings_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
