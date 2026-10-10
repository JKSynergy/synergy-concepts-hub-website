import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isFinance, isStaff } from "@/lib/security/roles";
import { loadSystemHealthRows } from "@/lib/providers/system-health-server";
import MonitoringManager from "./monitoring-manager";

export const metadata = { title: "Provider Monitoring" };

export default async function ProviderMonitoringPage() {
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

  // Staff see monitoring signals in the Action Center — schedule/provider
  // configuration is Admin-only, so staff land there instead.
  if (isStaff(profile.role)) {
    redirect("/admin/operations/action-center");
  }

  // Each section keeps its own query outcome — one failed query must not
  // take the rest of the page down or render as a false empty/healthy state.
  let systemHealth: Awaited<ReturnType<typeof loadSystemHealthRows>> = [];
  let systemHealthUnavailable = false;
  try {
    systemHealth = await loadSystemHealthRows(supabase);
  } catch {
    systemHealthUnavailable = true;
  }

  const { data: schedules, error: schedulesError } = await supabase
    .from("provider_monitoring_overview")
    .select("*")
    .order("provider_name")
    .limit(200);

  const { data: runs, error: runsError } = await supabase
    .from("provider_monitoring_run_overview")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);

  const { data: signals, error: signalsError } = await supabase
    .from("action_item_overview")
    .select("*")
    .eq("source", "provider_monitoring")
    .in("status", ["open", "acknowledged"])
    .order("detected_at", { ascending: false })
    .limit(100);

  // Schedule targets: provider accounts with a discovery adapter (admin only).
  const { data: accounts, error: accountsError } = isAdmin
    ? await supabase
        .from("provider_accounts")
        .select("id, account_name, status, providers(name, adapter_key)")
        .order("account_name")
        .limit(200)
    : { data: [], error: null };

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Provider Monitoring"
        description="Scheduled, read-only observation: discover → reconcile → classify → surface. Automation never mutates provider infrastructure — changes are surfaced for human review."
      />
      <MonitoringManager
        systemHealth={systemHealth}
        schedules={schedules ?? []}
        runs={runs ?? []}
        signals={signals ?? []}
        accounts={(accounts ?? []) as never}
        isAdmin={isAdmin}
        isFinance={isFinanceRole}
        systemHealthUnavailable={systemHealthUnavailable}
        schedulesUnavailable={Boolean(schedulesError)}
        runsUnavailable={Boolean(runsError)}
        signalsUnavailable={Boolean(signalsError)}
        accountsUnavailable={isAdmin && Boolean(accountsError)}
      />
    </div>
  );
}
