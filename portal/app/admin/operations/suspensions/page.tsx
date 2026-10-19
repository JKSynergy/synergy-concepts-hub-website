import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Activity, ShieldCheck } from "lucide-react";
import "./hosting.css";
import { isInternal, isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";
import SuspensionsManager from "./suspensions-manager";
import ApplicationSuspensionSection, { type ServiceActivity } from "./application-suspension-section";
import { RaiseCaseButton } from "./raise-case-button";

// Audit actions shown in the service activity log (admin-only under RLS).
const SERVICE_ACTIONS = [
  "SERVICE_SUSPENDED",
  "SERVICE_RESUMED",
  "SERVICE_SUSPEND_FAILED",
  "SERVICE_RESUME_FAILED",
  "SERVICE_TOKEN_ROTATED",
  "SERVICE_TOKEN_ROTATE_FAILED",
];

export const metadata = { title: "Suspensions" };

export default async function SuspensionsPage() {
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

  // 1. Fetch Suspension Cases — a failed query must never render as "no cases"
  const { data: casesData, error: casesError } = await supabase
    .from("suspension_cases")
    .select(`
      id, service_agreement_id, client_id, system_id, reason, status,
      requested_by, approved_by, assigned_to, requested_at, approved_at,
      executed_at, verified_at, restored_at, notes, operational_notes, created_at,
      service_agreement:service_agreements(id, name, status, service_type),
      client:profiles!client_id(id, email, full_name, company_name),
      system:systems(id, name, status),
      assigned_staff:profiles!assigned_to(id, email, full_name),
      requested_by_user:profiles!requested_by(id, email, full_name),
      approved_by_user:profiles!approved_by(id, email, full_name)
    `)
    .order("created_at", { ascending: false });

  // 2. Fetch Suspension Actions
  const { data: actionsData, error: actionsError } = await supabase
    .from("suspension_actions")
    .select(`
      id, suspension_case_id, resource_id, action_type, action_status,
      performed_by, performed_at, assigned_to, verified_by, verified_at,
      evidence, evidence_reference, notes, created_at,
      resource:resources(id, name, resource_type, status),
      performed_by_user:profiles!performed_by(id, email, full_name),
      assigned_staff:profiles!assigned_to(id, email, full_name),
      verified_by_user:profiles!verified_by(id, email, full_name)
    `)
    .order("created_at", { ascending: false });

  // 3. Reference options for case creation & assignments
  const { data: agreementsData } = await supabase
    .from("service_agreements")
    .select("id, name, client_id, system_id, status")
    .order("name");

  const { data: clientsData } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  // Application-level status — a failed systems query must never imply all live
  const { data: systemsData, error: systemsError } = await supabase
    .from("systems")
    .select(
      "id, name, client_id, status, suspended_at, suspended_by, suspension_reason, suspension_note, resumed_at, resumed_by"
    )
    .order("name");

  const { data: resourcesData } = await supabase
    .from("resources")
    .select("id, name, client_id, system_id, resource_type, status")
    .order("name");

  const { data: staffData } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .in("role", ["staff", "admin"])
    .order("full_name");

  // Recent service actions: who did what, why, and whether it worked.
  const { data: activityData } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, created_at, actor_id, details, new_data")
    .eq("table_name", "systems")
    .in("action", SERVICE_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(15);

  const { data: agreementResourcesData } = await supabase
    .from("agreement_resources")
    .select("agreement_id, resource_id");

  const agreements = (agreementsData ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    client_id: a.client_id,
    system_id: a.system_id,
    status: a.status,
  }));

  const clients = (clientsData ?? []).map((c) => ({
    id: c.id,
    label: c.company_name ? `${c.company_name} (${c.email})` : (c.full_name || c.email),
  }));

  const systems = (systemsData ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    client_id: s.client_id,
    status: s.status,
    suspended_at: s.suspended_at,
    suspended_by: s.suspended_by,
    suspension_reason: s.suspension_reason,
    suspension_note: s.suspension_note,
    resumed_at: s.resumed_at,
    resumed_by: s.resumed_by,
  }));

  const resources = (resourcesData ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    client_id: r.client_id,
    system_id: r.system_id,
    resource_type: r.resource_type,
    status: r.status,
  }));

  const staffName = new Map((staffData ?? []).map((s) => [s.id as string, (s.full_name || s.email) as string]));
  const systemName = new Map(systems.map((s) => [s.id, s.name]));
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const activity: ServiceActivity[] = (activityData ?? []).map((a) => {
    const details = (a.details ?? {}) as Record<string, unknown>;
    const newData = (a.new_data ?? {}) as Record<string, unknown>;
    // Trigger-written rows run as the service role, so the actor is carried in details.actor.
    const actorId = (a.actor_id as string | null) ?? str(details.actor);
    return {
      id: a.id,
      action: a.action,
      systemId: a.record_id,
      systemName: (a.record_id && systemName.get(a.record_id)) || "Unknown system",
      at: a.created_at,
      actor: actorId ? staffName.get(actorId) ?? "Unknown user" : null,
      reason: str(details.reason) ?? (a.action === "SERVICE_SUSPENDED" ? str(newData.suspension_reason) : null),
      note: str(details.note) ?? (a.action === "SERVICE_SUSPENDED" || a.action === "SERVICE_RESUMED" ? str(newData.suspension_note) : null),
      error: str(details.error),
    };
  });
  const actorLabel = staffName.get(user.id) ?? user.email ?? "you";

  const staffOptions = (staffData ?? []).map((s) => ({
    id: s.id,
    label: `${s.full_name || s.email} (${s.role})`,
    role: s.role,
  }));

  const formattedCases = (casesData ?? []).map((c) => ({
    ...c,
    service_agreement: Array.isArray(c.service_agreement) ? c.service_agreement[0] : c.service_agreement,
    client: Array.isArray(c.client) ? c.client[0] : c.client,
    system: Array.isArray(c.system) ? c.system[0] : c.system,
    assigned_staff: Array.isArray(c.assigned_staff) ? c.assigned_staff[0] : c.assigned_staff,
    requested_by_user: Array.isArray(c.requested_by_user) ? c.requested_by_user[0] : c.requested_by_user,
    approved_by_user: Array.isArray(c.approved_by_user) ? c.approved_by_user[0] : c.approved_by_user,
  }));

  const formattedActions = (actionsData ?? []).map((a) => ({
    ...a,
    resource: Array.isArray(a.resource) ? a.resource[0] : a.resource,
    performed_by_user: Array.isArray(a.performed_by_user) ? a.performed_by_user[0] : a.performed_by_user,
    assigned_staff: Array.isArray(a.assigned_staff) ? a.assigned_staff[0] : a.assigned_staff,
    verified_by_user: Array.isArray(a.verified_by_user) ? a.verified_by_user[0] : a.verified_by_user,
  }));

  return (
    <div className="ux-page ux-page--wide ops-page hx">
      <header className="hx-head hx-top">
        <div>
          <div className="hx-crumb">
            <span>operations</span>
            <span>service-control</span>
            <span>suspensions</span>
          </div>
          <h1>Suspensions</h1>
          <p>Application-layer control of SCH-managed services. Hosting and provider infrastructure are never touched.</p>
        </div>
        <div className="hx-head-meta">
          <span className="hx-chip"><ShieldCheck size={12} /> {isAdmin ? "role: admin" : isFinanceUser ? "role: finance" : "role: staff"}</span>
          <span className="hx-chip hx-env"><Activity size={12} /> {process.env.VERCEL_ENV ?? process.env.NODE_ENV}</span>
          {!isFinanceUser && <RaiseCaseButton />}
        </div>
      </header>

      <ApplicationSuspensionSection
        systems={systems}
        systemsUnavailable={Boolean(systemsError)}
        clients={clients}
        isAdmin={isAdmin}
        activity={activity}
        actorLabel={actorLabel}
      />
      <SuspensionsManager
        currentUserId={user.id}
        casesUnavailable={Boolean(casesError)}
        actionsUnavailable={Boolean(actionsError)}
        systemsUnavailable={Boolean(systemsError)}
        cases={formattedCases}
        actions={formattedActions}
        agreements={agreements}
        clients={clients}
        systems={systems}
        resources={resources}
        staffOptions={staffOptions}
        agreementResources={agreementResourcesData ?? []}
        isAdmin={isAdmin}
        isFinance={isFinanceUser}
        isStaff={isStaffUser}
      />
    </div>
  );
}
