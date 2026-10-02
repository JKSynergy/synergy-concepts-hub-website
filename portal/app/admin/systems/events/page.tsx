import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isFinance } from "@/lib/security/roles";
import EventsManager from "./events-manager";

export const metadata = { title: "Provider Events" };

export default async function ProviderEventsPage() {
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

  const { data: configs } = await supabase
    .from("provider_webhook_config_overview")
    .select("*")
    .order("provider_name")
    .limit(200);

  const { data: events } = await supabase
    .from("provider_event_overview")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(200);

  // Configuration targets: provider accounts without a webhook config (admin only).
  const { data: accounts } = isAdmin
    ? await supabase
        .from("provider_accounts")
        .select("id, account_name, status, providers(name, adapter_key)")
        .order("account_name")
        .limit(200)
    : { data: [] };

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Provider Events"
        description="Authenticated provider webhooks are validated, deduplicated and recorded as evidence. Events feed the existing reconciliation and Action Center pipeline — they never mutate provider infrastructure."
      />
      <EventsManager
        configs={configs ?? []}
        events={events ?? []}
        accounts={(accounts ?? []) as never}
        isAdmin={isAdmin}
        isFinance={isFinanceRole}
      />
    </div>
  );
}
