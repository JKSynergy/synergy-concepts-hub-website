"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";
import { CASE_TRANSITIONS, ACTION_COMPLETABLE_STATUSES } from "@/lib/operations/suspensions";

export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

/**
 * Guarded suspension-case transition: the UPDATE only lands if the case is
 * currently in one of the action's allowed from-statuses. An invalid, stale,
 * or retried transition matches zero rows — no write, no state regression,
 * and no duplicate audit event (the lifecycle trigger only fires on actual
 * changes).
 */
async function transitionSuspensionCase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: string,
  action: keyof typeof CASE_TRANSITIONS,
  updates: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("suspension_cases")
    .update(updates)
    .eq("id", caseId)
    .in("status", [...CASE_TRANSITIONS[action]])
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "This transition is not available for the case's current state" };
  }

  revalidatePath("/admin/operations/suspensions");
  revalidatePath("/admin/agreements");
  return { ok: true };
}

export interface CreateSuspensionCaseInput {
  serviceAgreementId: string;
  clientId: string;
  systemId?: string | null;
  reason: string;
  notes?: string | null;
  operationalNotes?: string | null;
  assignedTo?: string | null;
}

export async function createSuspensionCase(
  input: CreateSuspensionCaseInput | FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  // Admin can create; Staff can propose; Finance and Client cannot
  if (!isOperationalStaff(role)) {
    return { ok: false, error: "Permission denied: Operational or Admin access required" };
  }

  let serviceAgreementId: string | undefined;
  let clientId: string | undefined;
  let systemId: string | null = null;
  let reason: string | undefined;
  let notes: string | null = null;
  let operationalNotes: string | null = null;
  let assignedTo: string | null = null;

  if (input instanceof FormData) {
    serviceAgreementId = input.get("service_agreement_id")?.toString();
    clientId = input.get("client_id")?.toString();
    systemId = input.get("system_id")?.toString() || null;
    reason = input.get("reason")?.toString()?.trim();
    notes = input.get("notes")?.toString()?.trim() || null;
    operationalNotes = input.get("operational_notes")?.toString()?.trim() || null;
    assignedTo = input.get("assigned_to")?.toString() || null;
  } else {
    serviceAgreementId = input.serviceAgreementId;
    clientId = input.clientId;
    systemId = input.systemId ?? null;
    reason = input.reason?.trim();
    notes = input.notes?.trim() || null;
    operationalNotes = input.operationalNotes?.trim() || null;
    assignedTo = input.assignedTo ?? null;
  }

  if (!clientId && serviceAgreementId) {
    const { data: ag } = await supabase
      .from("service_agreements")
      .select("client_id, system_id")
      .eq("id", serviceAgreementId)
      .single();
    if (ag) {
      clientId = ag.client_id;
      if (!systemId) systemId = ag.system_id;
    }
  }

  if (!serviceAgreementId || !clientId || !reason) {
    return { ok: false, error: "Agreement and Reason are required" };
  }

  if (reason.length < 3) {
    return { ok: false, error: "Reason must be at least 3 characters" };
  }

  const { data, error } = await supabase
    .from("suspension_cases")
    .insert({
      service_agreement_id: serviceAgreementId,
      client_id: clientId,
      system_id: systemId,
      reason,
      status: "proposed",
      requested_by: user.id,
      assigned_to: assignedTo,
      notes,
      operational_notes: operationalNotes,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  revalidatePath("/admin/agreements");
  return { ok: true, data: { id: data.id } };
}

export async function approveSuspensionCase(
  caseId: string,
  assignedTo?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // ONLY Admin can approve suspensions (Spec 4 & 5)
  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators can approve suspensions" };
  }

  const updatePayload: Record<string, unknown> = {
    status: "approved",
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  };

  if (assignedTo !== undefined) {
    updatePayload.assigned_to = assignedTo;
  }

  return transitionSuspensionCase(supabase, caseId, "approve", updatePayload);
}

export async function rejectSuspensionCase(
  caseId: string,
  rejectionNotes?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // ONLY Admin can reject suspensions
  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators can reject suspension cases" };
  }

  return transitionSuspensionCase(supabase, caseId, "reject", {
    status: "rejected",
    notes: rejectionNotes ? rejectionNotes.trim() : null,
  });
}

export async function assignSuspensionCase(
  caseId: string,
  assignedTo: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators can assign suspension cases" };
  }

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      assigned_to: assignedTo,
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
}

export async function startCaseExecution(caseId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (isFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Finance cannot execute suspensions" };
  }

  return transitionSuspensionCase(supabase, caseId, "execute_start", { status: "executing" });
}

export async function executeSuspensionCase(
  caseId: string,
  notes?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (isFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Finance cannot execute suspensions" };
  }

  // Atomic: the RPC performs the case transition and the linked agreement
  // update in one transaction — both land or neither does.
  const { error } = await supabase.rpc("transition_suspension_case", {
    p_case_id: caseId,
    p_action: "execute",
    p_actor: user.id,
    p_notes: notes ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations/suspensions");
  revalidatePath("/admin/agreements");
  return { ok: true };
}

export async function addSuspensionAction(
  caseId: string,
  actionType: "suspension" | "restoration" | "verification",
  resourceId?: string | null,
  assignedTo?: string | null,
  notes?: string | null
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (isFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Finance cannot create suspension actions" };
  }

  const { data, error } = await supabase
    .from("suspension_actions")
    .insert({
      suspension_case_id: caseId,
      action_type: actionType,
      resource_id: resourceId || null,
      assigned_to: assignedTo || null,
      notes: notes?.trim() || null,
      action_status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true, data: { id: data.id } };
}

export async function completeSuspensionAction(
  actionId: string,
  evidenceReference: string,
  notes?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (isFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Finance cannot execute suspension actions" };
  }

  const { data, error } = await supabase
    .from("suspension_actions")
    .update({
      action_status: "completed",
      performed_by: user.id,
      performed_at: new Date().toISOString(),
      evidence_reference: evidenceReference.trim(),
      ...(notes ? { notes: notes.trim() } : {}),
    })
    .eq("id", actionId)
    .in("action_status", [...ACTION_COMPLETABLE_STATUSES])
    .select("id");

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Action is not in a state that can be completed" };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
}

export async function verifySuspensionAction(
  actionId: string,
  notes?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators can verify suspension actions" };
  }

  const { data, error } = await supabase
    .from("suspension_actions")
    .update({
      action_status: "verified",
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      ...(notes ? { notes: notes.trim() } : {}),
    })
    .eq("id", actionId)
    .eq("action_status", "completed")
    .select("id");

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Only completed actions can be verified" };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
}

export async function verifySuspensionCase(caseId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators can verify suspension cases" };
  }

  // Verify once — a retried verification must not overwrite the original
  // timestamp or emit a second audit event.
  const { data, error } = await supabase
    .from("suspension_cases")
    .update({
      verified_at: new Date().toISOString(),
    })
    .eq("id", caseId)
    .is("verified_at", null)
    .select("id");

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Case is already verified" };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
}

export async function initiateCaseRestoration(caseId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (isFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Finance cannot manage restoration" };
  }

  return transitionSuspensionCase(supabase, caseId, "initiate_restoration", {
    status: "restoration_pending",
  });
}

export async function completeCaseRestoration(
  caseId: string,
  notes?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (isFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Finance cannot manage restoration" };
  }

  // Atomic: the RPC performs the case transition and the linked agreement
  // update in one transaction — both land or neither does.
  const { error } = await supabase.rpc("transition_suspension_case", {
    p_case_id: caseId,
    p_action: "complete_restoration",
    p_actor: user.id,
    p_notes: notes ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations/suspensions");
  revalidatePath("/admin/agreements");
  return { ok: true };
}

export async function cancelSuspensionCase(
  caseId: string,
  notes?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators can cancel suspension cases" };
  }

  return transitionSuspensionCase(supabase, caseId, "cancel", {
    status: "cancelled",
    ...(notes ? { notes: notes.trim() } : {}),
  });
}
