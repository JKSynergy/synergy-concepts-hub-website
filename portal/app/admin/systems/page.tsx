import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isOperationalStaff } from "@/lib/security/roles";
import SystemsManager from "./systems-manager";

export const metadata = { title: "Systems & Infrastructure" };

export default async function SystemsPage() {
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
  const isStaff = isOperationalStaff(profile.role);

  // 1. Fetch Systems with client and origin project relations
  const { data: systemsData } = await supabase
    .from("systems")
    .select(`
      id, client_id, name, system_type, status, description, primary_url, origin_project_id,
      operational_notes, archived_at, created_at,
      client:profiles!systems_client_id_fkey(full_name, company_name, email),
      origin_project:projects!systems_origin_project_id_fkey(id, title)
    `)
    .order("created_at", { ascending: false });

  // 2. Fetch Resources with provider account relation
  const { data: resourcesData } = await supabase
    .from("resources")
    .select(`
      id, system_id, provider_account_id, name, resource_type, ownership, client_id,
      external_reference, status, suspension_capability, backup_verifiable,
      operational_notes, retired_at, created_at,
      provider_account:provider_accounts(account_name, providers(name))
    `)
    .order("created_at", { ascending: false });

  // 3. Fetch Clients for dropdown
  const { data: clientsData } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  // 4. Fetch Provider Accounts for dropdown
  const { data: paData } = await supabase
    .from("provider_accounts")
    .select("id, account_name, providers(name)")
    .order("account_name");

  // 5. Fetch Projects for linking
  const { data: projectsData } = await supabase
    .from("projects")
    .select("id, title, system_id")
    .order("title");

  const clientOptions = (clientsData ?? []).map((c) => ({
    id: c.id,
    label: c.company_name ? `${c.company_name} (${c.email})` : (c.full_name || c.email),
  }));

  const paOptions = (paData ?? []).map((pa) => {
    const provName = Array.isArray(pa.providers)
      ? (pa.providers as unknown as { name: string }[])[0]?.name
      : (pa.providers as { name?: string } | null)?.name;
    return {
      id: pa.id,
      label: provName ? `${provName} — ${pa.account_name}` : pa.account_name,
    };
  });

  const projectOptions = (projectsData ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    system_id: p.system_id,
  }));

  const systems = (systemsData ?? []).map((s) => ({
    ...s,
    client: Array.isArray(s.client) ? s.client[0] : s.client,
    origin_project: Array.isArray(s.origin_project) ? s.origin_project[0] : s.origin_project,
  }));

  const resources = (resourcesData ?? []).map((r) => {
    const pa = Array.isArray(r.provider_account) ? r.provider_account[0] : r.provider_account;
    return {
      ...r,
      provider_account: pa
        ? {
            ...pa,
            providers: Array.isArray(pa.providers) ? pa.providers[0] : pa.providers,
          }
        : pa,
    };
  });

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Systems & Technical Hierarchy"
        description="Operational registry of high-level client digital systems and supporting technical resources. Operational facts only; credentials and secrets are excluded."
      />

      <SystemsManager
        systems={systems}
        resources={resources}
        clients={clientOptions}
        providerAccounts={paOptions}
        projects={projectOptions}
        isAdmin={isAdmin}
        isStaff={isStaff}
      />
    </div>
  );
}
