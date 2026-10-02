import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";
import IncidentsManager, { type IncidentItem } from "./incidents-manager";

export const metadata = { title: "Incidents" };

export default async function IncidentsPage() {
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
  const isStaffUser = isOperationalStaff(profile.role) && !isAdmin;

  // 1. Fetch Incidents
  const { data: incidentsData } = await supabase
    .from("incidents")
    .select(`
      id, client_id, system_id, resource_id, service_agreement_id,
      title, description, severity, status, reported_by, assigned_to,
      opened_at, acknowledged_at, resolved_at, closed_at, resolution_notes,
      created_at, updated_at,
      client:profiles!client_id(id, email, full_name, company_name),
      system:systems(id, name, status),
      resource:resources(id, name, resource_type, status),
      service_agreement:service_agreements(id, name, status),
      assigned_staff:profiles!assigned_to(id, email, full_name),
      reported_by_user:profiles!reported_by(id, email, full_name)
    `)
    .order("created_at", { ascending: false });

  // 2. Fetch Option Reference Data
  const { data: clientsData } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  const { data: systemsData } = await supabase
    .from("systems")
    .select("id, name, client_id")
    .order("name");

  const { data: resourcesData } = await supabase
    .from("resources")
    .select("id, name, client_id, system_id")
    .order("name");

  const { data: agreementsData } = await supabase
    .from("service_agreements")
    .select("id, name, client_id")
    .order("name");

  const { data: staffData } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .in("role", ["staff", "admin"])
    .order("full_name");

  // Audit history (audit_logs is admin-only under RLS; empty for other roles)
  const { data: incidentAuditData } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, created_at, actor:profiles!actor_id(full_name, email)")
    .eq("table_name", "incidents")
    .order("created_at", { ascending: false })
    .limit(300);

  const formattedIncidents: IncidentItem[] = (incidentsData ?? []).map((inc) => ({
    ...inc,
    client: Array.isArray(inc.client) ? inc.client[0] : inc.client,
    system: Array.isArray(inc.system) ? inc.system[0] : inc.system,
    resource: Array.isArray(inc.resource) ? inc.resource[0] : inc.resource,
    service_agreement: Array.isArray(inc.service_agreement) ? inc.service_agreement[0] : inc.service_agreement,
    assigned_staff: Array.isArray(inc.assigned_staff) ? inc.assigned_staff[0] : inc.assigned_staff,
    reported_by_user: Array.isArray(inc.reported_by_user) ? inc.reported_by_user[0] : inc.reported_by_user,
  }));

  const staffOptions = (staffData ?? []).map((s) => ({
    id: s.id,
    label: s.full_name || s.email,
    role: s.role,
  }));

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Incidents"
        description="Track and resolve issues affecting client systems and services."
      />

      <IncidentsManager
        currentUserId={user.id}
        incidents={formattedIncidents}
        auditTrail={(incidentAuditData ?? []).map((a) => ({
          ...a,
          actor: Array.isArray(a.actor) ? a.actor[0] : a.actor,
        }))}
        clients={clientsData ?? []}
        systems={systemsData ?? []}
        resources={resourcesData ?? []}
        agreements={agreementsData ?? []}
        staffOptions={staffOptions}
        isAdmin={isAdmin}
        isFinance={isFinanceUser}
        isStaff={isStaffUser}
      />
    </div>
  );
}
