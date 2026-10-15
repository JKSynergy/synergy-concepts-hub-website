import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";
import { resolvePolicyHealth } from "@/lib/operations/backups";
import BackupsManager, { type BackupPolicyItem, type BackupEventItem } from "./backups-manager";

export const metadata = { title: "Backups" };

export default async function BackupsPage() {
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

  // 1. Fetch Policies (with embedded reference names) — errors surface as
  // Unavailable states in the workspace, never as empty lists or fake health.
  const { data: policiesData, error: policiesError } = await supabase
    .from("backup_policies")
    .select(`
      id, client_id, resource_id, system_id, service_agreement_id,
      name, frequency, frequency_interval_days, retention_days, verification_required,
      is_active, effective_from, effective_until, operational_notes,
      created_by, created_at, updated_at,
      client:profiles!client_id(id, email, full_name, company_name),
      system:systems(id, name, status),
      resource:resources(id, name, resource_type, status),
      service_agreement:service_agreements(id, name, status),
      created_by_user:profiles!created_by(id, email, full_name)
    `)
    .order("created_at", { ascending: false });

  // 2. Fetch deterministic health per policy
  const { data: healthData, error: healthError } = await supabase
    .from("backup_policy_health")
    .select("*");

  // 3. Fetch Backup Events
  const { data: eventsData, error: eventsError } = await supabase
    .from("backup_events")
    .select(`
      id, client_id, backup_policy_id, resource_id, system_id, service_agreement_id,
      status, started_at, completed_at, verified_at, verified_by, recorded_by,
      evidence_reference, evidence_notes, failure_reason,
      created_at, updated_at,
      recorded_by_user:profiles!recorded_by(id, email, full_name),
      verified_by_user:profiles!verified_by(id, email, full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  // 4. Option reference data
  const { data: clientsData } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  const { data: resourcesData } = await supabase
    .from("resources")
    .select("id, name, client_id, system_id, resource_type, status")
    .order("name");

  const { data: systemsData } = await supabase
    .from("systems")
    .select("id, name, client_id")
    .order("name");

  const { data: agreementsData } = await supabase
    .from("service_agreements")
    .select("id, name, client_id")
    .order("name");

  // Audit history (audit_logs is admin-only under RLS; empty for other roles)
  const { data: policyAuditData } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, created_at, actor:profiles!actor_id(full_name, email)")
    .eq("table_name", "backup_policies")
    .order("created_at", { ascending: false })
    .limit(300);

  const { data: eventAuditData } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, created_at, actor:profiles!actor_id(full_name, email)")
    .eq("table_name", "backup_events")
    .order("created_at", { ascending: false })
    .limit(300);

  const healthById = new Map((healthData ?? []).map((h) => [h.policy_id, h]));

  const formattedPolicies: BackupPolicyItem[] = (policiesData ?? []).map((p) => {
    const health = healthById.get(p.id);
    return {
      ...p,
      client: Array.isArray(p.client) ? p.client[0] : p.client,
      system: Array.isArray(p.system) ? p.system[0] : p.system,
      resource: Array.isArray(p.resource) ? p.resource[0] : p.resource,
      service_agreement: Array.isArray(p.service_agreement) ? p.service_agreement[0] : p.service_agreement,
      created_by_user: Array.isArray(p.created_by_user) ? p.created_by_user[0] : p.created_by_user,
      // Missing/unavailable health evidence is "unknown" — never implied healthy.
      health: healthError ? "unknown" : resolvePolicyHealth(health?.health),
      next_due_at: health?.next_due_at ?? null,
      last_completed_at: health?.last_completed_at ?? null,
      last_verified_at: health?.last_verified_at ?? null,
      last_event_status: health?.last_event_status ?? null,
      last_failed_at: health?.last_failed_at ?? null,
      last_failure_reason: health?.last_failure_reason ?? null,
    };
  });

  const formattedEvents: BackupEventItem[] = (eventsData ?? []).map((e) => ({
    ...e,
    recorded_by_user: Array.isArray(e.recorded_by_user) ? e.recorded_by_user[0] : e.recorded_by_user,
    verified_by_user: Array.isArray(e.verified_by_user) ? e.verified_by_user[0] : e.verified_by_user,
  }));

  const auditTrail = [...(policyAuditData ?? []), ...(eventAuditData ?? [])]
    .map((a) => ({
      ...a,
      actor: Array.isArray(a.actor) ? a.actor[0] : a.actor,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="ux-page ux-page--wide ops-page">
      <PageHeader
        title="Backups"
        description="Backup coverage and verification for client systems."
      />

      <BackupsManager
        currentUserId={user.id}
        policiesUnavailable={Boolean(policiesError)}
        healthUnavailable={Boolean(healthError)}
        eventsUnavailable={Boolean(eventsError)}
        policies={formattedPolicies}
        events={formattedEvents}
        auditTrail={auditTrail}
        clients={clientsData ?? []}
        resources={resourcesData ?? []}
        systems={systemsData ?? []}
        agreements={agreementsData ?? []}
        isAdmin={isAdmin}
        isFinance={isFinanceUser}
        isStaff={isStaffUser}
      />
    </div>
  );
}
