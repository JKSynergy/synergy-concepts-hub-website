"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/security/roles";
import { isUuid } from "@/lib/security/access";
import { generateStatusToken, hashStatusToken } from "@/lib/system-status/tokens";

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

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/systems/${systemId}`);
  revalidatePath("/admin/operations/suspensions");
  return { token };
}
