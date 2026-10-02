"use server";

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

function revalidateEventPaths() {
  revalidatePath("/admin/systems/events");
  revalidatePath("/admin/systems/monitoring");
  revalidatePath("/admin/operations/action-center");
}

// ============================================================================
// WEBHOOK CONFIGURATION (Admin only — Vault-backed, secret returned once)
// ============================================================================

/**
 * Create or rotate the webhook secret for a provider account. The generated
 * (or Vercel-provided) secret is returned ONCE so the administrator can paste
 * it into the provider's webhook settings — it is never readable again.
 */
export async function saveWebhookConfig(input: {
  providerAccountId: string;
  secret?: string;
}): Promise<ActionResult<{ configId: string; authType: string; secret: string; endpointPath: string }>> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: only administrators manage webhook configuration" };
  }
  if (!input.providerAccountId) return { ok: false, error: "Provider account is required" };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("save_webhook_config", {
    p_provider_account_id: input.providerAccountId,
    p_secret: input.secret ?? null,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  const result = data as { config_id: string; auth_type: string; secret: string };
  const endpointPath =
    result.auth_type === "url_token"
      ? `/api/provider-events/railway/${result.secret}`
      : `/api/provider-events/${adapterKeyFor(result.auth_type)}`;

  revalidateEventPaths();
  return {
    ok: true,
    data: {
      configId: result.config_id,
      authType: result.auth_type,
      secret: result.secret,
      endpointPath,
    },
  };
}

function adapterKeyFor(authType: string): string {
  switch (authType) {
    case "bearer_token": return "supabase";
    case "header_secret": return "cloudflare";
    case "vercel_hmac_sha1": return "vercel";
    default: return "railway";
  }
}

export async function setWebhookConfigEnabled(
  providerAccountId: string,
  enabled: boolean
): Promise<ActionResult> {
  const { user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!checkIsAdmin(role)) {
    return { ok: false, error: "Permission denied: only administrators manage webhook configuration" };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_webhook_config_enabled", {
    p_provider_account_id: providerAccountId,
    p_enabled: enabled,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidateEventPaths();
  return { ok: true };
}
