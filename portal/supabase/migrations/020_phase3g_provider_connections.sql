-- ============================================================================
-- Migration 020 — Phase 3G-1: Provider Connections & Read-Only Discovery
-- ============================================================================
-- Secure provider connection state and manual, read-only resource discovery.
--
-- Design guarantees:
--   * No plaintext credential columns. Secrets live exclusively in Supabase
--     Vault (vault.secrets). provider_accounts.credential_reference stores only
--     a 'vault:<uuid>' pointer to the vault secret.
--   * Credential access functions are SECURITY DEFINER and executable ONLY by
--     service_role. No application role can read provider secrets.
--   * Discovery is manually initiated (no cron, no workers, no sync engine).
--   * Discovered resources are NOT inventory — they become SCH resources only
--     through the explicit link_discovered_resource() path, which requires a
--     caller-selected client + system and reuses the existing same-client
--     integrity trigger on public.resources.
--   * This migration adds zero provider-side mutation capability.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Provider adapter registry marker
-- ----------------------------------------------------------------------------
-- adapter_key links a provider row to a code-level adapter implementation.
-- NULL = provider has no adapter (manual inventory only).
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS adapter_key TEXT
  CHECK (adapter_key IS NULL OR adapter_key IN ('supabase', 'railway', 'vercel', 'cloudflare'));

COMMENT ON COLUMN public.providers.adapter_key IS
  'Code-level adapter key for read-only discovery (supabase|railway|vercel|cloudflare). NULL = no adapter.';

-- ----------------------------------------------------------------------------
-- 2. Provider account connection state
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_accounts
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK (connection_status IN ('unconfigured', 'configured', 'connected', 'failed')),
  ADD COLUMN IF NOT EXISTS connection_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connection_error TEXT
    CHECK (public.check_no_secrets_in_text(connection_error)),
  ADD COLUMN IF NOT EXISTS last_discovery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discovery_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.provider_accounts.credential_reference IS
  'Reference to a Supabase Vault secret in the form vault:<uuid>. NEVER a plaintext credential.';

-- ----------------------------------------------------------------------------
-- 3. Discovery runs (manually initiated — no scheduling)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_discovery_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  initiated_by        UUID REFERENCES auth.users(id),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  discovered_count    INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  new_count           INTEGER NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  linked_count        INTEGER NOT NULL DEFAULT 0 CHECK (linked_count >= 0),
  error_count         INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  error_summary       TEXT CHECK (public.check_no_secrets_in_text(error_summary)),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_account
  ON public.provider_discovery_runs (provider_account_id, started_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Discovered external resources (review staging — NOT managed inventory)
-- ----------------------------------------------------------------------------
-- A discovered row is external evidence awaiting explicit review/linking.
-- It never becomes an SCH resource silently. Stable external identity is
-- (provider_account_id, external_resource_id) — re-discovery updates the same
-- row instead of duplicating.
CREATE TABLE IF NOT EXISTS public.provider_discovered_resources (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id  UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  external_resource_id TEXT NOT NULL,
  resource_type        TEXT NOT NULL
    CHECK (resource_type IN ('project', 'service', 'database', 'zone', 'hosting', 'storage', 'deployment', 'other')),
  name                 TEXT NOT NULL,
  status               TEXT,
  region               TEXT,
  external_url         TEXT CHECK (public.check_no_secrets_in_text(external_url)),
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (public.check_no_secrets_in_text(metadata::text)),
  first_discovered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_id          UUID REFERENCES public.provider_discovery_runs(id),
  link_status          TEXT NOT NULL DEFAULT 'unlinked'
    CHECK (link_status IN ('unlinked', 'linked', 'dismissed')),
  linked_resource_id   UUID REFERENCES public.resources(id),
  linked_at            TIMESTAMPTZ,
  linked_by            UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_discovered_external_identity UNIQUE (provider_account_id, external_resource_id)
);

CREATE INDEX IF NOT EXISTS idx_discovered_account ON public.provider_discovered_resources (provider_account_id);
CREATE INDEX IF NOT EXISTS idx_discovered_link_status ON public.provider_discovered_resources (link_status);

-- ----------------------------------------------------------------------------
-- 5. Caller helper — is the invoker the service role?
-- ----------------------------------------------------------------------------
-- PostgREST applies SET ROLE per request and exposes JWT claims via
-- request.jwt.claims; direct SQL callers are identified by the 'role' GUC.
-- Inside SECURITY DEFINER, current_user is the function OWNER — the 'role'
-- setting and JWT claims still reflect the actual invoker.
-- Never throws — a malformed claims setting means "not service".
CREATE OR REPLACE FUNCTION public.caller_is_service_role()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_claims TEXT;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN true;
  END IF;
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role' THEN
    RETURN true;
  END IF;
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  IF v_claims IS NULL THEN
    RETURN false;
  END IF;
  RETURN COALESCE(v_claims::jsonb ->> 'role', '') = 'service_role';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Credential storage via Supabase Vault (service_role only)
-- ----------------------------------------------------------------------------
-- store_provider_credential: writes the secret into vault.secrets and records
-- only 'vault:<uuid>' in credential_reference. Rotating replaces the vault
-- secret and removes the previous one. Fails closed when the vault extension
-- is unavailable — credentials are never stored outside it.
CREATE OR REPLACE FUNCTION public.store_provider_credential(
  p_provider_account_id UUID,
  p_secret TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref UUID;
  v_old_ref TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may store provider credentials';
  END IF;
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE EXCEPTION 'Secure secret storage (supabase_vault) is unavailable; refusing to store credential';
  END IF;
  IF p_secret IS NULL OR length(trim(p_secret)) < 8 THEN
    RAISE EXCEPTION 'Credential rejected: empty or too short';
  END IF;

  SELECT credential_reference INTO v_old_ref
  FROM public.provider_accounts
  WHERE id = p_provider_account_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
    INTO v_ref
    USING p_secret,
          COALESCE(p_name, 'provider-account/' || p_provider_account_id::text || '/' || gen_random_uuid()::text),
          'SCH Portal provider credential (read-only discovery)';

  UPDATE public.provider_accounts
  SET credential_reference = 'vault:' || v_ref::text,
      connection_status = CASE WHEN connection_status = 'unconfigured' THEN 'configured' ELSE connection_status END,
      updated_at = now()
  WHERE id = p_provider_account_id;

  IF v_old_ref LIKE 'vault:%' THEN
    EXECUTE 'DELETE FROM vault.secrets WHERE id = $1::uuid'
      USING substring(v_old_ref from 7);
  END IF;

  RETURN v_ref;
END;
$$;

-- reveal_provider_credential: returns the decrypted secret. Callable ONLY by
-- service_role — no application role may read provider credentials.
CREATE OR REPLACE FUNCTION public.reveal_provider_credential(p_provider_account_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT;
  v_secret TEXT;
BEGIN
  IF NOT public.caller_is_service_role() THEN
    RAISE EXCEPTION 'Provider credentials may only be read by the service role';
  END IF;
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE EXCEPTION 'Secure secret storage (supabase_vault) is unavailable';
  END IF;

  SELECT credential_reference INTO v_ref
  FROM public.provider_accounts
  WHERE id = p_provider_account_id;

  IF v_ref IS NULL OR v_ref NOT LIKE 'vault:%' THEN
    RETURN NULL;
  END IF;

  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1::uuid'
    INTO v_secret
    USING substring(v_ref from 7);

  RETURN v_secret;
END;
$$;

-- clear_provider_credential: removes the vault secret and the reference.
CREATE OR REPLACE FUNCTION public.clear_provider_credential(p_provider_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may clear provider credentials';
  END IF;

  SELECT credential_reference INTO v_ref
  FROM public.provider_accounts
  WHERE id = p_provider_account_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  UPDATE public.provider_accounts
  SET credential_reference = NULL,
      connection_status = 'unconfigured',
      connection_checked_at = NULL,
      connection_error = NULL,
      updated_at = now()
  WHERE id = p_provider_account_id;

  IF v_ref LIKE 'vault:%' AND to_regclass('vault.secrets') IS NOT NULL THEN
    EXECUTE 'DELETE FROM vault.secrets WHERE id = $1::uuid'
      USING substring(v_ref from 7);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Explicit linking (CONNECT → DISCOVER → REVIEW → EXPLICITLY LINK)
-- ----------------------------------------------------------------------------
-- The caller must explicitly select the SCH client AND system. The function
-- validates system→client consistency and client existence, then creates the
-- resources row — which re-fires the existing check_resource_client_integrity
-- trigger, keeping Phase 3A integrity fully in force.
CREATE OR REPLACE FUNCTION public.link_discovered_resource(
  p_discovered_id UUID,
  p_client_id UUID,
  p_system_id UUID,
  p_linked_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disc       public.provider_discovered_resources%ROWTYPE;
  v_sys_client UUID;
  v_acct_own   TEXT;
  v_acct_stat  TEXT;
  v_res_type   TEXT;
  v_resource_id UUID;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may link provider resources';
  END IF;

  SELECT * INTO v_disc
  FROM public.provider_discovered_resources
  WHERE id = p_discovered_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discovered resource % not found', p_discovered_id;
  END IF;

  -- Idempotent: an already-linked row returns its existing resource.
  IF v_disc.link_status = 'linked' AND v_disc.linked_resource_id IS NOT NULL THEN
    RETURN v_disc.linked_resource_id;
  END IF;

  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'An SCH client must be explicitly selected';
  END IF;
  IF p_system_id IS NULL THEN
    RAISE EXCEPTION 'An SCH system must be explicitly selected';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client_id AND role = 'client') THEN
    RAISE EXCEPTION 'Selected client % is not a client account', p_client_id;
  END IF;

  SELECT client_id INTO v_sys_client FROM public.systems WHERE id = p_system_id;
  IF v_sys_client IS NULL THEN
    RAISE EXCEPTION 'Selected system % does not exist', p_system_id;
  END IF;
  IF v_sys_client <> p_client_id THEN
    RAISE EXCEPTION 'Cross-client linking forbidden: selected system belongs to a different client';
  END IF;

  SELECT ownership, status INTO v_acct_own, v_acct_stat
  FROM public.provider_accounts
  WHERE id = v_disc.provider_account_id;
  IF v_acct_stat = 'archived' THEN
    RAISE EXCEPTION 'Cannot link resources from an archived provider account';
  END IF;

  -- Normalize the discovered type into the existing resources vocabulary.
  v_res_type := CASE v_disc.resource_type
    WHEN 'database' THEN 'database'
    WHEN 'zone'     THEN 'dns_zone'
    WHEN 'storage'  THEN 'storage_bucket'
    WHEN 'service'  THEN 'api_service'
    WHEN 'hosting'  THEN 'web_app'
    WHEN 'project'  THEN 'web_app'
    ELSE 'other'
  END;

  INSERT INTO public.resources (
    system_id, provider_account_id, name, resource_type, ownership,
    client_id, external_reference, status
  ) VALUES (
    p_system_id, v_disc.provider_account_id, v_disc.name, v_res_type,
    'client_owned', p_client_id,
    'provider:' || v_disc.external_resource_id,
    'active'
  )
  RETURNING id INTO v_resource_id;

  UPDATE public.provider_discovered_resources
  SET link_status = 'linked',
      linked_resource_id = v_resource_id,
      linked_at = now(),
      linked_by = p_linked_by,
      updated_at = now()
  WHERE id = p_discovered_id;

  PERFORM public.write_audit_log(
    'provider_resource.linked',
    'provider_discovered_resources',
    p_discovered_id,
    to_jsonb(v_disc),
    NULL,
    jsonb_build_object(
      'resource_id', v_resource_id,
      'client_id', p_client_id,
      'system_id', p_system_id,
      'external_resource_id', v_disc.external_resource_id
    )
  );

  RETURN v_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_discovered_resource(
  p_discovered_id UUID,
  p_actor UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disc public.provider_discovered_resources%ROWTYPE;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may unlink provider resources';
  END IF;

  SELECT * INTO v_disc
  FROM public.provider_discovered_resources
  WHERE id = p_discovered_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discovered resource % not found', p_discovered_id;
  END IF;
  IF v_disc.link_status <> 'linked' THEN
    RETURN; -- already unlinked/dismissed — nothing to do
  END IF;

  UPDATE public.provider_discovered_resources
  SET link_status = 'unlinked',
      linked_at = NULL,
      linked_by = NULL,
      updated_at = now()
  WHERE id = p_discovered_id;

  -- The SCH resource row is retained (audit history); it can be retired via
  -- the existing resource lifecycle if needed. Discovery evidence persists.
  PERFORM public.write_audit_log(
    'provider_resource.unlinked',
    'provider_discovered_resources',
    p_discovered_id,
    to_jsonb(v_disc),
    NULL,
    jsonb_build_object('resource_id', v_disc.linked_resource_id)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Audit triggers
-- ----------------------------------------------------------------------------
-- Provider account connection activity (tests, credential configure/clear).
CREATE OR REPLACE FUNCTION public.log_provider_connection_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_connection.created', 'provider_accounts', NEW.id, NULL, to_jsonb(NEW),
      jsonb_build_object('provider_id', NEW.provider_id, 'account_name', NEW.account_name)
    );
    RETURN NEW;
  END IF;

  -- credential_reference changed → configured or cleared (never log the value)
  IF OLD.credential_reference IS DISTINCT FROM NEW.credential_reference THEN
    PERFORM public.write_audit_log(
      'provider_connection.credential_' || CASE WHEN NEW.credential_reference IS NULL THEN 'cleared' ELSE 'configured' END,
      'provider_accounts', NEW.id, NULL, NULL,
      jsonb_build_object('credential_store', CASE WHEN NEW.credential_reference IS NULL THEN 'none' ELSE 'vault' END)
    );
  END IF;

  -- connection test ran (checked_at or status changed)
  IF OLD.connection_checked_at IS DISTINCT FROM NEW.connection_checked_at
     OR OLD.connection_status IS DISTINCT FROM NEW.connection_status THEN
    PERFORM public.write_audit_log(
      'provider_connection.tested', 'provider_accounts', NEW.id, NULL, NULL,
      jsonb_build_object(
        'connection_status', NEW.connection_status,
        'error_category', NEW.connection_error
      )
    );
  END IF;

  IF OLD.account_name IS DISTINCT FROM NEW.account_name
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.ownership IS DISTINCT FROM NEW.ownership
     OR OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    PERFORM public.write_audit_log(
      'provider_connection.updated', 'provider_accounts', NEW.id, to_jsonb(OLD), to_jsonb(NEW), NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_connection_audit ON public.provider_accounts;
CREATE TRIGGER trg_provider_connection_audit
  AFTER INSERT OR UPDATE ON public.provider_accounts
  FOR EACH ROW EXECUTE FUNCTION public.log_provider_connection_audit();

-- Discovery run lifecycle.
CREATE OR REPLACE FUNCTION public.log_discovery_run_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_discovery.started', 'provider_discovery_runs', NEW.id, NULL, NULL,
      jsonb_build_object('provider_account_id', NEW.provider_account_id, 'initiated_by', NEW.initiated_by)
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'running' THEN
    PERFORM public.write_audit_log(
      'provider_discovery.' || CASE WHEN NEW.status = 'failed' THEN 'failed' ELSE 'completed' END,
      'provider_discovery_runs', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'status', NEW.status,
        'discovered_count', NEW.discovered_count,
        'new_count', NEW.new_count,
        'linked_count', NEW.linked_count,
        'error_summary', NEW.error_summary
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_discovery_run_audit ON public.provider_discovery_runs;
CREATE TRIGGER trg_discovery_run_audit
  AFTER INSERT OR UPDATE ON public.provider_discovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_discovery_run_audit();

-- ----------------------------------------------------------------------------
-- 9. Views
-- ----------------------------------------------------------------------------
-- Admin/Finance connection overview. credential_reference is NEVER selected —
-- only a boolean "credentials configured" flag. No secrets, no ref values.
CREATE OR REPLACE VIEW public.provider_connection_overview AS
SELECT
  pa.id,
  pa.provider_id,
  pr.name AS provider_name,
  pr.adapter_key,
  pa.account_name,
  pa.account_identifier,
  pa.ownership,
  pa.client_id,
  cp.company_name AS client_company,
  cp.email AS client_email,
  pa.status AS account_status,
  pa.connection_status,
  pa.connection_checked_at,
  pa.connection_error,
  pa.last_discovery_at,
  pa.discovery_capabilities,
  (pa.credential_reference IS NOT NULL) AS credential_configured,
  pa.created_at,
  pa.updated_at,
  (SELECT count(*) FROM public.provider_discovered_resources d
    WHERE d.provider_account_id = pa.id) AS discovered_count,
  (SELECT count(*) FROM public.provider_discovered_resources d
    WHERE d.provider_account_id = pa.id AND d.link_status = 'linked') AS linked_count,
  (SELECT max(r.started_at) FROM public.provider_discovery_runs r
    WHERE r.provider_account_id = pa.id) AS last_run_at
FROM public.provider_accounts pa
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.profiles cp ON cp.id = pa.client_id
WHERE public.is_admin() OR public.is_finance();

-- Staff-safe view: operational context for LINKED resources only.
-- No credentials, no run internals, no metadata payload, no financial fields.
CREATE OR REPLACE VIEW public.staff_linked_provider_resources AS
SELECT
  d.id,
  d.provider_account_id,
  pr.name AS provider_name,
  pa.account_name AS provider_account_name,
  d.resource_type,
  d.name,
  d.status,
  d.region,
  d.external_url,
  d.linked_resource_id,
  d.linked_at,
  s.name AS system_name,
  cp.company_name AS client_company,
  cp.email AS client_email
FROM public.provider_discovered_resources d
JOIN public.provider_accounts pa ON pa.id = d.provider_account_id
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.resources r ON r.id = d.linked_resource_id
LEFT JOIN public.systems s ON s.id = r.system_id
LEFT JOIN public.profiles cp ON cp.id = r.client_id
WHERE d.link_status = 'linked'
  AND (public.is_admin() OR public.is_finance() OR public.is_staff());

-- ----------------------------------------------------------------------------
-- 10. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_discovered_resources ENABLE ROW LEVEL SECURITY;

-- Discovery runs: Admin read/write, Finance read-only, Staff/Client denied.
DROP POLICY IF EXISTS discovery_runs_select_admin ON public.provider_discovery_runs;
CREATE POLICY discovery_runs_select_admin ON public.provider_discovery_runs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS discovery_runs_select_finance ON public.provider_discovery_runs;
CREATE POLICY discovery_runs_select_finance ON public.provider_discovery_runs
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS discovery_runs_insert_admin ON public.provider_discovery_runs;
CREATE POLICY discovery_runs_insert_admin ON public.provider_discovery_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS discovery_runs_update_admin ON public.provider_discovery_runs;
CREATE POLICY discovery_runs_update_admin ON public.provider_discovery_runs
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Discovered resources: Admin read/write, Finance read-only.
-- Staff get NO raw-table access — their context comes through
-- staff_linked_provider_resources (linked rows only, curated columns).
DROP POLICY IF EXISTS discovered_select_admin ON public.provider_discovered_resources;
CREATE POLICY discovered_select_admin ON public.provider_discovered_resources
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS discovered_select_finance ON public.provider_discovered_resources;
CREATE POLICY discovered_select_finance ON public.provider_discovered_resources
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS discovered_insert_admin ON public.provider_discovered_resources;
CREATE POLICY discovered_insert_admin ON public.provider_discovered_resources
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS discovered_update_admin ON public.provider_discovered_resources;
CREATE POLICY discovered_update_admin ON public.provider_discovered_resources
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. Delete safety — discovery evidence and run history are auditable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_discovery_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Provider discovery records are auditable history and cannot be deleted; use link_status transitions instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_discovery_runs_no_delete ON public.provider_discovery_runs;
CREATE TRIGGER trg_discovery_runs_no_delete
  BEFORE DELETE ON public.provider_discovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.provider_discovery_prevent_destructive_delete();

DROP TRIGGER IF EXISTS trg_discovered_no_delete ON public.provider_discovered_resources;
CREATE TRIGGER trg_discovered_no_delete
  BEFORE DELETE ON public.provider_discovered_resources
  FOR EACH ROW EXECUTE FUNCTION public.provider_discovery_prevent_destructive_delete();

DROP TRIGGER IF EXISTS set_discovery_runs_updated_at ON public.provider_discovery_runs;
CREATE TRIGGER set_discovery_runs_updated_at
  BEFORE UPDATE ON public.provider_discovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_discovered_updated_at ON public.provider_discovered_resources;
CREATE TRIGGER set_discovered_updated_at
  BEFORE UPDATE ON public.provider_discovered_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. Privilege hardening
-- ----------------------------------------------------------------------------
-- Tables
REVOKE ALL ON public.provider_discovery_runs FROM anon;
REVOKE ALL ON public.provider_discovered_resources FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.provider_discovery_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_discovered_resources TO authenticated;
REVOKE DELETE, TRUNCATE ON public.provider_discovery_runs FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.provider_discovered_resources FROM authenticated, anon;
GRANT ALL ON public.provider_discovery_runs TO service_role;
GRANT ALL ON public.provider_discovered_resources TO service_role;
REVOKE TRUNCATE ON public.provider_discovery_runs FROM service_role;
REVOKE TRUNCATE ON public.provider_discovered_resources FROM service_role;

-- Views
REVOKE ALL ON public.provider_connection_overview FROM anon, authenticated, service_role;
REVOKE ALL ON public.staff_linked_provider_resources FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_connection_overview TO authenticated, service_role;
GRANT SELECT ON public.staff_linked_provider_resources TO authenticated, service_role;

-- Credential + linking functions: service_role only. No application role may
-- execute them directly over PostgREST; server actions call them with the
-- service key after their own role checks.
REVOKE EXECUTE ON FUNCTION public.caller_is_service_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_provider_credential(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reveal_provider_credential(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_provider_credential(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_discovered_resource(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlink_discovered_resource(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Repair pre-existing default-privilege TRUNCATE grants on earlier views
-- (Supabase default privileges granted TRUNCATE on views to these roles).
REVOKE TRUNCATE ON public.staff_service_agreements_view FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON public.backup_policy_health FROM anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.caller_is_service_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.store_provider_credential(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reveal_provider_credential(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_provider_credential(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_discovered_resource(UUID, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlink_discovered_resource(UUID, UUID) TO service_role;
