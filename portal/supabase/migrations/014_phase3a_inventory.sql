BEGIN;

-- =====================================================================
-- 014_phase3a_inventory.sql
-- PHASE 3A: INVENTORY & TECHNICAL HIERARCHY
--
-- Introduces core inventory and technical hierarchy tables:
--   1. public.providers (canonical vendor/provider catalog)
--   2. public.provider_accounts (org/client accounts within providers)
--   3. public.systems (high-level business digital products)
--   4. public.resources (technical components supporting systems or standalone)
--
-- Plus additive relationship:
--   - public.projects.system_id (nullable, ON DELETE SET NULL)
--
-- Invariants enforced:
--   - resources.system_id MUST be nullable (standalone domains, R2 buckets, DNS zones)
--   - No clients table; profiles.id is reused for client ownership
--   - Same-client integrity constraint between resources and systems
--   - Same-client integrity constraint between resources and client_owned provider_accounts
--   - Secrets guard check function prevents credentials/keys in metadata
--   - Destructive application-level DELETE is blocked; archival/retirement lifecycle used
--   - Full RLS enforcement: Admin full management, Staff operational view/update,
--     Finance read-only context, Client no access (D8)
--   - Explicit PostgreSQL grants: authenticated gets SELECT/INSERT/UPDATE;
--     service_role gets SELECT/INSERT/UPDATE/DELETE; anon gets NONE; TRUNCATE revoked from all.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Anti-Secrets Guard Function
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_no_secrets_in_text(val text)
RETURNS boolean AS $$
BEGIN
  IF val IS NULL THEN
    RETURN true;
  END IF;

  -- Disallow private keys
  IF val ILIKE '%-----BEGIN%PRIVATE KEY%' OR val ILIKE '%-----BEGIN RSA PRIVATE KEY%' THEN
    RETURN false;
  END IF;

  -- Disallow connection strings containing passwords
  IF val ~* 'postgres(ql)?:\/\/[^:]+:[^@]+@' THEN
    RETURN false;
  END IF;

  -- Disallow recognizable API keys and tokens (JWTs, service tokens, live secret keys, personal tokens)
  IF val ~ '(eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{20,})'
     OR val ~ '\y(sk_live_[0-9a-zA-Z]{16,}|sb_secret_[0-9a-zA-Z]{16,}|ghp_[0-9a-zA-Z]{20,}|xox[baprs]-[0-9a-zA-Z]{10,})\y'
     OR val ~* '\y(password|secret|apikey|api_key)\s*[:=]\s*["''][^"'']{6,}["'']' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 2. Providers Table (Canonical vendor catalog)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'other' CHECK (
    category IN (
      'cloud_hosting',
      'database',
      'storage',
      'dns_domain',
      'auth_identity',
      'api_service',
      'email',
      'monitoring',
      'other'
    )
  ),
  website_url text,
  operational_notes text CHECK (public.check_no_secrets_in_text(operational_notes)),
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Provider Accounts Table (Org / Client accounts within a vendor)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  account_name text NOT NULL,
  account_identifier text CHECK (public.check_no_secrets_in_text(account_identifier)),
  ownership text NOT NULL DEFAULT 'sch_managed' CHECK (ownership IN ('sch_managed', 'client_owned')),
  client_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  credential_reference text CHECK (public.check_no_secrets_in_text(credential_reference)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived', 'pending_verification')),
  operational_notes text CHECK (public.check_no_secrets_in_text(operational_notes)),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_provider_account_client_ownership CHECK (ownership != 'client_owned' OR client_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 4. Systems Table (High-level client digital product)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text,
  system_type text NOT NULL DEFAULT 'web_platform' CHECK (
    system_type IN (
      'web_platform',
      'mobile_app',
      'ecommerce',
      'sacco_platform',
      'lending_system',
      'corporate_website',
      'custom_api',
      'internal_tool',
      'other'
    )
  ),
  status text NOT NULL DEFAULT 'planned' CHECK (
    status IN (
      'planned',
      'in_build',
      'live',
      'maintenance_only',
      'suspended',
      'retired'
    )
  ),
  description text CHECK (public.check_no_secrets_in_text(description)),
  primary_url text,
  origin_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  operational_notes text CHECK (public.check_no_secrets_in_text(operational_notes)),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. Resources Table (Technical components; system_id is explicitly NULLABLE)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid REFERENCES public.systems(id) ON DELETE RESTRICT, -- NULLABLE: may exist standalone
  provider_account_id uuid NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  name text NOT NULL,
  resource_type text NOT NULL CHECK (
    resource_type IN (
      'web_app',
      'database',
      'storage_bucket',
      'dns_zone',
      'domain',
      'api_service',
      'auth_service',
      'worker_cron',
      'other'
    )
  ),
  ownership text NOT NULL DEFAULT 'sch_managed' CHECK (ownership IN ('sch_managed', 'client_owned')),
  client_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  external_reference text CHECK (public.check_no_secrets_in_text(external_reference)),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN (
      'provisioning',
      'active',
      'degraded',
      'maintenance',
      'suspended',
      'retired'
    )
  ),
  suspension_capability text NOT NULL DEFAULT 'none' CHECK (
    suspension_capability IN (
      'independent',
      'via_dependency',
      'application_level',
      'manual_only',
      'none'
    )
  ),
  backup_verifiable boolean NOT NULL DEFAULT false,
  operational_notes text CHECK (public.check_no_secrets_in_text(operational_notes)),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. Additive Project Link (projects.system_id nullable)
-- ---------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS system_id uuid REFERENCES public.systems(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 7. Same-Client Integrity Triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_resource_client_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_sys_client_id uuid;
  v_acct_ownership text;
  v_acct_client_id uuid;
BEGIN
  -- Validate provider account client match
  SELECT ownership, client_id INTO v_acct_ownership, v_acct_client_id
  FROM public.provider_accounts
  WHERE id = NEW.provider_account_id;

  IF v_acct_ownership = 'client_owned' AND v_acct_client_id IS NOT NULL THEN
    IF NEW.client_id IS NOT NULL AND NEW.client_id != v_acct_client_id THEN
      RAISE EXCEPTION 'Cross-client resource account forbidden: resource client (%) does not match provider account client (%)', NEW.client_id, v_acct_client_id;
    END IF;
  END IF;

  -- Validate system client match when system_id is attached
  IF NEW.system_id IS NOT NULL THEN
    SELECT client_id INTO v_sys_client_id FROM public.systems WHERE id = NEW.system_id;
    IF v_sys_client_id IS NULL THEN
      RAISE EXCEPTION 'Attached system % does not exist', NEW.system_id;
    END IF;

    IF NEW.ownership = 'client_owned' THEN
      IF NEW.client_id IS NULL THEN
        NEW.client_id := v_sys_client_id;
      ELSIF NEW.client_id != v_sys_client_id THEN
        RAISE EXCEPTION 'Cross-client resource attachment forbidden: client_owned resource client (%) does not match system client (%)', NEW.client_id, v_sys_client_id;
      END IF;
    ELSIF NEW.client_id IS NOT NULL AND NEW.client_id != v_sys_client_id THEN
      RAISE EXCEPTION 'Cross-client resource attachment forbidden: resource assigned client (%) does not match system client (%)', NEW.client_id, v_sys_client_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resource_client_integrity ON public.resources;
CREATE TRIGGER trg_resource_client_integrity
  BEFORE INSERT OR UPDATE ON public.resources
  FOR EACH ROW
  EXECUTE FUNCTION public.check_resource_client_integrity();

CREATE OR REPLACE FUNCTION public.check_system_client_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    IF EXISTS (
      SELECT 1 FROM public.resources r
      WHERE r.system_id = NEW.id
        AND r.client_id IS NOT NULL
        AND r.client_id != NEW.client_id
    ) THEN
      RAISE EXCEPTION 'Cannot transfer system % to client %: attached resources belong to another client', NEW.id, NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_client_integrity ON public.systems;
CREATE TRIGGER trg_system_client_integrity
  BEFORE UPDATE OF client_id ON public.systems
  FOR EACH ROW
  EXECUTE FUNCTION public.check_system_client_integrity();

-- ---------------------------------------------------------------------
-- 8. Updated At Triggers
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_providers_updated_at ON public.providers;
CREATE TRIGGER set_providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_provider_accounts_updated_at ON public.provider_accounts;
CREATE TRIGGER set_provider_accounts_updated_at
  BEFORE UPDATE ON public.provider_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_systems_updated_at ON public.systems;
CREATE TRIGGER set_systems_updated_at
  BEFORE UPDATE ON public.systems
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_resources_updated_at ON public.resources;
CREATE TRIGGER set_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 9. Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_providers_category ON public.providers(category);
CREATE INDEX IF NOT EXISTS idx_providers_is_active ON public.providers(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_archived_at ON public.providers(archived_at);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider_id ON public.provider_accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_client_id ON public.provider_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_ownership ON public.provider_accounts(ownership);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_status ON public.provider_accounts(status);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_archived_at ON public.provider_accounts(archived_at);

CREATE INDEX IF NOT EXISTS idx_systems_client_id ON public.systems(client_id);
CREATE INDEX IF NOT EXISTS idx_systems_status ON public.systems(status);
CREATE INDEX IF NOT EXISTS idx_systems_system_type ON public.systems(system_type);
CREATE INDEX IF NOT EXISTS idx_systems_origin_project_id ON public.systems(origin_project_id);
CREATE INDEX IF NOT EXISTS idx_systems_archived_at ON public.systems(archived_at);

CREATE INDEX IF NOT EXISTS idx_resources_system_id ON public.resources(system_id);
CREATE INDEX IF NOT EXISTS idx_resources_provider_account_id ON public.resources(provider_account_id);
CREATE INDEX IF NOT EXISTS idx_resources_client_id ON public.resources(client_id);
CREATE INDEX IF NOT EXISTS idx_resources_resource_type ON public.resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resources_status ON public.resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_external_reference ON public.resources(external_reference);
CREATE INDEX IF NOT EXISTS idx_resources_retired_at ON public.resources(retired_at);

CREATE INDEX IF NOT EXISTS idx_projects_system_id ON public.projects(system_id);

-- ---------------------------------------------------------------------
-- 10. Row Level Security & Policies
-- ---------------------------------------------------------------------
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- providers policies
DROP POLICY IF EXISTS "providers_select_internal" ON public.providers;
CREATE POLICY "providers_select_internal" ON public.providers
  FOR SELECT USING (public.is_staff() OR public.is_finance());

DROP POLICY IF EXISTS "providers_insert_admin" ON public.providers;
CREATE POLICY "providers_insert_admin" ON public.providers
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "providers_update_admin" ON public.providers;
CREATE POLICY "providers_update_admin" ON public.providers
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "providers_delete_blocked" ON public.providers;
CREATE POLICY "providers_delete_blocked" ON public.providers
  FOR DELETE USING (false);

-- provider_accounts policies
DROP POLICY IF EXISTS "provider_accounts_select_internal" ON public.provider_accounts;
CREATE POLICY "provider_accounts_select_internal" ON public.provider_accounts
  FOR SELECT USING (public.is_staff() OR public.is_finance());

DROP POLICY IF EXISTS "provider_accounts_insert_admin" ON public.provider_accounts;
CREATE POLICY "provider_accounts_insert_admin" ON public.provider_accounts
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "provider_accounts_update_admin" ON public.provider_accounts;
CREATE POLICY "provider_accounts_update_admin" ON public.provider_accounts
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "provider_accounts_delete_blocked" ON public.provider_accounts;
CREATE POLICY "provider_accounts_delete_blocked" ON public.provider_accounts
  FOR DELETE USING (false);

-- systems policies
DROP POLICY IF EXISTS "systems_select_internal" ON public.systems;
CREATE POLICY "systems_select_internal" ON public.systems
  FOR SELECT USING (public.is_staff() OR public.is_finance());

DROP POLICY IF EXISTS "systems_insert_admin" ON public.systems;
CREATE POLICY "systems_insert_admin" ON public.systems
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "systems_update_staff_admin" ON public.systems;
CREATE POLICY "systems_update_staff_admin" ON public.systems
  FOR UPDATE USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "systems_delete_blocked" ON public.systems;
CREATE POLICY "systems_delete_blocked" ON public.systems
  FOR DELETE USING (false);

-- resources policies
DROP POLICY IF EXISTS "resources_select_internal" ON public.resources;
CREATE POLICY "resources_select_internal" ON public.resources
  FOR SELECT USING (public.is_staff() OR public.is_finance());

DROP POLICY IF EXISTS "resources_insert_admin" ON public.resources;
CREATE POLICY "resources_insert_admin" ON public.resources
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "resources_update_staff_admin" ON public.resources;
CREATE POLICY "resources_update_staff_admin" ON public.resources
  FOR UPDATE USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "resources_delete_blocked" ON public.resources;
CREATE POLICY "resources_delete_blocked" ON public.resources
  FOR DELETE USING (false);

-- ---------------------------------------------------------------------
-- 11. Explicit Table Privileges
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE public.providers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.provider_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.systems FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.resources FROM PUBLIC, anon, authenticated;

-- Service role: standard application maintenance DML
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.systems TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resources TO service_role;

-- Authenticated: only authorized application DML (no DELETE, no TRUNCATE)
GRANT SELECT, INSERT, UPDATE ON TABLE public.providers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.provider_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.systems TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.resources TO authenticated;

-- Explicitly revoke TRUNCATE from all roles
REVOKE TRUNCATE ON TABLE public.providers FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.provider_accounts FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.systems FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON TABLE public.resources FROM anon, authenticated, service_role;

COMMIT;
