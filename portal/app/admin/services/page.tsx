import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ServicesManager from "./services-manager";
import type { Service } from "@/lib/types";

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

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const { data: services } = await supabase
    .from("service_catalog")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Service Catalog</h1>
      <ServicesManager services={(services ?? []) as Service[]} />
    </div>
  );
}
