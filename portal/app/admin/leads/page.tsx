import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LeadsTable from "./leads-table";
import { PageHeader } from "@/components/ux/primitives";
import type { Lead } from "@/lib/types";
import { isOperationalStaff } from "@/lib/security/roles";

export default async function AdminLeadsPage() {
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

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  const typedLeads = (leads ?? []) as Lead[];

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Website enquiries"
        description="The inbox for the forms on the Synergy website. Follow up each enquiry, then convert it to a client or archive it."
      />
      <LeadsTable rows={typedLeads} />
    </div>
  );
}
