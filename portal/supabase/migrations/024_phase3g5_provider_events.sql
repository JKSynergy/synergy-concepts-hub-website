-- ============================================================================
-- PHASE 3G-5 — PROVIDER EVENTS & WEBHOOKS
-- ============================================================================
--
-- Evidence-ingestion layer. Authenticated provider webhooks are validated,
-- deduplicated, normalized, matched to the provider resource/SCH resource and
-- recorded as immutable evidence. Where the event indicates provider state may
-- have changed, the EXISTING 3G-4 monitoring pipeline (discovery →
-- reconciliation → classification → signals → incidents) runs — no parallel
-- comparison or mutation is introduced.
--
--   * No raw provider payloads are stored. Each event keeps a SHA-256 payload
--     hash + a minimized normalized summary (adapter-selected safe fields).
--   * Webhook secrets live in Supabase Vault; the table keeps only the vault
--     reference and a SHA-256 lookup hash.
--   * Deterministic dedupe: provider_account_id + provider_event_id, or a
--     canonical payload fingerprint when the provider supplies no event id.
--   * Duplicate deliveries are recorded as duplicates, never reprocessed.
--   * Events are evidence — they never directly mutate SCH resource state and
--     never invoke provider-side operations.
--
-- Provider authentication mechanisms (documented provider features only):
--   vercel     → x-vercel-signature  (HMAC-SHA1 hex over raw body)
--   supabase   → Authorization: Bearer <token>  (custom_headers on endpoint)
--   cloudflare → cf-webhook-auth     (configured shared secret header)
--   railway    → unguessable per-account URL token (Railway signs nothing; the
--                configured URL is the only authentication available)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. provider_webhook_configs — one authenticated ingestion config per account
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_webhook_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id   UUID NOT NULL UNIQUE REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  auth_type             TEXT NOT NULL
    CHECK (auth_type IN ('vercel_hmac_sha1', 'bearer_token', 'header_secret', 'url_token')),
  -- 'vault:<uuid>' — the shared secret/token itself lives in Supabase Vault.
  vault_ref            TEXT NOT NULL CHECK (vault_ref LIKE 'vault:%'),
  -- SHA-256 hex of the secret. Lookup key for token-class auth — never the secret.
  credential_hash           TEXT NOT NULL CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
  enabled               BOOLEAN NOT NULL DEFAULT false,
  last_received_at      TIMESTAMPTZ,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_config_credential_hash
  ON public.provider_webhook_configs (credential_hash) WHERE enabled;

-- ----------------------------------------------------------------------------
-- 2. provider_events — immutable authenticated event evidence
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_events (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id             UUID REFERENCES public.provider_webhook_configs(id) ON DELETE SET NULL,
  provider_account_id           UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  provider_id                   UUID NOT NULL REFERENCES public.providers(id),
  provider_event_id             TEXT,
  event_type                    TEXT NOT NULL
    CHECK (char_length(btrim(event_type)) > 0 AND public.check_no_secrets_in_text(event_type)),
  normalized_type               TEXT NOT NULL DEFAULT 'unknown'
    CHECK (normalized_type IN (
      'resource_created', 'resource_updated', 'resource_deleted',
      'resource_state_changed', 'resource_unavailable', 'resource_recovered',
      'deployment_started', 'deployment_succeeded', 'deployment_failed',
      'backup_succeeded', 'backup_failed',
      'account_event', 'configuration_changed', 'unknown')),
  occurred_at                   TIMESTAMPTZ,
  received_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                        TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'duplicate', 'failed', 'rejected', 'unmatched')),
  processing_error              TEXT CHECK (public.check_no_secrets_in_text(processing_error)),
  -- account-scoped identity: provider event id, or 'fp:' + payload hash.
  dedupe_key                    TEXT NOT NULL,
  duplicate_count               INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  payload_hash                  TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  -- Minimized normalized fields only — never the raw provider payload.
  payload_summary               JSONB,
  matched_discovered_resource_id UUID REFERENCES public.provider_discovered_resources(id) ON DELETE SET NULL,
  matched_resource_id           UUID REFERENCES public.resources(id) ON DELETE SET NULL,
  monitoring_run_id             UUID REFERENCES public.provider_monitoring_runs(id) ON DELETE SET NULL,
  reconciliation_run_id         UUID REFERENCES public.provider_reconciliation_runs(id) ON DELETE SET NULL,
  action_item_id                UUID REFERENCES public.action_items(id) ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_provider_event_dedupe UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_events_account_time
  ON public.provider_events (provider_account_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_events_external_id
  ON public.provider_events (provider_account_id, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_provider_events_status
  ON public.provider_events (status);
CREATE INDEX IF NOT EXISTS idx_provider_events_matched_resource
  ON public.provider_events (matched_resource_id) WHERE matched_resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_events_normalized
  ON public.provider_events (normalized_type);

-- ----------------------------------------------------------------------------
-- 3. Extend existing vocabularies (additive — no behaviour change)
-- ----------------------------------------------------------------------------
-- Events may trigger the shared monitoring pipeline with trigger 'event'.
ALTER TABLE public.provider_monitoring_runs
  DROP CONSTRAINT provider_monitoring_runs_trigger_source_check;
ALTER TABLE public.provider_monitoring_runs
  ADD CONSTRAINT provider_monitoring_runs_trigger_source_check
  CHECK (trigger_source IN ('manual', 'scheduled', 'event'));

-- Event-derived signals enter the Action Center with source 'provider_event'
-- and event_type 'provider_event'.
ALTER TABLE public.action_items DROP CONSTRAINT action_items_source_check;
ALTER TABLE public.action_items
  ADD CONSTRAINT action_items_source_check
  CHECK (source IN ('provider_monitoring', 'provider_reconciliation', 'provider_event', 'manual'));

ALTER TABLE public.action_items DROP CONSTRAINT action_items_event_type_check;
ALTER TABLE public.action_items
  ADD CONSTRAINT action_items_event_type_check
  CHECK (event_type IN (
    'connection_failure', 'discovery_failure', 'external_change',
    'missing_externally', 'new_external_resource', 'identity_change',
    'sch_only', 'provider_event', 'general'));

-- begin_monitoring_run (3G-4) gates the trigger vocabulary; re-declare it
-- with 'event' permitted. Behaviour is otherwise identical to Migration 023.
CREATE OR REPLACE FUNCTION public.begin_monitoring_run(
  p_provider_account_id UUID,
  p_trigger_source TEXT,
  p_schedule_id UUID DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run UUID;
  v_skip UUID;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators or the scheduler may start monitoring runs';
  END IF;
  IF p_trigger_source NOT IN ('manual', 'scheduled', 'event') THEN
    RAISE EXCEPTION 'Unknown monitoring trigger: %', p_trigger_source;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_accounts
    WHERE id = p_provider_account_id AND status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Provider account % is not available for monitoring', p_provider_account_id;
  END IF;

  -- Single-flight claim: the partial unique index rejects a second 'running'
  -- row for the same account. On conflict, record an audited 'skipped' run.
  INSERT INTO public.provider_monitoring_runs (
    schedule_id, provider_account_id, trigger_source, status
  ) VALUES (
    p_schedule_id, p_provider_account_id, p_trigger_source, 'running'
  )
  ON CONFLICT (provider_account_id) WHERE status = 'running' DO NOTHING
  RETURNING id INTO v_run;

  IF v_run IS NULL THEN
    INSERT INTO public.provider_monitoring_runs (
      schedule_id, provider_account_id, trigger_source, status,
      error_category, completed_at
    ) VALUES (
      p_schedule_id, p_provider_account_id, p_trigger_source, 'skipped',
      'already_running', now()
    ) RETURNING id INTO v_skip;
    RETURN jsonb_build_object('outcome', 'skipped', 'run_id', v_skip);
  END IF;

  RETURN jsonb_build_object('outcome', 'begin', 'run_id', v_run);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. save_webhook_config — admin-managed config; secret → Vault, hash → lookup
-- ----------------------------------------------------------------------------
-- The auth mechanism is derived from the provider's adapter — the caller never
-- chooses it. Returns { config_id, auth_type, secret } ONCE for provider-side
-- setup; the plaintext secret is never returned again.
CREATE OR REPLACE FUNCTION public.save_webhook_config(
  p_provider_account_id UUID,
  p_secret TEXT DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account   public.provider_accounts%ROWTYPE;
  v_auth      TEXT;
  v_secret    TEXT;
  v_ref       UUID;
  v_old_ref   TEXT;
  v_id        UUID;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may manage webhook configuration';
  END IF;
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE EXCEPTION 'Secure secret storage (supabase_vault) is unavailable; refusing to store webhook secret';
  END IF;

  SELECT * INTO v_account FROM public.provider_accounts WHERE id = p_provider_account_id;
  IF NOT FOUND OR v_account.status = 'archived' THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  v_auth := CASE (SELECT adapter_key FROM public.providers WHERE id = v_account.provider_id)
    WHEN 'vercel'     THEN 'vercel_hmac_sha1'
    WHEN 'supabase'   THEN 'bearer_token'
    WHEN 'cloudflare' THEN 'header_secret'
    WHEN 'railway'    THEN 'url_token'
    ELSE NULL END;
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Webhook ingestion is not supported for this provider';
  END IF;

  -- Token classes can be SCH-generated; Vercel's secret is provider-issued and
  -- MUST be supplied (it is shown once at webhook creation).
  v_secret := NULLIF(btrim(COALESCE(p_secret, '')), '');
  IF v_secret IS NULL AND v_auth = 'vercel_hmac_sha1' THEN
    RAISE EXCEPTION 'Vercel webhook secrets are provider-issued — supply the secret shown at webhook creation';
  END IF;
  IF v_secret IS NULL THEN
    v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  END IF;
  IF length(v_secret) < 16 THEN
    RAISE EXCEPTION 'Webhook secret rejected: too short';
  END IF;

  EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
    INTO v_ref
    USING v_secret,
          'provider-webhook/' || p_provider_account_id::text || '/' || gen_random_uuid()::text,
          'SCH Portal provider webhook secret (inbound authentication)';

  -- Capture the superseded vault reference for rotation cleanup.
  SELECT vault_ref INTO v_old_ref
  FROM public.provider_webhook_configs
  WHERE provider_account_id = p_provider_account_id;

  INSERT INTO public.provider_webhook_configs (
    provider_account_id, auth_type, vault_ref, credential_hash, enabled, created_by
  ) VALUES (
    p_provider_account_id, v_auth, 'vault:' || v_ref::text,
    encode(sha256(v_secret::bytea), 'hex'), false, p_actor
  )
  ON CONFLICT (provider_account_id) DO UPDATE SET
    vault_ref = 'vault:' || v_ref::text,
    credential_hash = encode(sha256(v_secret::bytea), 'hex'),
    updated_at = now()
  RETURNING id INTO v_id;

  IF v_old_ref IS NOT NULL AND v_old_ref LIKE 'vault:%' THEN
    EXECUTE 'DELETE FROM vault.secrets WHERE id = $1::uuid'
      USING substring(v_old_ref from 7);
  END IF;

  RETURN jsonb_build_object(
    'config_id', v_id, 'auth_type', v_auth, 'secret', v_secret
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_webhook_config_enabled(
  p_provider_account_id UUID,
  p_enabled BOOLEAN,
  p_actor UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may manage webhook configuration';
  END IF;
  UPDATE public.provider_webhook_configs
  SET enabled = p_enabled, updated_at = now()
  WHERE provider_account_id = p_provider_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No webhook configuration exists for provider account %', p_provider_account_id;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Ingestion helpers — service-role only
-- ----------------------------------------------------------------------------
-- Token-class lookup (bearer_token / header_secret / url_token): find the
-- enabled config whose stored hash equals the presented credential's hash.
DROP FUNCTION IF EXISTS public.lookup_webhook_config_by_hash(TEXT);
CREATE OR REPLACE FUNCTION public.lookup_webhook_config_by_hash(p_credential_hash TEXT)
RETURNS TABLE (config_id UUID, provider_account_id UUID, provider_id UUID, adapter_key TEXT, auth_type TEXT)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.provider_account_id, a.provider_id, p.adapter_key, c.auth_type
  FROM public.provider_webhook_configs c
  JOIN public.provider_accounts a ON a.id = c.provider_account_id
  JOIN public.providers p ON p.id = a.provider_id
  WHERE c.enabled AND c.credential_hash = p_credential_hash AND a.status <> 'archived';
$$;

-- HMAC iteration set: enabled configs for a provider. Secrets are revealed
-- one-by-one via reveal_webhook_secret (service_role only).
CREATE OR REPLACE FUNCTION public.hmac_webhook_configs(p_adapter_key TEXT)
RETURNS TABLE (config_id UUID, provider_account_id UUID, provider_id UUID)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.provider_account_id, a.provider_id
  FROM public.provider_webhook_configs c
  JOIN public.provider_accounts a ON a.id = c.provider_account_id
  JOIN public.providers p ON p.id = a.provider_id
  WHERE c.enabled AND c.auth_type = 'vercel_hmac_sha1'
    AND p.adapter_key = p_adapter_key AND a.status <> 'archived';
$$;

CREATE OR REPLACE FUNCTION public.reveal_webhook_secret(p_config_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT;
  v_secret TEXT;
BEGIN
  IF NOT public.caller_is_service_role() THEN
    RAISE EXCEPTION 'Webhook secrets may only be read by the service role';
  END IF;
  SELECT vault_ref INTO v_ref FROM public.provider_webhook_configs WHERE id = p_config_id;
  IF v_ref IS NULL OR v_ref NOT LIKE 'vault:%' THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1::uuid'
    INTO v_secret USING substring(v_ref from 7);
  RETURN v_secret;
END;
$$;

-- Unattributable authentication failures still produce an audit trail.
CREATE OR REPLACE FUNCTION public.record_webhook_auth_failure(
  p_adapter_key TEXT,
  p_reason TEXT DEFAULT 'invalid_signature'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_is_service_role() THEN
    RAISE EXCEPTION 'Service role only';
  END IF;
  PERFORM public.write_audit_log(
    'provider_event.auth_failed', 'provider_events', NULL, NULL, NULL,
    jsonb_build_object('provider', p_adapter_key, 'reason', p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_webhook_received(p_config_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.provider_webhook_configs
  SET last_received_at = now(), updated_at = now()
  WHERE id = p_config_id;
$$;

-- ----------------------------------------------------------------------------
-- 6. record_provider_event — dedupe + match + insert
-- ----------------------------------------------------------------------------
-- Returns { outcome: 'recorded'|'duplicate', event_id, matched }.
-- Matching uses only authoritative provider identities: external resource ids
-- already known from discovery → linked SCH resource. Never client guessing.
CREATE OR REPLACE FUNCTION public.record_provider_event(
  p_webhook_config_id UUID,
  p_provider_account_id UUID,
  p_provider_event_id TEXT,
  p_event_type TEXT,
  p_normalized_type TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_payload_hash TEXT,
  p_payload_summary JSONB,
  p_external_ids TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dedupe  TEXT;
  v_event   UUID;
  v_disc    UUID;
  v_res     UUID;
  v_pid     UUID;
BEGIN
  IF NOT public.caller_is_service_role() THEN
    RAISE EXCEPTION 'Service role only';
  END IF;
  SELECT provider_id INTO v_pid FROM public.provider_accounts WHERE id = p_provider_account_id;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  v_dedupe := p_provider_account_id::text || ':' ||
    COALESCE(NULLIF(btrim(COALESCE(p_provider_event_id, '')), ''), 'fp:' || p_payload_hash);

  -- At-least-once delivery: an existing row means this event was already seen.
  SELECT id INTO v_event FROM public.provider_events WHERE dedupe_key = v_dedupe;
  IF v_event IS NOT NULL THEN
    -- The original row keeps its processing status; duplicate_count is the
    -- replay record. Retried deliveries must never flip the evidence state.
    UPDATE public.provider_events
    SET duplicate_count = duplicate_count + 1, updated_at = now()
    WHERE id = v_event;
    RETURN jsonb_build_object('outcome', 'duplicate', 'event_id', v_event);
  END IF;

  -- Authoritative match: external ids → discovered resource → linked SCH resource.
  IF p_external_ids IS NOT NULL THEN
    SELECT d.id, d.linked_resource_id INTO v_disc, v_res
    FROM public.provider_discovered_resources d
    WHERE d.provider_account_id = p_provider_account_id
      AND d.external_resource_id = ANY (p_external_ids)
    ORDER BY (d.linked_resource_id IS NOT NULL) DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.provider_events (
    webhook_config_id, provider_account_id, provider_id,
    provider_event_id, event_type, normalized_type, occurred_at,
    payload_hash, payload_summary, dedupe_key,
    matched_discovered_resource_id, matched_resource_id, status
  ) VALUES (
    p_webhook_config_id, p_provider_account_id, v_pid,
    NULLIF(btrim(COALESCE(p_provider_event_id, '')), ''), p_event_type,
    p_normalized_type, p_occurred_at,
    p_payload_hash, p_payload_summary, v_dedupe,
    v_disc, v_res, 'received'
  ) RETURNING id INTO v_event;

  RETURN jsonb_build_object(
    'outcome', 'recorded', 'event_id', v_event,
    'matched_discovered_resource_id', v_disc, 'matched_resource_id', v_res
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent duplicate delivery: the other transaction won the race.
    SELECT id INTO v_event FROM public.provider_events WHERE dedupe_key = v_dedupe;
    IF v_event IS NOT NULL THEN
      UPDATE public.provider_events
      SET duplicate_count = duplicate_count + 1, updated_at = now()
      WHERE id = v_event;
    END IF;
    RETURN jsonb_build_object('outcome', 'duplicate', 'event_id', v_event);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. signal_provider_event — event-derived Action Center signal
-- ----------------------------------------------------------------------------
-- Only categories that are themselves actionable evidence get a signal here.
-- State-asserting events (resource_*) rely on the reconciliation pipeline —
-- except when unmatched, where reconciliation can produce nothing.
CREATE OR REPLACE FUNCTION public.signal_provider_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ev      public.provider_events%ROWTYPE;
  v_res     public.resources%ROWTYPE;
  v_dedupe  TEXT;
  v_sev     TEXT;
  v_title   TEXT;
  v_action  TEXT;
  v_item    UUID;
BEGIN
  IF NOT public.caller_is_service_role() THEN
    RAISE EXCEPTION 'Service role only';
  END IF;
  SELECT * INTO v_ev FROM public.provider_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider event % not found', p_event_id;
  END IF;

  -- Deterministic policy: which normalized categories surface a signal.
  v_sev := NULL;
  IF v_ev.normalized_type = 'deployment_failed' THEN
    v_sev := 'warning';
    v_title := 'Provider deployment failed';
    v_action := 'Review the failed deployment at the provider';
  ELSIF v_ev.normalized_type = 'backup_failed' THEN
    v_sev := 'warning';
    v_title := 'Provider backup failed';
    v_action := 'Review backup configuration and provider status';
  ELSIF v_ev.normalized_type = 'configuration_changed' THEN
    v_sev := 'info';
    v_title := 'Provider configuration changed';
    v_action := 'Review the configuration change';
  ELSIF v_ev.normalized_type IN (
      'resource_created', 'resource_updated', 'resource_deleted',
      'resource_state_changed', 'resource_unavailable', 'resource_recovered')
    AND v_ev.matched_discovered_resource_id IS NULL THEN
    -- Provider reported state for a resource SCH does not track: reconciliation
    -- cannot surface it, so an informational signal is the review path.
    v_sev := 'info';
    v_title := 'Provider event for an untracked resource';
    v_action := 'Review the provider event and link the resource if it belongs to SCH';
  END IF;

  IF v_sev IS NULL THEN
    RETURN jsonb_build_object('signaled', false);
  END IF;

  SELECT * INTO v_res FROM public.resources WHERE id = v_ev.matched_resource_id;
  v_dedupe := 'evt:' || v_ev.provider_account_id::text || ':'
    || COALESCE(v_ev.matched_discovered_resource_id::text, 'account')
    || ':' || v_ev.normalized_type;

  SELECT id INTO v_item FROM public.action_items
  WHERE dedupe_key = v_dedupe AND status IN ('open', 'acknowledged');

  IF v_item IS NOT NULL THEN
    UPDATE public.action_items
    SET detected_at = now(),
        summary = COALESCE(v_ev.payload_summary ->> 'summary', v_ev.event_type),
        updated_at = now()
    WHERE id = v_item;
  ELSE
    INSERT INTO public.action_items (
      source, event_type, severity, title, summary, recommended_action,
      dedupe_key, provider_account_id, discovered_resource_id,
      client_id, system_id, resource_id, detected_at
    ) VALUES (
      'provider_event', 'provider_event', v_sev, v_title,
      COALESCE(v_ev.payload_summary ->> 'summary', v_ev.event_type), v_action,
      v_dedupe, v_ev.provider_account_id, v_ev.matched_discovered_resource_id,
      v_res.client_id, v_res.system_id, v_res.id, now()
    ) RETURNING id INTO v_item;
  END IF;

  UPDATE public.provider_events
  SET action_item_id = v_item, updated_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object('signaled', true, 'action_item_id', v_item);
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. finalize_provider_event — terminal status + evidence links
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_provider_event(
  p_event_id UUID,
  p_status TEXT,
  p_monitoring_run_id UUID DEFAULT NULL,
  p_reconciliation_run_id UUID DEFAULT NULL,
  p_processing_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_is_service_role() THEN
    RAISE EXCEPTION 'Service role only';
  END IF;
  IF p_status NOT IN ('processed', 'unmatched', 'failed', 'rejected') THEN
    RAISE EXCEPTION 'Unknown event status: %', p_status;
  END IF;
  UPDATE public.provider_events
  SET status = p_status,
      monitoring_run_id = COALESCE(p_monitoring_run_id, monitoring_run_id),
      reconciliation_run_id = COALESCE(p_reconciliation_run_id, reconciliation_run_id),
      processing_error = p_processing_error,
      updated_at = now()
  WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider event % not found', p_event_id;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Audit triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_webhook_config_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_webhook.config_created', 'provider_webhook_configs', NEW.id, NULL, NULL,
      jsonb_build_object('provider_account_id', NEW.provider_account_id, 'auth_type', NEW.auth_type)
    );
    RETURN NEW;
  END IF;
  IF OLD.enabled IS DISTINCT FROM NEW.enabled
     OR OLD.credential_hash IS DISTINCT FROM NEW.credential_hash THEN
    PERFORM public.write_audit_log(
      CASE
        WHEN OLD.credential_hash IS DISTINCT FROM NEW.credential_hash THEN 'provider_webhook.secret_rotated'
        WHEN NEW.enabled THEN 'provider_webhook.enabled'
        ELSE 'provider_webhook.disabled' END,
      'provider_webhook_configs', NEW.id, NULL, NULL,
      jsonb_build_object('provider_account_id', NEW.provider_account_id, 'auth_type', NEW.auth_type)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_config_audit ON public.provider_webhook_configs;
CREATE TRIGGER trg_webhook_config_audit
  AFTER INSERT OR UPDATE ON public.provider_webhook_configs
  FOR EACH ROW EXECUTE FUNCTION public.log_webhook_config_audit();

CREATE OR REPLACE FUNCTION public.log_provider_event_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_event.received', 'provider_events', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'event_type', NEW.event_type, 'normalized_type', NEW.normalized_type,
        'dedupe_key', NEW.dedupe_key, 'matched_resource_id', NEW.matched_resource_id
      )
    );
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.write_audit_log(
      CASE NEW.status
        WHEN 'processed'  THEN 'provider_event.processed'
        WHEN 'duplicate'  THEN 'provider_event.duplicate'
        WHEN 'failed'     THEN 'provider_event.failed'
        WHEN 'rejected'   THEN 'provider_event.rejected'
        WHEN 'unmatched'  THEN 'provider_event.unmatched'
        ELSE 'provider_event.updated' END,
      'provider_events', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'event_type', NEW.event_type, 'normalized_type', NEW.normalized_type,
        'monitoring_run_id', NEW.monitoring_run_id,
        'reconciliation_run_id', NEW.reconciliation_run_id,
        'action_item_id', NEW.action_item_id,
        'from', OLD.status, 'to', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_event_audit ON public.provider_events;
CREATE TRIGGER trg_provider_event_audit
  AFTER INSERT OR UPDATE ON public.provider_events
  FOR EACH ROW EXECUTE FUNCTION public.log_provider_event_audit();

-- ----------------------------------------------------------------------------
-- 10. Overview views (no secrets — hash/ref only, payload summary only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.provider_event_overview AS
SELECT
  e.id,
  e.provider_account_id,
  pr.name AS provider_name,
  pr.adapter_key,
  pa.account_name,
  e.provider_event_id,
  e.event_type,
  e.normalized_type,
  e.occurred_at,
  e.received_at,
  e.status,
  e.duplicate_count,
  e.matched_discovered_resource_id,
  d.external_resource_id,
  d.name AS external_name,
  e.matched_resource_id,
  res.name AS resource_name,
  res.client_id,
  cp.company_name AS client_company,
  res.system_id,
  s.name AS system_name,
  e.monitoring_run_id,
  e.reconciliation_run_id,
  e.action_item_id,
  e.processing_error,
  e.payload_summary,
  e.created_at
FROM public.provider_events e
JOIN public.provider_accounts pa ON pa.id = e.provider_account_id
JOIN public.providers pr ON pr.id = e.provider_id
LEFT JOIN public.provider_discovered_resources d ON d.id = e.matched_discovered_resource_id
LEFT JOIN public.resources res ON res.id = e.matched_resource_id
LEFT JOIN public.profiles cp ON cp.id = res.client_id
LEFT JOIN public.systems s ON s.id = res.system_id
WHERE public.is_admin() OR public.is_finance() OR public.is_staff();

CREATE OR REPLACE VIEW public.provider_webhook_config_overview AS
SELECT
  c.id AS config_id,
  c.provider_account_id,
  pr.name AS provider_name,
  pr.adapter_key,
  pa.account_name,
  pa.client_id,
  cp.company_name AS client_company,
  c.auth_type,
  c.enabled,
  c.last_received_at,
  c.created_at,
  c.updated_at,
  (SELECT count(*) FROM public.provider_events e
    WHERE e.webhook_config_id = c.id) AS events_received,
  (SELECT max(e.received_at) FROM public.provider_events e
    WHERE e.webhook_config_id = c.id) AS last_event_at
FROM public.provider_webhook_configs c
JOIN public.provider_accounts pa ON pa.id = c.provider_account_id
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.profiles cp ON cp.id = pa.client_id
WHERE public.is_admin() OR public.is_finance();

-- ----------------------------------------------------------------------------
-- 11. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_cfg_select ON public.provider_webhook_configs;
CREATE POLICY webhook_cfg_select ON public.provider_webhook_configs
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance());

DROP POLICY IF EXISTS provider_events_select ON public.provider_events;
CREATE POLICY provider_events_select ON public.provider_events
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_finance() OR public.is_staff());

-- Events are append/update evidence via service-role RPCs only; configs are
-- written only through save/set RPCs (SECURITY DEFINER). No direct writes.

-- ----------------------------------------------------------------------------
-- 12. Delete blockers — evidence and config history are never destroyed
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_provider_event_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'provider_events is an append-only evidence record — rows cannot be deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_events_no_delete ON public.provider_events;
CREATE TRIGGER trg_provider_events_no_delete
  BEFORE DELETE ON public.provider_events
  FOR EACH ROW EXECUTE FUNCTION public.block_provider_event_delete();

CREATE OR REPLACE FUNCTION public.block_webhook_config_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'provider_webhook_configs cannot be deleted — disable the configuration instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_config_no_delete ON public.provider_webhook_configs;
CREATE TRIGGER trg_webhook_config_no_delete
  BEFORE DELETE ON public.provider_webhook_configs
  FOR EACH ROW EXECUTE FUNCTION public.block_webhook_config_delete();

DROP TRIGGER IF EXISTS set_provider_events_updated_at ON public.provider_events;
CREATE TRIGGER set_provider_events_updated_at
  BEFORE UPDATE ON public.provider_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_webhook_config_updated_at ON public.provider_webhook_configs;
CREATE TRIGGER set_webhook_config_updated_at
  BEFORE UPDATE ON public.provider_webhook_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 13. Grants
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.provider_event_overview TO authenticated, service_role;
GRANT SELECT ON public.provider_webhook_config_overview TO authenticated, service_role;
-- Supabase default privileges over-grant on new views (TRUNCATE etc.); keep
-- application roles to read-only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.provider_event_overview FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.provider_webhook_config_overview FROM anon, authenticated, service_role;
REVOKE ALL ON public.provider_webhook_configs FROM anon;
REVOKE ALL ON public.provider_events FROM anon;
GRANT SELECT ON public.provider_webhook_configs TO authenticated;
GRANT SELECT ON public.provider_events TO authenticated;
GRANT ALL ON public.provider_webhook_configs TO service_role;
GRANT ALL ON public.provider_events TO service_role;
REVOKE TRUNCATE ON public.provider_webhook_configs FROM service_role;
REVOKE TRUNCATE ON public.provider_events FROM service_role;
REVOKE DELETE, TRUNCATE ON public.provider_webhook_configs FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.provider_events FROM authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.save_webhook_config(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_webhook_config_enabled(UUID, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_webhook_config_by_hash(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hmac_webhook_configs(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reveal_webhook_secret(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_webhook_auth_failure(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_webhook_received(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_provider_event(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.signal_provider_event(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_provider_event(UUID, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_webhook_config(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_webhook_config_enabled(UUID, BOOLEAN, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_webhook_config_by_hash(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.hmac_webhook_configs(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reveal_webhook_secret(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_webhook_auth_failure(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_webhook_received(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_provider_event(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.signal_provider_event(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_provider_event(UUID, TEXT, UUID, UUID, TEXT) TO service_role;

COMMIT;
