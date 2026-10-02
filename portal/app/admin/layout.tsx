import type { ReactNode } from "react";
import "../ux.css";
import { NavProgress } from "@/components/nav-progress";
import { AdminShell } from "@/components/ux/admin-shell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import { isRole } from "@/lib/security/roles";

const ROLE_LABEL = { admin: "Administrator", finance: "Finance", staff: "Staff", client: "Client" } as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  const role = isRole(profile?.role) ? profile.role : null;
  const userLabel = profile?.full_name || profile?.email || user.email || "Admin";

  return (
    <>
      <NavProgress />
      <AdminShell role={role} userLabel={userLabel} userRole={ROLE_LABEL[role ?? "staff"]}>
        {children}
      </AdminShell>
    </>
  );
}
