import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ServicesManager from "./services-manager";
import { PageHeader } from "@/components/ux/primitives";
import type { Service } from "@/lib/types";
import { canManageServices, isOperationalStaff } from "@/lib/security/roles";

export default async function AdminServicesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isOperationalStaff(profile.role)) {
    redirect("/client");
  }

  const { data: services } = await supabase
    .from("service_catalog")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="ux-page ux-page--wide">
      <ServicesManager services={(services ?? []) as Service[]} canEdit={canManageServices(profile.role)} />
    </div>
  );
}
