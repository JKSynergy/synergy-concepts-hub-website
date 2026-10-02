"use server";

/**
 * Phase 3G-6 — controlled operational automation.
 *
 * Server actions for automation rule configuration. The rule catalog is
 * closed (Migration 025 CHECK constraint) — actions may only toggle enable
 * state and tune threshold/cooldown on existing catalog entries. No action
 * here can execute a provider operation; approval_required rules only create
 * proposals through the existing 3G-3 pipeline.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin } from "@/lib/security/roles";
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

function revalidateAutomationPaths() {
  revalidatePath("/admin/systems/automation");
  revalidatePath("/admin/operations/action-center");
  revalidatePath("/admin/operations/tasks");
}

/** Update a catalog rule's enabled flag, threshold and cooldown. Admin only. */
export async function saveAutomationRule(input: {
  ruleKey: string;
  enabled: boolean;
  threshold: number;
  cooldownSeconds: number;
}): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: only administrators configure automation rules" };
  }
  if (!input.ruleKey) return { ok: false, error: "Rule key is required" };
  if (!Number.isInteger(input.threshold) || input.threshold < 1) {
    return { ok: false, error: "Threshold must be a positive integer" };
  }
  if (!Number.isInteger(input.cooldownSeconds) || input.cooldownSeconds < 0) {
    return { ok: false, error: "Cooldown must be zero or greater seconds" };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("save_automation_rule", {
    p_rule_key: input.ruleKey,
    p_enabled: input.enabled,
    p_threshold: input.threshold,
    p_cooldown_seconds: input.cooldownSeconds,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidateAutomationPaths();
  return { ok: true };
}
