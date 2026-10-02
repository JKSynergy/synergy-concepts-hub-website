"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";

export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type BackupFrequency = "daily" | "weekly" | "monthly" | "custom";
type BackupEventStatus = "expected" | "in_progress" | "successful" | "failed" | "missed";

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

// ============================================================================
// BACKUP POLICY ACTIONS (governance — Admin only)
// ============================================================================

export interface CreateBackupPolicyInput {
  clientId: string;
  resourceId: string;
  systemId?: string | null;
  serviceAgreementId?: string | null;
  name: string;
  frequency: BackupFrequency;
  frequencyIntervalDays?: number | null;
  retentionDays: number;
  verificationRequired?: boolean;
  isActive?: boolean;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  operationalNotes?: string | null;
}

export async function createBackupPolicy(
  input: CreateBackupPolicyInput | FormData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: Only administrators manage backup policies" };
  }

  const f = (k: string) => (input instanceof FormData ? input.get(k)?.toString() : undefined);

  const payload = input instanceof FormData
    ? {
        client_id: f("client_id"),
        resource_id: f("resource_id"),
        system_id: f("system_id") || null,
        service_agreement_id: f("service_agreement_id") || null,
        name: f("name")?.trim(),
        frequency: (f("frequency") || "daily") as BackupFrequency,
        frequency_interval_days: f("frequency_interval_days") ? Number(f("frequency_interval_days")) : null,
        retention_days: Number(f("retention_days") || 0),
        verification_required: f("verification_required") !== "false",
        is_active: f("is_active") !== "false",
        effective_from: f("effective_from") || null,
        effective_until: f("effective_until") || null,
        operational_notes: f("operational_notes")?.trim() || null,
      }
    : {
        client_id: input.clientId,
        resource_id: input.resourceId,
        system_id: input.systemId ?? null,
        service_agreement_id: input.serviceAgreementId ?? null,
        name: input.name?.trim(),
        frequency: input.frequency || "daily",
        frequency_interval_days: input.frequencyIntervalDays ?? null,
        retention_days: input.retentionDays,
        verification_required: input.verificationRequired ?? true,
        is_active: input.isActive ?? true,
        effective_from: input.effectiveFrom || null,
        effective_until: input.effectiveUntil || null,
        operational_notes: input.operationalNotes?.trim() || null,
      };

  // Automatic client resolution from resource if not explicitly provided
  if (!payload.client_id && payload.resource_id) {
    const { data: res } = await supabase
      .from("resources")
      .select("client_id")
      .eq("id", payload.resource_id)
      .single();
    if (res?.client_id) payload.client_id = res.client_id;
  }

  if (!payload.client_id) return { ok: false, error: "Client is required for backup policies" };
  if (!payload.resource_id) return { ok: false, error: "Resource is required for backup policies" };
  if (!payload.name || payload.name.length < 3) return { ok: false, error: "Policy name must be at least 3 characters" };
  if (!payload.retention_days || payload.retention_days <= 0) {
    return { ok: false, error: "Retention period must be a positive number of days" };
  }
  if (payload.frequency === "custom" && (!payload.frequency_interval_days || payload.frequency_interval_days <= 0)) {
    return { ok: false, error: "Custom frequency requires a positive interval in days" };
  }
  if (payload.frequency !== "custom") payload.frequency_interval_days = null;

  const insertPayload: Record<string, unknown> = { ...payload, created_by: user.id };
  if (!insertPayload.effective_from) delete insertPayload.effective_from; // let DB default (CURRENT_DATE) apply

  const { data, error } = await supabase
    .from("backup_policies")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/backups");
  return { ok: true, data: { id: data.id } };
}

export async function updateBackupPolicy(
  policyId: string,
  input: {
    name?: string;
    frequency?: BackupFrequency;
    frequencyIntervalDays?: number | null;
    retentionDays?: number;
    verificationRequired?: boolean;
    effectiveFrom?: string | null;
    effectiveUntil?: string | null;
    serviceAgreementId?: string | null;
    operationalNotes?: string | null;
  }
): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: Only administrators manage backup policies" };
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.frequency !== undefined) updates.frequency = input.frequency;
  if (input.frequencyIntervalDays !== undefined) updates.frequency_interval_days = input.frequencyIntervalDays;
  if (input.retentionDays !== undefined) updates.retention_days = input.retentionDays;
  if (input.verificationRequired !== undefined) updates.verification_required = input.verificationRequired;
  if (input.effectiveFrom !== undefined) updates.effective_from = input.effectiveFrom;
  if (input.effectiveUntil !== undefined) updates.effective_until = input.effectiveUntil;
  if (input.serviceAgreementId !== undefined) updates.service_agreement_id = input.serviceAgreementId;
  if (input.operationalNotes !== undefined) updates.operational_notes = input.operationalNotes?.trim() || null;

  const { error } = await supabase
    .from("backup_policies")
    .update(updates)
    .eq("id", policyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/backups");
  return { ok: true };
}

export async function setBackupPolicyActive(policyId: string, active: boolean): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: Only administrators manage backup policies" };
  }

  const updates: Record<string, unknown> = { is_active: active };
  if (active) {
    updates.effective_until = null;
  } else {
    updates.effective_until = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase
    .from("backup_policies")
    .update(updates)
    .eq("id", policyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/backups");
  return { ok: true };
}

// ============================================================================
// BACKUP EVENT ACTIONS (operational recording — Admin + Staff)
// ============================================================================

export interface RecordBackupEventInput {
  clientId?: string;
  backupPolicyId?: string | null;
  resourceId: string;
  status: BackupEventStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  evidenceReference?: string | null;
  evidenceNotes?: string | null;
  failureReason?: string | null;
}

export async function recordBackupEvent(
  input: RecordBackupEventInput | FormData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!isOperationalStaff(role)) {
    return { ok: false, error: "Permission denied: Operational access required" };
  }
  if (isFinance(role)) {
    return { ok: false, error: "Finance users cannot record backup events" };
  }

  let clientId: string | undefined;
  let backupPolicyId: string | null = null;
  let resourceId: string | undefined;
  let status: BackupEventStatus = "successful";
  let startedAt: string | null = null;
  let completedAt: string | null = null;
  let evidenceReference: string | null = null;
  let evidenceNotes: string | null = null;
  let failureReason: string | null = null;

  if (input instanceof FormData) {
    clientId = input.get("client_id")?.toString();
    backupPolicyId = input.get("backup_policy_id")?.toString() || null;
    resourceId = input.get("resource_id")?.toString();
    const st = input.get("status")?.toString();
    if (st && ["expected", "in_progress", "successful", "failed", "missed"].includes(st)) {
      status = st as BackupEventStatus;
    }
    startedAt = input.get("started_at")?.toString() || null;
    completedAt = input.get("completed_at")?.toString() || null;
    evidenceReference = input.get("evidence_reference")?.toString()?.trim() || null;
    evidenceNotes = input.get("evidence_notes")?.toString()?.trim() || null;
    failureReason = input.get("failure_reason")?.toString()?.trim() || null;
  } else {
    clientId = input.clientId;
    backupPolicyId = input.backupPolicyId ?? null;
    resourceId = input.resourceId;
    status = input.status || "successful";
    startedAt = input.startedAt ?? null;
    completedAt = input.completedAt ?? null;
    evidenceReference = input.evidenceReference?.trim() || null;
    evidenceNotes = input.evidenceNotes?.trim() || null;
    failureReason = input.failureReason?.trim() || null;
  }

  // Automatic client resolution from policy or resource
  if (!clientId) {
    if (backupPolicyId) {
      const { data: pol } = await supabase.from("backup_policies").select("client_id").eq("id", backupPolicyId).single();
      if (pol) clientId = pol.client_id;
    }
    if (!clientId && resourceId) {
      const { data: res } = await supabase.from("resources").select("client_id").eq("id", resourceId).single();
      if (res?.client_id) clientId = res.client_id;
    }
  }

  if (!clientId) return { ok: false, error: "Client is required for backup events" };
  if (!resourceId && backupPolicyId) {
    const { data: pol } = await supabase.from("backup_policies").select("resource_id").eq("id", backupPolicyId).single();
    if (pol) resourceId = pol.resource_id;
  }
  if (!resourceId) return { ok: false, error: "Resource is required for backup events" };
  if (status === "failed" && (!failureReason || failureReason.length < 3)) {
    return { ok: false, error: "A failed backup event requires a failure reason" };
  }

  const { data, error } = await supabase
    .from("backup_events")
    .insert({
      client_id: clientId,
      backup_policy_id: backupPolicyId,
      resource_id: resourceId,
      status,
      started_at: startedAt,
      completed_at: completedAt,
      evidence_reference: evidenceReference,
      evidence_notes: evidenceNotes,
      failure_reason: failureReason,
      recorded_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/backups");
  return { ok: true, data: { id: data.id } };
}

export async function recordBackupEvidence(
  eventId: string,
  evidenceReference: string | null,
  evidenceNotes: string | null
): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!isOperationalStaff(role)) {
    return { ok: false, error: "Permission denied: Operational access required" };
  }
  if (isFinance(role)) {
    return { ok: false, error: "Finance users cannot modify backup events" };
  }
  if (!evidenceReference?.trim() && !evidenceNotes?.trim()) {
    return { ok: false, error: "Provide an evidence reference or evidence notes" };
  }

  const { error } = await supabase
    .from("backup_events")
    .update({
      evidence_reference: evidenceReference?.trim() || null,
      evidence_notes: evidenceNotes?.trim() || null,
    })
    .eq("id", eventId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/backups");
  return { ok: true };
}

export async function verifyBackupEvent(eventId: string): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!isOperationalStaff(role)) {
    return { ok: false, error: "Permission denied: Operational access required" };
  }
  if (isFinance(role)) {
    return { ok: false, error: "Finance users cannot verify backup events" };
  }

  const { error } = await supabase
    .from("backup_events")
    .update({ status: "verified" })
    .eq("id", eventId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/backups");
  return { ok: true };
}

export async function markBackupEventInProgress(eventId: string): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!isOperationalStaff(role) || isFinance(role)) {
    return { ok: false, error: "Permission denied: Operational access required" };
  }

  const { error } = await supabase
    .from("backup_events")
    .update({ status: "in_progress" })
    .eq("id", eventId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/backups");
  return { ok: true };
}
