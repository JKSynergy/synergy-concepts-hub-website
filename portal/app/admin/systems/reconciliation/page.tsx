import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import "../systems.css";
import { isInternal, isAdmin as checkIsAdmin, isFinance, isStaff } from "@/lib/security/roles";
import ReconciliationManager from "./reconciliation-manager";

export const metadata = { title: "Provider Reconciliation" };

export default async function ReconciliationPage() {
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
  const isStaffRole = isStaff(profile.role);

  // Staff have no reconciliation access — they get the linked-resources view
  // on the Providers page instead.
  if (isStaffRole) {
    redirect("/admin/systems/providers");
  }

  const { data: items, error: itemsError } = await supabase
    .from("provider_reconciliation_overview")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: runs, error: runsError } = await supabase
    .from("provider_reconciliation_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(25);

  // Accounts for the "Run reconciliation" control (admin only needs them).
  const { data: accounts, error: accountsError } = isAdmin
    ? await supabase
        .from("provider_connection_overview")
        .select("id, provider_name, account_name")
        .order("account_name")
    : { data: [], error: null };

  return (
    <div className="ux-page ux-page--wide ops-page">
      <PageHeader
        title="Reconciliation"
        description="Changes detected between SCH inventory and provider state. Differences are proposals — nothing changes until an administrator approves and applies."
      />
      <ReconciliationManager
        items={items ?? []}
        runs={runs ?? []}
        accounts={accounts ?? []}
        isAdmin={isAdmin}
        isFinance={isFinanceRole}
        itemsUnavailable={Boolean(itemsError)}
        runsUnavailable={Boolean(runsError)}
        accountsUnavailable={isAdmin && Boolean(accountsError)}
      />
    </div>
  );
}
