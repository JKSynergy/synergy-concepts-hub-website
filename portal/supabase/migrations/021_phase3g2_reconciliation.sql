-- ============================================================================
-- Migration 021 — Phase 3G-2: Provider Reconciliation & Controlled Synchronization
-- ============================================================================
-- Moves the model from
--   CONNECT → DISCOVER → REVIEW → EXPLICITLY LINK
-- to
--   CONNECT → DISCOVER → REVIEW → EXPLICITLY LINK → RECONCILE → PROPOSE →
--   APPROVE → APPLY
--
-- Design guarantees:
--   * Reconciliation only PROPOSES. Detected differences never update SCH
--     inventory silently — apply requires review_status='approved' and a
--     non-stale basis (the proposal's discovery run must still be the latest
--     observation for that discovered row).
--   * The snapshot projection lives in SQL (provider_discovered_snapshot) so
--     database code, tests and the server action share ONE canonical,
--     deterministic comparison. jsonb equality is key-order insensitive.
--   * No provider-side mutation is added anywhere in this migration.
--   * Reconciliation items are auditable history — deletes are blocked.
--   * Credentials remain in Supabase Vault only; no secret material is ever
--     stored in snapshots, summaries, items or audit details.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extended observation columns on discovered resources
-- ----------------------------------------------------------------------------
-- external_missing        — set by a COMPLETED discovery run when the provider
--                           no longer reports the resource (never set on
--                           failed/partial runs, so stale evidence cannot be
--                           mistaken for disappearance).
-- external_created_at /
-- external_updated_at     — provider-side timestamps when the adapter supplies
--                           them (optional; populated by the discovery action).
-- reconciled_snapshot     — the canonical snapshot at the last reconciliation.
--                           NULL = never reconciled (first run establishes the
--                           baseline instead of flagging everything as changed).
ALTER TABLE public.provider_discovered_resources
  ADD COLUMN IF NOT EXISTS external_missing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_snapshot JSONB
    CHECK (public.check_no_secrets_in_text(reconciled_snapshot::text));

-- ----------------------------------------------------------------------------
-- 2. Provider-observed fields on SCH resources
-- ----------------------------------------------------------------------------
-- SCH owns the business record (name, status, client, system). The provider is
-- authoritative for external_* fields only — apply updates these, never the
-- SCH-owned lifecycle/business columns.
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS external_name TEXT,
  ADD COLUMN IF NOT EXISTS external_status TEXT,
  ADD COLUMN IF NOT EXISTS external_region TEXT,
  ADD COLUMN IF NOT EXISTS external_url TEXT
    CHECK (public.check_no_secrets_in_text(external_url)),
  ADD COLUMN IF NOT EXISTS external_checked_at TIMESTAMPTZ;

-- Most recent reconciliation per provider account (UI convenience + staleness).
ALTER TABLE public.provider_accounts
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 3. Canonical snapshot projection (single source of truth for comparison)
-- ----------------------------------------------------------------------------
-- Volatile fields (first_discovered_at, last_seen_at, last_run_id, link state,
-- link metadata) are excluded so repeated discovery of an unchanged resource
-- produces byte-identical snapshots. metadata is already normalized by the
-- adapter contract (no secrets, stable keys).
CREATE OR REPLACE FUNCTION public.provider_discovered_snapshot(p_discovered_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'external_resource_id', d.external_resource_id,
    'resource_type',        d.resource_type,
    'name',                 d.name,
    'status',               d.status,
    'region',               d.region,
    'external_url',         d.external_url,
    'external_missing',     d.external_missing,
    'external_created_at',  d.external_created_at,
    'external_updated_at',  d.external_updated_at,
    'metadata',             d.metadata
  )
  FROM public.provider_discovered_resources d
  WHERE d.id = p_discovered_id;
$$;

-- Human-readable diff between two snapshots. metadata is summarised as
-- "metadata changed" rather than dumped wholesale.
CREATE OR REPLACE FUNCTION public.provider_snapshot_diff(p_prev JSONB, p_cur JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT string_agg(detail, '; ' ORDER BY detail)
  FROM (
    SELECT CASE
             WHEN k.key = 'metadata' THEN 'metadata changed'
             ELSE k.key || ': ' ||
                  COALESCE(NULLIF(p_prev ->> k.key, 'null'), '—') || ' → ' ||
                  COALESCE(NULLIF(p_cur  ->> k.key, 'null'), '—')
           END AS detail
    FROM (SELECT jsonb_object_keys(COALESCE(p_prev, '{}'::jsonb) || COALESCE(p_cur, '{}'::jsonb)) AS key) k
    WHERE COALESCE(p_prev ->> k.key, 'null') IS DISTINCT FROM COALESCE(p_cur ->> k.key, 'null')
  ) diffs;
$$;

-- ----------------------------------------------------------------------------
-- 4. Reconciliation runs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_reconciliation_runs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id    UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  basis_discovery_run_id UUID REFERENCES public.provider_discovery_runs(id),
  status                 TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  initiated_by           UUID REFERENCES auth.users(id),
  resources_examined     INTEGER NOT NULL DEFAULT 0 CHECK (resources_examined >= 0),
  changes_detected       INTEGER NOT NULL DEFAULT 0 CHECK (changes_detected >= 0),
  error_count            INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  error_summary          TEXT CHECK (public.check_no_secrets_in_text(error_summary)),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_runs_account
  ON public.provider_reconciliation_runs (provider_account_id, started_at DESC);

-- ----------------------------------------------------------------------------
-- 5. Reconciliation items (detected differences / review proposals)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_reconciliation_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                 UUID NOT NULL REFERENCES public.provider_reconciliation_runs(id) ON DELETE RESTRICT,
  provider_account_id    UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE RESTRICT,
  discovered_resource_id UUID REFERENCES public.provider_discovered_resources(id),
  resource_id            UUID REFERENCES public.resources(id),
  change_type            TEXT NOT NULL CHECK (change_type IN (
    'new_external_resource', 'unchanged', 'external_change',
    'missing_externally', 'identity_change', 'sch_only')),
  previous_snapshot      JSONB CHECK (public.check_no_secrets_in_text(previous_snapshot::text)),
  current_snapshot       JSONB CHECK (public.check_no_secrets_in_text(current_snapshot::text)),
  change_summary         TEXT CHECK (public.check_no_secrets_in_text(change_summary)),
  change_fingerprint     TEXT NOT NULL,
  basis_run_id           UUID REFERENCES public.provider_discovery_runs(id),
  requires_review        BOOLEAN NOT NULL DEFAULT false,
  review_status          TEXT NOT NULL DEFAULT 'not_required' CHECK (review_status IN (
    'not_required', 'pending_review', 'acknowledged',
    'approved', 'rejected', 'dismissed', 'applied', 'stale')),
  reviewed_by            UUID REFERENCES auth.users(id),
  reviewed_at            TIMESTAMPTZ,
  applied_by             UUID REFERENCES auth.users(id),
  applied_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_recon_item_subject
    CHECK (discovered_resource_id IS NOT NULL OR resource_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_recon_items_run ON public.provider_reconciliation_items (run_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_account ON public.provider_reconciliation_items (provider_account_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_status ON public.provider_reconciliation_items (review_status);
CREATE INDEX IF NOT EXISTS idx_recon_items_discovered ON public.provider_reconciliation_items (discovered_resource_id);

-- Idempotency: at most ONE open proposal per subject+fingerprint. Repeated
-- reconciliation without external change finds the open item and does not
-- create another (the insert in run_provider_reconciliation checks first; the
-- index is the hard guarantee under concurrency).
CREATE UNIQUE INDEX IF NOT EXISTS uq_recon_open_item
  ON public.provider_reconciliation_items (
    COALESCE(discovered_resource_id::text, ''),
    COALESCE(resource_id::text, ''),
    change_fingerprint
  )
  WHERE review_status IN ('pending_review', 'acknowledged', 'approved');

-- ----------------------------------------------------------------------------
-- 6. Reconciliation engine (SCH-side only — read provider evidence, propose)
-- ----------------------------------------------------------------------------
-- Manual, admin-initiated. Compares each discovered row's canonical snapshot
-- against its reconciled_snapshot, emits review items, and moves the baseline
-- forward. Failure marks the run 'failed' and preserves all prior state.
CREATE OR REPLACE FUNCTION public.run_provider_reconciliation(
  p_provider_account_id UUID,
  p_actor UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run      UUID;
  v_basis    UUID;
  v_disc     public.provider_discovered_resources%ROWTYPE;
  v_res      public.resources%ROWTYPE;
  v_prev     JSONB;
  v_cur      JSONB;
  v_type     TEXT;
  v_req      BOOLEAN;
  v_fp       TEXT;
  v_summary  TEXT;
  v_examined INTEGER := 0;
  v_changes  INTEGER := 0;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may run provider reconciliation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_accounts WHERE id = p_provider_account_id) THEN
    RAISE EXCEPTION 'Provider account % not found', p_provider_account_id;
  END IF;

  -- The reconciliation basis is the most recent completed/partial discovery run.
  SELECT id INTO v_basis
  FROM public.provider_discovery_runs
  WHERE provider_account_id = p_provider_account_id
    AND status IN ('completed', 'partial')
  ORDER BY completed_at DESC NULLS LAST, started_at DESC
  LIMIT 1;

  INSERT INTO public.provider_reconciliation_runs
    (provider_account_id, basis_discovery_run_id, status, initiated_by)
  VALUES (p_provider_account_id, v_basis, 'running', p_actor)
  RETURNING id INTO v_run;

  BEGIN
    IF v_basis IS NULL THEN
      RAISE EXCEPTION 'no_successful_discovery';
    END IF;

    -- Superseded proposals: an open item whose basis is older than the current
    -- discovery basis is stale — mark it, never silently discard.
    UPDATE public.provider_reconciliation_items
    SET review_status = 'stale', updated_at = now()
    WHERE provider_account_id = p_provider_account_id
      AND review_status IN ('pending_review', 'acknowledged', 'approved')
      AND basis_run_id IS DISTINCT FROM v_basis;

    -- ------------------------------------------------ discovered resources
    FOR v_disc IN
      SELECT * FROM public.provider_discovered_resources
      WHERE provider_account_id = p_provider_account_id
        AND link_status <> 'dismissed'
      ORDER BY external_resource_id
    LOOP
      v_examined := v_examined + 1;
      v_cur := public.provider_discovered_snapshot(v_disc.id);
      v_prev := v_disc.reconciled_snapshot;

      IF v_disc.link_status = 'linked' AND v_disc.external_missing THEN
        v_type := 'missing_externally'; v_req := true;
      ELSIF v_prev IS NULL AND v_disc.link_status = 'unlinked' THEN
        v_type := 'new_external_resource'; v_req := true;
      ELSIF v_prev IS NULL THEN
        v_type := 'unchanged'; v_req := false;          -- first baseline
      ELSIF v_disc.external_missing THEN
        v_type := 'missing_externally'; v_req := false; -- unlinked disappearance
      ELSIF v_prev IS DISTINCT FROM v_cur THEN
        IF v_disc.link_status = 'linked' AND EXISTS (
          SELECT 1 FROM public.resources r
          WHERE r.id = v_disc.linked_resource_id
            AND r.external_reference IS DISTINCT FROM 'provider:' || v_disc.external_resource_id
        ) THEN
          v_type := 'identity_change'; v_req := true;
        ELSE
          v_type := 'external_change'; v_req := (v_disc.link_status = 'linked');
        END IF;
      ELSE
        v_type := 'unchanged'; v_req := false;
      END IF;

      v_fp := md5(
        v_type || '|' ||
        COALESCE(v_prev::text, '∅') || '|' ||
        COALESCE(v_cur::text, '∅')
      );
      v_summary := public.provider_snapshot_diff(v_prev, v_cur);

      IF v_req THEN
        -- Skip when an open proposal with the same fingerprint already exists.
        IF NOT EXISTS (
          SELECT 1 FROM public.provider_reconciliation_items i
          WHERE i.discovered_resource_id = v_disc.id
            AND i.change_fingerprint = v_fp
            AND i.review_status IN ('pending_review', 'acknowledged', 'approved')
        ) THEN
          INSERT INTO public.provider_reconciliation_items (
            run_id, provider_account_id, discovered_resource_id, resource_id,
            change_type, previous_snapshot, current_snapshot, change_summary,
            change_fingerprint, basis_run_id, requires_review, review_status
          ) VALUES (
            v_run, p_provider_account_id, v_disc.id, v_disc.linked_resource_id,
            v_type, v_prev, v_cur, v_summary,
            v_fp, v_basis, true, 'pending_review'
          );
          v_changes := v_changes + 1;
        END IF;
      ELSE
        INSERT INTO public.provider_reconciliation_items (
          run_id, provider_account_id, discovered_resource_id, resource_id,
          change_type, previous_snapshot, current_snapshot, change_summary,
          change_fingerprint, basis_run_id, requires_review, review_status
        ) VALUES (
          v_run, p_provider_account_id, v_disc.id, v_disc.linked_resource_id,
          v_type, v_prev, v_cur, v_summary,
          v_fp, v_basis, false, 'not_required'
        );
      END IF;

      -- Move the baseline forward AFTER comparison.
      UPDATE public.provider_discovered_resources
      SET reconciled_snapshot = v_cur, updated_at = now()
      WHERE id = v_disc.id;
    END LOOP;

    -- ----------------------------------------------------- SCH-only resources
    FOR v_res IN
      SELECT r.* FROM public.resources r
      WHERE r.provider_account_id = p_provider_account_id
        AND r.retired_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.provider_discovered_resources d
          WHERE d.linked_resource_id = r.id
        )
      ORDER BY r.name
    LOOP
      v_examined := v_examined + 1;
      v_fp := md5('sch_only|' || v_res.id::text);
      IF NOT EXISTS (
        SELECT 1 FROM public.provider_reconciliation_items i
        WHERE i.resource_id = v_res.id
          AND i.discovered_resource_id IS NULL
          AND i.change_fingerprint = v_fp
          AND i.review_status IN ('pending_review', 'acknowledged', 'approved')
      ) THEN
        INSERT INTO public.provider_reconciliation_items (
          run_id, provider_account_id, resource_id, change_type,
          previous_snapshot, current_snapshot, change_summary,
          change_fingerprint, basis_run_id, requires_review, review_status
        ) VALUES (
          v_run, p_provider_account_id, v_res.id, 'sch_only',
          jsonb_build_object(
            'resource_id', v_res.id, 'name', v_res.name,
            'resource_type', v_res.resource_type, 'status', v_res.status,
            'client_id', v_res.client_id, 'system_id', v_res.system_id,
            'external_reference', v_res.external_reference
          ),
          NULL,
          'SCH resource has no corresponding discovered provider resource',
          v_fp, v_basis, true, 'pending_review'
        );
        v_changes := v_changes + 1;
      END IF;
    END LOOP;

    UPDATE public.provider_reconciliation_runs
    SET status = 'completed', completed_at = now(),
        resources_examined = v_examined, changes_detected = v_changes
    WHERE id = v_run;

    UPDATE public.provider_accounts
    SET last_reconciled_at = now(), updated_at = now()
    WHERE id = p_provider_account_id;
  EXCEPTION WHEN OTHERS THEN
    -- Record the failure; never emit a false successful run. Prior snapshots
    -- and inventory remain untouched.
    UPDATE public.provider_reconciliation_runs
    SET status = 'failed', completed_at = now(), error_count = error_count + 1,
        error_summary = CASE
          WHEN SQLERRM LIKE '%no_successful_discovery%' THEN 'no_successful_discovery'
          ELSE 'reconciliation_failed'
        END
    WHERE id = v_run;
  END;

  RETURN v_run;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Review lifecycle (acknowledge / approve / reject / dismiss)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_reconciliation_item(
  p_item_id UUID,
  p_decision TEXT,
  p_actor UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.provider_reconciliation_items%ROWTYPE;
  v_next TEXT;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may review reconciliation items';
  END IF;

  SELECT * INTO v_item FROM public.provider_reconciliation_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation item % not found', p_item_id;
  END IF;
  IF v_item.review_status IN ('applied', 'stale') THEN
    RAISE EXCEPTION 'Reconciliation item is % and can no longer be reviewed', v_item.review_status;
  END IF;

  v_next := CASE p_decision
    WHEN 'acknowledge' THEN 'acknowledged'
    WHEN 'approve'     THEN 'approved'
    WHEN 'reject'      THEN 'rejected'
    WHEN 'dismiss'     THEN 'dismissed'
    ELSE NULL
  END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Invalid review decision %', p_decision;
  END IF;

  -- Transition guards: acknowledge only from pending; approve/reject from
  -- pending or acknowledged; dismiss from any open state.
  IF p_decision = 'acknowledge' AND v_item.review_status <> 'pending_review' THEN
    RAISE EXCEPTION 'Only pending items can be acknowledged';
  END IF;
  IF p_decision IN ('approve', 'reject')
     AND v_item.review_status NOT IN ('pending_review', 'acknowledged') THEN
    RAISE EXCEPTION 'Only pending or acknowledged items can be %', p_decision || 'd';
  END IF;
  IF p_decision = 'dismiss'
     AND v_item.review_status NOT IN ('pending_review', 'acknowledged', 'rejected') THEN
    RAISE EXCEPTION 'Only open items can be dismissed';
  END IF;

  UPDATE public.provider_reconciliation_items
  SET review_status = v_next, reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
  WHERE id = p_item_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Controlled apply — approved proposals only, stale basis rejected
-- ----------------------------------------------------------------------------
-- Applies the SCH-side portion of an approved proposal. Provider-side state is
-- NEVER touched. Staleness rule (deterministic): the discovery run that
-- produced the proposal's current snapshot (basis_run_id) must still be the
-- run that last observed the discovered row (last_run_id). If a newer
-- discovery ran since, the proposal is stale — it is marked 'stale' and the
-- apply is refused; the admin must refresh → reconcile → review → apply.
-- Returns 'applied' or 'stale'. Staleness is a controlled concurrent-state
-- outcome, not an exception: the item is marked 'stale' in the same
-- transaction and the caller is told to refresh → reconcile → review → apply.
CREATE OR REPLACE FUNCTION public.apply_reconciliation_item(
  p_item_id UUID,
  p_actor UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.provider_reconciliation_items%ROWTYPE;
  v_disc public.provider_discovered_resources%ROWTYPE;
BEGIN
  IF NOT public.caller_is_service_role() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators may apply reconciliation changes';
  END IF;

  SELECT * INTO v_item FROM public.provider_reconciliation_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation item % not found', p_item_id;
  END IF;
  IF v_item.review_status <> 'approved' THEN
    RAISE EXCEPTION 'Reconciliation item must be approved before apply (currently %)', v_item.review_status;
  END IF;

  -- Staleness: a newer observation of the same external resource invalidates
  -- the proposal.
  IF v_item.discovered_resource_id IS NOT NULL THEN
    SELECT * INTO v_disc FROM public.provider_discovered_resources
    WHERE id = v_item.discovered_resource_id;
    IF NOT FOUND OR v_disc.last_run_id IS DISTINCT FROM v_item.basis_run_id THEN
      UPDATE public.provider_reconciliation_items
      SET review_status = 'stale', updated_at = now()
      WHERE id = p_item_id;
      RETURN 'stale';
    END IF;
  END IF;

  IF v_item.change_type IN ('external_change', 'identity_change') THEN
    UPDATE public.resources
    SET external_name       = v_item.current_snapshot ->> 'name',
        external_status     = v_item.current_snapshot ->> 'status',
        external_region     = v_item.current_snapshot ->> 'region',
        external_url        = v_item.current_snapshot ->> 'external_url',
        external_checked_at = now(),
        external_reference  = CASE
          WHEN v_item.change_type = 'identity_change'
            THEN 'provider:' || (v_item.current_snapshot ->> 'external_resource_id')
          ELSE external_reference
        END,
        updated_at          = now()
    WHERE id = v_item.resource_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked SCH resource % no longer exists', v_item.resource_id;
    END IF;
  ELSIF v_item.change_type = 'missing_externally' THEN
    UPDATE public.resources
    SET external_status     = 'missing_externally',
        external_checked_at = now(),
        updated_at          = now()
    WHERE id = v_item.resource_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked SCH resource % no longer exists', v_item.resource_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Change type % has no SCH-side apply action', v_item.change_type;
  END IF;

  UPDATE public.provider_reconciliation_items
  SET review_status = 'applied', applied_by = p_actor, applied_at = now(), updated_at = now()
  WHERE id = p_item_id;

  RETURN 'applied';
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. link_discovered_resource — capture baseline snapshot + external_* fields
-- ----------------------------------------------------------------------------
-- Same signature as migration 020; the created SCH resource now records the
-- provider-observed fields and the discovered row gets its first
-- reconciled_snapshot so the first reconciliation reports UNCHANGED rather
-- than a spurious difference.
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

  SELECT status INTO v_acct_stat
  FROM public.provider_accounts
  WHERE id = v_disc.provider_account_id;
  IF v_acct_stat = 'archived' THEN
    RAISE EXCEPTION 'Cannot link resources from an archived provider account';
  END IF;

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
    client_id, external_reference, status,
    external_name, external_status, external_region, external_url, external_checked_at
  ) VALUES (
    p_system_id, v_disc.provider_account_id, v_disc.name, v_res_type,
    'client_owned', p_client_id,
    'provider:' || v_disc.external_resource_id,
    'active',
    v_disc.name, v_disc.status, v_disc.region, v_disc.external_url, now()
  )
  RETURNING id INTO v_resource_id;

  UPDATE public.provider_discovered_resources
  SET link_status = 'linked',
      linked_resource_id = v_resource_id,
      linked_at = now(),
      linked_by = p_linked_by,
      reconciled_snapshot = public.provider_discovered_snapshot(p_discovered_id),
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

-- ----------------------------------------------------------------------------
-- 10. Audit triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_reconciliation_run_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'provider_reconciliation.started', 'provider_reconciliation_runs', NEW.id, NULL, NULL,
      jsonb_build_object('provider_account_id', NEW.provider_account_id, 'initiated_by', NEW.initiated_by)
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'running' THEN
    PERFORM public.write_audit_log(
      'provider_reconciliation.' || CASE WHEN NEW.status = 'failed' THEN 'failed' ELSE 'completed' END,
      'provider_reconciliation_runs', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'status', NEW.status,
        'resources_examined', NEW.resources_examined,
        'changes_detected', NEW.changes_detected,
        'error_summary', NEW.error_summary
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recon_run_audit ON public.provider_reconciliation_runs;
CREATE TRIGGER trg_recon_run_audit
  AFTER INSERT OR UPDATE ON public.provider_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_reconciliation_run_audit();

CREATE OR REPLACE FUNCTION public.log_reconciliation_item_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A new reviewable proposal.
  IF TG_OP = 'INSERT' AND NEW.requires_review THEN
    PERFORM public.write_audit_log(
      'provider_resource.sync_proposed', 'provider_reconciliation_items', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'discovered_resource_id', NEW.discovered_resource_id,
        'resource_id', NEW.resource_id,
        'change_type', NEW.change_type,
        'change_summary', NEW.change_summary
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.review_status IS DISTINCT FROM NEW.review_status THEN
    PERFORM public.write_audit_log(
      CASE NEW.review_status
        WHEN 'acknowledged' THEN 'provider_reconciliation.reviewed'
        WHEN 'approved'     THEN 'provider_resource.sync_approved'
        WHEN 'rejected'     THEN 'provider_resource.sync_rejected'
        WHEN 'dismissed'    THEN 'provider_reconciliation.dismissed'
        WHEN 'applied'      THEN 'provider_resource.sync_applied'
        WHEN 'stale'        THEN 'provider_reconciliation.stale'
        ELSE 'provider_reconciliation.reviewed'
      END,
      'provider_reconciliation_items', NEW.id, NULL, NULL,
      jsonb_build_object(
        'provider_account_id', NEW.provider_account_id,
        'discovered_resource_id', NEW.discovered_resource_id,
        'resource_id', NEW.resource_id,
        'change_type', NEW.change_type,
        'from', OLD.review_status,
        'to', NEW.review_status,
        'reviewed_by', NEW.reviewed_by,
        'applied_by', NEW.applied_by
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recon_item_audit ON public.provider_reconciliation_items;
CREATE TRIGGER trg_recon_item_audit
  AFTER INSERT OR UPDATE ON public.provider_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION public.log_reconciliation_item_audit();

-- ----------------------------------------------------------------------------
-- 11. Views
-- ----------------------------------------------------------------------------
-- Admin/Finance reconciliation overview. Snapshots contain normalized fields
-- only (no credentials — enforced by CHECK constraints on the columns).
CREATE OR REPLACE VIEW public.provider_reconciliation_overview AS
SELECT
  i.id,
  i.run_id,
  i.provider_account_id,
  i.discovered_resource_id,
  i.resource_id,
  pr.name AS provider_name,
  pa.account_name,
  d.external_resource_id,
  d.resource_type AS external_type,
  d.name AS external_name,
  r.name AS sch_resource_name,
  r.status AS sch_status,
  s.name AS system_name,
  cp.company_name AS client_company,
  cp.email AS client_email,
  i.change_type,
  i.change_summary,
  i.previous_snapshot,
  i.current_snapshot,
  i.requires_review,
  i.review_status,
  i.reviewed_by,
  i.reviewed_at,
  i.applied_at,
  i.basis_run_id,
  i.created_at,
  rn.status AS run_status,
  rn.started_at AS run_started_at,
  (d.id IS NOT NULL AND d.last_run_id IS DISTINCT FROM i.basis_run_id) AS basis_stale
FROM public.provider_reconciliation_items i
JOIN public.provider_reconciliation_runs rn ON rn.id = i.run_id
JOIN public.provider_accounts pa ON pa.id = i.provider_account_id
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.provider_discovered_resources d ON d.id = i.discovered_resource_id
LEFT JOIN public.resources r ON r.id = i.resource_id
LEFT JOIN public.systems s ON s.id = r.system_id
LEFT JOIN public.profiles cp ON cp.id = r.client_id
WHERE public.is_admin() OR public.is_finance();

-- Extend the connection overview with reconciliation context (appended column;
-- existing column order/names unchanged for 3G-1 callers).
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
    WHERE r.provider_account_id = pa.id) AS last_run_at,
  pa.last_reconciled_at,
  (SELECT count(*) FROM public.provider_reconciliation_items i
    WHERE i.provider_account_id = pa.id
      AND i.review_status IN ('pending_review', 'acknowledged', 'approved')) AS pending_reconciliation_count
FROM public.provider_accounts pa
JOIN public.providers pr ON pr.id = pa.provider_id
LEFT JOIN public.profiles cp ON cp.id = pa.client_id
WHERE public.is_admin() OR public.is_finance();

-- ----------------------------------------------------------------------------
-- 12. Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.provider_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_reconciliation_items ENABLE ROW LEVEL SECURITY;

-- Runs: Admin read/write, Finance read-only, Staff/Client denied.
DROP POLICY IF EXISTS recon_runs_select_admin ON public.provider_reconciliation_runs;
CREATE POLICY recon_runs_select_admin ON public.provider_reconciliation_runs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS recon_runs_select_finance ON public.provider_reconciliation_runs;
CREATE POLICY recon_runs_select_finance ON public.provider_reconciliation_runs
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS recon_runs_insert_admin ON public.provider_reconciliation_runs;
CREATE POLICY recon_runs_insert_admin ON public.provider_reconciliation_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS recon_runs_update_admin ON public.provider_reconciliation_runs;
CREATE POLICY recon_runs_update_admin ON public.provider_reconciliation_runs
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Items: Admin read/write, Finance read-only. Inserts flow through
-- run_provider_reconciliation (SECURITY DEFINER); direct admin inserts are
-- still permitted by policy for tooling parity with discovery tables.
DROP POLICY IF EXISTS recon_items_select_admin ON public.provider_reconciliation_items;
CREATE POLICY recon_items_select_admin ON public.provider_reconciliation_items
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS recon_items_select_finance ON public.provider_reconciliation_items;
CREATE POLICY recon_items_select_finance ON public.provider_reconciliation_items
  FOR SELECT TO authenticated USING (public.is_finance());
DROP POLICY IF EXISTS recon_items_insert_admin ON public.provider_reconciliation_items;
CREATE POLICY recon_items_insert_admin ON public.provider_reconciliation_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS recon_items_update_admin ON public.provider_reconciliation_items;
CREATE POLICY recon_items_update_admin ON public.provider_reconciliation_items
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 13. Delete safety — reconciliation history is auditable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_reconciliation_prevent_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Provider reconciliation records are auditable history and cannot be deleted; use review_status transitions instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_recon_runs_no_delete ON public.provider_reconciliation_runs;
CREATE TRIGGER trg_recon_runs_no_delete
  BEFORE DELETE ON public.provider_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.provider_reconciliation_prevent_destructive_delete();

DROP TRIGGER IF EXISTS trg_recon_items_no_delete ON public.provider_reconciliation_items;
CREATE TRIGGER trg_recon_items_no_delete
  BEFORE DELETE ON public.provider_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION public.provider_reconciliation_prevent_destructive_delete();

DROP TRIGGER IF EXISTS set_recon_runs_updated_at ON public.provider_reconciliation_runs;
CREATE TRIGGER set_recon_runs_updated_at
  BEFORE UPDATE ON public.provider_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_recon_items_updated_at ON public.provider_reconciliation_items;
CREATE TRIGGER set_recon_items_updated_at
  BEFORE UPDATE ON public.provider_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. Privileges
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.provider_reconciliation_runs FROM anon;
REVOKE ALL ON public.provider_reconciliation_items FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.provider_reconciliation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_reconciliation_items TO authenticated;
REVOKE DELETE, TRUNCATE ON public.provider_reconciliation_runs FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.provider_reconciliation_items FROM authenticated, anon;
GRANT ALL ON public.provider_reconciliation_runs TO service_role;
GRANT ALL ON public.provider_reconciliation_items TO service_role;
REVOKE TRUNCATE ON public.provider_reconciliation_runs FROM service_role;
REVOKE TRUNCATE ON public.provider_reconciliation_items FROM service_role;

REVOKE ALL ON public.provider_reconciliation_overview FROM anon, authenticated, service_role;
GRANT SELECT ON public.provider_reconciliation_overview TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.provider_discovered_snapshot(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.provider_snapshot_diff(JSONB, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_provider_reconciliation(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_reconciliation_item(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_reconciliation_item(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.provider_discovered_snapshot(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provider_snapshot_diff(JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_provider_reconciliation(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_reconciliation_item(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_reconciliation_item(UUID, UUID) TO service_role;
