import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusMark } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isOperationalStaff, isFinance } from "@/lib/security/roles";

export const metadata = { title: "Operations" };

type ClientRef = { company_name?: string | null; email?: string | null } | null | undefined;

function clientLabel(row: { client?: unknown }): string {
  const c = (Array.isArray(row.client) ? row.client[0] : row.client) as ClientRef;
  return c?.company_name || c?.email || "—";
}

export default async function OperationsPage() {
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

  // Parallel fetch operational counts
  const [
    { data: tasks },
    { data: incidents },
    { data: suspensions },
    { data: backupHealth },
    { data: costRenewals },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_at, client_id, assigned_to, created_at, client:profiles!client_id(company_name, email)")
      .order("created_at", { ascending: false }),
    supabase
      .from("incidents")
      .select("id, title, status, severity, opened_at, client_id, assigned_to, created_at, client:profiles!client_id(company_name, email)")
      .order("created_at", { ascending: false }),
    supabase
      .from("suspension_cases")
      .select("id, reason, status, client_id, created_at, client:profiles!client_id(company_name, email)")
      .order("created_at", { ascending: false }),
    supabase
      .from("backup_policy_health")
      .select("policy_id, health"),
    // Staff-safe view — renewal state only, no amounts or currencies
    supabase
      .from("staff_provider_costs_view")
      .select("id, renewal_state"),
  ]);

  const allTasks = tasks ?? [];
  const allIncidents = incidents ?? [];
  const allSuspensions = suspensions ?? [];

  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  // Task metrics
  const taskCounts = {
    open: allTasks.filter((t) => t.status === "open").length,
    assigned: allTasks.filter((t) => t.status === "assigned").length,
    in_progress: allTasks.filter((t) => t.status === "in_progress").length,
    blocked: allTasks.filter((t) => t.status === "blocked").length,
    due_soon: allTasks.filter(
      (t) => t.due_at && t.due_at > now && t.due_at <= soon && !["completed", "cancelled"].includes(t.status)
    ).length,
    overdue: allTasks.filter(
      (t) => t.due_at && t.due_at < now && !["completed", "cancelled"].includes(t.status)
    ).length,
    completed: allTasks.filter((t) => t.status === "completed").length,
  };

  // Incident metrics
  const incidentCounts = {
    open: allIncidents.filter((i) => i.status === "open").length,
    investigating: allIncidents.filter((i) => ["acknowledged", "investigating", "monitoring"].includes(i.status)).length,
    high_critical: allIncidents.filter(
      (i) => ["high", "critical"].includes(i.severity) && !["resolved", "closed", "cancelled"].includes(i.status)
    ).length,
    resolved: allIncidents.filter((i) => i.status === "resolved").length,
    closed: allIncidents.filter((i) => i.status === "closed").length,
  };

  // Suspension metrics
  const suspensionCounts = {
    pending_approval: allSuspensions.filter((s) => s.status === "pending_approval").length,
    approved: allSuspensions.filter((s) => s.status === "approved").length,
    executing: allSuspensions.filter((s) => s.status === "executing").length,
    suspended: allSuspensions.filter((s) => s.status === "suspended").length,
    restoration_pending: allSuspensions.filter((s) => s.status === "restoration_pending").length,
  };

  const allBackupHealth = backupHealth ?? [];

  // Backup coverage metrics (deterministic health states from backup_policy_health)
  const backupCounts = {
    healthy: allBackupHealth.filter((b) => b.health === "healthy").length,
    due: allBackupHealth.filter((b) => b.health === "due").length,
    overdue: allBackupHealth.filter((b) => b.health === "overdue").length,
    failed: allBackupHealth.filter((b) => b.health === "failed").length,
    unverified: allBackupHealth.filter((b) => b.health === "unverified").length,
  };

  // Infrastructure renewal metrics — renewal timing only, NO amounts or currencies
  const allCostRenewals = costRenewals ?? [];
  const renewalCounts = {
    upcoming: allCostRenewals.filter((c) => c.renewal_state === "upcoming").length,
    due: allCostRenewals.filter((c) => c.renewal_state === "due").length,
    overdue: allCostRenewals.filter((c) => c.renewal_state === "overdue").length,
  };

  const activeIncidents = allIncidents.filter(
    (i) => !["resolved", "closed", "cancelled"].includes(i.status)
  ).slice(0, 5);

  const urgentTasks = allTasks.filter(
    (t) => !["completed", "cancelled"].includes(t.status)
  ).slice(0, 5);

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Operations"
        description="Keep operational work, incidents and service issues moving."
      />

      {/* ATTENTION — what needs human review right now */}
      <section className="ux-ops-sec ux-ops-sec--first">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Requires attention</h2>
          <Link href="/admin/operations/action-center" className="ux-link">View Action Center &rarr;</Link>
        </div>
        <div className="ux-ops-stats ux-ops-stats--wide">
          <div className="ux-ops-stat">
            <span>High / critical incidents</span>
            <b className={incidentCounts.high_critical > 0 ? "is-hot" : ""}>{incidentCounts.high_critical}</b>
          </div>
          <div className="ux-ops-stat">
            <span>Overdue tasks</span>
            <b className={taskCounts.overdue > 0 ? "is-hot" : ""}>{taskCounts.overdue}</b>
          </div>
          <div className="ux-ops-stat">
            <span>Suspensions pending approval</span>
            <b className={suspensionCounts.pending_approval > 0 ? "is-warn" : ""}>{suspensionCounts.pending_approval}</b>
          </div>
          <div className="ux-ops-stat">
            <span>Failed / overdue backups</span>
            <b className={backupCounts.failed + backupCounts.overdue > 0 ? "is-hot" : ""}>{backupCounts.failed + backupCounts.overdue}</b>
          </div>
        </div>
      </section>

      {/* WORK — tasks & incidents */}
      <section className="ux-ops-sec">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Work</h2>
        </div>
        <div className="ux-ops-grid2">
          <div>
            <div className="ux-ops-sub-head">
              <h3>Tasks</h3>
              <Link href="/admin/operations/tasks" className="ux-link">View Tasks &rarr;</Link>
            </div>
            <div className="ux-ops-stats">
              <div className="ux-ops-stat"><span>Open</span><b>{taskCounts.open}</b></div>
              <div className="ux-ops-stat"><span>Assigned</span><b>{taskCounts.assigned}</b></div>
              <div className="ux-ops-stat"><span>In progress</span><b>{taskCounts.in_progress}</b></div>
              <div className="ux-ops-stat"><span>Blocked</span><b className={taskCounts.blocked > 0 ? "is-hot" : ""}>{taskCounts.blocked}</b></div>
              <div className="ux-ops-stat"><span>Due soon</span><b className={taskCounts.due_soon > 0 ? "is-warn" : ""}>{taskCounts.due_soon}</b></div>
              <div className="ux-ops-stat"><span>Completed</span><b>{taskCounts.completed}</b></div>
            </div>
          </div>
          <div>
            <div className="ux-ops-sub-head">
              <h3>Incidents</h3>
              <Link href="/admin/operations/incidents" className="ux-link">View Incidents &rarr;</Link>
            </div>
            <div className="ux-ops-stats">
              <div className="ux-ops-stat"><span>Open</span><b className={incidentCounts.open > 0 ? "is-hot" : ""}>{incidentCounts.open}</b></div>
              <div className="ux-ops-stat"><span>Investigating</span><b>{incidentCounts.investigating}</b></div>
              <div className="ux-ops-stat"><span>High / critical</span><b className={incidentCounts.high_critical > 0 ? "is-hot" : ""}>{incidentCounts.high_critical}</b></div>
              <div className="ux-ops-stat"><span>Resolved</span><b>{incidentCounts.resolved}</b></div>
              <div className="ux-ops-stat"><span>Closed</span><b>{incidentCounts.closed}</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* ACTIVE WORK — incidents & tasks needing attention */}
      <section className="ux-ops-sec">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Active work</h2>
        </div>
        <div className="ux-ops-grid2">
          <div>
            <div className="ux-ops-sub-head"><h3>Unresolved incidents</h3></div>
            {activeIncidents.length === 0 ? (
              <p className="ux-ops-empty">No active unresolved incidents.</p>
            ) : (
              <div className="ux-ops-rows">
                {activeIncidents.map((inc) => (
                  <div key={inc.id} className="ux-ops-row">
                    <div>
                      <div className="ux-ops-row-top">
                        <StatusMark tone={["critical", "high"].includes(inc.severity) ? "danger" : "warning"}>
                          {inc.severity}
                        </StatusMark>
                        <span className="ux-ops-row-name">{inc.title}</span>
                      </div>
                      <div className="ux-ops-meta">
                        Client: {clientLabel(inc)} · Status: {inc.status}
                      </div>
                    </div>
                    <Link href="/admin/operations/incidents" className="ux-textbtn">View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="ux-ops-sub-head"><h3>Open tasks</h3></div>
            {urgentTasks.length === 0 ? (
              <p className="ux-ops-empty">No active tasks.</p>
            ) : (
              <div className="ux-ops-rows">
                {urgentTasks.map((t) => (
                  <div key={t.id} className="ux-ops-row">
                    <div>
                      <div className="ux-ops-row-top">
                        <StatusMark tone={["urgent", "high"].includes(t.priority) ? "danger" : "neutral"}>
                          {t.priority}
                        </StatusMark>
                        <span className="ux-ops-row-name">{t.title}</span>
                      </div>
                      <div className="ux-ops-meta">
                        Client: {clientLabel(t)} · Status: {t.status}
                        {t.due_at && ` · Due: ${new Date(t.due_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    <Link href="/admin/operations/tasks" className="ux-textbtn">View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SERVICE ENFORCEMENT */}
      <section className="ux-ops-sec">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Suspensions</h2>
          <Link href="/admin/operations/suspensions" className="ux-link">View Suspensions &rarr;</Link>
        </div>
        <p className="ux-ops-meta">
          Controlled service suspension and restoration, with approval and verification.
        </p>
        <div className="ux-ops-stats ux-ops-stats--wide">
          <div className="ux-ops-stat"><span>Pending approval</span><b className={suspensionCounts.pending_approval > 0 ? "is-warn" : ""}>{suspensionCounts.pending_approval}</b></div>
          <div className="ux-ops-stat"><span>Approved</span><b>{suspensionCounts.approved}</b></div>
          <div className="ux-ops-stat"><span>Executing</span><b>{suspensionCounts.executing}</b></div>
          <div className="ux-ops-stat"><span>Suspended</span><b className={suspensionCounts.suspended > 0 ? "is-hot" : ""}>{suspensionCounts.suspended}</b></div>
          <div className="ux-ops-stat"><span>Restoring</span><b>{suspensionCounts.restoration_pending}</b></div>
        </div>
      </section>

      {/* INFRASTRUCTURE — backups & renewals */}
      <section className="ux-ops-sec">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Infrastructure</h2>
        </div>
        <div className="ux-ops-grid2">
          <div>
            <div className="ux-ops-sub-head">
              <h3>Backups</h3>
              <Link href="/admin/operations/backups" className="ux-link">View Backups &rarr;</Link>
            </div>
            <div className="ux-ops-stats">
              <div className="ux-ops-stat"><span>Healthy</span><b>{backupCounts.healthy}</b></div>
              <div className="ux-ops-stat"><span>Due</span><b>{backupCounts.due}</b></div>
              <div className="ux-ops-stat"><span>Overdue</span><b className={backupCounts.overdue > 0 ? "is-warn" : ""}>{backupCounts.overdue}</b></div>
              <div className="ux-ops-stat"><span>Failed</span><b className={backupCounts.failed > 0 ? "is-hot" : ""}>{backupCounts.failed}</b></div>
              <div className="ux-ops-stat"><span>Unverified</span><b className={backupCounts.unverified > 0 ? "is-warn" : ""}>{backupCounts.unverified}</b></div>
            </div>
          </div>
          <div id="ops-renewals-card">
            <div className="ux-ops-sub-head">
              <h3>Renewals</h3>
              {(isAdmin || isFinanceUser) && (
                <Link href="/admin/finances/provider-costs" className="ux-link">Provider Costs &rarr;</Link>
              )}
            </div>
            <div className="ux-ops-stats">
              <div className="ux-ops-stat"><span>Upcoming</span><b>{renewalCounts.upcoming}</b></div>
              <div className="ux-ops-stat"><span>Due (7d)</span><b className={renewalCounts.due > 0 ? "is-warn" : ""}>{renewalCounts.due}</b></div>
              <div className="ux-ops-stat"><span>Overdue</span><b className={renewalCounts.overdue > 0 ? "is-hot" : ""}>{renewalCounts.overdue}</b></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
