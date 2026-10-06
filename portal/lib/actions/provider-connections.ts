"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin } from "@/lib/security/roles";
import { PROVIDER_ADAPTER_KEYS } from "@/lib/providers/registry";
import type { ConnectionErrorCategory } from "@/lib/providers/types";
import {
  reconcileSystemInfrastructure,
  type SystemInfrastructureAssessment,
} from "@/lib/providers/infrastructure-reconciliation";
import {
  executeProviderDiscovery,
  loadAccountWithAdapter,
  loadProviderCredentials,
} from "@/lib/monitoring/discovery-service";

export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

async function callerProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, user, role: profile?.role ?? null };
}

function requireAdmin(role: string | null): string | null {
  if (!checkIsAdmin(role)) {
    return "Permission denied: only administrators manage provider connections";
  }
  return null;
}

function revalidateProviderPaths() {
  revalidatePath("/admin/systems");
  revalidatePath("/admin/systems/providers");
}

const ERROR_MESSAGES: Record<ConnectionErrorCategory, string> = {
  auth_failed: "Provider authentication failed — check the credential and try again",
  permission_denied: "The credential does not have permission for this operation",
  rate_limited: "Provider rate limit reached — try again later",
  unavailable: "Provider service unavailable",
  malformed_response: "Provider returned an unexpected response",
  network_error: "Provider endpoint unreachable",
  no_adapter: "This provider has no discovery adapter",
  no_credentials: "No credential is configured for this account",
};

// ============================================================================
// PROVIDER ACCOUNT MANAGEMENT (Admin)
// ============================================================================

export async function createProvider(input: {
  name: string;
  slug: string;
  adapterKey?: string | null;
  category?: string;
  websiteUrl?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const slug = input.slug.trim().toLowerCase();
  if (!input.name.trim() || !slug) return { ok: false, error: "Name and slug are required" };
  if (input.adapterKey && !PROVIDER_ADAPTER_KEYS.includes(input.adapterKey as never)) {
    return { ok: false, error: "Unsupported adapter" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("providers")
    .insert({
      name: input.name.trim(),
      slug,
      category: input.category ?? "cloud_hosting",
      website_url: input.websiteUrl || null,
      adapter_key: input.adapterKey || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidateProviderPaths();
  return { ok: true, data: { id: data.id } };
}

export async function createProviderAccount(input: {
  providerId: string;
  accountName: string;
  accountIdentifier?: string | null;
  ownership: "sch_managed" | "client_owned";
  clientId?: string | null;
  railwayWorkspaceId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  if (!input.providerId || !input.accountName.trim()) {
    return { ok: false, error: "Provider and account name are required" };
  }
  if (input.ownership === "client_owned" && !input.clientId) {
    return { ok: false, error: "Client-owned accounts require a client" };
  }

  const admin = createAdminClient();
  const isRailway = input.railwayWorkspaceId !== undefined;
  const workspaceId = isRailway ? input.railwayWorkspaceId?.trim() || null : null;
  const { data, error } = await admin
    .from("provider_accounts")
    .insert({
      provider_id: input.providerId,
      account_name: input.accountName.trim(),
      account_identifier: input.accountIdentifier || workspaceId,
      ownership: input.ownership,
      client_id: input.ownership === "client_owned" ? input.clientId : null,
      railway_workspace_id: workspaceId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidateProviderPaths();
  return { ok: true, data: { id: data.id } };
}

// ============================================================================
// CREDENTIALS (Admin — secrets go to Vault only, never returned)
// ============================================================================

export async function configureProviderCredential(input: {
  providerAccountId: string;
  token: string;
  accountId?: string | null;
}): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };
  if (!input.token || input.token.trim().length < 8) {
    return { ok: false, error: "Credential rejected: token too short" };
  }

  const admin = createAdminClient();
  const payload = JSON.stringify({
    token: input.token.trim(),
    ...(input.accountId ? { accountId: input.accountId.trim() } : {}),
  });
  const { error } = await admin.rpc("store_provider_credential", {
    p_provider_account_id: input.providerAccountId,
    p_secret: payload,
  });
  if (error) return { ok: false, error: "Credential storage failed" };
  revalidateProviderPaths();
  return { ok: true };
}

export async function clearProviderCredential(providerAccountId: string): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { error } = await admin.rpc("clear_provider_credential", {
    p_provider_account_id: providerAccountId,
  });
  if (error) return { ok: false, error: "Credential removal failed" };
  revalidateProviderPaths();
  return { ok: true };
}

// ============================================================================
// CONNECTION TEST (Admin — read-only)
// ============================================================================

export async function testProviderConnection(providerAccountId: string): Promise<
  ActionResult<{ status: "connected" | "failed"; error?: ConnectionErrorCategory }>
> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { account, adapter } = await loadAccountWithAdapter(admin, providerAccountId);
  if (!account) return { ok: false, error: "Provider account not found" };

  let status: "connected" | "failed";
  let errorCategory: ConnectionErrorCategory | null = null;

  if (!adapter) {
    status = "failed";
    errorCategory = "no_adapter";
  } else {
    const creds = await loadProviderCredentials(admin, providerAccountId);
    if (!creds) {
      status = "failed";
      errorCategory = "no_credentials";
    } else {
      const result = await adapter.testConnection(creds);
      status = result.ok ? "connected" : "failed";
      errorCategory = result.ok ? null : (result.error ?? "network_error");
    }
  }

  await admin
    .from("provider_accounts")
    .update({
      connection_status: status,
      connection_checked_at: new Date().toISOString(),
      connection_error: errorCategory,
      discovery_capabilities: adapter?.capabilities ?? {},
    })
    .eq("id", providerAccountId);

  revalidateProviderPaths();
  return {
    ok: status === "connected",
    data: { status, error: errorCategory ?? undefined },
    error: errorCategory ? ERROR_MESSAGES[errorCategory] : undefined,
  };
}

// ============================================================================
// DISCOVERY (Admin — manual, read-only)
// ============================================================================

export async function runProviderDiscovery(providerAccountId: string): Promise<
  ActionResult<{ runId: string; discovered: number; newCount: number; status: string }>
> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const outcome = await executeProviderDiscovery(admin, providerAccountId, user.id);
  if (!outcome.ok || !outcome.runId) {
    return {
      ok: false,
      error: ERROR_MESSAGES[outcome.errorCategory ?? "network_error"],
      data: { runId: outcome.runId ?? "", discovered: 0, newCount: 0, status: outcome.status },
    };
  }
  revalidateProviderPaths();
  return {
    ok: true,
    data: {
      runId: outcome.runId,
      discovered: outcome.discovered ?? 0,
      newCount: outcome.newCount ?? 0,
      status: outcome.status,
    },
  };
}

export async function auditSystemInfrastructure(): Promise<ActionResult<SystemInfrastructureAssessment[]>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data: systems, error: systemsError } = await admin
    .from("systems")
    .select("id, client_id, name")
    .is("archived_at", null)
    .order("name");
  if (systemsError) return { ok: false, error: systemsError.message };

  const { data: resources, error: resourcesError } = await admin
    .from("resources")
    .select("id, system_id, provider_account_id, client_id, name, resource_type, status, retired_at")
    .not("system_id", "is", null);
  if (resourcesError) return { ok: false, error: resourcesError.message };

  const { data: accounts, error: accountsError } = await admin
    .from("provider_accounts")
    .select("id, provider_id");
  if (accountsError) return { ok: false, error: accountsError.message };

  const { data: providers, error: providersError } = await admin
    .from("providers")
    .select("id, name, adapter_key");
  if (providersError) return { ok: false, error: providersError.message };

  const { data: discovered, error: discoveredError } = await admin
    .from("provider_discovered_resources")
    .select("linked_resource_id, external_resource_id, resource_type, name, status, metadata, external_missing")
    .eq("link_status", "linked")
    .not("linked_resource_id", "is", null);
  if (discoveredError) return { ok: false, error: discoveredError.message };

  const clientIds = [...new Set((systems ?? []).map((system) => system.client_id).filter(Boolean))];
  const { data: clients, error: clientsError } = clientIds.length
    ? await admin.from("profiles").select("id, company_name, full_name, email").in("id", clientIds)
    : { data: [], error: null };
  if (clientsError) return { ok: false, error: clientsError.message };

  const providerById = new Map((providers ?? []).map((provider) => [provider.id, provider]));
  const accountById = new Map((accounts ?? []).map((account) => [account.id, account]));
  const discoveredByResource = new Map((discovered ?? []).map((item) => [item.linked_resource_id, item]));
  const clientById = new Map((clients ?? []).map((client) => [client.id, client]));
  const resourcesBySystem = new Map<string, NonNullable<typeof resources>>();
  for (const resource of resources ?? []) {
    const list = resourcesBySystem.get(resource.system_id) ?? [];
    list.push(resource);
    resourcesBySystem.set(resource.system_id, list);
  }

  return {
    ok: true,
    data: (systems ?? []).map((system) => {
      const client = clientById.get(system.client_id);
      const evidence = (resourcesBySystem.get(system.id) ?? []).map((resource) => {
        const account = accountById.get(resource.provider_account_id);
        const provider = account ? providerById.get(account.provider_id) : null;
        const item = discoveredByResource.get(resource.id);
        return {
          provider: provider?.name ?? "Unknown provider",
          providerKey: provider?.adapter_key ?? null,
          resourceName: item?.name ?? resource.name,
          resourceType: resource.resource_type,
          status: item?.status ?? resource.status,
          externalMissing: item?.external_missing ?? false,
          retired: Boolean(resource.retired_at),
          metadata: item?.metadata && typeof item.metadata === "object" ? item.metadata : null,
          mappingIssue: resource.client_id && resource.client_id !== system.client_id
            ? `${provider?.name ?? "Provider"}: ${resource.name} belongs to a different client than the SCH system`
            : null,
        };
      });
      return reconcileSystemInfrastructure({
        systemName: system.name,
        client: client?.company_name ?? client?.full_name ?? client?.email ?? "Unknown client",
        resources: evidence,
      });
    }),
  };
}

// ============================================================================
// EXPLICIT LINKING (Admin — client + system must be chosen, DB validates)
// ============================================================================

export async function linkDiscoveredResource(input: {
  discoveredId: string;
  clientId: string;
  systemId: string;
}): Promise<ActionResult<{ resourceId: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };
  if (!input.discoveredId || !input.clientId || !input.systemId) {
    return { ok: false, error: "Client and system must be explicitly selected" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("link_discovered_resource", {
    p_discovered_id: input.discoveredId,
    p_client_id: input.clientId,
    p_system_id: input.systemId,
    p_linked_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateProviderPaths();
  return { ok: true, data: { resourceId: data as string } };
}

export async function unlinkDiscoveredResource(discoveredId: string): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { error } = await admin.rpc("unlink_discovered_resource", {
    p_discovered_id: discoveredId,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateProviderPaths();
  return { ok: true };
}

export async function dismissDiscoveredResource(discoveredId: string): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { error } = await admin
    .from("provider_discovered_resources")
    .update({ link_status: "dismissed" })
    .eq("id", discoveredId)
    .eq("link_status", "unlinked");
  if (error) return { ok: false, error: error.message };
  revalidateProviderPaths();
  return { ok: true };
}
