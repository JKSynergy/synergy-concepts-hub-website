"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";

export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

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

  const { error } = await supabase
    .from("suspension_cases")
    .update(updatePayload)
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  revalidatePath("/admin/agreements");
  return { ok: true };
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

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      status: "rejected",
      notes: rejectionNotes ? rejectionNotes.trim() : null,
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
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

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      status: "executing",
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
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

  const { data: caseData, error: fetchErr } = await supabase
    .from("suspension_cases")
    .select("service_agreement_id, system_id, status")
    .eq("id", caseId)
    .single();

  if (fetchErr || !caseData) {
    return { ok: false, error: "Suspension case not found" };
  }

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      status: "suspended",
      executed_at: new Date().toISOString(),
      ...(notes ? { operational_notes: notes.trim() } : {}),
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  // Update associated agreement status to suspended
  if (caseData.service_agreement_id) {
    await supabase
      .from("service_agreements")
      .update({ status: "suspended" })
      .eq("id", caseData.service_agreement_id);
  }

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

  const { error } = await supabase
    .from("suspension_actions")
    .update({
      action_status: "completed",
      performed_by: user.id,
      performed_at: new Date().toISOString(),
      evidence_reference: evidenceReference.trim(),
      ...(notes ? { notes: notes.trim() } : {}),
    })
    .eq("id", actionId);

  if (error) {
    return { ok: false, error: error.message };
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

  const { error } = await supabase
    .from("suspension_actions")
    .update({
      action_status: "verified",
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      ...(notes ? { notes: notes.trim() } : {}),
    })
    .eq("id", actionId);

  if (error) {
    return { ok: false, error: error.message };
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

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      verified_at: new Date().toISOString(),
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
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

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      status: "restoration_pending",
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
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

  const { data: caseData, error: fetchErr } = await supabase
    .from("suspension_cases")
    .select("service_agreement_id")
    .eq("id", caseId)
    .single();

  if (fetchErr || !caseData) {
    return { ok: false, error: "Suspension case not found" };
  }

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      status: "restored",
      restored_at: new Date().toISOString(),
      ...(notes ? { operational_notes: notes.trim() } : {}),
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  // Restore service agreement status to active
  if (caseData.service_agreement_id) {
    await supabase
      .from("service_agreements")
      .update({ status: "active" })
      .eq("id", caseData.service_agreement_id);
  }

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

  const { error } = await supabase
    .from("suspension_cases")
    .update({
      status: "cancelled",
      ...(notes ? { notes: notes.trim() } : {}),
    })
    .eq("id", caseId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  return { ok: true };
}
