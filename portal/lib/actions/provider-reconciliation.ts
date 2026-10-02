"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin } from "@/lib/security/roles";

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
  if (!user) return { user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { user, role: profile?.role ?? null };
}

function requireAdmin(role: string | null): string | null {
  if (!checkIsAdmin(role)) {
    return "Permission denied: only administrators manage provider reconciliation";
  }
  return null;
}

function revalidateReconPaths() {
  revalidatePath("/admin/systems");
  revalidatePath("/admin/systems/providers");
  revalidatePath("/admin/systems/reconciliation");
}

/**
 * Run a manual reconciliation for one provider account. The engine compares
 * the latest completed discovery against the last reconciled snapshot and
 * records review proposals — it never mutates SCH inventory.
 */
export async function runProviderReconciliation(
  providerAccountId: string
): Promise<ActionResult<{ runId: string; status: string; examined: number; changes: number; errorSummary: string | null }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data: runId, error } = await admin.rpc("run_provider_reconciliation", {
    p_provider_account_id: providerAccountId,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: "Reconciliation could not be started" };

  const { data: run } = await admin
    .from("provider_reconciliation_runs")
    .select("id, status, resources_examined, changes_detected, error_summary")
    .eq("id", runId)
    .single();

  revalidateReconPaths();
  return {
    ok: run?.status !== "failed",
    data: {
      runId,
      status: run?.status ?? "unknown",
      examined: run?.resources_examined ?? 0,
      changes: run?.changes_detected ?? 0,
      errorSummary: run?.error_summary ?? null,
    },
    error: run?.status === "failed" ? (run.error_summary ?? "Reconciliation failed") : undefined,
  };
}

export type ReviewDecision = "acknowledge" | "approve" | "reject" | "dismiss";

/** Record a review decision on a reconciliation item (admin only). */
export async function reviewReconciliationItem(
  itemId: string,
  decision: ReviewDecision
): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { error } = await admin.rpc("review_reconciliation_item", {
    p_item_id: itemId,
    p_decision: decision,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateReconPaths();
  return { ok: true };
}

/**
 * Apply an approved proposal (SCH-side only). The database re-checks the
 * proposal's basis run — a newer observation marks it stale and refuses.
 */
export async function applyReconciliationItem(itemId: string): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  const denied = requireAdmin(role);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_reconciliation_item", {
    p_item_id: itemId,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateReconPaths();
  if (data === "stale") {
    return { ok: false, error: "Proposal is stale — provider state changed since it was generated. Re-run discovery and reconciliation." };
  }
  return { ok: true, data };
}
