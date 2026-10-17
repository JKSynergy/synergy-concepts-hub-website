"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DatabaseBackup,
  Search,
  Filter,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Play,
  FileCheck,
  X,
} from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { revealOpsDetail } from "@/components/ux/ops-mobile";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import Link from "next/link";
import {
  sortPoliciesForAttention,
  filterPolicies,
  deriveBackupOpsSummary,
  uncoveredSystems,
} from "@/lib/operations/backups";
import {
  createBackupPolicy,
  updateBackupPolicy,
  setBackupPolicyActive,
  recordBackupEvent,
  recordBackupEvidence,
  verifyBackupEvent,
  markBackupEventInProgress,
} from "@/lib/actions/backups";

export interface BackupPolicyItem {
  id: string;
  client_id: string;
  resource_id: string;
  system_id: string | null;
  service_agreement_id: string | null;
  name: string;
  frequency: "daily" | "weekly" | "monthly" | "custom";
  frequency_interval_days: number | null;
  retention_days: number;
  verification_required: boolean;
  is_active: boolean;
  effective_from: string;
  effective_until: string | null;
  operational_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client?: { id: string; email: string; full_name?: string | null; company_name?: string | null } | null;
  system?: { id: string; name: string; status: string } | null;
  resource?: { id: string; name: string; resource_type: string; status: string } | null;
  service_agreement?: { id: string; name: string; status: string } | null;
  created_by_user?: { id: string; email: string; full_name?: string | null } | null;
  health: "healthy" | "due" | "overdue" | "failed" | "unverified" | "inactive" | "unknown";
  next_due_at: string | null;
  last_completed_at: string | null;
  last_verified_at: string | null;
  last_event_status: string | null;
  last_failed_at: string | null;
  last_failure_reason: string | null;
}

export interface BackupEventItem {
  id: string;
  client_id: string;
  backup_policy_id: string | null;
  resource_id: string;
  system_id: string | null;
  service_agreement_id: string | null;
  status: "expected" | "in_progress" | "successful" | "failed" | "missed" | "verified";
  started_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  recorded_by: string;
  evidence_reference: string | null;
  evidence_notes: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  recorded_by_user?: { id: string; email: string; full_name?: string | null } | null;
  verified_by_user?: { id: string; email: string; full_name?: string | null } | null;
}

export interface ClientOption {
  id: string;
  email: string;
  company_name: string | null;
  full_name: string | null;
}

export interface ResourceOption {
  id: string;
  name: string;
  client_id: string | null;
  system_id: string | null;
  resource_type: string;
  status: string;
}

export interface SystemOption {
  id: string;
  name: string;
  client_id: string;
}

export interface AgreementOption {
  id: string;
  name: string;
  client_id: string;
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
  /** True when a section's query failed — render Unavailable, never a false empty/zero state. */
  policiesUnavailable: boolean;
  healthUnavailable: boolean;
  eventsUnavailable: boolean;
  policies: BackupPolicyItem[];
  events: BackupEventItem[];
  auditTrail: AuditEvent[];
  clients: ClientOption[];
  resources: ResourceOption[];
  systems: SystemOption[];
  agreements: AgreementOption[];
  isAdmin: boolean;
  isFinance: boolean;
  isStaff: boolean;
}

function healthTone(health: string): Tone {
  switch (health) {
    case "healthy":
      return "success";
    case "due":
      return "info";
    case "overdue":
      return "warning";
    case "failed":
      return "danger";
    case "unverified":
      return "warning";
    case "unknown":
      return "neutral";
    case "inactive":
    default:
      return "neutral";
  }
}

function eventStatusTone(status: string): Tone {
  switch (status) {
    case "verified":
      return "success";
    case "successful":
      return "success";
    case "in_progress":
      return "info";
    case "expected":
      return "neutral";
    case "failed":
      return "danger";
    case "missed":
      return "warning";
    default:
      return "neutral";
  }
}

export default function BackupsManager({
  policiesUnavailable,
  healthUnavailable,
  eventsUnavailable,
  policies,
  events,
  auditTrail,
  clients,
  resources,
  systems,
  agreements,
  isAdmin,
  isFinance,
  isStaff,
}: Props) {
  const router = useRouter();

  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(policies[0]?.id || null);
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Policy form fields
  const [policyClientId, setPolicyClientId] = useState<string>("");
  const [policyResourceId, setPolicyResourceId] = useState<string>("");
  const [policyAgreementId, setPolicyAgreementId] = useState<string>("");
  const [policyName, setPolicyName] = useState<string>("");
  const [policyFrequency, setPolicyFrequency] = useState<"daily" | "weekly" | "monthly" | "custom">("daily");
  const [policyIntervalDays, setPolicyIntervalDays] = useState<string>("");
  const [policyRetention, setPolicyRetention] = useState<string>("30");
  const [policyVerification, setPolicyVerification] = useState<boolean>(true);
  const [policyEffectiveFrom, setPolicyEffectiveFrom] = useState<string>("");
  const [policyNotes, setPolicyNotes] = useState<string>("");

  // Event form fields
  const [eventStatus, setEventStatus] = useState<"expected" | "in_progress" | "successful" | "failed" | "missed">("successful");
  const [eventEvidenceRef, setEventEvidenceRef] = useState<string>("");
  const [eventEvidenceNotes, setEventEvidenceNotes] = useState<string>("");
  const [eventFailureReason, setEventFailureReason] = useState<string>("");

  // Evidence dialog state (for existing events)
  const [evidenceEventId, setEvidenceEventId] = useState<string | null>(null);
  const [evidenceRef, setEvidenceRef] = useState<string>("");
  const [evidenceNotes, setEvidenceNotes] = useState<string>("");

  const activePolicy = policies.find((p) => p.id === selectedPolicyId) || policies[0] || null;
  const activePolicyEvents = activePolicy
    ? events.filter(
        (e) => e.backup_policy_id === activePolicy.id || (e.backup_policy_id === null && e.resource_id === activePolicy.resource_id)
      )
    : [];
  const activeAudit = activePolicy
    ? auditTrail.filter(
        (e) => e.record_id === activePolicy.id || activePolicyEvents.some((ev) => ev.id === e.record_id)
      )
    : [];

  const canOperate = isAdmin || isStaff;

  // Options filtered by selected client in the create form
  const availableResources = resources.filter((r) => !policyClientId || r.client_id === policyClientId);
  const availableAgreements = agreements.filter((a) => !policyClientId || a.client_id === policyClientId);

  // Urgency ordering first (failed/overdue/unverified ahead of healthy),
  // then the operator's filters.
  const filteredPolicies = filterPolicies(sortPoliciesForAttention(policies), {
    health: healthFilter,
    clientId: clientFilter,
    systemId: systemFilter,
    query: searchQuery,
  });

  const opsSummary = deriveBackupOpsSummary(policies);
  const noCoverage = uncoveredSystems(systems, policies, resources);

  function resetPolicyForm() {
    setPolicyClientId("");
    setPolicyResourceId("");
    setPolicyAgreementId("");
    setPolicyName("");
    setPolicyFrequency("daily");
    setPolicyIntervalDays("");
    setPolicyRetention("30");
    setPolicyVerification(true);
    setPolicyEffectiveFrom("");
    setPolicyNotes("");
  }

  function openEditModal() {
    if (!activePolicy) return;
    setPolicyClientId(activePolicy.client_id);
    setPolicyResourceId(activePolicy.resource_id);
    setPolicyAgreementId(activePolicy.service_agreement_id || "");
    setPolicyName(activePolicy.name);
    setPolicyFrequency(activePolicy.frequency);
    setPolicyIntervalDays(activePolicy.frequency_interval_days?.toString() || "");
    setPolicyRetention(activePolicy.retention_days.toString());
    setPolicyVerification(activePolicy.verification_required);
    setPolicyEffectiveFrom(activePolicy.effective_from || "");
    setPolicyNotes(activePolicy.operational_notes || "");
    setEditModalOpen(true);
  }

  async function handleCreatePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!policyClientId || !policyResourceId || !policyName.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createBackupPolicy({
      clientId: policyClientId,
      resourceId: policyResourceId,
      serviceAgreementId: policyAgreementId || null,
      name: policyName.trim(),
      frequency: policyFrequency,
      frequencyIntervalDays: policyFrequency === "custom" ? Number(policyIntervalDays) : null,
      retentionDays: Number(policyRetention),
      verificationRequired: policyVerification,
      effectiveFrom: policyEffectiveFrom || null,
      operationalNotes: policyNotes.trim() || null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to create backup policy");
    } else {
      setCreateModalOpen(false);
      resetPolicyForm();
      router.refresh();
      if (res.data?.id) setSelectedPolicyId(res.data.id);
    }
  }

  async function handleEditPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!activePolicy || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await updateBackupPolicy(activePolicy.id, {
      name: policyName.trim(),
      frequency: policyFrequency,
      frequencyIntervalDays: policyFrequency === "custom" ? Number(policyIntervalDays) : null,
      retentionDays: Number(policyRetention),
      verificationRequired: policyVerification,
      effectiveFrom: policyEffectiveFrom || null,
      serviceAgreementId: policyAgreementId || null,
      operationalNotes: policyNotes.trim() || null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to update backup policy");
    } else {
      setEditModalOpen(false);
      router.refresh();
    }
  }

  async function handleToggleActive() {
    if (!activePolicy || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await setBackupPolicyActive(activePolicy.id, !activePolicy.is_active);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to update policy state");
    } else {
      router.refresh();
    }
  }

  async function handleRecordEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!activePolicy || !canOperate) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await recordBackupEvent({
      backupPolicyId: activePolicy.id,
      resourceId: activePolicy.resource_id,
      clientId: activePolicy.client_id,
      status: eventStatus,
      evidenceReference: eventEvidenceRef.trim() || null,
      evidenceNotes: eventEvidenceNotes.trim() || null,
      failureReason: eventStatus === "failed" ? eventFailureReason.trim() : null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to record backup event");
    } else {
      setEventModalOpen(false);
      setEventStatus("successful");
      setEventEvidenceRef("");
      setEventEvidenceNotes("");
      setEventFailureReason("");
      router.refresh();
    }
  }

  function openEvidenceModal(ev: BackupEventItem) {
    setEvidenceEventId(ev.id);
    setEvidenceRef(ev.evidence_reference || "");
    setEvidenceNotes(ev.evidence_notes || "");
    setEvidenceModalOpen(true);
  }

  async function handleRecordEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!evidenceEventId || !canOperate) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await recordBackupEvidence(evidenceEventId, evidenceRef, evidenceNotes);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to record evidence");
    } else {
      setEvidenceModalOpen(false);
      router.refresh();
    }
  }

  async function handleVerifyEvent(ev: BackupEventItem) {
    if (!canOperate) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await verifyBackupEvent(ev.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to verify backup event");
    } else {
      router.refresh();
    }
  }

  async function handleEventInProgress(ev: BackupEventItem) {
    if (!canOperate) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await markBackupEventInProgress(ev.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to update backup event");
    } else {
      router.refresh();
    }
  }

  const policyFormFields = (
    <>
      <div>
        <label className="ux-label">Client *</label>
        <select
          id="select-policy-client"
          value={policyClientId}
          onChange={(e) => {
            setPolicyClientId(e.target.value);
            setPolicyResourceId("");
            setPolicyAgreementId("");
          }}
          required
          className="ux-select"
          style={{ width: "100%" }}
        >
          <option value="">Select client...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name || c.full_name || c.email}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="ux-label">Resource *</label>
        <select
          id="select-policy-resource"
          value={policyResourceId}
          onChange={(e) => setPolicyResourceId(e.target.value)}
          required
          className="ux-select"
          style={{ width: "100%" }}
        >
          <option value="">Select resource...</option>
          {availableResources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.resource_type})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="ux-label">Policy Name *</label>
        <input
          id="input-policy-name"
          type="text"
          required
          placeholder="e.g. Nightly database backup"
          value={policyName}
          onChange={(e) => setPolicyName(e.target.value)}
          className="ux-input"
          style={{ width: "100%" }}
        />
      </div>

      <div className="ops-form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="ux-label">Frequency</label>
          <select
            id="select-policy-frequency"
            value={policyFrequency}
            onChange={(e) => setPolicyFrequency(e.target.value as "daily" | "weekly" | "monthly" | "custom")}
            className="ux-select"
            style={{ width: "100%" }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="ux-label">Retention (days) *</label>
          <input
            id="input-policy-retention"
            type="number"
            min={1}
            required
            value={policyRetention}
            onChange={(e) => setPolicyRetention(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {policyFrequency === "custom" && (
        <div>
          <label className="ux-label">Custom Interval (days) *</label>
          <input
            id="input-policy-interval"
            type="number"
            min={1}
            required
            value={policyIntervalDays}
            onChange={(e) => setPolicyIntervalDays(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
      )}

      <div className="ops-form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="ux-label">Effective From</label>
          <input
            id="input-policy-effective-from"
            type="date"
            value={policyEffectiveFrom}
            onChange={(e) => setPolicyEffectiveFrom(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className="ux-label">Service Agreement</label>
          <select
            id="select-policy-agreement"
            value={policyAgreementId}
            onChange={(e) => setPolicyAgreementId(e.target.value)}
            className="ux-select"
            style={{ width: "100%" }}
          >
            <option value="">None</option>
            {availableAgreements.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          id="input-policy-verification"
          type="checkbox"
          checked={policyVerification}
          onChange={(e) => setPolicyVerification(e.target.checked)}
        />
        <label htmlFor="input-policy-verification" style={{ fontSize: "0.8125rem" }}>
          Verification required — backup events must be verified against this policy
        </label>
      </div>

      <div>
        <label className="ux-label">Operational Notes</label>
        <textarea
          id="input-policy-notes"
          rows={3}
          placeholder="Coverage expectations, restore notes, escalation context..."
          value={policyNotes}
          onChange={(e) => setPolicyNotes(e.target.value)}
          className="ux-input"
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>
    </>
  );

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
          <b>Finance View (Read-Only Context):</b> Backup coverage context for client agreements.
          Policy management and backup event recording are restricted to Operations and Administration.
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
          <b>Staff Operational View:</b> You may record backup events, evidence, and verification.
          Backup policy creation and lifecycle control are restricted to Administrators.
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

      {/* Operational summary — only rendered when its data actually loaded */}
      {!policiesUnavailable && (
        <div className="ux-ops-stats ux-ops-stats--wide" style={{ marginBottom: "0.25rem" }}>
          <div className="ux-ops-stat">
            <span>Needs attention</span>
            <b className={opsSummary.needsAttention > 0 ? "is-hot" : ""}>{opsSummary.needsAttention}</b>
          </div>
          <div className="ux-ops-stat">
            <span>Failed</span>
            <b className={opsSummary.failed > 0 ? "is-hot" : ""}>{opsSummary.failed}</b>
          </div>
          <div className="ux-ops-stat">
            <span>Overdue</span>
            <b className={opsSummary.overdue > 0 ? "is-hot" : ""}>{opsSummary.overdue}</b>
          </div>
          <div className="ux-ops-stat">
            <span>Unverified</span>
            <b className={opsSummary.unverified > 0 ? "is-warn" : ""}>{opsSummary.unverified}</b>
          </div>
          <div className="ux-ops-stat">
            <span>No coverage</span>
            <b className={noCoverage.length > 0 ? "is-warn" : ""}>{noCoverage.length}</b>
          </div>
        </div>
      )}

      {healthUnavailable && (
        <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: 0 }}>
          Health derivation unavailable — policies shown as <b>unknown</b>; this is not a healthy state.{" "}
          <Link href="/admin/operations/backups" className="ux-link">Retry</Link>
        </p>
      )}

      {!policiesUnavailable && noCoverage.length > 0 && (
        <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: 0 }}>
          <b>{noCoverage.length}</b> system{noCoverage.length === 1 ? "" : "s"} with no active backup policy:{" "}
          {noCoverage.slice(0, 6).map((s, i) => (
            <span key={s.id}>
              {i > 0 && ", "}
              <Link href={`/admin/systems/${s.id}`} className="ux-link">{s.name}</Link>
            </span>
          ))}
          {noCoverage.length > 6 && ` +${noCoverage.length - 6} more`}
        </p>
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
              placeholder="Search policies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ux-input"
              style={{ paddingLeft: "2rem", width: "100%", fontSize: "0.8125rem" }}
            />
          </div>

          <div className="ops-filter-group" style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem", maxWidth: "100%" }}
            >
              <option value="all">All Health States</option>
              <option value="healthy">Healthy</option>
              <option value="due">Due</option>
              <option value="overdue">Overdue</option>
              <option value="failed">Failed</option>
              <option value="unverified">Unverified</option>
              <option value="unknown">Unknown</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem", maxWidth: "220px" }}
            >
              <option value="all">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name || c.full_name || c.email}</option>
              ))}
            </select>

            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem", maxWidth: "220px" }}
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
            id="btn-create-policy"
            onClick={() => {
              resetPolicyForm();
              setPolicyClientId(clients[0]?.id || "");
              setCreateModalOpen(true);
            }}
            className="ux-btn ux-btn--primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Plus className="w-4 h-4" />
            <span>New Backup Policy</span>
          </button>
        )}
      </div>

      {/* Main Master-Detail Layout — a failed policy query renders Unavailable, never a false empty list */}
      {policiesUnavailable ? (
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
          Backup policies unavailable — the data source could not be reached.{" "}
          <Link href="/admin/operations/backups" className="ux-link">Retry</Link>
        </div>
      ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px minmax(0, 1fr)",
          gap: "1.25rem",
          alignItems: "start",
        }}
        className="backups-layout"
      >
        {/* Left Column: Policy List */}
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
            <span>Backup Policies ({filteredPolicies.length})</span>
          </div>

          <div className="ops-list-scroll" style={{ maxHeight: "680px", overflowY: "auto" }}>
            {filteredPolicies.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                No backup policies defined.
              </div>
            ) : (
              filteredPolicies.map((p) => {
                const isSelected = p.id === activePolicy?.id;
                return (
                  <div
                    key={p.id}
                    id={`policy-card-${p.id}`}
                    onClick={() => { setSelectedPolicyId(p.id); revealOpsDetail(); }}
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
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{p.name}</span>
                      <div className="ops-marks" style={{ display: "flex", gap: "0.375rem" }}>
                        {!p.is_active && <StatusMark tone="neutral">inactive</StatusMark>}
                        <StatusMark tone={healthTone(p.health)}>{p.health}</StatusMark>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.375rem" }}>
                      {p.client?.company_name || p.client?.email}
                      {p.resource && <span> • {p.resource.name}</span>}
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
                      <span>{p.frequency === "custom" ? `every ${p.frequency_interval_days}d` : p.frequency} • keep {p.retention_days}d</span>
                      {p.last_completed_at && (
                        <span>Last: {new Date(p.last_completed_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Policy Detail & Events */}
        {activePolicy ? (
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
                    <DatabaseBackup className="w-5 h-5 text-indigo-500" />
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                      {activePolicy.name}
                    </h2>
                    <span id="active-policy-health" data-health={activePolicy.health}>
                      <StatusMark tone={healthTone(activePolicy.health)}>{activePolicy.health}</StatusMark>
                    </span>
                    <StatusMark tone={activePolicy.is_active ? "info" : "neutral"}>
                      {activePolicy.is_active ? "active" : "inactive"}
                    </StatusMark>
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                    Client: <b>{activePolicy.client?.company_name || activePolicy.client?.email}</b>
                    {activePolicy.system && (
                      <span>
                        {" • System: "}
                        <Link href={`/admin/systems/${activePolicy.system.id}`} className="ux-link">
                          <b>{activePolicy.system.name}</b>
                        </Link>
                        {activePolicy.system.status === "suspended" && (
                          <span> (<StatusMark tone="neutral">commercially suspended</StatusMark>)</span>
                        )}
                      </span>
                    )}
                    {activePolicy.resource && <span> • Resource: <b>{activePolicy.resource.name}</b></span>}
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {isAdmin && (
                    <button
                      id="btn-edit-policy"
                      onClick={openEditModal}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Policy</span>
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      id="btn-toggle-policy"
                      onClick={handleToggleActive}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ color: activePolicy.is_active ? "var(--ux-danger)" : "var(--ux-success)" }}
                    >
                      {activePolicy.is_active ? (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Activate</span>
                        </>
                      )}
                    </button>
                  )}

                  {canOperate && activePolicy.is_active && (
                    <button
                      id="btn-record-event"
                      onClick={() => {
                        setEventStatus("successful");
                        setEventEvidenceRef("");
                        setEventEvidenceNotes("");
                        setEventFailureReason("");
                        setEventModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Record Backup Event</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Policy Metadata Grid */}
              <div
                style={{
                  marginTop: "1.25rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.875rem",
                  fontSize: "0.8125rem",
                  padding: "0.875rem",
                  background: "var(--surface)",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                }}
              >
                <div>
                  <span className="ux-muted">Frequency:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activePolicy.frequency === "custom" ? `Every ${activePolicy.frequency_interval_days} days` : activePolicy.frequency}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Retention:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>{activePolicy.retention_days} days</div>
                </div>
                <div>
                  <span className="ux-muted">Verification:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activePolicy.verification_required ? "Required" : "Not required"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Effective Window:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {new Date(activePolicy.effective_from).toLocaleDateString()} →{" "}
                    {activePolicy.effective_until ? new Date(activePolicy.effective_until).toLocaleDateString() : "open"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Last Successful Backup:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activePolicy.last_completed_at ? new Date(activePolicy.last_completed_at).toLocaleString() : "None recorded"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Last Verified:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activePolicy.last_verified_at ? new Date(activePolicy.last_verified_at).toLocaleString() : "—"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Next Due:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activePolicy.next_due_at ? new Date(activePolicy.next_due_at).toLocaleString() : "—"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Restore Test:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    Not tracked
                  </div>
                  <span className="ux-muted" style={{ fontSize: "0.6875rem" }}>
                    Verification confirms recorded evidence, not restorability.
                  </span>
                </div>
                {activePolicy.last_failure_reason && (
                  <div>
                    <span className="ux-muted">Last Failure:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem", color: "var(--ux-danger)" }}>
                      {activePolicy.last_failure_reason}
                    </div>
                  </div>
                )}
              </div>

              {activePolicy.service_agreement && (
                <div style={{ marginTop: "0.875rem", fontSize: "0.8125rem" }}>
                  <span style={{ background: "var(--surface)", padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid var(--border)", display: "inline-block" }}>
                    <span className="ux-muted">Coverage under agreement:</span> <b>{activePolicy.service_agreement.name}</b>
                  </span>
                </div>
              )}

              {activePolicy.operational_notes && (
                <div style={{ marginTop: "1rem" }}>
                  <span className="ux-muted" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Operational Notes:</span>
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
                    {activePolicy.operational_notes}
                  </div>
                </div>
              )}
            </div>

            {/* Backup Events */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "var(--card)",
                overflow: "hidden",
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
                <span>Backup events{eventsUnavailable ? "" : ` (${activePolicyEvents.length})`}</span>
              </div>

              {eventsUnavailable ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                  Events unavailable — the data source could not be reached.{" "}
                  <Link href="/admin/operations/backups" className="ux-link">Retry</Link>
                </div>
              ) : activePolicyEvents.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                  No backup events recorded for this resource.
                </div>
              ) : (
                <div>
                  {activePolicyEvents.map((ev) => (
                    <div
                      key={ev.id}
                      id={`event-card-${ev.id}`}
                      data-event-status={ev.status}
                      style={{
                        padding: "0.75rem 1rem",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <StatusMark tone={eventStatusTone(ev.status)}>{ev.status}</StatusMark>
                          {ev.evidence_reference || ev.evidence_notes ? (
                            <StatusMark tone="info">evidence</StatusMark>
                          ) : (
                            <span className="ux-muted" style={{ fontSize: "0.6875rem" }}>no evidence</span>
                          )}
                          {ev.status === "failed" && ev.failure_reason && (
                            <span style={{ fontSize: "0.75rem", color: "var(--ux-danger)" }}>{ev.failure_reason}</span>
                          )}
                        </div>
                        <div className="ux-muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
                          {ev.completed_at ? `Completed ${new Date(ev.completed_at).toLocaleString()}` : `Recorded ${new Date(ev.created_at).toLocaleString()}`}
                          {ev.recorded_by_user && ` • by ${ev.recorded_by_user.full_name || ev.recorded_by_user.email}`}
                          {ev.verified_at && ` • verified ${new Date(ev.verified_at).toLocaleString()}${ev.verified_by_user ? ` by ${ev.verified_by_user.full_name || ev.verified_by_user.email}` : ""}`}
                        </div>
                        {ev.evidence_reference && (
                          <div className="ux-muted" style={{ fontSize: "0.75rem", marginTop: "0.125rem" }}>
                            Evidence: {ev.evidence_reference}
                          </div>
                        )}
                      </div>

                      {canOperate && (
                        <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                          {ev.status === "expected" && (
                            <button
                              id={`btn-start-event-${ev.id}`}
                              onClick={() => handleEventInProgress(ev)}
                              disabled={isSubmitting}
                              className="ux-btn ux-btn--secondary ux-btn--sm"
                            >
                              Mark In Progress
                            </button>
                          )}
                          {(ev.status === "successful" || ev.status === "verified" || ev.status === "failed") && (
                            <button
                              id={`btn-evidence-event-${ev.id}`}
                              onClick={() => openEvidenceModal(ev)}
                              disabled={isSubmitting}
                              className="ux-btn ux-btn--secondary ux-btn--sm"
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>Evidence</span>
                            </button>
                          )}
                          {ev.status === "successful" && (
                            <button
                              id={`btn-verify-event-${ev.id}`}
                              onClick={() => handleVerifyEvent(ev)}
                              disabled={isSubmitting}
                              className="ux-btn ux-btn--primary ux-btn--sm"
                            >
                              Verify
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity / Audit History */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "var(--card)",
                padding: "1.25rem",
              }}
            >
              <span className="ux-muted" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Activity History:</span>
              {isAdmin ? (
                activeAudit.length > 0 ? (
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
                    {activeAudit.map((e) => (
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
                    No audit events recorded for this policy.
                  </div>
                )
              ) : (
                <div className="ux-muted" style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}>
                  Activity history is recorded and visible to administrators.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "4px" }}>
            Select a backup policy from the list{isAdmin ? " or create a new one" : ""}.
          </div>
        )}
      </div>
      )}

      {/* Create Policy Modal */}
      {createModalOpen && (
        <Dialog onClose={() => setCreateModalOpen(false)} labelledBy="dialog-create-policy-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-create-policy-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              New Backup Policy
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Define expected backup cadence, retention, and verification for a client resource.
            </p>
            <form onSubmit={handleCreatePolicy} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {policyFormFields}
              <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setCreateModalOpen(false)} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button id="submit-create-policy" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
                  {isSubmitting ? "Creating..." : "Create Policy"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Edit Policy Modal */}
      {editModalOpen && (
        <Dialog onClose={() => setEditModalOpen(false)} labelledBy="dialog-edit-policy-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-edit-policy-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Edit Backup Policy
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Update the policy. The resource and client bindings are fixed once created.
            </p>
            <form onSubmit={handleEditPolicy} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {policyFormFields}
              <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setEditModalOpen(false)} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button id="submit-edit-policy" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
                  {isSubmitting ? "Saving..." : "Save Policy"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Record Backup Event Modal */}
      {eventModalOpen && activePolicy && (
        <Dialog onClose={() => setEventModalOpen(false)} labelledBy="dialog-record-event-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-record-event-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Record Backup Event
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Record evidence of a backup for <b>{activePolicy.resource?.name || "this resource"}</b>. This records an
              event — it does not execute a backup.
            </p>
            <form onSubmit={handleRecordEvent} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="ux-label">Outcome</label>
                <select
                  id="select-event-status"
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value as typeof eventStatus)}
                  className="ux-select"
                  style={{ width: "100%" }}
                >
                  <option value="expected">Expected (scheduled occurrence)</option>
                  <option value="in_progress">In Progress</option>
                  <option value="successful">Successful</option>
                  <option value="failed">Failed</option>
                  <option value="missed">Missed (expected occurrence did not happen)</option>
                </select>
              </div>

              {eventStatus === "failed" && (
                <div>
                  <label className="ux-label">Failure Reason *</label>
                  <input
                    id="input-event-failure"
                    type="text"
                    required
                    placeholder="e.g. Provider snapshot timed out"
                    value={eventFailureReason}
                    onChange={(e) => setEventFailureReason(e.target.value)}
                    className="ux-input"
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              <div>
                <label className="ux-label">Evidence Reference</label>
                <input
                  id="input-event-evidence-ref"
                  type="text"
                  placeholder="Snapshot id, filename, or storage location reference (no secrets)"
                  value={eventEvidenceRef}
                  onChange={(e) => setEventEvidenceRef(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label className="ux-label">Evidence Notes</label>
                <textarea
                  id="input-event-evidence-notes"
                  rows={3}
                  placeholder="Manual verification notes, where the evidence can be found..."
                  value={eventEvidenceNotes}
                  onChange={(e) => setEventEvidenceNotes(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>

              <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setEventModalOpen(false)} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button id="submit-record-event" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
                  {isSubmitting ? "Recording..." : "Record Event"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Record Evidence Modal */}
      {evidenceModalOpen && (
        <Dialog onClose={() => setEvidenceModalOpen(false)} labelledBy="dialog-evidence-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-evidence-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Record Evidence
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Attach an evidence reference to this backup event. References only — never credentials.
            </p>
            <form onSubmit={handleRecordEvidence} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="ux-label">Evidence Reference</label>
                <input
                  id="input-evidence-ref"
                  type="text"
                  placeholder="Snapshot id, filename, or storage location reference"
                  value={evidenceRef}
                  onChange={(e) => setEvidenceRef(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label className="ux-label">Evidence Notes</label>
                <textarea
                  id="input-evidence-notes"
                  rows={3}
                  placeholder="How the backup was verified, where the evidence lives..."
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
              <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setEvidenceModalOpen(false)} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button id="submit-evidence" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
                  {isSubmitting ? "Saving..." : "Save Evidence"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}
