"use server";

/**
 * Phase 3G-3 — controlled provider operations.
 *
 * Flow: propose → review (approve/reject/cancel) → execute (adapter call,
 * server-side, Vault credential) → verify actual provider state.
 *
 * The browser only ever sends proposal ids / discovered ids. The server
 * resolves the linked resource, provider account and credential itself —
 * nothing about provider identity is trusted from the client.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin } from "@/lib/security/roles";
import { getAdapter } from "@/lib/providers/registry";
import { isProviderOperationKey, providerSupportsOperation } from "@/lib/providers/operations";
import type {
  ProviderCredentials,
  ProviderOperationResultCategory,
} from "@/lib/providers/types";

export type ActionResult<T = unknown> = { ok: boolean; data?: T; error?: string };

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
    return "Permission denied: only administrators manage provider operations";
  }
  return null;
}

function revalidateOperationPaths() {
  revalidatePath("/admin/systems");
  revalidatePath("/admin/systems/operations");
  revalidatePath("/admin/systems/providers");
}

const RESULT_MESSAGES: Record<ProviderOperationResultCategory, string> = {
  success: "Provider acknowledged the operation",
  accepted: "Provider accepted the operation",
  already_in_desired_state: "Resource is already in the requested state",
  not_found: "Provider resource no longer exists",
  auth_failed: "Provider authentication failed — check the credential",
  permission_denied: "The credential lacks permission for this operation",
  rate_limited: "Provider rate limit reached — retry later",
  unavailable: "Provider service unavailable — retry later",
  invalid_request: "Provider rejected the request",
  conflict: "Provider rejected the state change",
  network_error: "Provider endpoint unreachable — verify state before retrying",
  malformed_response: "Provider returned an unexpected response",
  execution_unknown: "The operation outcome is unknown — verify state before retrying",
  no_credentials: "No credential is configured for this account",
  unsupported: "This provider does not support the requested operation",
};

// ============================================================================
// PROPOSE (Admin)
// ============================================================================

export async function proposeProviderOperation(input: {
  discoveredId: string;
  operationKey: string;
  reason: string;
}): Promise<ActionResult<{ proposalId: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  if (!isProviderOperationKey(input.operationKey)) {
    return { ok: false, error: "Unsupported provider operation" };
  }
  if (!input.reason?.trim()) {
    return { ok: false, error: "A reason is required" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("propose_provider_operation", {
    p_discovered_id: input.discoveredId,
    p_operation_key: input.operationKey,
    p_reason: input.reason.trim(),
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateOperationPaths();
  return { ok: true, data: { proposalId: data as string } };
}

// ============================================================================
// REVIEW (Admin) — approve / reject / cancel
// ============================================================================

export type OperationReviewDecision = "approve" | "reject" | "cancel";

export async function reviewProviderOperation(
  proposalId: string,
  decision: OperationReviewDecision,
  reason?: string
): Promise<ActionResult<{ status: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("review_provider_operation", {
    p_proposal_id: proposalId,
    p_decision: decision,
    p_actor: user.id,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateOperationPaths();
  return { ok: true, data: { status: data as string } };
}

// ============================================================================
// EXECUTE + VERIFY (Admin — provider call happens server-side only)
// ============================================================================

async function loadOperationContext(proposalId: string) {
  const admin = createAdminClient();
  const { data: begin, error } = await admin.rpc("begin_provider_operation_execution", {
    p_proposal_id: proposalId,
  });
  if (error) return { admin, error: error.message as string };

  const ctx = begin as {
    outcome: string;
    reason?: string;
    execution_id?: string;
    provider_account_id?: string;
    external_resource_id?: string;
    resource_type?: string;
    operation_key?: string;
    idempotency_key?: string;
  };
  return { admin, ctx };
}

export async function executeProviderOperation(proposalId: string): Promise<
  ActionResult<{ status: string; category?: string }>
> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const { admin, ctx, error } = await loadOperationContext(proposalId);
  if (error) return { ok: false, error };
  if (!ctx) return { ok: false, error: "Could not begin execution" };

  if (ctx.outcome === "stale") {
    revalidateOperationPaths();
    return {
      ok: false,
      error: "Proposal is stale — the provider state changed since approval. Run discovery again and create a fresh proposal.",
      data: { status: "stale" },
    };
  }
  if (ctx.outcome !== "begin" || !ctx.execution_id || !ctx.provider_account_id || !ctx.external_resource_id) {
    return { ok: false, error: "Execution could not be started" };
  }

  // Resolve adapter + provider capability.
  const { data: account } = await admin
    .from("provider_accounts")
    .select("id, providers(adapter_key)")
    .eq("id", ctx.provider_account_id)
    .single();
  const providerRel = account?.providers as unknown;
  const adapterKey = Array.isArray(providerRel)
    ? (providerRel[0] as { adapter_key?: string } | undefined)?.adapter_key
    : (providerRel as { adapter_key?: string } | null)?.adapter_key;
  const adapter = getAdapter(adapterKey);

  const failWith = async (category: ProviderOperationResultCategory, message?: string) => {
    await admin.rpc("complete_provider_operation_execution", {
      p_execution_id: ctx.execution_id,
      p_result_category: category,
      p_error_category: category,
      p_safe_message: message ?? RESULT_MESSAGES[category],
      p_actor: user.id,
    });
    revalidateOperationPaths();
    return { ok: false, error: message ?? RESULT_MESSAGES[category], data: { status: "failed" } };
  };

  if (!adapter?.operations || !adapter.operations.supportsOperation(ctx.operation_key as never, ctx.resource_type as never)
      || !providerSupportsOperation(adapterKey, ctx.operation_key as never, ctx.resource_type ?? "")) {
    return failWith("invalid_request", "This provider does not support the requested operation");
  }

  // Vault credential — server-side only, never leaves this process.
  const { data: secret } = await admin.rpc("reveal_provider_credential", {
    p_provider_account_id: ctx.provider_account_id,
  });
  if (!secret) return failWith("no_credentials", "No credential is configured for this account");
  let creds: ProviderCredentials;
  try {
    const parsed = JSON.parse(secret) as { token?: string; accountId?: string };
    if (!parsed.token) throw new Error("empty");
    creds = { token: parsed.token, accountId: parsed.accountId };
  } catch {
    return failWith("malformed_response", "Stored credential is unreadable");
  }

  // Execute the typed provider operation.
  const opReq = {
    creds,
    operation: ctx.operation_key as never,
    externalResourceId: ctx.external_resource_id,
    resourceType: ctx.resource_type as never,
    idempotencyKey: ctx.idempotency_key ?? `schop-${proposalId}`,
  };

  const result = await adapter.operations.executeOperation(opReq);
  const proposalStatus = await admin.rpc("complete_provider_operation_execution", {
    p_execution_id: ctx.execution_id,
    p_result_category: result.category,
    p_provider_ref: result.providerReference ?? null,
    p_safe_message: result.message ?? RESULT_MESSAGES[result.category],
    p_actor: user.id,
  });

  if (result.category !== "success" && result.category !== "accepted" && result.category !== "already_in_desired_state") {
    revalidateOperationPaths();
    const retriable = ["rate_limited", "unavailable", "network_error", "execution_unknown"].includes(result.category);
    return {
      ok: false,
      error: RESULT_MESSAGES[result.category],
      data: { status: retriable ? "approved" : "failed", category: result.category },
    };
  }

  // Mandatory post-operation verification — execution success is not enough.
  const verification = await adapter.operations.verifyOperation(opReq);
  if (verification.outcome === "unknown") {
    revalidateOperationPaths();
    return {
      ok: true,
      data: { status: "verification_pending" },
      error: "Verification could not read provider state — retry verification",
    };
  }
  const { data: finalStatus } = await admin.rpc("finish_provider_operation_verification", {
    p_execution_id: ctx.execution_id,
    p_outcome: verification.outcome,
    p_observed_status: verification.observedStatus ?? null,
    p_actor: user.id,
  });

  revalidateOperationPaths();
  if (finalStatus === "verified") {
    return { ok: true, data: { status: "verified", category: result.category } };
  }
  if (verification.outcome === "pending") {
    return { ok: true, data: { status: "verification_pending" }, error: "Provider is still transitioning — verify again shortly" };
  }
  return { ok: false, error: "Provider did not reach the expected state — verification failed", data: { status: "verification_failed" } };
}

// ============================================================================
// VERIFY (Admin — retry verification on a pending proposal; read-only)
// ============================================================================

export async function verifyProviderOperation(proposalId: string): Promise<ActionResult<{ status: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data: proposal } = await admin
    .from("provider_operation_proposals")
    .select("id, provider_account_id, operation_key, status, provider_operation_executions(id, status)")
    .eq("id", proposalId)
    .single();
  if (!proposal) return { ok: false, error: "Proposal not found" };
  if (proposal.status !== "verification_pending") {
    return { ok: false, error: `Proposal is not awaiting verification (${proposal.status})` };
  }

  const exec = (proposal.provider_operation_executions as { id: string; status: string }[] | null)
    ?.find((e) => e.status === "completed" || e.status === "verification_pending");
  if (!exec) return { ok: false, error: "No execution awaiting verification" };

  const { data: disc } = await admin
    .from("provider_operation_proposals")
    .select("provider_discovered_resources(external_resource_id, resource_type)")
    .eq("id", proposalId)
    .single();
  const discRel = disc?.provider_discovered_resources as unknown;
  const external = Array.isArray(discRel) ? discRel[0] : discRel;
  const extId = (external as { external_resource_id?: string } | null)?.external_resource_id;
  const extType = (external as { resource_type?: string } | null)?.resource_type;
  if (!extId) return { ok: false, error: "Linked provider resource not found" };

  const { data: account } = await admin
    .from("provider_accounts")
    .select("providers(adapter_key)")
    .eq("id", proposal.provider_account_id)
    .single();
  const providerRel = account?.providers as unknown;
  const adapterKey = Array.isArray(providerRel)
    ? (providerRel[0] as { adapter_key?: string } | undefined)?.adapter_key
    : (providerRel as { adapter_key?: string } | null)?.adapter_key;
  const adapter = getAdapter(adapterKey);
  if (!adapter?.operations) return { ok: false, error: "Provider does not support verification" };

  const { data: secret } = await admin.rpc("reveal_provider_credential", {
    p_provider_account_id: proposal.provider_account_id,
  });
  if (!secret) return { ok: false, error: "No credential is configured for this account" };
  const creds = JSON.parse(secret) as { token?: string; accountId?: string };
  if (!creds.token) return { ok: false, error: "Stored credential is unreadable" };

  const verification = await adapter.operations.verifyOperation({
    creds: { token: creds.token, accountId: creds.accountId },
    operation: proposal.operation_key as never,
    externalResourceId: extId,
    resourceType: extType as never,
    idempotencyKey: `schop-${proposalId}`,
  });

  if (verification.outcome === "unknown") {
    return { ok: true, data: { status: "verification_pending" }, error: "Provider state could not be read — try again" };
  }
  const { data: finalStatus, error } = await admin.rpc("finish_provider_operation_verification", {
    p_execution_id: exec.id,
    p_outcome: verification.outcome,
    p_observed_status: verification.observedStatus ?? null,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidateOperationPaths();
  if (finalStatus === "verified") return { ok: true, data: { status: "verified" } };
  if (verification.outcome === "pending") {
    return { ok: true, data: { status: "verification_pending" }, error: "Provider is still transitioning" };
  }
  return { ok: false, error: "Provider state does not match the requested operation", data: { status: "verification_failed" } };
}
