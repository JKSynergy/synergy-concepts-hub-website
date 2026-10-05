-- Migration 027 — Railway provider enhancement
-- Adds workspace/environment as discovered resource types and dedicated
-- workspace-scope columns on provider_accounts for Railway connections.
-- Credentials remain in Vault only; these columns are non-secret configuration.

BEGIN;

-- 1. Allow discovered resources to represent Railway workspace and environment nodes.
ALTER TABLE public.provider_discovered_resources
  DROP CONSTRAINT IF EXISTS provider_discovered_resources_resource_type_check;

ALTER TABLE public.provider_discovered_resources
  ADD CONSTRAINT provider_discovered_resources_resource_type_check
  CHECK (resource_type IN (
    'workspace', 'project', 'environment', 'service', 'database',
    'zone', 'hosting', 'storage', 'deployment', 'other'
  ));

-- 2. Workspace scope fields for Railway accounts. No secrets here.
ALTER TABLE public.provider_accounts
  ADD COLUMN IF NOT EXISTS railway_workspace_id text
    CONSTRAINT chk_provider_account_workspace_id_no_secrets
    CHECK (public.check_no_secrets_in_text(railway_workspace_id));

ALTER TABLE public.provider_accounts
  ADD COLUMN IF NOT EXISTS railway_workspace_name text
    CONSTRAINT chk_provider_account_workspace_name_no_secrets
    CHECK (public.check_no_secrets_in_text(railway_workspace_name));

-- 3. Refresh the admin/finance overview to expose the new scope columns.
DROP VIEW IF EXISTS public.provider_connection_overview;

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
  pa.railway_workspace_id,
  pa.railway_workspace_name,
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

-- Preserve existing grants.
REVOKE ALL ON public.provider_connection_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_connection_overview TO authenticated, service_role;

COMMIT;
