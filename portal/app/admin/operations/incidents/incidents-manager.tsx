"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  User,
  Search,
  Filter,
  ShieldAlert,
  Check,
  X,
  Eye,
  Activity,
} from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { revealOpsDetail } from "@/components/ux/ops-mobile";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import Link from "next/link";
import { sortIncidentsForWork, filterIncidents } from "@/lib/operations/incidents";
import {
  createIncident,
  assignIncident,
  acknowledgeIncident,
  investigateIncident,
  monitorIncident,
  resolveIncident,
  closeIncident,
  cancelIncident,
} from "@/lib/actions/operations";

export interface IncidentItem {
  id: string;
  client_id: string;
  system_id: string | null;
  resource_id: string | null;
  service_agreement_id: string | null;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "investigating" | "monitoring" | "resolved" | "closed" | "cancelled";
  reported_by: string;
  assigned_to: string | null;
  opened_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  client?: { id: string; email: string; full_name?: string | null; company_name?: string | null } | null;
  system?: { id: string; name: string; status: string } | null;
  resource?: { id: string; name: string; resource_type: string; status: string } | null;
  service_agreement?: { id: string; name: string; status: string } | null;
  assigned_staff?: { id: string; email: string; full_name?: string | null } | null;
  reported_by_user?: { id: string; email: string; full_name?: string | null } | null;
}

export interface ClientOption {
  id: string;
  email: string;
  company_name: string | null;
  full_name: string | null;
}

export interface SystemOption {
  id: string;
  name: string;
  client_id: string;
}

export interface ResourceOption {
  id: string;
  name: string;
  client_id: string;
  system_id: string | null;
}

export interface AgreementOption {
  id: string;
  name: string;
  client_id: string;
}

export interface StaffOption {
  id: string;
  label: string;
  role: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  record_id: string | null;
  created_at: string;
  actor?: { full_name?: string | null; email?: string | null } | null;
}

interface Props {
  currentUserId: string;
  /** True when the incidents query failed — render Unavailable, never an empty list. */
  incidentsUnavailable: boolean;
  incidents: IncidentItem[];
  auditTrail: AuditEvent[];
  clients: ClientOption[];
  systems: SystemOption[];
  resources: ResourceOption[];
  agreements: AgreementOption[];
  staffOptions: StaffOption[];
  isAdmin: boolean;
  isFinance: boolean;
  isStaff: boolean;
}

function incidentStatusTone(status: string): Tone {
  switch (status) {
    case "closed":
      return "success";
    case "resolved":
      return "info";
    case "investigating":
    case "monitoring":
    case "acknowledged":
      return "warning";
    case "open":
      return "danger";
    case "cancelled":
    default:
      return "neutral";
  }
}

function incidentSeverityTone(severity: string): Tone {
  switch (severity) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    case "medium":
      return "info";
    case "low":
    default:
      return "neutral";
  }
}

export default function IncidentsManager({
  currentUserId,
  incidentsUnavailable,
  incidents,
  auditTrail,
  clients,
  systems,
  resources,
  agreements,
  staffOptions,
  isAdmin,
  isFinance,
  isStaff,
}: Props) {
  const router = useRouter();

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(incidents[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New incident fields
  const [incClientId, setIncClientId] = useState<string>("");
  const [incSystemId, setIncSystemId] = useState<string>("");
  const [incResourceId, setIncResourceId] = useState<string>("");
  const [incAgreementId, setIncAgreementId] = useState<string>("");
  const [incTitle, setIncTitle] = useState<string>("");
  const [incDesc, setIncDesc] = useState<string>("");
  const [incSeverity, setIncSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [incAssignedTo, setIncAssignedTo] = useState<string>("");

  // Action input states
  const [newAssignedTo, setNewAssignedTo] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [closeNotes, setCloseNotes] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");

  const activeIncident = incidents.find((i) => i.id === selectedIncidentId) || incidents[0] || null;
  const activeIncidentAudit = activeIncident ? auditTrail.filter((e) => e.record_id === activeIncident.id) : [];

  // Filtered dropdowns based on client
  const availableSystems = systems.filter((s) => !incClientId || s.client_id === incClientId);
  const availableResources = resources.filter((r) => !incClientId || r.client_id === incClientId);
  const availableAgreements = agreements.filter((a) => !incClientId || a.client_id === incClientId);

  // Urgency ordering first (unresolved by severity/age, terminal last), then filters
  const filteredIncidents = filterIncidents(sortIncidentsForWork(incidents), {
    status: statusFilter,
    severity: severityFilter,
    systemId: systemFilter,
    query: searchQuery,
  });

  // Permission helpers
  const isAssignedToMe = activeIncident?.assigned_to === currentUserId;
  const canUpdateActiveIncident = isAdmin || (isStaff && (isAssignedToMe || !activeIncident?.assigned_to));

  // Handlers
  async function handleCreateIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!incClientId || !incTitle.trim() || !incDesc.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createIncident({
      clientId: incClientId,
      systemId: incSystemId || null,
      resourceId: incResourceId || null,
      serviceAgreementId: incAgreementId || null,
      title: incTitle.trim(),
      description: incDesc.trim(),
      severity: incSeverity,
      assignedTo: incAssignedTo || null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to create incident");
    } else {
      setCreateModalOpen(false);
      setIncTitle("");
      setIncDesc("");
      setIncClientId("");
      setIncSystemId("");
      setIncResourceId("");
      setIncAgreementId("");
      setIncAssignedTo("");
      router.refresh();
      if (res.data?.id) setSelectedIncidentId(res.data.id);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!activeIncident || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await assignIncident(activeIncident.id, newAssignedTo || null);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to assign incident");
    } else {
      setAssignModalOpen(false);
      router.refresh();
    }
  }

  async function handleAcknowledge() {
    if (!activeIncident || !canUpdateActiveIncident) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await acknowledgeIncident(activeIncident.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to acknowledge incident");
    } else {
      router.refresh();
    }
  }

  async function handleInvestigate() {
    if (!activeIncident || !canUpdateActiveIncident) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await investigateIncident(activeIncident.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to mark investigating");
    } else {
      router.refresh();
    }
  }

  async function handleMonitor() {
    if (!activeIncident || !canUpdateActiveIncident) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await monitorIncident(activeIncident.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to mark monitoring");
    } else {
      router.refresh();
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    if (!activeIncident || !canUpdateActiveIncident) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await resolveIncident(activeIncident.id, resolutionNotes);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to resolve incident");
    } else {
      setResolveModalOpen(false);
      setResolutionNotes("");
      router.refresh();
    }
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!activeIncident || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await closeIncident(activeIncident.id, closeNotes);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to close incident");
    } else {
      setCloseModalOpen(false);
      setCloseNotes("");
      router.refresh();
    }
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!activeIncident || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await cancelIncident(activeIncident.id, cancelReason);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to cancel incident");
    } else {
      setCancelModalOpen(false);
      setCancelReason("");
      router.refresh();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {isFinance && (
        <div
          id="finance-context-banner"
          style={{
            padding: "0.75rem 1rem",
            background: "var(--ux-info-bg)",
            border: "1px solid var(--ux-info-line)",
            color: "var(--ux-info)",
            borderRadius: "4px",
            fontSize: "0.8125rem",
          }}
        >
          <b>Finance View (Read-Only Context):</b> You have access to review operational incidents to assess
          service health and SLA context. Incident reporting, triage, and resolution are restricted to Operations and Administration.
        </div>
      )}

      {isStaff && !isAdmin && (
        <div
          id="staff-operational-banner"
          style={{
            padding: "0.75rem 1rem",
            background: "var(--ux-success-bg)",
            border: "1px solid var(--ux-success-line)",
            color: "var(--ux-success)",
            borderRadius: "4px",
            fontSize: "0.8125rem",
          }}
        >
          <b>Staff Operational View:</b> You may acknowledge, investigate, monitor, and resolve incidents.
          Incident closure and cancellation are restricted to Administrators.
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--ux-danger-bg)",
            border: "1px solid var(--ux-danger-line)",
            color: "var(--ux-danger)",
            borderRadius: "4px",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ux-danger)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Header & Filters */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div className="ops-filters" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="ops-search" style={{ position: "relative", minWidth: "220px" }}>
            <Search className="w-4 h-4 text-muted-foreground" style={{ position: "absolute", left: "0.625rem", top: "0.625rem" }} />
            <input
              type="text"
              placeholder="Search incidents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ux-input"
              style={{ paddingLeft: "2rem", width: "100%", fontSize: "0.8125rem" }}
            />
          </div>

          <div className="ops-filter-group" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="investigating">Investigating</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>

            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Systems</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {isAdmin && (
          <button
            id="btn-create-incident"
            onClick={() => {
              setIncClientId(clients[0]?.id || "");
              setCreateModalOpen(true);
            }}
            className="ux-btn ux-btn--primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Plus className="w-4 h-4" />
            <span>Report Incident</span>
          </button>
        )}
      </div>

      {/* Main Master-Detail Layout — a failed query renders Unavailable, never a false empty list */}
      {incidentsUnavailable ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "4px",
            padding: "2.5rem",
            textAlign: "center",
            color: "var(--muted-foreground)",
            fontSize: "0.8125rem",
          }}
        >
          Incidents unavailable — the data source could not be reached.{" "}
          <Link href="/admin/operations/incidents" className="ux-link">Retry</Link>
        </div>
      ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px minmax(0, 1fr)",
          gap: "1.25rem",
          alignItems: "start",
        }}
        className="incident-layout"
      >
        {/* Left Column: Incident List */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--card)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              fontWeight: 600,
              fontSize: "0.8125rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Incidents ({filteredIncidents.length})</span>
          </div>

          <div className="ops-list-scroll" style={{ maxHeight: "680px", overflowY: "auto" }}>
            {filteredIncidents.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                No operational incidents found.
              </div>
            ) : (
              filteredIncidents.map((i) => {
                const isSelected = i.id === activeIncident?.id;
                return (
                  <div
                    key={i.id}
                    id={`incident-card-${i.id}`}
                    onClick={() => { setSelectedIncidentId(i.id); revealOpsDetail(); }}
                    style={{
                      padding: "0.875rem 1rem",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: isSelected ? "var(--surface)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--primary, #000)" : "3px solid transparent",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <div className="ops-card-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{i.title}</span>
                      <div className="ops-marks" style={{ display: "flex", gap: "0.375rem" }}>
                        <StatusMark tone={incidentSeverityTone(i.severity)}>{i.severity}</StatusMark>
                        <StatusMark tone={incidentStatusTone(i.status)}>{i.status}</StatusMark>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.375rem" }}>
                      {i.client?.company_name || i.client?.email}
                      {i.system && <span> • {i.system.name}</span>}
                      {i.system?.status === "suspended" && (
                        <StatusMark tone="neutral">commercially suspended</StatusMark>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.75rem",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      <span>
                        {i.assigned_staff ? `Assigned: ${i.assigned_staff.full_name || i.assigned_staff.email.split("@")[0]}` : "Unassigned"}
                      </span>
                      <span>Opened: {new Date(i.opened_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Incident Detail & Triage */}
        {activeIncident ? (
          <div className="ops-detail" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Header Card */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "var(--card)",
                padding: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div className="ops-detail-title" style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem" }}>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                      {activeIncident.title}
                    </h2>
                    <span id="active-incident-status" data-status={activeIncident.status}>
                      <StatusMark tone={incidentStatusTone(activeIncident.status)}>{activeIncident.status}</StatusMark>
                    </span>
                    <StatusMark tone={incidentSeverityTone(activeIncident.severity)}>{activeIncident.severity}</StatusMark>
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                    Client: <b>{activeIncident.client?.company_name || activeIncident.client?.email}</b>
                    {activeIncident.system && (
                      <span>
                        {" • System: "}
                        <Link href={`/admin/systems/${activeIncident.system.id}`} className="ux-link">
                          <b>{activeIncident.system.name}</b>
                        </Link>
                        {activeIncident.system.status === "suspended" && (
                          <span> (<StatusMark tone="neutral">commercially suspended</StatusMark>)</span>
                        )}
                      </span>
                    )}
                    {activeIncident.resource && <span> • Resource: <b>{activeIncident.resource.name}</b></span>}
                  </div>
                  {activeIncident.system?.status === "suspended" && (
                    <div className="ux-muted" style={{ fontSize: "0.75rem", marginTop: "0.375rem" }}>
                      Commercial suspension is a billing/contract state — it is not evidence of an infrastructure outage.
                    </div>
                  )}
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {isAdmin && (
                    <button
                      id="btn-assign-incident"
                      onClick={() => {
                        setNewAssignedTo(activeIncident.assigned_to || "");
                        setAssignModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>{activeIncident.assigned_to ? "Reassign" : "Assign"}</span>
                    </button>
                  )}

                  {canUpdateActiveIncident && activeIncident.status === "open" && (
                    <button
                      id="btn-ack-incident"
                      onClick={handleAcknowledge}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Acknowledge</span>
                    </button>
                  )}

                  {canUpdateActiveIncident && (activeIncident.status === "acknowledged" || activeIncident.status === "monitoring") && (
                    <button
                      id="btn-investigate-incident"
                      onClick={handleInvestigate}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Investigate</span>
                    </button>
                  )}

                  {canUpdateActiveIncident && activeIncident.status === "investigating" && (
                    <button
                      id="btn-monitor-incident"
                      onClick={handleMonitor}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Monitor</span>
                    </button>
                  )}

                  {canUpdateActiveIncident && (activeIncident.status === "investigating" || activeIncident.status === "monitoring" || activeIncident.status === "acknowledged") && (
                    <button
                      id="btn-resolve-incident"
                      onClick={() => {
                        setResolutionNotes("");
                        setResolveModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Resolved</span>
                    </button>
                  )}

                  {isAdmin && activeIncident.status === "resolved" && (
                    <button
                      id="btn-close-incident"
                      onClick={() => {
                        setCloseNotes("");
                        setCloseModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Close Incident</span>
                    </button>
                  )}

                  {isAdmin && !["closed", "cancelled"].includes(activeIncident.status) && (
                    <button
                      id="btn-cancel-incident"
                      onClick={() => {
                        setCancelReason("");
                        setCancelModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Status progression */}
              <div className="ux-muted" style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.8125rem" }}>
                <span style={{ fontWeight: activeIncident.status === "open" ? 700 : 400, color: activeIncident.status === "open" ? "var(--ux-strong)" : undefined }}>Open</span>
                <span>→</span>
                <span style={{ fontWeight: activeIncident.status === "acknowledged" ? 700 : 400, color: activeIncident.status === "acknowledged" ? "var(--ux-strong)" : undefined }}>Acknowledged</span>
                <span>→</span>
                <span style={{ fontWeight: ["investigating", "monitoring"].includes(activeIncident.status) ? 700 : 400, color: ["investigating", "monitoring"].includes(activeIncident.status) ? "var(--ux-strong)" : undefined }}>Investigation</span>
                <span>→</span>
                <span style={{ fontWeight: activeIncident.status === "resolved" ? 700 : 400, color: activeIncident.status === "resolved" ? "var(--ux-strong)" : undefined }}>Resolved</span>
                <span>→</span>
                <span style={{ fontWeight: activeIncident.status === "closed" ? 700 : 400, color: activeIncident.status === "closed" ? "var(--ux-strong)" : undefined }}>Closed</span>
              </div>

              {/* Incident Metadata Grid */}
              <div
                style={{
                  marginTop: "1.25rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "0.875rem",
                  fontSize: "0.8125rem",
                  padding: "0.875rem",
                  background: "var(--surface)",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                }}
              >
                <div>
                  <span className="ux-muted">Reported By:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeIncident.reported_by_user?.full_name || activeIncident.reported_by_user?.email}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Assigned Engineer:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeIncident.assigned_staff?.full_name || activeIncident.assigned_staff?.email || "Unassigned"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Opened At:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {new Date(activeIncident.opened_at).toLocaleString()}
                  </div>
                </div>
                {activeIncident.acknowledged_at && (
                  <div>
                    <span className="ux-muted">Acknowledged At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                      {new Date(activeIncident.acknowledged_at).toLocaleString()}
                    </div>
                  </div>
                )}
                {activeIncident.resolved_at && (
                  <div>
                    <span className="ux-muted">Resolved At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem", color: "var(--ux-success)" }}>
                      {new Date(activeIncident.resolved_at).toLocaleString()}
                    </div>
                  </div>
                )}
                {activeIncident.closed_at && (
                  <div>
                    <span className="ux-muted">Closed At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem", color: "var(--ux-info)" }}>
                      {new Date(activeIncident.closed_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div style={{ marginTop: "1.25rem" }}>
                <span className="ux-muted" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Problem Description:</span>
                <div
                  style={{
                    marginTop: "0.375rem",
                    padding: "0.875rem",
                    background: "var(--surface)",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {activeIncident.description}
                </div>
              </div>

              {/* Resolution Notes */}
              {activeIncident.resolution_notes && (
                <div style={{ marginTop: "1.25rem" }}>
                  <span className="ux-muted" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Resolution Summary:</span>
                  <div
                    style={{
                      marginTop: "0.375rem",
                      padding: "0.875rem",
                      background: "var(--ux-success-bg)",
                      border: "1px solid var(--ux-success-line)",
                      borderRadius: "4px",
                      fontSize: "0.8125rem",
                      color: "var(--ux-success)",
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {activeIncident.resolution_notes}
                  </div>
                </div>
              )}

              {/* Operational / Audit History */}
              <div style={{ marginTop: "1.25rem" }}>
                <span className="ux-muted" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Activity History:</span>
                {isAdmin ? (
                  activeIncidentAudit.length > 0 ? (
                    <div
                      style={{
                        marginTop: "0.375rem",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        background: "var(--surface)",
                        maxHeight: "220px",
                        overflowY: "auto",
                      }}
                    >
                      {activeIncidentAudit.map((e) => (
                        <div
                          key={e.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.5rem 0.875rem",
                            borderBottom: "1px solid var(--border)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{e.action}</span>
                          <span className="ux-muted" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            {e.actor?.full_name || e.actor?.email || "system"} •{" "}
                            {new Date(e.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ux-muted" style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}>
                      No audit events recorded for this incident.
                    </div>
                  )
                ) : (
                  <div className="ux-muted" style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}>
                    Activity history is recorded and visible to administrators.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "4px" }}>
            Select an incident from the list or report a new one.
          </div>
        )}
      </div>
      )}

      {/* Report Incident Modal */}
      {createModalOpen && (
        <Dialog onClose={() => setCreateModalOpen(false)} labelledBy="dialog-create-incident-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-create-incident-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Report Operational Incident
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Record an operational technical issue affecting client infrastructure.
            </p>
            <form onSubmit={handleCreateIncident} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Client *</label>
            <select
              id="select-incident-client"
              value={incClientId}
              onChange={(e) => {
                setIncClientId(e.target.value);
                setIncSystemId("");
                setIncResourceId("");
                setIncAgreementId("");
              }}
              required
              className="ux-select"
              style={{ width: "100%" }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name || c.full_name || c.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ux-label">Title *</label>
            <input
              id="input-incident-title"
              type="text"
              required
              placeholder="e.g. Database connection pool exhaustion"
              value={incTitle}
              onChange={(e) => setIncTitle(e.target.value)}
              className="ux-input"
              style={{ width: "100%" }}
            />
          </div>

          <div className="ops-form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="ux-label">Severity</label>
              <select
                id="select-incident-severity"
                value={incSeverity}
                onChange={(e) => setIncSeverity(e.target.value as "low" | "medium" | "high" | "critical")}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="ux-label">Assignee</label>
              <select
                id="select-incident-assignee"
                value={incAssignedTo}
                onChange={(e) => setIncAssignedTo(e.target.value)}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">Unassigned</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ops-form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="ux-label">System (Optional)</label>
              <select
                id="select-incident-system"
                value={incSystemId}
                onChange={(e) => setIncSystemId(e.target.value)}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">None</option>
                {availableSystems.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="ux-label">Resource (Optional)</label>
              <select
                id="select-incident-resource"
                value={incResourceId}
                onChange={(e) => setIncResourceId(e.target.value)}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">None</option>
                {availableResources.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="ux-label">Problem Description *</label>
            <textarea
              id="input-incident-desc"
              required
              rows={3}
              placeholder="Symptoms, affected components, and preliminary observations..."
              value={incDesc}
              onChange={(e) => setIncDesc(e.target.value)}
              className="ux-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="ux-btn ux-btn--secondary"
            >
              Cancel
            </button>
            <button
              id="submit-create-incident"
              type="submit"
              disabled={isSubmitting}
              className="ux-btn ux-btn--primary"
            >
              {isSubmitting ? "Submitting..." : "Report Incident"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Assign Incident Modal */}
      {assignModalOpen && (
        <Dialog onClose={() => setAssignModalOpen(false)} labelledBy="dialog-assign-incident-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-assign-incident-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Assign Operational Incident
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Select an engineer responsible for leading triage and resolution.
            </p>
            <form onSubmit={handleAssign} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Lead Engineer</label>
            <select
              id="select-incident-lead"
              value={newAssignedTo}
              onChange={(e) => setNewAssignedTo(e.target.value)}
              className="ux-select"
              style={{ width: "100%" }}
            >
              <option value="">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.role})
                </option>
              ))}
            </select>
          </div>
          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button type="button" onClick={() => setAssignModalOpen(false)} className="ux-btn ux-btn--secondary">
              Cancel
            </button>
            <button id="submit-assign-incident" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
              {isSubmitting ? "Saving..." : "Save Assignment"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Resolve Incident Modal */}
      {resolveModalOpen && (
        <Dialog onClose={() => setResolveModalOpen(false)} labelledBy="dialog-resolve-incident-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-resolve-incident-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Resolve Incident
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Record resolution details and corrective actions taken.
            </p>
            <form onSubmit={handleResolve} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Resolution Summary</label>
            <textarea
              id="input-resolve-notes"
              required
              rows={3}
              placeholder="e.g. Restarted connection pooler and increased max connections pool limit..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              className="ux-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button type="button" onClick={() => setResolveModalOpen(false)} className="ux-btn ux-btn--secondary">
              Cancel
            </button>
            <button id="submit-resolve-incident" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
              {isSubmitting ? "Submitting..." : "Confirm Resolution"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Close Incident Modal */}
      {closeModalOpen && (
        <Dialog onClose={() => setCloseModalOpen(false)} labelledBy="dialog-close-incident-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-close-incident-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Close Incident
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Confirm post-incident verification and formally close this record.
            </p>
            <form onSubmit={handleClose} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Final Closing Notes (Optional)</label>
            <textarea
              id="input-close-notes"
              rows={3}
              placeholder="Final verification notes or post-mortem references..."
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className="ux-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button type="button" onClick={() => setCloseModalOpen(false)} className="ux-btn ux-btn--secondary">
              Cancel
            </button>
            <button id="submit-close-incident" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
              {isSubmitting ? "Submitting..." : "Close Incident"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Cancel Incident Modal */}
      {cancelModalOpen && (
        <Dialog onClose={() => setCancelModalOpen(false)} labelledBy="dialog-cancel-incident-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-cancel-incident-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Cancel Incident
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Record reason for cancelling this incident report.
            </p>
            <form onSubmit={handleCancel} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Cancellation Reason</label>
            <textarea
              id="input-cancel-reason"
              required
              rows={3}
              placeholder="e.g. Duplicate report or false alarm..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="ux-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button type="button" onClick={() => setCancelModalOpen(false)} className="ux-btn ux-btn--secondary">
              Close
            </button>
            <button id="submit-cancel-incident" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--danger">
              {isSubmitting ? "Submitting..." : "Confirm Cancellation"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}
