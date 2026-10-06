"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin, isOperationalStaff } from "@/lib/security/roles";
import { runProviderMonitoring } from "@/lib/monitoring/service";
import type { ActionResult } from "@/lib/actions/provider-connections";

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

function revalidateMonitoringPaths() {
  revalidatePath("/admin/systems/monitoring");
  revalidatePath("/admin/operations/action-center");
  revalidatePath("/admin/operations");
}

// ============================================================================
// SCHEDULE MANAGEMENT (Admin only)
// ============================================================================

export async function saveMonitoringSchedule(input: {
  providerAccountId: string;
  frequency: "every_6_hours" | "every_12_hours" | "daily";
  enabled: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: only administrators manage monitoring schedules" };
  }
  if (!input.providerAccountId) return { ok: false, error: "Provider account is required" };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("save_monitoring_schedule", {
    p_provider_account_id: input.providerAccountId,
    p_frequency: input.frequency,
    p_enabled: input.enabled,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateMonitoringPaths();
  return { ok: true, data: { id: data as string } };
}

export async function setMonitoringScheduleEnabled(
  providerAccountId: string,
  enabled: boolean
): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: only administrators manage monitoring schedules" };
  }

  const admin = createAdminClient();
  const { data: sched } = await admin
    .from("provider_monitoring_schedules")
    .select("frequency")
    .eq("provider_account_id", providerAccountId)
    .maybeSingle();

  const { error } = await admin.rpc("save_monitoring_schedule", {
    p_provider_account_id: providerAccountId,
    p_frequency: sched?.frequency ?? "every_12_hours",
    p_enabled: enabled,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateMonitoringPaths();
  return { ok: true };
}

export async function changeMonitoringScheduleFrequency(
  providerAccountId: string,
  frequency: "every_6_hours" | "every_12_hours" | "daily"
): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: only administrators manage monitoring schedules" };
  }

  // Read the current enabled flag server-side — the row prop in the browser can
  // be stale for a moment after an enable/disable save.
  const admin = createAdminClient();
  const { data: sched } = await admin
    .from("provider_monitoring_schedules")
    .select("enabled")
    .eq("provider_account_id", providerAccountId)
    .maybeSingle();
  if (!sched) return { ok: false, error: "No monitoring schedule exists for this account" };

  const { error } = await admin.rpc("save_monitoring_schedule", {
    p_provider_account_id: providerAccountId,
    p_frequency: frequency,
    p_enabled: sched.enabled,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateMonitoringPaths();
  return { ok: true };
}

// ============================================================================
// RUN NOW (Admin) — the SAME service path as the scheduled sweep
// ============================================================================

export async function runMonitoringNow(providerAccountId: string): Promise<
  ActionResult<{
    outcome: string;
    runId?: string;
    changesDetected?: number;
    signalsCreated?: number;
    signalsUpdated?: number;
    incidentsCreated?: number;
    isBaseline?: boolean;
    errorCategory?: string;
  }>
> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: only administrators run provider monitoring" };
  }
  if (!providerAccountId) return { ok: false, error: "Provider account is required" };

  const admin = createAdminClient();
  const { data: sched } = await admin
    .from("provider_monitoring_schedules")
    .select("id")
    .eq("provider_account_id", providerAccountId)
    .maybeSingle();

  const result = await runProviderMonitoring(admin, {
    providerAccountId,
    trigger: "manual",
    scheduleId: sched?.id ?? null,
    actorId: user.id,
  });

  revalidateMonitoringPaths();
  return {
    ok: result.ok,
    error: result.error,
    data: {
      outcome: result.outcome,
      runId: result.runId,
      changesDetected: result.changesDetected,
      signalsCreated: result.signalsCreated,
      signalsUpdated: result.signalsUpdated,
      incidentsCreated: result.incidentsCreated,
      isBaseline: result.isBaseline,
      errorCategory: result.errorCategory,
    },
  };
}

// ============================================================================
// ACTION CENTER (Admin + Staff review; Finance reads via view)
// ============================================================================

export async function reviewActionItem(
  itemId: string,
  decision: "acknowledge" | "resolve" | "dismiss"
): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!isOperationalStaff(role)) {
    return { ok: false, error: "Permission denied: only operational staff review action items" };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("review_action_item", {
    p_item_id: itemId,
    p_decision: decision,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateMonitoringPaths();
  return { ok: true };
}
