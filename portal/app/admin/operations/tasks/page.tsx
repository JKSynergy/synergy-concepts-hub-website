import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";
import TasksManager, { type TaskItem } from "./tasks-manager";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
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

  // 1. Fetch Tasks — keep the query error: a failed fetch is not an empty list.
  const { data: tasksData, error: tasksError } = await supabase
    .from("tasks")
    .select(`
      id, client_id, system_id, resource_id, service_agreement_id, incident_id, suspension_case_id,
      title, description, status, priority, assigned_to, created_by,
      due_at, started_at, completed_at, cancelled_at, created_at, updated_at,
      client:profiles!client_id(id, email, full_name, company_name),
      system:systems(id, name, status),
      resource:resources(id, name, resource_type, status),
      service_agreement:service_agreements(id, name, status),
      incident:incidents(id, title, severity, status),
      suspension_case:suspension_cases(id, reason, status),
      assigned_staff:profiles!assigned_to(id, email, full_name),
      created_by_user:profiles!created_by(id, email, full_name)
    `)
    .order("created_at", { ascending: false });

  // 2. Fetch Option Reference Data — errors are surfaced, not silently empty
  const { data: clientsData, error: clientsError } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  const { data: systemsData, error: systemsError } = await supabase
    .from("systems")
    .select("id, name, client_id")
    .order("name");

  const { data: resourcesData, error: resourcesError } = await supabase
    .from("resources")
    .select("id, name, client_id, system_id")
    .order("name");

  const { data: agreementsData, error: agreementsError } = await supabase
    .from("service_agreements")
    .select("id, name, client_id")
    .order("name");

  const { data: incidentsData, error: incidentsError } = await supabase
    .from("incidents")
    .select("id, title, client_id")
    .order("title");

  const { data: suspensionsData, error: suspensionsError } = await supabase
    .from("suspension_cases")
    .select("id, reason, client_id")
    .order("created_at", { ascending: false });

  const { data: staffData, error: staffError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .in("role", ["staff", "admin"])
    .order("full_name");

  // Audit history (audit_logs is admin-only under RLS; empty for other roles)
  const { data: taskAuditData, error: taskAuditError } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, created_at, actor:profiles!actor_id(full_name, email)")
    .eq("table_name", "tasks")
    .order("created_at", { ascending: false })
    .limit(300);

  const optionsUnavailable = Boolean(
    clientsError || systemsError || resourcesError || agreementsError ||
    incidentsError || suspensionsError || staffError
  );

  const formattedTasks: TaskItem[] = (tasksData ?? []).map((t) => ({
    ...t,
    client: Array.isArray(t.client) ? t.client[0] : t.client,
    system: Array.isArray(t.system) ? t.system[0] : t.system,
    resource: Array.isArray(t.resource) ? t.resource[0] : t.resource,
    service_agreement: Array.isArray(t.service_agreement) ? t.service_agreement[0] : t.service_agreement,
    incident: Array.isArray(t.incident) ? t.incident[0] : t.incident,
    suspension_case: Array.isArray(t.suspension_case) ? t.suspension_case[0] : t.suspension_case,
    assigned_staff: Array.isArray(t.assigned_staff) ? t.assigned_staff[0] : t.assigned_staff,
    created_by_user: Array.isArray(t.created_by_user) ? t.created_by_user[0] : t.created_by_user,
  }));

  const staffOptions = (staffData ?? []).map((s) => ({
    id: s.id,
    label: s.full_name || s.email,
    role: s.role,
  }));

  return (
    <div className="ux-page ux-page--wide ops-page">
      <PageHeader
        title="Tasks"
        description="Operational work assigned to the team."
      />

      <TasksManager
        currentUserId={user.id}
        tasks={formattedTasks}
        auditTrail={(taskAuditData ?? []).map((a) => ({
          ...a,
          actor: Array.isArray(a.actor) ? a.actor[0] : a.actor,
        }))}
        clients={clientsData ?? []}
        systems={systemsData ?? []}
        resources={resourcesData ?? []}
        agreements={agreementsData ?? []}
        incidents={incidentsData ?? []}
        suspensionCases={suspensionsData ?? []}
        staffOptions={staffOptions}
        isAdmin={isAdmin}
        isFinance={isFinanceUser}
        isStaff={isStaffUser}
        tasksUnavailable={Boolean(tasksError)}
        optionsUnavailable={optionsUnavailable}
        auditUnavailable={isAdmin && Boolean(taskAuditError)}
      />
    </div>
  );
}
