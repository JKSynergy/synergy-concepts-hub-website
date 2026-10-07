import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isFinance, isStaff } from "@/lib/security/roles";
import ProviderActionsManager from "./provider-actions-manager";

export const metadata = { title: "Provider Actions" };

export default async function ProviderActionsPage() {
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

  if (!profile || !isInternal(profile.role)) {
    redirect("/client");
  }

  const isAdmin = checkIsAdmin(profile.role);
  const isFinanceRole = isFinance(profile.role);

  // Staff have no provider-operation access — linked resources only on the
  // Providers page.
  if (isStaff(profile.role)) {
    redirect("/admin/systems/providers");
  }

  const { data: proposals } = await supabase
    .from("provider_operation_overview")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: executions } = await supabase
    .from("provider_operation_execution_overview")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);

  // Proposal targets: explicitly linked discovered resources (admin only —
  // finance has no raw-table read anyway, and never sees the propose card).
  const { data: targets } = isAdmin
    ? await supabase
        .from("provider_discovered_resources")
        .select(
          "id, name, status, external_resource_id, resource_type, external_missing, provider_accounts(account_name, providers(name, adapter_key)), resources(name)"
        )
        .eq("link_status", "linked")
        .order("name")
        .limit(500)
    : { data: [] };

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Provider Actions"
        description="Explicitly supported provider-side lifecycle actions. Every operation is proposed, approved by an administrator, executed server-side, and verified against the provider's actual state."
      />
      <ProviderActionsManager
        proposals={proposals ?? []}
        executions={executions ?? []}
        targets={(targets ?? []) as never}
        isAdmin={isAdmin}
        isFinance={isFinanceRole}
      />
    </div>
  );
}
