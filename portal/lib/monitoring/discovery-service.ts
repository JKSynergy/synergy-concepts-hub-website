/**
 * Phase 3G-4 — shared provider discovery service.
 *
 * Single implementation of the discovery write path, used identically by:
 *   - the manual "Run discovery" admin action (lib/actions/provider-connections.ts)
 *   - the scheduled/manual monitoring engine (lib/monitoring/service.ts)
 *
 * Safety rules preserved/enforced here:
 *   - Only a COMPLETED run may mark resources externally_missing.
 *   - An empty result set when known resources exist is treated as a
 *     suspicious/incomplete response: the run completes but missing-marking is
 *     deferred — absence requires positive evidence.
 *   - Credentials are resolved through Vault RPCs and never leave the server.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter } from "@/lib/providers/registry";
import type { ConnectionErrorCategory, ProviderCredentials } from "@/lib/providers/types";

export interface DiscoveryRunOutcome {
  ok: boolean;
  runId?: string;
  discovered?: number;
  newCount?: number;
  status: "completed" | "failed";
  errorCategory?: ConnectionErrorCategory;
  /** True when a suspiciously empty result deferred missing-marking. */
  missingMarkingDeferred?: boolean;
}

export async function loadAccountWithAdapter(admin: SupabaseClient, accountId: string) {
  const { data: account } = await admin
    .from("provider_accounts")
    .select("id, provider_id, account_name, status, credential_reference, providers(adapter_key)")
    .eq("id", accountId)
    .single();
  if (!account) return { account: null, adapter: null };
  const providerRel = (account as { providers?: unknown }).providers;
  const adapterKey = Array.isArray(providerRel)
    ? (providerRel[0] as { adapter_key?: string } | undefined)?.adapter_key
    : (providerRel as { adapter_key?: string } | null)?.adapter_key;
  return { account, adapter: getAdapter(adapterKey) };
}

export async function loadProviderCredentials(
  admin: SupabaseClient,
  accountId: string
): Promise<ProviderCredentials | null> {
  const { data: secret } = await admin.rpc("reveal_provider_credential", {
    p_provider_account_id: accountId,
  });
  if (!secret) return null;
  try {
    const parsed = JSON.parse(secret) as { token?: string; accountId?: string };
    if (!parsed.token) return null;
    return { token: parsed.token, accountId: parsed.accountId };
  } catch {
    return null;
  }
}

/**
 * Execute one provider discovery run. Never throws — failures are recorded on
 * the run row and returned as a normalized category.
 */
export async function executeProviderDiscovery(
  admin: SupabaseClient,
  providerAccountId: string,
  initiatedBy: string | null
): Promise<DiscoveryRunOutcome> {
  const { account, adapter } = await loadAccountWithAdapter(admin, providerAccountId);
  if (!account) return { ok: false, status: "failed", errorCategory: "no_adapter" };

  const { data: run, error: runErr } = await admin
    .from("provider_discovery_runs")
    .insert({ provider_account_id: providerAccountId, initiated_by: initiatedBy, status: "running" })
    .select("id")
    .single();
  if (runErr || !run) return { ok: false, status: "failed", errorCategory: "unavailable" };

  const failRun = async (category: ConnectionErrorCategory): Promise<DiscoveryRunOutcome> => {
    await admin
      .from("provider_discovery_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_count: 1,
        error_summary: category,
      })
      .eq("id", run.id);
    return { ok: false, runId: run.id, discovered: 0, newCount: 0, status: "failed", errorCategory: category };
  };

  if (!adapter) return failRun("no_adapter");
  const creds = await loadProviderCredentials(admin, providerAccountId);
  if (!creds) return failRun("no_credentials");

  const result = await adapter.discoverResources(creds);
  if (!result.ok) return failRun(result.error ?? "network_error");

  let newCount = 0;
  let linkedCount = 0;
  for (const r of result.resources) {
    const { data: existing } = await admin
      .from("provider_discovered_resources")
      .select("id, link_status")
      .eq("provider_account_id", providerAccountId)
      .eq("external_resource_id", r.externalId)
      .maybeSingle();

    const meta = r.metadata ?? {};
    const extCreated = typeof meta.created_at === "string" ? meta.created_at : null;
    const extUpdated = typeof meta.updated_at === "string" ? meta.updated_at : null;
    if (existing) {
      if (existing.link_status === "linked") linkedCount += 1;
      await admin
        .from("provider_discovered_resources")
        .update({
          name: r.name,
          status: r.status ?? null,
          region: r.region ?? null,
          external_url: r.url ?? null,
          metadata: meta,
          external_missing: false,
          external_created_at: extCreated,
          external_updated_at: extUpdated,
          last_seen_at: new Date().toISOString(),
          last_run_id: run.id,
        })
        .eq("id", existing.id);
    } else {
      newCount += 1;
      await admin.from("provider_discovered_resources").insert({
        provider_account_id: providerAccountId,
        external_resource_id: r.externalId,
        resource_type: r.type,
        name: r.name,
        status: r.status ?? null,
        region: r.region ?? null,
        external_url: r.url ?? null,
        metadata: meta,
        external_created_at: extCreated,
        external_updated_at: extUpdated,
        last_run_id: run.id,
      });
    }
  }

  // Missing detection (completed runs only). A provider API outage or an
  // incomplete response must NEVER mark resources missing — absence requires a
  // successful listing that positively omits the resource. An empty result on
  // an account with known resources is ambiguous: defer marking.
  const { count: knownCount } = await admin
    .from("provider_discovered_resources")
    .select("id", { count: "exact", head: true })
    .eq("provider_account_id", providerAccountId)
    .eq("external_missing", false);

  let missingMarkingDeferred = false;
  if (result.resources.length > 0 || (knownCount ?? 0) === 0) {
    await admin
      .from("provider_discovered_resources")
      .update({ external_missing: true })
      .eq("provider_account_id", providerAccountId)
      .or(`last_run_id.is.null,last_run_id.neq.${run.id}`);
  } else {
    missingMarkingDeferred = true;
  }

  const { count: totalLinked } = await admin
    .from("provider_discovered_resources")
    .select("id", { count: "exact", head: true })
    .eq("provider_account_id", providerAccountId)
    .eq("link_status", "linked");

  await admin
    .from("provider_discovery_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      discovered_count: result.resources.length,
      new_count: newCount,
      linked_count: totalLinked ?? linkedCount,
      ...(missingMarkingDeferred ? { error_summary: "empty_result_missing_marking_deferred" } : {}),
    })
    .eq("id", run.id);

  await admin
    .from("provider_accounts")
    .update({ last_discovery_at: new Date().toISOString() })
    .eq("id", providerAccountId);

  return {
    ok: true,
    runId: run.id,
    discovered: result.resources.length,
    newCount,
    status: "completed",
    missingMarkingDeferred,
  };
}
