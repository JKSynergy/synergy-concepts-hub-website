/**
 * Phase 3G-4 — provider monitoring service.
 *
 * THE single execution path shared by manual "Run Now" and the scheduled
 * sweep endpoint:
 *
 *   begin_monitoring_run  (single-flight claim)
 *     → executeProviderDiscovery  (existing adapter, Vault credentials)
 *     → run_provider_reconciliation  (existing 3G-2 engine)
 *     → process_monitoring_run  (deterministic classify → signals → incidents)
 *     → complete_monitoring_run  (schedule bookkeeping + failure policy)
 *     → evaluate_account_automation + evaluate_automation_sweep (3G-6)
 *
 * It never calls provider mutation adapters. Observation only — automation
 * evaluation can create tasks/signals/proposals, never execute operations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeProviderDiscovery } from "@/lib/monitoring/discovery-service";
import type { ConnectionErrorCategory } from "@/lib/providers/types";

export interface MonitoringRunResult {
  ok: boolean;
  runId?: string;
  outcome: "completed" | "failed" | "skipped" | "unavailable";
  discoveryRunId?: string;
  reconciliationRunId?: string;
  changesDetected?: number;
  signalsCreated?: number;
  signalsUpdated?: number;
  incidentsCreated?: number;
  isBaseline?: boolean;
  errorCategory?: string;
  error?: string;
}

export async function runProviderMonitoring(
  admin: SupabaseClient,
  input: {
    providerAccountId: string;
    trigger: "manual" | "scheduled" | "event";
    scheduleId?: string | null;
    actorId?: string | null;
  }
): Promise<MonitoringRunResult> {
  // 1. Claim the single-flight slot.
  const { data: begin, error: beginErr } = await admin.rpc("begin_monitoring_run", {
    p_provider_account_id: input.providerAccountId,
    p_trigger_source: input.trigger,
    p_schedule_id: input.scheduleId ?? null,
    p_actor: input.actorId ?? null,
  });
  if (beginErr) {
    return { ok: false, outcome: "unavailable", error: beginErr.message };
  }
  const beginResult = begin as { outcome?: string; run_id?: string; is_baseline?: boolean };
  if (beginResult.outcome !== "begin" || !beginResult.run_id) {
    return { ok: true, outcome: "skipped", runId: beginResult.run_id, isBaseline: false };
  }
  const runId = beginResult.run_id;
  const isBaseline = beginResult.is_baseline === true;

  const complete = async (
    outcome: "completed" | "failed",
    extra: {
      discoveryRunId?: string;
      reconciliationRunId?: string;
      changesDetected?: number;
      signalsCreated?: number;
      incidentsCreated?: number;
      errorCategory?: string;
    }
  ) => {
    await admin.rpc("complete_monitoring_run", {
      p_run_id: runId,
      p_outcome: outcome,
      p_discovery_run_id: extra.discoveryRunId ?? null,
      p_reconciliation_run_id: extra.reconciliationRunId ?? null,
      p_changes_detected: extra.changesDetected ?? 0,
      p_signals_created: extra.signalsCreated ?? 0,
      p_incidents_created: extra.incidentsCreated ?? 0,
      p_error_category: extra.errorCategory ?? null,
    });

    // 3G-6: deterministic automation evaluation in the same execution
    // context. Failure here must never fail the monitoring run — each rule
    // records its own outcome in automation_runs.
    try {
      await admin.rpc("evaluate_account_automation", {
        p_provider_account_id: input.providerAccountId,
        p_monitoring_run_id: runId,
        p_run_succeeded: outcome === "completed",
        p_trigger_source: input.trigger,
        p_actor: input.actorId ?? null,
      });
      await admin.rpc("evaluate_automation_sweep", {
        p_actor: input.actorId ?? null,
      });
    } catch {
      // Automation errors are self-recorded in automation_runs; a broken
      // evaluation must not report a healthy monitoring run as failed.
    }
  };

  // 2. Discovery — read-only, Vault-resolved credentials, existing adapters.
  const discovery = await executeProviderDiscovery(admin, input.providerAccountId, input.actorId ?? null);
  if (!discovery.ok) {
    const category: ConnectionErrorCategory = discovery.errorCategory ?? "network_error";
    await complete("failed", { discoveryRunId: discovery.runId, errorCategory: category });
    return {
      ok: false, outcome: "failed", runId, discoveryRunId: discovery.runId,
      errorCategory: category, error: `Discovery failed: ${category}`,
    };
  }

  // 3. Reconciliation — the existing 3G-2 deterministic engine. Monitoring
  //    never implements a parallel comparison.
  const { data: reconRunId, error: reconErr } = await admin.rpc("run_provider_reconciliation", {
    p_provider_account_id: input.providerAccountId,
    p_actor: input.actorId ?? null,
  });
  if (reconErr || !reconRunId) {
    await complete("failed", {
      discoveryRunId: discovery.runId,
      errorCategory: "reconciliation_failed",
    });
    return {
      ok: false, outcome: "failed", runId, discoveryRunId: discovery.runId,
      errorCategory: "reconciliation_failed",
      error: `Reconciliation failed: ${reconErr?.message ?? "unknown"}`,
    };
  }

  if (isBaseline) {
    await complete("completed", {
      discoveryRunId: discovery.runId,
      reconciliationRunId: reconRunId as string,
    });
    return {
      ok: true,
      outcome: "completed",
      runId,
      discoveryRunId: discovery.runId,
      reconciliationRunId: reconRunId as string,
      changesDetected: 0,
      signalsCreated: 0,
      signalsUpdated: 0,
      incidentsCreated: 0,
      isBaseline: true,
    };
  }

  // 4. Classify → signals → incidents (deduplicated, deterministic).
  const { data: processed, error: procErr } = await admin.rpc("process_monitoring_run", {
    p_run_id: runId,
    p_actor: input.actorId ?? null,
    p_reconciliation_run_id: reconRunId as string,
  });
  const counts = (processed ?? {}) as {
    changes_detected?: number; signals_created?: number; incidents_created?: number;
  };
  if (procErr) {
    await complete("failed", {
      discoveryRunId: discovery.runId,
      reconciliationRunId: reconRunId as string,
      errorCategory: "processing_failed",
    });
    return {
      ok: false, outcome: "failed", runId,
      discoveryRunId: discovery.runId, reconciliationRunId: reconRunId as string,
      errorCategory: "processing_failed", error: `Processing failed: ${procErr.message}`,
    };
  }

  const { count: observedSignals } = await admin
    .from("action_items")
    .select("id", { count: "exact", head: true })
    .eq("monitoring_run_id", runId)
    .eq("source", "provider_monitoring");
  const signalsUpdated = Math.max(0, (observedSignals ?? 0) - (counts.signals_created ?? 0));

  // 5. Finish: record counts + schedule bookkeeping.
  await complete("completed", {
    discoveryRunId: discovery.runId,
    reconciliationRunId: reconRunId as string,
    changesDetected: counts.changes_detected ?? 0,
    signalsCreated: counts.signals_created ?? 0,
    incidentsCreated: counts.incidents_created ?? 0,
  });
  await admin.from("provider_monitoring_runs").update({ signals_updated: signalsUpdated }).eq("id", runId);

  return {
    ok: true, outcome: "completed", runId,
    discoveryRunId: discovery.runId,
    reconciliationRunId: reconRunId as string,
    changesDetected: counts.changes_detected ?? 0,
    signalsCreated: counts.signals_created ?? 0,
    signalsUpdated,
    incidentsCreated: counts.incidents_created ?? 0,
    isBaseline: false,
  };
}

/**
 * Scheduled sweep: every due+enabled schedule runs through the identical
 * execution path. The caller (the protected endpoint) supplies the admin
 * client — the browser can never reach this function.
 */
export async function runDueMonitoringSchedules(admin: SupabaseClient) {
  const { data: due, error } = await admin.rpc("due_monitoring_schedules");
  if (error) return { ok: false as const, error: error.message, results: [] };

  const results: MonitoringRunResult[] = [];
  for (const row of (due ?? []) as { schedule_id: string; provider_account_id: string }[]) {
    results.push(
      await runProviderMonitoring(admin, {
        providerAccountId: row.provider_account_id,
        trigger: "scheduled",
        scheduleId: row.schedule_id,
      })
    );
  }

  // 3G-6: sweep-scope rules (incident aging, backup health) must evaluate even
  // when no account schedule was due — the sweep is the existing scheduler.
  try {
    await admin.rpc("evaluate_automation_sweep", { p_actor: null });
  } catch {
    // Self-recorded in automation_runs; never fails the sweep.
  }

  return { ok: true as const, results };
}
