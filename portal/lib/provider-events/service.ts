/**
 * Phase 3G-5 — provider event ingestion service.
 *
 * THE single pipeline for authenticated provider webhooks:
 *
 *   authenticate (provider-specific adapter + Vault-held secret)
 *     → validate payload shape
 *     → dedupe (provider event id / canonical fingerprint, atomic)
 *     → normalize + match (authoritative external ids only)
 *     → record immutable evidence (hash + minimized summary, never raw payload)
 *     → optionally trigger the EXISTING monitoring/reconciliation pipeline
 *     → existing classification owns signals/incidents
 *
 * No provider mutation, no direct SCH resource writes, no client guessing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventAdapter } from "./registry";
import { sha256Hex } from "./types";
import { runProviderMonitoring } from "@/lib/monitoring/service";

const MAX_BODY_BYTES = 256 * 1024;
/** Event-triggered runs for the same account are spaced at least this far apart. */
const RECONCILE_THROTTLE_MS = 120_000;
/** Normalized categories that justify an immediate reconciliation run. */
const RECONCILE_TRIGGERS = new Set([
  "resource_created", "resource_updated", "resource_deleted",
  "resource_state_changed", "resource_unavailable", "resource_recovered",
  "configuration_changed",
]);

export interface IngestResult {
  status: number;
  body: { ok: boolean; error?: string; outcome?: string; event_id?: string };
}

export async function ingestProviderEvent(
  admin: SupabaseClient,
  input: {
    providerKey: string;
    urlToken?: string;
    headers: Headers;
    rawBody: Buffer;
  }
): Promise<IngestResult> {
  const adapter = getEventAdapter(input.providerKey);
  if (!adapter) {
    return { status: 404, body: { ok: false, error: "Not found" } };
  }
  if (input.rawBody.byteLength === 0 || input.rawBody.byteLength > MAX_BODY_BYTES) {
    return { status: 413, body: { ok: false, error: "Payload too large" } };
  }

  const credential = adapter.extractCredential(input.headers, input.urlToken);
  if (!credential) {
    await admin.rpc("record_webhook_auth_failure", {
      p_adapter_key: adapter.key, p_reason: "missing_credential",
    });
    return { status: 401, body: { ok: false, error: "Unauthorized" } };
  }

  // --- Authenticate ---------------------------------------------------------
  let config: { config_id: string; provider_account_id: string } | null = null;

  if (adapter.authType === "vercel_hmac_sha1") {
    // Signature cannot be indexed — iterate enabled configs for this provider.
    const { data: rows } = await admin.rpc("hmac_webhook_configs", {
      p_adapter_key: adapter.key,
    });
    for (const row of (rows ?? []) as { config_id: string; provider_account_id: string }[]) {
      const { data: secret } = await admin.rpc("reveal_webhook_secret", {
        p_config_id: row.config_id,
      });
      if (secret && adapter.verify(input.rawBody, credential, secret as string)) {
        config = row;
        break;
      }
    }
  } else {
    // Token classes: SHA-256 lookup binds credential → account atomically.
    const { data: rows } = await admin.rpc("lookup_webhook_config_by_hash", {
      p_credential_hash: sha256Hex(credential),
    });
    const row = ((rows ?? []) as {
      config_id: string; provider_account_id: string;
      adapter_key: string; auth_type: string;
    }[]).find(
      (r) => r.adapter_key === adapter.key && r.auth_type === adapter.authType
    );
    config = row ?? null;
  }

  if (!config) {
    await admin.rpc("record_webhook_auth_failure", {
      p_adapter_key: adapter.key, p_reason: "invalid_credential",
    });
    return { status: 401, body: { ok: false, error: "Unauthorized" } };
  }

  const configId = config.config_id;
  const accountId = config.provider_account_id;

  // --- Parse + record -------------------------------------------------------
  const payloadHash = sha256Hex(input.rawBody);
  let parsed: ReturnType<typeof adapter.parse>;
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody.toString("utf8"));
    parsed = adapter.parse(json);
  } catch (e) {
    // Authenticated but malformed — record as rejected evidence, then refuse.
    const { data: rec } = await admin.rpc("record_provider_event", {
      p_webhook_config_id: configId,
      p_provider_account_id: accountId,
      p_provider_event_id: null,
      p_event_type: "(malformed)",
      p_normalized_type: "unknown",
      p_occurred_at: null,
      p_payload_hash: payloadHash,
      p_payload_summary: { summary: "Malformed or unparseable provider payload" },
      p_external_ids: [],
    });
    const eventId = (rec as { event_id?: string } | null)?.event_id;
    if (eventId) {
      await admin.rpc("finalize_provider_event", {
        p_event_id: eventId, p_status: "rejected",
        p_processing_error: e instanceof Error ? e.message : "invalid_payload_shape",
      });
    }
    await admin.rpc("touch_webhook_received", { p_config_id: configId });
    return { status: 400, body: { ok: false, error: "Invalid payload" } };
  }

  const { data: rec, error: recErr } = await admin.rpc("record_provider_event", {
    p_webhook_config_id: configId,
    p_provider_account_id: accountId,
    p_provider_event_id: parsed.providerEventId ?? null,
    p_event_type: parsed.eventType,
    p_normalized_type: parsed.normalizedType,
    p_occurred_at: parsed.occurredAt?.toISOString() ?? null,
    p_payload_hash: payloadHash,
    p_payload_summary: parsed.summary,
    p_external_ids: parsed.externalResourceIds,
  });
  if (recErr) {
    return { status: 500, body: { ok: false, error: "Processing failed" } };
  }
  const record = rec as {
    outcome: string; event_id: string;
    matched_discovered_resource_id?: string | null;
    matched_resource_id?: string | null;
  };

  await admin.rpc("touch_webhook_received", { p_config_id: configId });

  if (record.outcome === "duplicate") {
    return { status: 200, body: { ok: true, outcome: "duplicate", event_id: record.event_id } };
  }

  // --- Existing Action Center (deduped signal policy lives in the RPC) ------
  await admin.rpc("signal_provider_event", { p_event_id: record.event_id });

  // --- Trigger the EXISTING monitoring/reconciliation pipeline --------------
  let monitoringRunId: string | null = null;
  let reconciliationRunId: string | null = null;
  if (RECONCILE_TRIGGERS.has(parsed.normalizedType)) {
    const runnable = await canTriggerEventRun(admin, accountId);
    if (runnable) {
      const result = await runProviderMonitoring(admin, {
        providerAccountId: accountId,
        trigger: "event",
        scheduleId: null,
      });
      monitoringRunId = result.runId ?? null;
      reconciliationRunId = result.reconciliationRunId ?? null;
    }
  }

  await admin.rpc("finalize_provider_event", {
    p_event_id: record.event_id,
    p_status: record.matched_discovered_resource_id ? "processed" : "unmatched",
    p_monitoring_run_id: monitoringRunId,
    p_reconciliation_run_id: reconciliationRunId,
  });

  return {
    status: 200,
    body: { ok: true, outcome: "processed", event_id: record.event_id },
  };
}

/**
 * Event-triggered reconciliation needs credentials to do anything; without
 * them the run would only manufacture a failure signal. Also collapse event
 * bursts: skip if a run for this account started within the throttle window
 * (begin_monitoring_run's single-flight index covers true concurrency).
 */
async function canTriggerEventRun(
  admin: SupabaseClient,
  accountId: string
): Promise<boolean> {
  const { data: account } = await admin
    .from("provider_accounts")
    .select("credential_reference")
    .eq("id", accountId)
    .single();
  if (!account?.credential_reference) return false;

  const since = new Date(Date.now() - RECONCILE_THROTTLE_MS).toISOString();
  const { data: recent } = await admin
    .from("provider_monitoring_runs")
    .select("id")
    .eq("provider_account_id", accountId)
    .gte("started_at", since)
    .limit(1);
  return !recent || recent.length === 0;
}
