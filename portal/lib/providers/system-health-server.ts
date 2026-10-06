import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSystemDetailResources, type LinkedDiscoveryRecord, type SystemResourceRecord } from "./system-detail";
import { assessSystemHealth, type SystemHealthAssessment } from "./system-health";

export type SystemHealthRow = {
  systemId: string;
  systemName: string;
  clientName: string;
  systemStatus: string;
  health: SystemHealthAssessment;
  infrastructureSummary: string;
};

export async function loadSystemHealthRows(supabase: SupabaseClient, now = new Date()): Promise<SystemHealthRow[]> {
  const [{ data: systems, error: systemsError }, { data: resources, error: resourcesError }] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name, status, client:profiles!systems_client_id_fkey(company_name, full_name, email)")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("resources")
      .select("id, system_id, name, resource_type, status, external_reference, retired_at, provider_account:provider_accounts(id, account_name, connection_status, provider:providers(name, adapter_key))")
      .not("system_id", "is", null),
  ]);
  if (systemsError) throw new Error("Unable to load Systems health data");
  if (resourcesError) throw new Error("Unable to load infrastructure health data");

  const activeResources = (resources ?? []).filter((resource) => !resource.retired_at);
  const resourceIds = activeResources.map((resource) => resource.id);
  const { data: discovered, error: discoveredError } = resourceIds.length
    ? await supabase
        .from("provider_discovered_resources")
        .select("linked_resource_id, external_resource_id, resource_type, name, status, external_url, metadata, last_seen_at, link_status")
        .in("linked_resource_id", resourceIds)
        .eq("link_status", "linked")
    : { data: [], error: null };
  if (discoveredError) throw new Error("Unable to load linked provider evidence");

  const resourcesBySystem = new Map<string, SystemResourceRecord[]>();
  for (const resource of activeResources) {
    const account = Array.isArray(resource.provider_account) ? resource.provider_account[0] : resource.provider_account;
    const provider = account && (Array.isArray(account.provider) ? account.provider[0] : account.provider);
    const normalized: SystemResourceRecord = {
      id: resource.id,
      name: resource.name,
      resource_type: resource.resource_type,
      status: resource.status,
      external_reference: resource.external_reference,
      provider: provider?.name ?? "Unknown provider",
      provider_key: provider?.adapter_key ?? null,
      provider_account: account?.account_name ?? "Unknown account",
      provider_connection_status: account?.connection_status ?? null,
    };
    const list = resourcesBySystem.get(resource.system_id) ?? [];
    list.push(normalized);
    resourcesBySystem.set(resource.system_id, list);
  }

  const discoveryBySystem = new Map<string, LinkedDiscoveryRecord[]>();
  const systemByResource = new Map(activeResources.map((resource) => [resource.id, resource.system_id]));
  for (const item of discovered ?? []) {
    const systemId = systemByResource.get(item.linked_resource_id);
    if (!systemId) continue;
    const normalized: LinkedDiscoveryRecord = {
      ...item,
      metadata: item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : null,
    };
    const list = discoveryBySystem.get(systemId) ?? [];
    list.push(normalized);
    discoveryBySystem.set(systemId, list);
  }

  return (systems ?? []).map((system) => {
    const client = Array.isArray(system.client) ? system.client[0] : system.client;
    const detailResources = buildSystemDetailResources(
      resourcesBySystem.get(system.id) ?? [],
      discoveryBySystem.get(system.id) ?? []
    );
    const providerCounts = new Map<string, number>();
    for (const resource of detailResources) {
      providerCounts.set(resource.provider, (providerCounts.get(resource.provider) ?? 0) + 1);
    }
    return {
      systemId: system.id,
      systemName: system.name,
      clientName: client?.company_name ?? client?.full_name ?? client?.email ?? "Unknown client",
      systemStatus: system.status,
      health: assessSystemHealth(system.name, detailResources, {}, now),
      infrastructureSummary: [...providerCounts.entries()]
        .map(([provider, count]) => count > 1 ? `${provider} ×${count}` : provider)
        .join(" + ") || "No linked infrastructure",
    };
  });
}
