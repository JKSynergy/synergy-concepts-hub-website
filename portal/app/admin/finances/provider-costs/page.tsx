import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isAdmin as checkIsAdmin, isFinance, isInternal } from "@/lib/security/roles";
import ProviderCostsManager, {
  type ProviderCostItem,
  type ServiceMarginItem,
} from "./provider-costs-manager";

export const metadata = { title: "Provider Costs" };

export default async function ProviderCostsPage() {
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
  const isFinanceUser = isFinance(profile.role);

  // Staff never see the financial cost surface — operational context only.
  if (!isAdmin && !isFinanceUser) {
    redirect("/admin");
  }

  const { data: costsData } = await supabase
    .from("provider_cost_overview")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: marginsData } = await supabase
    .from("service_margin_view")
    .select("*")
    .order("client_company");

  const { data: clientsData } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  const { data: providerAccountsData } = await supabase
    .from("provider_accounts")
    .select("id, account_name, provider:providers(id, name)")
    .order("account_name");

  const { data: resourcesData } = await supabase
    .from("resources")
    .select("id, name, client_id, system_id, provider_account_id, resource_type, status")
    .order("name");

  const { data: systemsData } = await supabase
    .from("systems")
    .select("id, name, client_id")
    .order("name");

  const { data: agreementsData } = await supabase
    .from("service_agreements")
    .select("id, name, client_id, status")
    .order("name");

  // Audit history (audit_logs is admin-only under RLS; empty for finance)
  const { data: auditData } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, created_at, actor:profiles!actor_id(full_name, email)")
    .eq("table_name", "provider_costs")
    .order("created_at", { ascending: false })
    .limit(300);

  const costs: ProviderCostItem[] = (costsData ?? []).map((c) => ({
    ...c,
    amount: Number(c.amount),
  }));

  const margins: ServiceMarginItem[] = (marginsData ?? []).map((m) => ({
    ...m,
    service_revenue: m.service_revenue === null ? null : Number(m.service_revenue),
    allocated_cost: Number(m.allocated_cost),
    margin_amount: m.margin_amount === null ? null : Number(m.margin_amount),
    margin_pct: m.margin_pct === null ? null : Number(m.margin_pct),
  }));

  const providerAccounts = (providerAccountsData ?? []).map((a) => ({
    ...a,
    provider: Array.isArray(a.provider) ? a.provider[0] : a.provider,
  }));

  const auditTrail = (auditData ?? []).map((a) => ({
    ...a,
    actor: Array.isArray(a.actor) ? a.actor[0] : a.actor,
  }));

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Provider Costs"
        description="Recorded provider and infrastructure costs, allocation, renewal timing, and deterministic same-currency service margins. Costs are entered manually — no provider automation."
      />

      <ProviderCostsManager
        currentUserId={user.id}
        costs={costs}
        margins={margins}
        auditTrail={auditTrail}
        clients={clientsData ?? []}
        providerAccounts={providerAccounts}
        resources={resourcesData ?? []}
        systems={systemsData ?? []}
        agreements={agreementsData ?? []}
        isAdmin={isAdmin}
        isFinance={isFinanceUser}
      />
    </div>
  );
}
