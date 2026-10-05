import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isFinance, isStaff } from "@/lib/security/roles";
import ProvidersManager from "./providers-manager";

export const metadata = { title: "Provider Connections" };

export default async function ProvidersPage() {
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

  // Staff see linked provider resources only — no connections, no discovery.
  if (isStaffRole) {
    const { data: linked } = await supabase
      .from("staff_linked_provider_resources")
      .select("*")
      .order("linked_at", { ascending: false });
    return (
      <div className="ux-page ux-page--wide">
        <PageHeader
          title="Linked Provider Resources"
          description="Operational view of infrastructure resources discovered and linked to SCH systems. Connection management is administrator-only."
        />
        <ProvidersManager
          accounts={[]}
          discovered={[]}
          staffLinked={linked ?? []}
          runs={[]}
          providers={[]}
          clients={[]}
          systems={[]}
          isAdmin={false}
          isFinance={false}
          isStaff={true}
        />
      </div>
    );
  }

  // Reads use the user client: views and RLS enforce is_admin()/is_finance().
  const { data: accounts } = await supabase
    .from("provider_connection_overview")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: discovered } = await supabase
    .from("provider_discovered_resources")
    .select("*")
    .order("last_seen_at", { ascending: false });

  const { data: runs } = await supabase
    .from("provider_discovery_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(25);

  const { data: providers } = await supabase
    .from("providers")
    .select("id, name, slug, adapter_key, category")
    .order("name");

  const { data: clients } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  const { data: systems } = await supabase
    .from("systems")
    .select("id, name, client_id, status")
    .is("archived_at", null)
    .order("name");

  const accountIds = new Set((accounts ?? []).map((a) => a.id));
  const providerNames = new Map((providers ?? []).map((p) => [p.id, p.name]));

  const accountsNormalized = (accounts ?? []).map((a) => ({
    ...a,
    provider_name: a.provider_name ?? providerNames.get(a.provider_id) ?? null,
    railway_workspace_id: (a as { railway_workspace_id?: string | null }).railway_workspace_id ?? null,
    railway_workspace_name: (a as { railway_workspace_name?: string | null }).railway_workspace_name ?? null,
  }));

  const discoveredNormalized = (discovered ?? [])
    .filter((d) => accountIds.has(d.provider_account_id))
    .map((d) => {
      const acct = accountsNormalized.find((a) => a.id === d.provider_account_id);
      return { ...d, provider_name: acct?.provider_name ?? null, account_name: acct?.account_name ?? null };
    });

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Provider Connections & Discovery"
        description="Connect provider accounts, test access, and run read-only discovery. Discovered resources are linked to SCH systems only after explicit review."
      />
      <ProvidersManager
        accounts={accountsNormalized}
        discovered={discoveredNormalized}
        staffLinked={[]}
        runs={runs ?? []}
        providers={providers ?? []}
        clients={(clients ?? []).map((c) => ({
          id: c.id,
          label: c.company_name ? `${c.company_name} (${c.email})` : (c.full_name || c.email),
        }))}
        systems={(systems ?? []).map((s) => ({ id: s.id, name: s.name, client_id: s.client_id }))}
        isAdmin={isAdmin}
        isFinance={isFinanceRole}
        isStaff={false}
      />
    </div>
  );
}
