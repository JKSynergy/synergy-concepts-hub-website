"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";
import { INCIDENT_TRANSITIONS } from "@/lib/operations/incidents";
import { TASK_TRANSITIONS } from "@/lib/operations/tasks";

export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// TASKS ACTIONS
// ============================================================================

export interface CreateTaskInput {
  clientId: string;
  systemId?: string | null;
  resourceId?: string | null;
  serviceAgreementId?: string | null;
  incidentId?: string | null;
  suspensionCaseId?: string | null;
  title: string;
  description?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  assignedTo?: string | null;
  dueAt?: string | null;
}

export async function createTask(
  input: CreateTaskInput | FormData
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
  if (!isOperationalStaff(role)) {
    return { ok: false, error: "Permission denied: Operational access required" };
  }
  if (isFinance(role)) {
    return { ok: false, error: "Finance users cannot create operational tasks" };
  }

  let clientId: string | undefined;
  let systemId: string | null = null;
  let resourceId: string | null = null;
  let serviceAgreementId: string | null = null;
  let incidentId: string | null = null;
  let suspensionCaseId: string | null = null;
  let title: string | undefined;
  let description: string | null = null;
  let priority: "low" | "normal" | "high" | "urgent" = "normal";
  let assignedTo: string | null = null;
  let dueAt: string | null = null;

  if (input instanceof FormData) {
    clientId = input.get("client_id")?.toString();
    systemId = input.get("system_id")?.toString() || null;
    resourceId = input.get("resource_id")?.toString() || null;
    serviceAgreementId = input.get("service_agreement_id")?.toString() || null;
    incidentId = input.get("incident_id")?.toString() || null;
    suspensionCaseId = input.get("suspension_case_id")?.toString() || null;
    title = input.get("title")?.toString()?.trim();
    description = input.get("description")?.toString()?.trim() || null;
    const prio = input.get("priority")?.toString()?.trim();
    if (prio && ["low", "normal", "high", "urgent"].includes(prio)) {
      priority = prio as "low" | "normal" | "high" | "urgent";
    }
    assignedTo = input.get("assigned_to")?.toString() || null;
    dueAt = input.get("due_at")?.toString() || null;
  } else {
    clientId = input.clientId;
    systemId = input.systemId ?? null;
    resourceId = input.resourceId ?? null;
    serviceAgreementId = input.serviceAgreementId ?? null;
    incidentId = input.incidentId ?? null;
    suspensionCaseId = input.suspensionCaseId ?? null;
    title = input.title?.trim();
    description = input.description?.trim() || null;
    priority = input.priority || "normal";
    assignedTo = input.assignedTo ?? null;
    dueAt = input.dueAt ?? null;
  }

  // Automatic client resolution from parent entity if not explicitly provided
  if (!clientId) {
    if (systemId) {
      const { data: sys } = await supabase.from("systems").select("client_id").eq("id", systemId).single();
      if (sys) clientId = sys.client_id;
    } else if (resourceId) {
      const { data: res } = await supabase.from("resources").select("client_id").eq("id", resourceId).single();
      if (res && res.client_id) clientId = res.client_id;
    } else if (serviceAgreementId) {
      const { data: agr } = await supabase.from("service_agreements").select("client_id").eq("id", serviceAgreementId).single();
      if (agr) clientId = agr.client_id;
    } else if (incidentId) {
      const { data: inc } = await supabase.from("incidents").select("client_id").eq("id", incidentId).single();
      if (inc) clientId = inc.client_id;
    } else if (suspensionCaseId) {
      const { data: sus } = await supabase.from("suspension_cases").select("client_id").eq("id", suspensionCaseId).single();
      if (sus) clientId = sus.client_id;
    }
  }

  if (!clientId) return { ok: false, error: "Client is required for operational tasks" };
  if (!title || title.length < 3) return { ok: false, error: "Title must be at least 3 characters" };

  if (assignedTo) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", assignedTo)
      .single();
    if (!assignee || !isOperationalStaff(assignee.role)) {
      return { ok: false, error: "Tasks can only be assigned to staff or administrators" };
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      client_id: clientId,
      system_id: systemId,
      resource_id: resourceId,
      service_agreement_id: serviceAgreementId,
      incident_id: incidentId,
      suspension_case_id: suspensionCaseId,
      title,
      description,
      status: assignedTo ? "assigned" : "open",
      priority,
      assigned_to: assignedTo,
      created_by: user.id,
      due_at: dueAt,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/tasks");
  return { ok: true, data: { id: data.id } };
}

export async function updateTask(
  taskId: string,
  input: {
    title?: string;
    description?: string | null;
    priority?: "low" | "normal" | "high" | "urgent";
    dueAt?: string | null;
  }
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

  if (!isOperationalStaff(profile?.role)) {
    return { ok: false, error: "Operational access required" };
  }

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length < 3) return { ok: false, error: "Title must be at least 3 characters" };
    updates.title = title;
  }
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueAt !== undefined) updates.due_at = input.dueAt;

  const { error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/tasks");
  return { ok: true };
}

export async function assignTask(
  taskId: string,
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
    return { ok: false, error: "Permission denied: Only administrators can assign or reassign tasks" };
  }

  const { data: currentTask } = await supabase
    .from("tasks")
    .select("status")
    .eq("id", taskId)
    .single();

  if (assignedTo) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", assignedTo)
      .single();
    if (!assignee || !isOperationalStaff(assignee.role)) {
      return { ok: false, error: "Tasks can only be assigned to staff or administrators" };
    }
  }

  const nextStatus = assignedTo && currentTask?.status === "open" ? "assigned" : undefined;

  const updates: Record<string, unknown> = { assigned_to: assignedTo };
  if (nextStatus) updates.status = nextStatus;

  const { error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/tasks");
  return { ok: true };
}

/**
 * Authorize a task-mutating action: the caller must be operational staff
 * (admin or staff — never finance or a client), and a staff caller may only
 * act on tasks assigned to them or unassigned tasks. Mirrors RLS
 * `tasks_update_staff` + `trg_task_lifecycle`, enforced at the action layer
 * so unauthorized calls fail before touching the row.
 */
async function authorizeTaskMutation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string
): Promise<
  | { ok: true; userId: string; admin: boolean }
  | { ok: false; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isOperationalStaff(profile?.role)) {
    return { ok: false, error: "Permission denied: Operational access required" };
  }

  if (!checkIsAdmin(profile?.role)) {
    const { data: task } = await supabase
      .from("tasks")
      .select("assigned_to")
      .eq("id", taskId)
      .single();
    if (task?.assigned_to && task.assigned_to !== user.id) {
      return { ok: false, error: "Permission denied: This task is assigned to another staff member" };
    }
  }

  return { ok: true, userId: user.id, admin: checkIsAdmin(profile?.role) };
}

/**
 * Apply a guarded status transition: the UPDATE only lands if the task is
 * currently in one of the action's allowed from-statuses. An invalid, stale,
 * or retried transition matches zero rows — no write, no duplicate audit
 * event, no appended status note.
 */
async function transitionTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  action: keyof typeof TASK_TRANSITIONS,
  updates: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .in("status", [...TASK_TRANSITIONS[action]])
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "This transition is not available for the task's current state" };
  }

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/tasks");
  return { ok: true };
}

export async function startTask(taskId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const authz = await authorizeTaskMutation(supabase, taskId);
  if (!authz.ok) return authz;

  return transitionTask(supabase, taskId, "start", {
    status: "in_progress",
    started_at: new Date().toISOString(),
  });
}

export async function blockTask(taskId: string, reason?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const authz = await authorizeTaskMutation(supabase, taskId);
  if (!authz.ok) return authz;

  const updates: Record<string, unknown> = { status: "blocked" };
  if (reason) {
    const { data: current } = await supabase.from("tasks").select("description").eq("id", taskId).single();
    const existing = current?.description ? `${current.description}\n\n[BLOCKED]: ${reason.trim()}` : `[BLOCKED]: ${reason.trim()}`;
    updates.description = existing;
  }

  return transitionTask(supabase, taskId, "block", updates);
}

export async function completeTask(taskId: string, notes?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const authz = await authorizeTaskMutation(supabase, taskId);
  if (!authz.ok) return authz;

  const updates: Record<string, unknown> = {
    status: "completed",
    completed_at: new Date().toISOString(),
  };

  if (notes) {
    const { data: current } = await supabase.from("tasks").select("description").eq("id", taskId).single();
    const existing = current?.description ? `${current.description}\n\n[COMPLETED]: ${notes.trim()}` : `[COMPLETED]: ${notes.trim()}`;
    updates.description = existing;
  }

  return transitionTask(supabase, taskId, "complete", updates);
}

export async function cancelTask(taskId: string, reason?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const authz = await authorizeTaskMutation(supabase, taskId);
  if (!authz.ok) return authz;
  if (!authz.admin) {
    return { ok: false, error: "Permission denied: Only administrators can cancel operational tasks" };
  }

  const updates: Record<string, unknown> = {
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
  };

  if (reason) {
    const { data: current } = await supabase.from("tasks").select("description").eq("id", taskId).single();
    const existing = current?.description ? `${current.description}\n\n[CANCELLED]: ${reason.trim()}` : `[CANCELLED]: ${reason.trim()}`;
    updates.description = existing;
  }

  return transitionTask(supabase, taskId, "cancel", updates);
}

// ============================================================================
// INCIDENTS ACTIONS
// ============================================================================

export interface CreateIncidentInput {
  clientId: string;
  systemId?: string | null;
  resourceId?: string | null;
  serviceAgreementId?: string | null;
  title: string;
  description: string;
  severity?: "low" | "medium" | "high" | "critical";
  assignedTo?: string | null;
}

export async function createIncident(
  input: CreateIncidentInput | FormData
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
  if (!isOperationalStaff(role)) {
    return { ok: false, error: "Permission denied: Operational access required" };
  }
  if (isFinance(role)) {
    return { ok: false, error: "Finance users cannot create operational incidents" };
  }

  let clientId: string | undefined;
  let systemId: string | null = null;
  let resourceId: string | null = null;
  let serviceAgreementId: string | null = null;
  let title: string | undefined;
  let description: string | undefined;
  let severity: "low" | "medium" | "high" | "critical" = "medium";
  let assignedTo: string | null = null;

  if (input instanceof FormData) {
    clientId = input.get("client_id")?.toString();
    systemId = input.get("system_id")?.toString() || null;
    resourceId = input.get("resource_id")?.toString() || null;
    serviceAgreementId = input.get("service_agreement_id")?.toString() || null;
    title = input.get("title")?.toString()?.trim();
    description = input.get("description")?.toString()?.trim();
    const sev = input.get("severity")?.toString()?.trim();
    if (sev && ["low", "medium", "high", "critical"].includes(sev)) {
      severity = sev as "low" | "medium" | "high" | "critical";
    }
    assignedTo = input.get("assigned_to")?.toString() || null;
  } else {
    clientId = input.clientId;
    systemId = input.systemId ?? null;
    resourceId = input.resourceId ?? null;
    serviceAgreementId = input.serviceAgreementId ?? null;
    title = input.title?.trim();
    description = input.description?.trim();
    severity = input.severity || "medium";
    assignedTo = input.assignedTo ?? null;
  }

  // Automatic client resolution from related entity
  if (!clientId) {
    if (systemId) {
      const { data: sys } = await supabase.from("systems").select("client_id").eq("id", systemId).single();
      if (sys) clientId = sys.client_id;
    } else if (resourceId) {
      const { data: res } = await supabase.from("resources").select("client_id").eq("id", resourceId).single();
      if (res && res.client_id) clientId = res.client_id;
    } else if (serviceAgreementId) {
      const { data: agr } = await supabase.from("service_agreements").select("client_id").eq("id", serviceAgreementId).single();
      if (agr) clientId = agr.client_id;
    }
  }

  if (!clientId) return { ok: false, error: "Client is required for incident records" };
  if (!title || title.length < 3) return { ok: false, error: "Title must be at least 3 characters" };
  if (!description || description.length < 3) return { ok: false, error: "Description must be at least 3 characters" };

  const { data, error } = await supabase
    .from("incidents")
    .insert({
      client_id: clientId,
      system_id: systemId,
      resource_id: resourceId,
      service_agreement_id: serviceAgreementId,
      title,
      description,
      severity,
      status: assignedTo ? "acknowledged" : "open",
      reported_by: user.id,
      assigned_to: assignedTo,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/incidents");
  return { ok: true, data: { id: data.id } };
}

export async function updateIncident(
  incidentId: string,
  input: {
    title?: string;
    description?: string;
    severity?: "low" | "medium" | "high" | "critical";
  }
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

  if (!isOperationalStaff(profile?.role)) {
    return { ok: false, error: "Operational access required" };
  }

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.severity !== undefined) updates.severity = input.severity;

  const { error } = await supabase
    .from("incidents")
    .update(updates)
    .eq("id", incidentId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/incidents");
  return { ok: true };
}

export async function assignIncident(
  incidentId: string,
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
    return { ok: false, error: "Permission denied: Only administrators can assign or reassign incidents" };
  }

  const { data: currentInc } = await supabase
    .from("incidents")
    .select("status")
    .eq("id", incidentId)
    .single();

  const nextStatus = assignedTo && currentInc?.status === "open" ? "acknowledged" : undefined;

  const updates: Record<string, unknown> = { assigned_to: assignedTo };
  if (nextStatus) updates.status = nextStatus;

  const { error } = await supabase
    .from("incidents")
    .update(updates)
    .eq("id", incidentId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/incidents");
  return { ok: true };
}

/**
 * Apply a guarded status transition: the UPDATE only lands if the incident is
 * currently in one of the action's allowed from-statuses. An invalid or
 * retried transition matches zero rows — no write, no duplicate audit event.
 */
async function transitionIncident(
  supabase: Awaited<ReturnType<typeof createClient>>,
  incidentId: string,
  action: keyof typeof INCIDENT_TRANSITIONS,
  updates: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("incidents")
    .update(updates)
    .eq("id", incidentId)
    .in("status", [...INCIDENT_TRANSITIONS[action]])
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "This transition is not available for the incident's current state" };
  }

  revalidatePath("/admin/operations");
  revalidatePath("/admin/operations/incidents");
  return { ok: true };
}

export async function acknowledgeIncident(incidentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  return transitionIncident(supabase, incidentId, "acknowledge", {
    status: "acknowledged",
    acknowledged_at: new Date().toISOString(),
  });
}

export async function investigateIncident(incidentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  return transitionIncident(supabase, incidentId, "investigate", { status: "investigating" });
}

export async function monitorIncident(incidentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  return transitionIncident(supabase, incidentId, "monitor", { status: "monitoring" });
}

export async function resolveIncident(
  incidentId: string,
  resolutionNotes?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const updates: Record<string, unknown> = {
    status: "resolved",
    resolved_at: new Date().toISOString(),
  };

  if (resolutionNotes) {
    updates.resolution_notes = resolutionNotes.trim();
  }

  return transitionIncident(supabase, incidentId, "resolve", updates);
}

export async function closeIncident(
  incidentId: string,
  finalNotes?: string | null
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
    return { ok: false, error: "Permission denied: Only administrators can close operational incidents" };
  }

  const updates: Record<string, unknown> = {
    status: "closed",
    closed_at: new Date().toISOString(),
  };

  if (finalNotes) {
    const { data: current } = await supabase.from("incidents").select("resolution_notes").eq("id", incidentId).single();
    const existing = current?.resolution_notes ? `${current.resolution_notes}\n\n[CLOSED]: ${finalNotes.trim()}` : finalNotes.trim();
    updates.resolution_notes = existing;
  }

  return transitionIncident(supabase, incidentId, "close", updates);
}

export async function cancelIncident(
  incidentId: string,
  reason?: string | null
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
    return { ok: false, error: "Permission denied: Only administrators can cancel operational incidents" };
  }

  const updates: Record<string, unknown> = {
    status: "cancelled",
  };

  if (reason) {
    const { data: current } = await supabase.from("incidents").select("resolution_notes").eq("id", incidentId).single();
    const existing = current?.resolution_notes ? `${current.resolution_notes}\n\n[CANCELLED]: ${reason.trim()}` : reason.trim();
    updates.resolution_notes = existing;
  }

  return transitionIncident(supabase, incidentId, "cancel", updates);
}
