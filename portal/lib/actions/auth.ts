"use server";

import { createClient } from "@/lib/supabase/server";
import { canAccessFinance, isAdmin as isAdminRole, isOperationalStaff, type Role } from "@/lib/security/roles";

type AuthResult = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string } | null;
  role: Role | null;
  /** Operational staff rights (admin or staff). Finance is not included. */
  isStaff: boolean;
  isAdmin: boolean;
  /** Admin or finance. */
  canFinance: boolean;
};

export async function getAuthContext(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, role: null, isStaff: false, isAdmin: false, canFinance: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "client";
  return {
    supabase,
    user: { id: user.id, email: user.email },
    role: role as AuthResult["role"],
    isStaff: isOperationalStaff(role),
    isAdmin: isAdminRole(role),
    canFinance: canAccessFinance(role),
  };
}
