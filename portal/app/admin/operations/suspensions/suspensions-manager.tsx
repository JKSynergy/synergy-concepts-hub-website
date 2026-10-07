"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  createSuspensionCase,
  approveSuspensionCase,
  rejectSuspensionCase,
  assignSuspensionCase,
  startCaseExecution,
  executeSuspensionCase,
  addSuspensionAction,
  completeSuspensionAction,
  verifySuspensionAction,
  verifySuspensionCase,
  initiateCaseRestoration,
  completeCaseRestoration,
  cancelSuspensionCase,
} from "@/lib/actions/suspensions";
import {
  suspendApplication,
  resumeApplication,
} from "@/lib/actions/application-suspension";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Plus,
  ArrowRight,
  Check,
  X,
  RotateCcw,
  FileText,
  Search,
} from "lucide-react";

export interface SuspensionCaseItem {
  id: string;
  service_agreement_id: string;
  client_id: string;
  system_id: string | null;
  reason: string;
  status: string;
  requested_by: string;
  approved_by: string | null;
  assigned_to: string | null;
  requested_at: string;
  approved_at: string | null;
  executed_at: string | null;
  verified_at: string | null;
  restored_at: string | null;
  notes: string | null;
  operational_notes: string | null;
  created_at: string;
  service_agreement?: {
    id: string;
    name: string;
    status: string;
    service_type: string;
  } | null;
  client?: {
    id: string;
    email: string;
    full_name: string | null;
    company_name: string | null;
  } | null;
  system?: {
    id: string;
    name: string;
    status: string;
  } | null;
  assigned_staff?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  requested_by_user?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  approved_by_user?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}

export interface SuspensionActionItem {
  id: string;
  suspension_case_id: string;
  resource_id: string | null;
  action_type: string;
  action_status: string;
  performed_by: string | null;
  performed_at: string | null;
  assigned_to: string | null;
  verified_by: string | null;
  verified_at: string | null;
  evidence: string | null;
  evidence_reference: string | null;
  notes: string | null;
  created_at: string;
  resource?: {
    id: string;
    name: string;
    resource_type: string;
    status: string;
  } | null;
  performed_by_user?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  assigned_staff?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  verified_by_user?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}

interface AgreementOption {
  id: string;
  name: string;
  client_id: string;
  system_id: string | null;
  status: string;
}

interface ClientOption {
  id: string;
  label: string;
}

interface SystemOption {
  id: string;
  name: string;
  client_id: string;
  status: string;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  suspension_note: string | null;
  resumed_at: string | null;
  resumed_by: string | null;
}

interface ResourceOption {
  id: string;
  name: string;
  client_id: string | null;
  system_id: string | null;
  resource_type: string;
  status: string;
}

interface StaffOption {
  id: string;
  label: string;
  role: string;
}

interface AgreementResourcePair {
  agreement_id: string;
  resource_id: string;
}

interface Props {
  currentUserId: string;
  cases: SuspensionCaseItem[];
  actions: SuspensionActionItem[];
  agreements: AgreementOption[];
  clients: ClientOption[];
  systems: SystemOption[];
  resources: ResourceOption[];
  staffOptions: StaffOption[];
  agreementResources: AgreementResourcePair[];
  isAdmin: boolean;
  isFinance: boolean;
  isStaff: boolean;
}

function caseStatusTone(status: string): Tone {
  switch (status) {
    case "approved":
    case "restored":
      return "success";
    case "executing":
    case "restoration_pending":
    case "pending_approval":
      return "warning";
    case "suspended":
    case "rejected":
      return "danger";
    case "proposed":
    case "cancelled":
    default:
      return "neutral";
  }
}

function actionStatusTone(status: string): Tone {
  switch (status) {
    case "verified":
    case "completed":
      return "success";
    case "in_progress":
      return "warning";
    case "failed":
      return "danger";
    case "pending":
    case "cancelled":
    default:
      return "neutral";
  }
}

export default function SuspensionsManager({
  currentUserId,
  cases,
  actions,
  agreements,
  clients,
  systems,
  resources,
  staffOptions,
  agreementResources,
  isAdmin,
  isFinance,
  isStaff,
}: Props) {
  const router = useRouter();

  // State
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [addActionModalOpen, setAddActionModalOpen] = useState(false);
  const [completeActionModalOpen, setCompleteActionModalOpen] = useState(false);
  const [selectedActionToComplete, setSelectedActionToComplete] = useState<SuspensionActionItem | null>(null);

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Case form
  const [selectedAgreementId, setSelectedAgreementId] = useState<string>("");
  const [caseReason, setCaseReason] = useState<string>("");
  const [caseNotes, setCaseNotes] = useState<string>("");
  const [caseAssignedTo, setCaseAssignedTo] = useState<string>("");

  // Rejection form
  const [rejectionNotes, setRejectionNotes] = useState<string>("");

  // Assignment form
  const [newAssignedTo, setNewAssignedTo] = useState<string>("");

  // Add Action form
  const [actionType, setActionType] = useState<"suspension" | "restoration" | "verification">("suspension");
  const [actionResourceId, setActionResourceId] = useState<string>("");
  const [actionAssignedTo, setActionAssignedTo] = useState<string>("");
  const [actionNotes, setActionNotes] = useState<string>("");

  // Complete Action form
  const [evidenceRef, setEvidenceRef] = useState<string>("");
  const [actionCompletionNotes, setActionCompletionNotes] = useState<string>("");

  const activeCase = cases.find((c) => c.id === selectedCaseId) || cases[0] || null;
  const caseActions = actions.filter((a) => a.suspension_case_id === activeCase?.id);

  // Filtered cases
  const filteredCases = cases.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchReason = c.reason.toLowerCase().includes(q);
      const matchClient = (c.client?.company_name || c.client?.email || "").toLowerCase().includes(q);
      const matchAgreement = (c.service_agreement?.name || "").toLowerCase().includes(q);
      return matchReason || matchClient || matchAgreement;
    }
    return true;
  });

  // When selectedAgreementId changes in Create modal, determine valid client & system
  const chosenAgreement = agreements.find((a) => a.id === selectedAgreementId);
  const chosenClient = clients.find((c) => c.id === chosenAgreement?.client_id);
  const chosenSystem = systems.find((s) => s.id === chosenAgreement?.system_id);

  // Resources covered by active agreement
  const coveredResourceIds = agreementResources
    .filter((ar) => ar.agreement_id === activeCase?.service_agreement_id)
    .map((ar) => ar.resource_id);

  const coveredResources = resources.filter((r) => coveredResourceIds.includes(r.id));

  // Handlers
  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    if (!chosenAgreement) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createSuspensionCase({
      serviceAgreementId: chosenAgreement.id,
      clientId: chosenAgreement.client_id,
      systemId: chosenAgreement.system_id,
      reason: caseReason,
      notes: caseNotes,
      assignedTo: caseAssignedTo || null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to create suspension case");
    } else {
      setCreateModalOpen(false);
      setCaseReason("");
      setCaseNotes("");
      setCaseAssignedTo("");
      setSelectedAgreementId("");
      router.refresh();
      if (res.data?.id) setSelectedCaseId(res.data.id);
    }
  }

  async function handleApprove(caseId: string) {
    if (!isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await approveSuspensionCase(caseId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to approve suspension case");
    } else {
      router.refresh();
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCase || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await rejectSuspensionCase(activeCase.id, rejectionNotes);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to reject suspension case");
    } else {
      setRejectModalOpen(false);
      setRejectionNotes("");
      router.refresh();
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCase || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await assignSuspensionCase(activeCase.id, newAssignedTo || null);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to assign staff");
    } else {
      setAssignModalOpen(false);
      router.refresh();
    }
  }

  async function handleStartExecution(caseId: string) {
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await startCaseExecution(caseId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to start execution");
    } else {
      router.refresh();
    }
  }

  async function handleExecuteSuspension(caseId: string) {
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await executeSuspensionCase(caseId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to execute suspension");
    } else {
      router.refresh();
    }
  }

  async function handleVerifyCase(caseId: string) {
    if (!isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await verifySuspensionCase(caseId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to verify suspension");
    } else {
      router.refresh();
    }
  }

  async function handleInitiateRestoration(caseId: string) {
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await initiateCaseRestoration(caseId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to initiate restoration");
    } else {
      router.refresh();
    }
  }

  async function handleCompleteRestoration(caseId: string) {
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await completeCaseRestoration(caseId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to complete restoration");
    } else {
      router.refresh();
    }
  }

  async function handleCancelCase(caseId: string) {
    if (!isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await cancelSuspensionCase(caseId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to cancel case");
    } else {
      router.refresh();
    }
  }

  async function handleAddAction(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCase) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await addSuspensionAction(
      activeCase.id,
      actionType,
      actionResourceId || null,
      actionAssignedTo || null,
      actionNotes
    );

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to add action");
    } else {
      setAddActionModalOpen(false);
      setActionResourceId("");
      setActionAssignedTo("");
      setActionNotes("");
      router.refresh();
    }
  }

  async function handleCompleteAction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedActionToComplete) return;
    if (!evidenceRef.trim()) {
      setErrorMessage("Evidence reference is mandatory for verified execution");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await completeSuspensionAction(
      selectedActionToComplete.id,
      evidenceRef,
      actionCompletionNotes
    );

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to mark action completed");
    } else {
      setCompleteActionModalOpen(false);
      setSelectedActionToComplete(null);
      setEvidenceRef("");
      setActionCompletionNotes("");
      router.refresh();
    }
  }

  async function handleVerifyAction(actionId: string) {
    if (!isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await verifySuspensionAction(actionId);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to verify action");
    } else {
      router.refresh();
    }
  }

  // Permission helpers for active case
  const isAssignedToMe = activeCase?.assigned_to === currentUserId;
  const canExecuteCase = (isAdmin || (isStaff && isAssignedToMe)) && !isFinance;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {isFinance && (
        <div
          id="finance-context-banner"
          style={{
            padding: "0.75rem 1rem",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            borderRadius: "4px",
            fontSize: "0.8125rem",
          }}
        >
          <b>Finance View (Read-Only Context):</b> You have access to review contract suspension standing and
          financial background. Operational approval and execution are restricted to Operations and Administration.
        </div>
      )}

      {isStaff && !isAdmin && (
        <div
          id="staff-operational-banner"
          style={{
            padding: "0.75rem 1rem",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            borderRadius: "4px",
            fontSize: "0.8125rem",
          }}
        >
          <b>Staff Operational View:</b> You may execute assigned and approved operational suspension tasks and record evidence. Case approval is restricted to Administrators.
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
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
            style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c" }}
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: "220px" }}>
            <Search
              className="w-4 h-4 text-muted-foreground"
              style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              type="text"
              placeholder="Search cases, agreements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ux-input"
              style={{ paddingLeft: "2.25rem", height: "36px", fontSize: "0.8125rem" }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ux-select"
            style={{ height: "36px", fontSize: "0.8125rem" }}
          >
            <option value="all">All Statuses ({cases.length})</option>
            <option value="proposed">Proposed</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="executing">Executing</option>
            <option value="suspended">Suspended</option>
            <option value="restoration_pending">In Restoration</option>
            <option value="restored">Restored</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {!isFinance && (
          <button
            id="btn-create-case"
            onClick={() => {
              setErrorMessage(null);
              setCreateModalOpen(true);
            }}
            className="ux-btn ux-btn--primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Plus className="w-4 h-4" />
            <span>Raise Suspension Case</span>
          </button>
        )}
      </div>

      {/* Main Master-Detail Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px minmax(0, 1fr)",
          gap: "1.25rem",
          alignItems: "start",
        }}
        className="suspension-layout"
      >
        {/* Left Column: Suspension Cases List */}
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
            <span>Cases ({filteredCases.length})</span>
          </div>

          <div style={{ maxHeight: "680px", overflowY: "auto" }}>
            {filteredCases.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                No suspension cases found.
              </div>
            ) : (
              filteredCases.map((c) => {
                const isSelected = c.id === activeCase?.id;
                return (
                  <div
                    key={c.id}
                    id={`case-card-${c.id}`}
                    onClick={() => setSelectedCaseId(c.id)}
                    style={{
                      padding: "0.875rem 1rem",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: isSelected ? "var(--surface)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--primary, #000)" : "3px solid transparent",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                        {c.service_agreement?.name || "Agreement"}
                      </span>
                      <StatusMark tone={caseStatusTone(c.status)}>{c.status}</StatusMark>
                    </div>

                    <div style={{ fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.375rem" }}>
                      {c.reason}
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
                      <span>{c.client?.company_name || c.client?.email}</span>
                      <span>
                        {c.assigned_staff ? `Assigned: ${c.assigned_staff.full_name || c.assigned_staff.email.split("@")[0]}` : "Unassigned"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Case Lifecycle Detail & Actions */}
        {activeCase ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem" }}>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                      {activeCase.service_agreement?.name}
                    </h2>
                    <span id="active-case-status" data-status={activeCase.status}>
                      <StatusMark tone={caseStatusTone(activeCase.status)}>{activeCase.status}</StatusMark>
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                    Client: <b>{activeCase.client?.company_name || activeCase.client?.email}</b>
                    {activeCase.system && (
                      <span>
                        {" "}• System: <b>{activeCase.system.name}</b>
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Action Buttons based on Role and Status */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {isAdmin && (activeCase.status === "proposed" || activeCase.status === "pending_approval") && (
                    <>
                      <button
                        id="btn-approve-case"
                        onClick={() => handleApprove(activeCase.id)}
                        disabled={isSubmitting}
                        className="ux-btn ux-btn--primary ux-btn--sm"
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve Suspension</span>
                      </button>
                      <button
                        id="btn-reject-case"
                        onClick={() => {
                          setRejectionNotes("");
                          setRejectModalOpen(true);
                        }}
                        disabled={isSubmitting}
                        className="ux-btn ux-btn--danger ux-btn--sm"
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </>
                  )}

                  {isAdmin && (
                    <button
                      id="btn-assign-exec"
                      onClick={() => {
                        setNewAssignedTo(activeCase.assigned_to || "");
                        setAssignModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>{activeCase.assigned_to ? "Reassign" : "Assign"}</span>
                    </button>
                  )}

                  {canExecuteCase && activeCase.status === "approved" && (
                    <button
                      id="btn-begin-execution"
                      onClick={() => handleStartExecution(activeCase.id)}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Begin Execution</span>
                    </button>
                  )}

                  {canExecuteCase && (activeCase.status === "executing" || activeCase.status === "approved") && (
                    <button
                      id="btn-execute-suspension"
                      onClick={() => handleExecuteSuspension(activeCase.id)}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--danger ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Mark Suspended</span>
                    </button>
                  )}

                  {isAdmin && activeCase.status === "suspended" && !activeCase.verified_at && (
                    <button
                      id="btn-verify-suspension"
                      onClick={() => handleVerifyCase(activeCase.id)}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Verify Suspension</span>
                    </button>
                  )}

                  {canExecuteCase && activeCase.status === "suspended" && (
                    <button
                      id="btn-initiate-restoration"
                      onClick={() => handleInitiateRestoration(activeCase.id)}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Initiate Restoration</span>
                    </button>
                  )}

                  {canExecuteCase && activeCase.status === "restoration_pending" && (
                    <button
                      id="btn-complete-restoration"
                      onClick={() => handleCompleteRestoration(activeCase.id)}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Restored</span>
                    </button>
                  )}

                  {isAdmin && !["restored", "rejected", "cancelled"].includes(activeCase.status) && (
                    <button
                      id="btn-cancel-case"
                      onClick={() => handleCancelCase(activeCase.id)}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Cancel Case
                    </button>
                  )}
                </div>
              </div>

              {/* Lifecycle status progression */}
              <div className="ux-muted" style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.8125rem" }}>
                <span style={{ fontWeight: ["proposed", "pending_approval"].includes(activeCase.status) ? 700 : 400, color: ["proposed", "pending_approval"].includes(activeCase.status) ? "var(--ux-navy)" : undefined }}>
                  Proposed
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span style={{ fontWeight: activeCase.status === "approved" ? 700 : 400, color: activeCase.status === "approved" ? "var(--ux-navy)" : undefined }}>
                  Approved
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span style={{ fontWeight: activeCase.status === "executing" ? 700 : 400, color: activeCase.status === "executing" ? "var(--ux-navy)" : undefined }}>
                  Executing
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span style={{ fontWeight: activeCase.status === "suspended" ? 700 : 400, color: activeCase.status === "suspended" ? "var(--ux-navy)" : undefined }}>
                  Suspended
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span style={{ fontWeight: activeCase.status === "restoration_pending" ? 700 : 400, color: activeCase.status === "restoration_pending" ? "var(--ux-navy)" : undefined }}>
                  Restoration
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span style={{ fontWeight: activeCase.status === "restored" ? 700 : 400, color: activeCase.status === "restored" ? "var(--ux-navy)" : undefined }}>
                  Restored
                </span>
              </div>

              {/* Reason & Meta Info */}
              <div
                style={{
                  marginTop: "1rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "0.75rem",
                  fontSize: "0.8125rem",
                }}
              >
                <div>
                  <span className="ux-muted">Formal Reason:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>{activeCase.reason}</div>
                </div>
                <div>
                  <span className="ux-muted">Assigned Engineer:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeCase.assigned_staff?.full_name || activeCase.assigned_staff?.email || "Unassigned"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Requested By:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeCase.requested_by_user?.full_name || activeCase.requested_by_user?.email}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Approved By:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeCase.approved_by_user?.full_name || activeCase.approved_by_user?.email || "Pending Approval"}
                  </div>
                </div>
                {activeCase.executed_at && (
                  <div>
                    <span className="ux-muted">Executed At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                      {new Date(activeCase.executed_at).toLocaleString()}
                    </div>
                  </div>
                )}
                {activeCase.verified_at && (
                  <div>
                    <span className="ux-muted">Verified At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem", color: "#059669" }}>
                      {new Date(activeCase.verified_at).toLocaleString()}
                    </div>
                  </div>
                )}
                {activeCase.restored_at && (
                  <div>
                    <span className="ux-muted">Restored At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem", color: "#2563eb" }}>
                      {new Date(activeCase.restored_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {activeCase.operational_notes && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", background: "var(--surface)", padding: "0.625rem", borderRadius: "4px" }}>
                  <span className="ux-muted">Operational Notes: </span>
                  <span>{activeCase.operational_notes}</span>
                </div>
              )}
            </div>

            {/* Operational Actions Section */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "var(--card)",
                padding: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, margin: 0 }}>
                    Case actions ({caseActions.length})
                  </h3>
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", marginTop: "0.125rem" }}>
                    Components to suspend, verify, or restore with recorded evidence.
                  </div>
                </div>

                {!isFinance && (
                  <button
                    onClick={() => {
                      setErrorMessage(null);
                      setAddActionModalOpen(true);
                    }}
                    className="ux-btn ux-btn--secondary ux-btn--sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Action</span>
                  </button>
                )}
              </div>

              {caseActions.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    border: "1px dashed var(--border)",
                    borderRadius: "4px",
                    textAlign: "center",
                    color: "var(--muted-foreground)",
                    fontSize: "0.8125rem",
                  }}
                >
                  No individual actions added to this suspension case yet. Add an action to scope suspension to covered technical resources.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {caseActions.map((act) => {
                    const isAssignedToThis = act.assigned_to === currentUserId || (!act.assigned_to && isAssignedToMe);
                    const canCompleteAction = (isAdmin || (isStaff && isAssignedToThis)) && !isFinance;

                    return (
                      <div
                        key={act.id}
                        style={{
                          padding: "1rem",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          background: "var(--surface)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.875rem", textTransform: "capitalize" }}>
                              {act.action_type} {act.resource ? `— ${act.resource.name} (${act.resource.resource_type})` : "(Agreement Scope)"}
                            </span>
                            <StatusMark tone={actionStatusTone(act.action_status)}>{act.action_status}</StatusMark>
                          </div>

                          {act.notes && (
                            <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", marginBottom: "0.25rem" }}>
                              Notes: {act.notes}
                            </div>
                          )}

                          {act.evidence_reference && (
                            <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                              <b>Evidence:</b> <span style={{ fontFamily: "monospace" }}>{act.evidence_reference}</span>
                            </div>
                          )}

                          <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: "0.375rem" }}>
                            {act.performed_by_user && (
                              <span>Performed by: {act.performed_by_user.full_name || act.performed_by_user.email}</span>
                            )}
                            {act.performed_at && (
                              <span>At: {new Date(act.performed_at).toLocaleString()}</span>
                            )}
                            {act.verified_by_user && (
                              <span style={{ color: "#059669" }}>
                                Verified by: {act.verified_by_user.full_name || act.verified_by_user.email}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action controls */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {canCompleteAction && act.action_status !== "completed" && act.action_status !== "verified" && (
                            <button
                              onClick={() => {
                                setSelectedActionToComplete(act);
                                setEvidenceRef("");
                                setActionCompletionNotes("");
                                setCompleteActionModalOpen(true);
                              }}
                              className="ux-btn ux-btn--primary ux-btn--sm"
                            >
                              Record Execution
                            </button>
                          )}

                          {isAdmin && act.action_status === "completed" && (
                            <button
                              onClick={() => handleVerifyAction(act.id)}
                              className="ux-btn ux-btn--secondary ux-btn--sm"
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Verify</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "3rem",
              border: "1px dashed var(--border)",
              borderRadius: "4px",
              textAlign: "center",
              color: "var(--muted-foreground)",
            }}
          >
            No suspension case selected.
          </div>
        )}
      </div>

      {/* MODAL 1: Create Suspension Case */}
      {createModalOpen && (
        <Dialog onClose={() => setCreateModalOpen(false)} labelledBy="dialog-create-case-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-create-case-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
              Raise Suspension Case
            </h2>
            <form onSubmit={handleCreateCase} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="ux-label">Service Agreement *</label>
                <select
                  id="select-case-agreement"
                  required
                  value={selectedAgreementId}
                  onChange={(e) => setSelectedAgreementId(e.target.value)}
                  className="ux-select"
                  style={{ width: "100%" }}
                >
                  <option value="">Select Service Agreement...</option>
                  {agreements.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.status})
                    </option>
                  ))}
                </select>
              </div>

              {chosenAgreement && (
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--surface)",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                  }}
                >
                  <div>
                    <b>Client:</b> {chosenClient?.label || chosenAgreement.client_id}
                  </div>
                  {chosenSystem && (
                    <div>
                      <b>System:</b> {chosenSystem.name}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="ux-label">Reason for Suspension *</label>
                <textarea
                  id="input-case-reason"
                  required
                  rows={3}
                  placeholder="e.g. Invoices past due grace period; client breached contractual SLA agreement..."
                  value={caseReason}
                  onChange={(e) => setCaseReason(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%", height: "auto" }}
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="ux-label">Assign Operational Staff (Optional)</label>
                  <select
                    id="select-case-assign"
                    value={caseAssignedTo}
                    onChange={(e) => setCaseAssignedTo(e.target.value)}
                    className="ux-select"
                    style={{ width: "100%" }}
                  >
                    <option value="">Unassigned</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="ux-label">Operational Notes</label>
                <input
                  id="input-case-notes"
                  type="text"
                  placeholder="Additional guidance for assigned engineer..."
                  value={caseNotes}
                  onChange={(e) => setCaseNotes(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="ux-btn ux-btn--secondary"
                >
                  Cancel
                </button>
                <button
                  id="submit-create-case"
                  type="submit"
                  disabled={isSubmitting || !selectedAgreementId || caseReason.trim().length < 3}
                  className="ux-btn ux-btn--primary"
                >
                  {isSubmitting ? "Creating..." : "Submit Case"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* MODAL 2: Reject Case */}
      {rejectModalOpen && (
        <Dialog onClose={() => setRejectModalOpen(false)} labelledBy="dialog-reject-case-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-reject-case-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
              Reject Suspension Case
            </h2>
            <form onSubmit={handleReject} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ fontSize: "0.875rem", margin: 0 }}>
                Are you sure you want to reject this suspension case? Rejected cases are permanently locked
                and cannot be executed.
              </p>

              <div>
                <label className="ux-label">Rejection Reason / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Reason for rejecting case (e.g., payment received, exception granted)..."
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%", height: "auto" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="ux-btn ux-btn--secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--danger"
                >
                  {isSubmitting ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* MODAL 3: Assign Staff */}
      {assignModalOpen && (
        <Dialog onClose={() => setAssignModalOpen(false)} labelledBy="dialog-assign-case-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-assign-case-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
              Assign Staff to Case
            </h2>
            <form onSubmit={handleAssign} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="ux-label">Select Staff Member</label>
                <select
                  value={newAssignedTo}
                  onChange={(e) => setNewAssignedTo(e.target.value)}
                  className="ux-select"
                  style={{ width: "100%" }}
                >
                  <option value="">Unassigned</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="ux-btn ux-btn--secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--primary"
                >
                  {isSubmitting ? "Saving..." : "Save Assignment"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* MODAL 4: Add Action */}
      {addActionModalOpen && (
        <Dialog onClose={() => setAddActionModalOpen(false)} labelledBy="dialog-add-action-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-add-action-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
              Add Operational Action
            </h2>
            <form onSubmit={handleAddAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="ux-label">Action Type</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as any)}
                  className="ux-select"
                  style={{ width: "100%" }}
                >
                  <option value="suspension">Suspension</option>
                  <option value="restoration">Restoration</option>
                  <option value="verification">Verification</option>
                </select>
              </div>

              <div>
                <label className="ux-label">Target Covered Resource (Optional)</label>
                <select
                  value={actionResourceId}
                  onChange={(e) => setActionResourceId(e.target.value)}
                  className="ux-select"
                  style={{ width: "100%" }}
                >
                  <option value="">Entire Agreement (All resources)</option>
                  {coveredResources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.resource_type})
                    </option>
                  ))}
                </select>
                {coveredResources.length === 0 && (
                  <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                    No resources explicitly attached to this agreement. Action will apply to the entire agreement.
                  </div>
                )}
              </div>

              {isAdmin && (
                <div>
                  <label className="ux-label">Assignee</label>
                  <select
                    value={actionAssignedTo}
                    onChange={(e) => setActionAssignedTo(e.target.value)}
                    className="ux-select"
                    style={{ width: "100%" }}
                  >
                    <option value="">Default to Case Assignee</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="ux-label">Action Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Stop container in Railway, freeze database user..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setAddActionModalOpen(false)}
                  className="ux-btn ux-btn--secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--primary"
                >
                  {isSubmitting ? "Adding..." : "Add Action"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* MODAL 5: Complete Action with Evidence */}
      {completeActionModalOpen && (
        <Dialog onClose={() => setCompleteActionModalOpen(false)} labelledBy="dialog-complete-action-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-complete-action-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
              Record Execution Evidence
            </h2>
            <form onSubmit={handleCompleteAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="ux-label">Evidence Reference *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Scaled deployment to 0; Vercel domain paused; Droplet #8194 stopped"
                  value={evidenceRef}
                  onChange={(e) => setEvidenceRef(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%" }}
                />
                <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                  Provide verifiable proof or reference for audit verification. No credentials or secrets!
                </div>
              </div>

              <div>
                <label className="ux-label">Execution Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional operational context..."
                  value={actionCompletionNotes}
                  onChange={(e) => setActionCompletionNotes(e.target.value)}
                  className="ux-input"
                  style={{ width: "100%", height: "auto" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setCompleteActionModalOpen(false)}
                  className="ux-btn ux-btn--secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !evidenceRef.trim()}
                  className="ux-btn ux-btn--primary"
                >
                  {isSubmitting ? "Recording..." : "Confirm Execution"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}
