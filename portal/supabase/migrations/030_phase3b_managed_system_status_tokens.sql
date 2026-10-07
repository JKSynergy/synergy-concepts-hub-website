-- ============================================================================
-- Migration 030: Phase 3B — Managed System Service Status Tokens
-- ============================================================================
-- Adds per-system credentials so independent SCH-managed applications can
-- authenticate to the SCH Portal control plane and query their own service
-- status. Plaintext tokens are never persisted; only SHA-256 hashes are stored.
--
-- Design guarantees:
--   * Plaintext tokens are never persisted.
--   * Tokens can be rotated, invalidating old ones.
--   * Verification uses constant-time comparison.
--   * No client data, invoices, reasons, notes, or provider details are exposed.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Token storage on systems
-- ----------------------------------------------------------------------------
ALTER TABLE public.systems
  ADD COLUMN IF NOT EXISTS status_token_hash TEXT CHECK (status_token_hash IS NULL OR length(status_token_hash) > 0),
  ADD COLUMN IF NOT EXISTS status_token_last_rotated_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 2. Store a token hash (admin only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_system_status_token_hash(
  p_system_id UUID,
  p_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may set system status tokens' USING ERRCODE = 'P0001';
  END IF;

  IF p_hash IS NULL OR length(p_hash) < 16 THEN
    RAISE EXCEPTION 'Invalid token hash' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.systems
  SET status_token_hash = p_hash,
      status_token_last_rotated_at = now(),
      updated_at = now()
  WHERE id = p_system_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'System % not found', p_system_id USING ERRCODE = 'P0001';
  END IF;

  -- Audit token rotation (no plaintext).
  PERFORM public.write_audit_log(
    'system_status_token.rotated',
    'systems',
    p_system_id,
    NULL,
    NULL,
    jsonb_build_object('rotated_at', now())
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_system_status_token_hash(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_status_token_hash(UUID, TEXT) TO service_role;

COMMIT;
