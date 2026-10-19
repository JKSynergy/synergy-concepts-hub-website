"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/security/roles";
import { isUuid } from "@/lib/security/access";
import { generateStatusToken, hashStatusToken } from "@/lib/system-status/tokens";
import { writeAuditLog } from "@/lib/audit";

type GenerateResult = { token?: string; error?: string };

export async function generateSystemStatusToken(systemId: string): Promise<GenerateResult> {
  if (!isUuid(systemId)) return { error: "Invalid system" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isAdmin(profile?.role)) return { error: "Forbidden" };

  const token = generateStatusToken();
  const hash = hashStatusToken(token);

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_system_status_token_hash", {
    p_system_id: systemId,
    p_hash: hash,
  });

  // The database logs the rotation itself (system_status_token.rotated) but runs as the
  // service role, so record which administrator asked for it, and whether it worked.
  // Never include the token or its hash.
  await writeAuditLog(admin, {
    actorId: user.id,
    actorRole: profile?.role ?? null,
    action: error ? "SERVICE_TOKEN_ROTATE_FAILED" : "SERVICE_TOKEN_ROTATED",
    table: "systems",
    recordId: systemId,
    details: error ? { error: error.message } : {},
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/systems/${systemId}`);
  revalidatePath("/admin/operations/suspensions");
  return { token };
}
