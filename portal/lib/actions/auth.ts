"use server";

import { createClient } from "@/lib/supabase/server";

type AuthResult = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string } | null;
  role: "admin" | "staff" | "client" | null;
  isStaff: boolean;
  isAdmin: boolean;
};

export async function getAuthContext(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, role: null, isStaff: false, isAdmin: false };
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
    isStaff: role === "admin" || role === "staff",
    isAdmin: role === "admin",
  };
}
