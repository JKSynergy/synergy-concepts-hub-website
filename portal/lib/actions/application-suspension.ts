"use server";

/**
 * Phase 3B — Application-level service suspension and restoration.
 *
 * These actions set a system's commercial/service access status to 'suspended'
 * or 'live'. The underlying provider infrastructure (Railway/Vercel) is never
 * touched. Enforcement happens in the client layout and in protected server
 * actions via checkApplicationAccess.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin, isClient } from "@/lib/security/roles";

export type ActionResult<T = unknown> = { ok: boolean; data?: T; error?: string };

const REASON_VOCABULARY = [
  "NON_PAYMENT",
  "CLIENT_REQUEST",
  "CONTRACT_ENDED",
  "SECURITY",
  "MAINTENANCE",
  "OTHER",
] as const;

type SuspensionReason = (typeof REASON_VOCABULARY)[number];

function isValidReason(value: string): value is SuspensionReason {
  return REASON_VOCABULARY.includes(value as SuspensionReason);
}

export async function suspendApplication(
  systemId: string,
  reason: string,
  note?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators may suspend application access" };
  }

  if (!isValidReason(reason)) {
    return { ok: false, error: "Invalid suspension reason" };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("suspend_application_system", {
    p_system_id: systemId,
    p_reason: reason,
    p_note: note?.trim() || null,
    p_actor: user.id,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  revalidatePath("/admin/systems");
  revalidatePath(`/admin/systems/${systemId}`);
  return { ok: true };
}

export async function resumeApplication(
  systemId: string,
  note?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!checkIsAdmin(profile?.role)) {
    return { ok: false, error: "Permission denied: Only administrators may resume application access" };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("resume_application_system", {
    p_system_id: systemId,
    p_note: note?.trim() || null,
    p_actor: user.id,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/operations/suspensions");
  revalidatePath("/admin/systems");
  revalidatePath(`/admin/systems/${systemId}`);
  return { ok: true };
}

/**
 * Check whether a non-internal user has any suspended systems. Returns the
 * first suspended system found, or null. This is used by the client layout to
 * render the suspension page and by server actions to deny protected access.
 */
export async function getClientSuspendedSystem(
  userId: string
): Promise<{ id: string; name: string; reason: string | null; note: string | null; suspendedAt: string | null } | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!isClient(profile?.role)) return null;

  const { data } = await supabase
    .from("systems")
    .select("id, name, suspension_reason, suspension_note, suspended_at")
    .eq("client_id", userId)
    .eq("status", "suspended")
    .order("suspended_at", { ascending: false })
    .limit(1);

  const first = data?.[0];
  if (!first) return null;
  return {
    id: first.id,
    name: first.name,
    reason: first.suspension_reason,
    note: first.suspension_note,
    suspendedAt: first.suspended_at,
  };
}

/**
 * Guard for client-facing server actions. Returns an error if the caller's
 * system is suspended. Internal users are never blocked.
 */
export async function checkApplicationAccess(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!isClient(profile?.role)) return { ok: true };

  const suspended = await getClientSuspendedSystem(userId);
  if (suspended) {
    return { ok: false, error: "Service temporarily suspended" };
  }
  return { ok: true };
}
