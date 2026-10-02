import type { ReactNode } from "react";
import "../ux.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavProgress } from "@/components/nav-progress";
import { ClientShell } from "@/components/ux/client-shell";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, full_name, email")
    .eq("id", user.id)
    .single();

  const userLabel = profile?.company_name || profile?.full_name || profile?.email || user.email || "Client";

  return (
    <>
      <NavProgress />
      <ClientShell userLabel={userLabel}>{children}</ClientShell>
    </>
  );
}
