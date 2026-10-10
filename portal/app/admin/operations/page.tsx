import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusMark } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isFinance } from "@/lib/security/roles";
import {
  outcome,
  deriveTaskCounts,
  sortTasksForAttention,
  deriveIncidentCounts,
  sortIncidentsForAttention,
  deriveSuspensionCounts,
  suspendedSystems,
  deriveBackupSummary,
  deriveSignalSummary,
  deriveProviderActionSummary,
  deriveMonitoringSummary,
  deriveRenewalCounts,
  describeAuditEvent,
  ACTIVITY_TABLES,
  type QueryOutcome,
  type TaskRow,
  type IncidentRow,
  type SuspensionCaseRow,
  type SystemStatusRow,
  type BackupHealthRow,
  type ActionSignalRow,
  type ProviderProposalRow,
  type MonitoringScheduleRow,
  type RenewalRow,
  type AuditRow,
} from "@/lib/operations/overview";

export const metadata = { title: "Operations" };

type ClientRef = { company_name?: string | null; email?: string | null } | null | undefined;

function clientLabel(row: { client?: unknown }): string {
  const c = (Array.isArray(row.client) ? row.client[0] : row.client) as ClientRef;
  return c?.company_name || c?.email || "—";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Rendered when a section's data source could not be retrieved. Never implies zero. */
function Unavailable({ label }: { label: string }) {
  return (
    <p className="ux-ops-empty">
      {label} unavailable — the data source could not be reached. <Link href="/admin/operations" className="ux-link">Retry</Link>
    </p>
  );
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
  const canSeeProviderOps = isAdmin || isFinanceUser;

  // Core queries every internal role runs (RLS-permitted for admin/staff/finance).
  const [tasksRes, incidentsRes, casesRes, backupRes, renewalsRes, systemsRes, signalsRes] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_at, created_at, client:profiles!client_id(company_name, email)")
        .order("created_at", { ascending: false }),
      supabase
        .from("incidents")
        .select("id, title, status, severity, opened_at, created_at, client:profiles!client_id(company_name, email)")
        .order("opened_at", { ascending: false }),
      supabase
        .from("suspension_cases")
        .select("id, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("backup_policy_health")
        .select("policy_id, policy_name, health, last_completed_at, last_verified_at, next_due_at, last_failure_reason, last_event_at"),
      // Staff-safe view — renewal state only, no amounts or currencies
      supabase.from("staff_provider_costs_view").select("id, renewal_state"),
      // Application-level suspension status (systems.status) — distinct from suspension_cases
      supabase
        .from("systems")
        .select("id, name, status, suspended_at")
        .eq("status", "suspended")
        .order("suspended_at", { ascending: false }),
      // Canonical Action Center feed — open/acknowledged deduplicated signals
      supabase
        .from("action_item_overview")
        .select("id, severity, status, title, detected_at, client_company, system_name, resource_name")
        .in("status", ["open", "acknowledged"])
        .order("detected_at", { ascending: false })
        .limit(50),
    ]);

  // Restricted queries — admin/finance only. Staff must never hit these views.
  // audit_logs SELECT is admin-only (migration 010) — finance and staff must not query it.
  const [providerActionsQ, monitoringQ, activityQ] = await Promise.all([
    canSeeProviderOps
      ? supabase
          .from("provider_operation_overview")
          .select("id, status, operation_key, provider_name, external_name, system_name, created_at")
          .in("status", ["proposed", "approved", "verification_pending"])
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve(null),
    canSeeProviderOps
      ? supabase
          .from("provider_monitoring_overview")
          .select("schedule_id, provider_name, account_name, enabled, consecutive_failures, last_run_status, next_run_at, last_run_at")
      : Promise.resolve(null),
    isAdmin
      ? supabase
          .from("audit_logs")
          .select("action, table_name, record_id, created_at, actor:profiles!actor_id(full_name)")
          .in("table_name", ACTIVITY_TABLES)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve(null),
  ]);

  const providerActionsRes: QueryOutcome<ProviderProposalRow[]> | null = providerActionsQ
    ? outcome<ProviderProposalRow[]>(providerActionsQ)
    : null;
  const monitoringRes: QueryOutcome<MonitoringScheduleRow[]> | null = monitoringQ
    ? outcome<MonitoringScheduleRow[]>(monitoringQ)
    : null;
  const activityRes: QueryOutcome<AuditRow[]> | null = activityQ ? outcome<AuditRow[]>(activityQ) : null;

  const tasksOut = outcome<TaskRow[]>(tasksRes);
  const incidentsOut = outcome<IncidentRow[]>(incidentsRes);
  const casesOut = outcome<SuspensionCaseRow[]>(casesRes);
  const backupOut = outcome<BackupHealthRow[]>(backupRes);
  const renewalsOut = outcome<RenewalRow[]>(renewalsRes);
  const systemsOut = outcome<SystemStatusRow[]>(systemsRes);
  const signalsOut = outcome<ActionSignalRow[]>(signalsRes);

  const now = Date.now();
  const taskCounts = tasksOut.ok ? deriveTaskCounts(tasksOut.data, now) : null;
  const incidentCounts = incidentsOut.ok ? deriveIncidentCounts(incidentsOut.data) : null;
  const caseCounts = casesOut.ok ? deriveSuspensionCounts(casesOut.data) : null;
  const backup = backupOut.ok ? deriveBackupSummary(backupOut.data) : null;
  const renewals = renewalsOut.ok ? deriveRenewalCounts(renewalsOut.data) : null;
  const suspended = systemsOut.ok ? suspendedSystems(systemsOut.data) : null;
  const signals = signalsOut.ok ? deriveSignalSummary(signalsOut.data) : null;
  const providerActions = providerActionsRes?.ok ? deriveProviderActionSummary(providerActionsRes.data) : null;
  const monitoring = monitoringRes?.ok ? deriveMonitoringSummary(monitoringRes.data) : null;

  const attentionTasks = tasksOut.ok ? sortTasksForAttention(tasksOut.data, now).slice(0, 5) : null;
  const attentionIncidents = incidentsOut.ok ? sortIncidentsForAttention(incidentsOut.data).slice(0, 5) : null;

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Operations"
        description="Keep operational work, incidents and service issues moving."
      />

      {/* REQUIRES ATTENTION — canonical Action Center signals + pending decisions */}
      <section className="ux-ops-sec ux-ops-sec--first">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Requires attention</h2>
          <Link href="/admin/operations/action-center" className="ux-link">View Action Center &rarr;</Link>
        </div>
        {!signals ? (
          <Unavailable label="Action signals" />
        ) : (
          <>
            <div className="ux-ops-stats ux-ops-stats--wide">
              <div className="ux-ops-stat">
                <span>Critical signals</span>
                <b className={signals.critical > 0 ? "is-hot" : ""}>{signals.critical}</b>
              </div>
              <div className="ux-ops-stat">
                <span>Warning signals</span>
                <b className={signals.warning > 0 ? "is-warn" : ""}>{signals.warning}</b>
              </div>
              <div className="ux-ops-stat">
                <span>Info signals</span>
                <b>{signals.info}</b>
              </div>
              <div className="ux-ops-stat">
                <span>Open items</span>
                <b>{signals.totalOpen}</b>
              </div>
            </div>
            {signals.top.length > 0 && (
              <div className="ux-ops-rows" style={{ marginTop: "0.75rem" }}>
                {signals.top.map((i) => (
                  <div key={i.id} className="ux-ops-row">
                    <div>
                      <div className="ux-ops-row-top">
                        <StatusMark tone={i.severity === "critical" ? "danger" : i.severity === "warning" ? "warning" : "neutral"}>
                          {i.severity}
                        </StatusMark>
                        <span className="ux-ops-row-name">{i.title}</span>
                      </div>
                      <div className="ux-ops-meta">
                        {i.system_name ?? i.client_company ?? i.resource_name ?? "—"} · {i.status} · {fmtDate(i.detected_at)}
                      </div>
                    </div>
                    <Link href="/admin/operations/action-center" className="ux-textbtn">Review</Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {canSeeProviderOps && (
          <div style={{ marginTop: "1.25rem" }}>
            <div className="ux-ops-sub-head">
              <h3>Provider decisions</h3>
              <Link href="/admin/operations/provider-actions" className="ux-link">View Provider Actions &rarr;</Link>
            </div>
            {!providerActions ? (
              <Unavailable label="Provider actions" />
            ) : (
              <div className="ux-ops-stats ux-ops-stats--wide">
                <div className="ux-ops-stat">
                  <span>Proposed</span>
                  <b className={providerActions.proposed > 0 ? "is-warn" : ""}>{providerActions.proposed}</b>
                </div>
                <div className="ux-ops-stat"><span>Approved</span><b>{providerActions.approved}</b></div>
                <div className="ux-ops-stat">
                  <span>Awaiting verification</span>
                  <b className={providerActions.verificationPending > 0 ? "is-warn" : ""}>{providerActions.verificationPending}</b>
                </div>
              </div>
            )}
          </div>
        )}
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
            {!taskCounts ? (
              <Unavailable label="Tasks" />
            ) : (
              <div className="ux-ops-stats">
                <div className="ux-ops-stat"><span>Open</span><b>{taskCounts.open}</b></div>
                <div className="ux-ops-stat"><span>Assigned</span><b>{taskCounts.assigned}</b></div>
                <div className="ux-ops-stat"><span>In progress</span><b>{taskCounts.in_progress}</b></div>
                <div className="ux-ops-stat"><span>Blocked</span><b className={taskCounts.blocked > 0 ? "is-hot" : ""}>{taskCounts.blocked}</b></div>
                <div className="ux-ops-stat"><span>Due soon</span><b className={taskCounts.due_soon > 0 ? "is-warn" : ""}>{taskCounts.due_soon}</b></div>
                <div className="ux-ops-stat"><span>Overdue</span><b className={taskCounts.overdue > 0 ? "is-hot" : ""}>{taskCounts.overdue}</b></div>
                <div className="ux-ops-stat"><span>Completed</span><b>{taskCounts.completed}</b></div>
              </div>
            )}
          </div>
          <div>
            <div className="ux-ops-sub-head">
              <h3>Incidents</h3>
              <Link href="/admin/operations/incidents" className="ux-link">View Incidents &rarr;</Link>
            </div>
            {!incidentCounts ? (
              <Unavailable label="Incidents" />
            ) : (
              <div className="ux-ops-stats">
                <div className="ux-ops-stat"><span>Open</span><b className={incidentCounts.open > 0 ? "is-hot" : ""}>{incidentCounts.open}</b></div>
                <div className="ux-ops-stat"><span>Active</span><b>{incidentCounts.active}</b></div>
                <div className="ux-ops-stat"><span>High / critical</span><b className={incidentCounts.high_critical > 0 ? "is-hot" : ""}>{incidentCounts.high_critical}</b></div>
                <div className="ux-ops-stat"><span>Resolved</span><b>{incidentCounts.resolved}</b></div>
                <div className="ux-ops-stat"><span>Closed</span><b>{incidentCounts.closed}</b></div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ACTIVE WORK — most urgent unfinished items */}
      <section className="ux-ops-sec">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Active work</h2>
        </div>
        <div className="ux-ops-grid2">
          <div>
            <div className="ux-ops-sub-head"><h3>Unresolved incidents</h3></div>
            {!attentionIncidents ? (
              <Unavailable label="Incidents" />
            ) : attentionIncidents.length === 0 ? (
              <p className="ux-ops-empty">No active unresolved incidents.</p>
            ) : (
              <div className="ux-ops-rows">
                {attentionIncidents.map((inc) => (
                  <div key={inc.id} className="ux-ops-row">
                    <div>
                      <div className="ux-ops-row-top">
                        <StatusMark tone={["critical", "high"].includes(inc.severity ?? "") ? "danger" : "warning"}>
                          {inc.severity}
                        </StatusMark>
                        <span className="ux-ops-row-name">{inc.title}</span>
                      </div>
                      <div className="ux-ops-meta">
                        Client: {clientLabel(inc)} · {inc.status} · Opened {fmtDate(inc.opened_at)}
                      </div>
                    </div>
                    <Link href="/admin/operations/incidents" className="ux-textbtn">View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="ux-ops-sub-head"><h3>Urgent tasks</h3></div>
            {!attentionTasks ? (
              <Unavailable label="Tasks" />
            ) : attentionTasks.length === 0 ? (
              <p className="ux-ops-empty">No unfinished tasks.</p>
            ) : (
              <div className="ux-ops-rows">
                {attentionTasks.map((t) => {
                  const overdue = t.due_at && new Date(t.due_at).getTime() < now;
                  return (
                    <div key={t.id} className="ux-ops-row">
                      <div>
                        <div className="ux-ops-row-top">
                          <StatusMark tone={overdue ? "danger" : ["urgent", "high"].includes(t.priority ?? "") ? "warning" : "neutral"}>
                            {overdue ? "overdue" : t.priority}
                          </StatusMark>
                          <span className="ux-ops-row-name">{t.title}</span>
                        </div>
                        <div className="ux-ops-meta">
                          Client: {clientLabel(t)} · {t.status}
                          {t.due_at && ` · Due ${fmtDate(t.due_at)}`}
                        </div>
                      </div>
                      <Link href="/admin/operations/tasks" className="ux-textbtn">View</Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SUSPENSIONS — case lifecycle + application-level suspended systems */}
      <section className="ux-ops-sec">
        <div className="ux-ops-sec-head">
          <h2 className="ux-ops-sec-title">Suspensions</h2>
          <Link href="/admin/operations/suspensions" className="ux-link">View Suspensions &rarr;</Link>
        </div>
        <p className="ux-ops-meta">
          Controlled service suspension and restoration, with approval and verification.
        </p>
        {!caseCounts ? (
          <Unavailable label="Suspension cases" />
        ) : (
          <div className="ux-ops-stats ux-ops-stats--wide">
            <div className="ux-ops-stat"><span>Pending approval</span><b className={caseCounts.pending_approval > 0 ? "is-warn" : ""}>{caseCounts.pending_approval}</b></div>
            <div className="ux-ops-stat"><span>Approved</span><b>{caseCounts.approved}</b></div>
            <div className="ux-ops-stat"><span>Executing</span><b>{caseCounts.executing}</b></div>
            <div className="ux-ops-stat"><span>Suspended</span><b className={caseCounts.suspended > 0 ? "is-hot" : ""}>{caseCounts.suspended}</b></div>
            <div className="ux-ops-stat"><span>Restoring</span><b>{caseCounts.restoration_pending}</b></div>
          </div>
        )}

        <div className="ux-ops-sub-head" style={{ marginTop: "1.25rem" }}>
          <h3>Systems suspended</h3>
        </div>
        {!suspended ? (
          <Unavailable label="System status" />
        ) : suspended.length === 0 ? (
          <p className="ux-ops-empty">No systems currently suspended at application level.</p>
        ) : (
          <div className="ux-ops-rows">
            {suspended.map((s) => (
              <div key={s.id} className="ux-ops-row">
                <div>
                  <div className="ux-ops-row-top">
                    <StatusMark tone="danger">suspended</StatusMark>
                    <span className="ux-ops-row-name">{s.name}</span>
                  </div>
                  <div className="ux-ops-meta">Suspended {fmtDate(s.suspended_at)}</div>
                </div>
                <Link href="/admin/operations/suspensions" className="ux-textbtn">View</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* INFRASTRUCTURE — backups, renewals, monitoring */}
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
            {!backup ? (
              <Unavailable label="Backup health" />
            ) : (
              <>
                <div className="ux-ops-stats">
                  <div className="ux-ops-stat"><span>Healthy</span><b>{backup.healthy}</b></div>
                  <div className="ux-ops-stat"><span>Due</span><b>{backup.due}</b></div>
                  <div className="ux-ops-stat"><span>Overdue</span><b className={backup.overdue > 0 ? "is-warn" : ""}>{backup.overdue}</b></div>
                  <div className="ux-ops-stat"><span>Failed</span><b className={backup.failed > 0 ? "is-hot" : ""}>{backup.failed}</b></div>
                  <div className="ux-ops-stat"><span>Unverified</span><b className={backup.unverified > 0 ? "is-warn" : ""}>{backup.unverified}</b></div>
                </div>
                <p className="ux-ops-meta" style={{ marginTop: "0.75rem" }}>
                  Last verified evidence: {fmtDate(backup.lastVerifiedAt)}
                  {" · "}Next due: {fmtDate(backup.nextDueAt)}
                </p>
              </>
            )}
          </div>
          <div id="ops-renewals-card">
            <div className="ux-ops-sub-head">
              <h3>Renewals</h3>
              {(isAdmin || isFinanceUser) && (
                <Link href="/admin/finances/provider-costs" className="ux-link">Provider Costs &rarr;</Link>
              )}
            </div>
            {!renewals ? (
              <Unavailable label="Renewals" />
            ) : (
              <div className="ux-ops-stats">
                <div className="ux-ops-stat"><span>Upcoming</span><b>{renewals.upcoming}</b></div>
                <div className="ux-ops-stat"><span>Due (7d)</span><b className={renewals.due > 0 ? "is-warn" : ""}>{renewals.due}</b></div>
                <div className="ux-ops-stat"><span>Overdue</span><b className={renewals.overdue > 0 ? "is-hot" : ""}>{renewals.overdue}</b></div>
              </div>
            )}
          </div>
        </div>

        {canSeeProviderOps && (
          <div style={{ marginTop: "1.25rem" }}>
            <div className="ux-ops-sub-head">
              <h3>Provider monitoring</h3>
              <Link href="/admin/systems/monitoring" className="ux-link">View Monitoring &rarr;</Link>
            </div>
            {!monitoring ? (
              <Unavailable label="Monitoring" />
            ) : (
              <>
                <div className="ux-ops-stats ux-ops-stats--wide">
                  <div className="ux-ops-stat"><span>Enabled schedules</span><b>{monitoring.enabled}</b></div>
                  <div className="ux-ops-stat"><span>Disabled</span><b>{monitoring.disabled}</b></div>
                  <div className="ux-ops-stat">
                    <span>Failing</span>
                    <b className={monitoring.failing > 0 ? "is-hot" : ""}>{monitoring.failing}</b>
                  </div>
                </div>
                <p className="ux-ops-meta" style={{ marginTop: "0.75rem" }}>
                  Last failed run: {fmtDate(monitoring.lastFailedRunAt)}
                  {" · "}Next scheduled: {fmtDate(monitoring.nextRunAt)}
                </p>
              </>
            )}
          </div>
        )}
      </section>

      {/* RECENT ACTIVITY — audit feed, admin only (audit_logs RLS) */}
      {isAdmin && (
        <section className="ux-ops-sec">
          <div className="ux-ops-sec-head">
            <h2 className="ux-ops-sec-title">Recent activity</h2>
          </div>
          {!activityRes?.ok ? (
            <Unavailable label="Activity" />
          ) : activityRes.data.length === 0 ? (
            <p className="ux-ops-empty">No recent operational activity.</p>
          ) : (
            <div className="ux-ops-rows">
              {activityRes.data.map((r) => {
                const item = describeAuditEvent(r);
                return (
                  <div key={item.id} className="ux-ops-row">
                    <div>
                      <div className="ux-ops-row-top">
                        <span className="ux-ops-row-name">{item.label}</span>
                      </div>
                      <div className="ux-ops-meta">
                        {fmtDate(item.at)}{item.detail ? ` · ${item.detail}` : ""}
                      </div>
                    </div>
                    <Link href={item.href} className="ux-textbtn">View</Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
