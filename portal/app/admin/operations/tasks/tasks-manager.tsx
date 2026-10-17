"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  User,
  Search,
  Filter,
  ArrowRight,
  Calendar,
  X,
  Play,
  Slash,
} from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { revealOpsDetail } from "@/components/ux/ops-mobile";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { sortTasksForWorkspace, filterTasks, deriveTaskWorkspaceSummary, isTaskOverdue } from "@/lib/operations/tasks";
import {
  createTask,
  assignTask,
  startTask,
  blockTask,
  completeTask,
  cancelTask,
} from "@/lib/actions/operations";

export interface TaskItem {
  id: string;
  client_id: string;
  system_id: string | null;
  resource_id: string | null;
  service_agreement_id: string | null;
  incident_id: string | null;
  suspension_case_id: string | null;
  title: string;
  description: string | null;
  status: "open" | "assigned" | "in_progress" | "blocked" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to: string | null;
  created_by: string;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  client?: { id: string; email: string; full_name?: string | null; company_name?: string | null } | null;
  system?: { id: string; name: string; status: string } | null;
  resource?: { id: string; name: string; resource_type: string; status: string } | null;
  service_agreement?: { id: string; name: string; status: string } | null;
  incident?: { id: string; title: string; severity: string; status: string } | null;
  suspension_case?: { id: string; reason: string; status: string } | null;
  assigned_staff?: { id: string; email: string; full_name?: string | null } | null;
  created_by_user?: { id: string; email: string; full_name?: string | null } | null;
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

export interface IncidentOption {
  id: string;
  title: string;
  client_id: string;
}

export interface SuspensionCaseOption {
  id: string;
  reason: string;
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
  tasks: TaskItem[];
  auditTrail: AuditEvent[];
  clients: ClientOption[];
  systems: SystemOption[];
  resources: ResourceOption[];
  agreements: AgreementOption[];
  incidents: IncidentOption[];
  suspensionCases: SuspensionCaseOption[];
  staffOptions: StaffOption[];
  isAdmin: boolean;
  isFinance: boolean;
  isStaff: boolean;
  /** True when a section's query failed — render Unavailable, never a false empty/zero state. */
  tasksUnavailable: boolean;
  optionsUnavailable: boolean;
  auditUnavailable: boolean;
}

function taskStatusTone(status: string): Tone {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "warning";
    case "blocked":
      return "danger";
    case "assigned":
      return "info";
    case "open":
    case "cancelled":
    default:
      return "neutral";
  }
}

function taskPriorityTone(priority: string): Tone {
  switch (priority) {
    case "urgent":
      return "danger";
    case "high":
      return "warning";
    case "normal":
      return "info";
    case "low":
    default:
      return "neutral";
  }
}

export default function TasksManager({
  currentUserId,
  tasks,
  auditTrail,
  clients,
  systems,
  resources,
  agreements,
  incidents,
  suspensionCases,
  staffOptions,
  isAdmin,
  isFinance,
  isStaff,
  tasksUnavailable,
  optionsUnavailable,
  auditUnavailable,
}: Props) {
  const router = useRouter();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New task form fields
  const [taskClientId, setTaskClientId] = useState<string>("");
  const [taskSystemId, setTaskSystemId] = useState<string>("");
  const [taskResourceId, setTaskResourceId] = useState<string>("");
  const [taskAgreementId, setTaskAgreementId] = useState<string>("");
  const [taskIncidentId, setTaskIncidentId] = useState<string>("");
  const [taskSuspensionId, setTaskSuspensionId] = useState<string>("");
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [taskDesc, setTaskDesc] = useState<string>("");
  const [taskPriority, setTaskPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [taskAssignedTo, setTaskAssignedTo] = useState<string>("");
  const [taskDueAt, setTaskDueAt] = useState<string>("");

  // Action input states
  const [newAssignedTo, setNewAssignedTo] = useState<string>("");
  const [blockReason, setBlockReason] = useState<string>("");
  const [completeNotes, setCompleteNotes] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");

  const activeTask = tasks.find((t) => t.id === selectedTaskId) || tasks[0] || null;
  const activeTaskAudit = activeTask ? auditTrail.filter((e) => e.record_id === activeTask.id) : [];

  // Filtered lists for modal dropdowns based on chosen client
  const availableSystems = systems.filter((s) => !taskClientId || s.client_id === taskClientId);
  const availableResources = resources.filter((r) => !taskClientId || r.client_id === taskClientId);
  const availableAgreements = agreements.filter((a) => !taskClientId || a.client_id === taskClientId);
  const availableIncidents = incidents.filter((i) => !taskClientId || i.client_id === taskClientId);
  const availableSuspensions = suspensionCases.filter((s) => !taskClientId || s.client_id === taskClientId);

  // Operational ordering (overdue → active → assigned → unassigned → terminal),
  // then filters. sortTasksForWorkspace shares the Overview's attention order.
  const taskSummary = deriveTaskWorkspaceSummary(tasks);
  const sortedTasks = sortTasksForWorkspace(tasks);
  const filteredTasks = filterTasks(sortedTasks, {
    status: statusFilter,
    priority: priorityFilter,
    assignee: assigneeFilter,
    due: dueFilter,
    systemId: systemFilter,
    search: searchQuery,
  }, { currentUserId });

  // Permission helpers
  const isAssignedToMe = activeTask?.assigned_to === currentUserId;
  const canUpdateActiveTask = isAdmin || (isStaff && (isAssignedToMe || !activeTask?.assigned_to));

  // Handlers
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskClientId || !taskTitle.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createTask({
      clientId: taskClientId,
      systemId: taskSystemId || null,
      resourceId: taskResourceId || null,
      serviceAgreementId: taskAgreementId || null,
      incidentId: taskIncidentId || null,
      suspensionCaseId: taskSuspensionId || null,
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      priority: taskPriority,
      assignedTo: taskAssignedTo || null,
      dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to create task");
    } else {
      setCreateModalOpen(false);
      setTaskTitle("");
      setTaskDesc("");
      setTaskClientId("");
      setTaskSystemId("");
      setTaskResourceId("");
      setTaskAgreementId("");
      setTaskIncidentId("");
      setTaskSuspensionId("");
      setTaskAssignedTo("");
      setTaskDueAt("");
      router.refresh();
      if (res.data?.id) setSelectedTaskId(res.data.id);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTask || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await assignTask(activeTask.id, newAssignedTo || null);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to assign task");
    } else {
      setAssignModalOpen(false);
      router.refresh();
    }
  }

  async function handleStart() {
    if (!activeTask || !canUpdateActiveTask) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await startTask(activeTask.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to start task");
    } else {
      router.refresh();
    }
  }

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTask || !canUpdateActiveTask) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await blockTask(activeTask.id, blockReason);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to block task");
    } else {
      setBlockModalOpen(false);
      setBlockReason("");
      router.refresh();
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTask || !canUpdateActiveTask) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await completeTask(activeTask.id, completeNotes);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to complete task");
    } else {
      setCompleteModalOpen(false);
      setCompleteNotes("");
      router.refresh();
    }
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTask || !isAdmin) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await cancelTask(activeTask.id, cancelReason);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to cancel task");
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
          <b>Finance View (Read-Only Context):</b> You have access to review operational tasks to understand
          client work standing. Operational creation, assignment, and execution are restricted to Operations and Administration.
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
          <b>Staff Operational View:</b> You may execute and complete assigned tasks and record operational notes.
          Task reassignment and cancellation are restricted to Administrators.
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
              placeholder="Search tasks..."
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
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>

            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Assignees</option>
              <option value="mine">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>

            <select
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Deadlines</option>
              <option value="overdue">Overdue</option>
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
            id="btn-create-task"
            onClick={() => {
              setTaskClientId(clients[0]?.id || "");
              setCreateModalOpen(true);
            }}
            className="ux-btn ux-btn--primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Plus className="w-4 h-4" />
            <span>Create Task</span>
          </button>
        )}
      </div>

      {optionsUnavailable && (
        <div
          style={{
            padding: "0.625rem 1rem",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
            color: "var(--muted-foreground)",
          }}
        >
          Some reference data is unavailable — assignment and linking options may be incomplete.{" "}
          <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
        </div>
      )}

      {/* Work summary — counts reflect all tasks, not the filtered list */}
      {!tasksUnavailable && tasks.length > 0 && (
        <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span><b style={{ color: "var(--foreground)" }}>{taskSummary.actionable}</b> actionable</span>
          {taskSummary.overdue > 0 && <span><b style={{ color: "var(--ux-danger)" }}>{taskSummary.overdue}</b> overdue</span>}
          {taskSummary.unassigned > 0 && <span><b style={{ color: "var(--foreground)" }}>{taskSummary.unassigned}</b> unassigned</span>}
          {taskSummary.blocked > 0 && <span><b style={{ color: "var(--ux-warning)" }}>{taskSummary.blocked}</b> blocked</span>}
        </div>
      )}

      {/* Main Master-Detail Layout — a failed query renders Unavailable, never a false empty list */}
      {tasksUnavailable ? (
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
          Tasks unavailable — the data source could not be reached.{" "}
          <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
        </div>
      ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px minmax(0, 1fr)",
          gap: "1.25rem",
          alignItems: "start",
        }}
        className="task-layout"
      >
        {/* Left Column: Task List */}
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
            <span>Tasks ({filteredTasks.length})</span>
          </div>

          <div className="ops-list-scroll" style={{ maxHeight: "680px", overflowY: "auto" }}>
            {filteredTasks.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                No operational tasks found.
              </div>
            ) : (
              filteredTasks.map((t) => {
                const isSelected = t.id === activeTask?.id;
                return (
                  <div
                    key={t.id}
                    id={`task-card-${t.id}`}
                    onClick={() => { setSelectedTaskId(t.id); revealOpsDetail(); }}
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
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{t.title}</span>
                      <div className="ops-marks" style={{ display: "flex", gap: "0.375rem" }}>
                        {isTaskOverdue(t, Date.now()) && <StatusMark tone="danger">overdue</StatusMark>}
                        <StatusMark tone={taskPriorityTone(t.priority)}>{t.priority}</StatusMark>
                        <StatusMark tone={taskStatusTone(t.status)}>{t.status}</StatusMark>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.375rem" }}>
                      {t.client?.company_name || t.client?.email}
                      {t.system && <span> • {t.system.name}</span>}
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
                        {t.assigned_staff ? `Assigned: ${t.assigned_staff.full_name || t.assigned_staff.email.split("@")[0]}` : "Unassigned"}
                      </span>
                      {t.due_at && (
                        <span>Due: {new Date(t.due_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Task Detail & Actions */}
        {activeTask ? (
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
                      {activeTask.title}
                    </h2>
                    <span id="active-task-status" data-status={activeTask.status}>
                      <StatusMark tone={taskStatusTone(activeTask.status)}>{activeTask.status}</StatusMark>
                    </span>
                    <StatusMark tone={taskPriorityTone(activeTask.priority)}>{activeTask.priority}</StatusMark>
                    {isTaskOverdue(activeTask, Date.now()) && <StatusMark tone="danger">overdue</StatusMark>}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                    Client: <b>{activeTask.client?.company_name || activeTask.client?.email}</b>
                    {activeTask.system && (
                      <span> • System:{" "}
                        <Link href={`/admin/systems/${activeTask.system.id}`} className="ux-link">
                          <b>{activeTask.system.name}</b>
                        </Link>
                      </span>
                    )}
                    {activeTask.resource && <span> • Resource: <b>{activeTask.resource.name}</b></span>}
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {isAdmin && (
                    <button
                      id="btn-assign-task"
                      onClick={() => {
                        setNewAssignedTo(activeTask.assigned_to || "");
                        setAssignModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>{activeTask.assigned_to ? "Reassign" : "Assign"}</span>
                    </button>
                  )}

                  {canUpdateActiveTask && (activeTask.status === "open" || activeTask.status === "assigned") && (
                    <button
                      id="btn-start-task"
                      onClick={handleStart}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start Task</span>
                    </button>
                  )}

                  {canUpdateActiveTask && activeTask.status === "in_progress" && (
                    <button
                      id="btn-block-task"
                      onClick={() => {
                        setBlockReason("");
                        setBlockModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--ux-danger)" }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Mark Blocked</span>
                    </button>
                  )}

                  {canUpdateActiveTask && (activeTask.status === "in_progress" || activeTask.status === "assigned" || activeTask.status === "blocked") && (
                    <button
                      id="btn-complete-task"
                      onClick={() => {
                        setCompleteNotes("");
                        setCompleteModalOpen(true);
                      }}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--primary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Complete Task</span>
                    </button>
                  )}

                  {isAdmin && !["completed", "cancelled"].includes(activeTask.status) && (
                    <button
                      id="btn-cancel-task"
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

              {/* Task Detail Metadata Grid */}
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
                  <span className="ux-muted">Assigned To:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeTask.assigned_staff?.full_name || activeTask.assigned_staff?.email || "Unassigned"}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Created By:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeTask.created_by_user?.full_name || activeTask.created_by_user?.email}
                  </div>
                </div>
                <div>
                  <span className="ux-muted">Due Date:</span>
                  <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                    {activeTask.due_at ? new Date(activeTask.due_at).toLocaleString() : "None"}
                  </div>
                </div>
                {activeTask.started_at && (
                  <div>
                    <span className="ux-muted">Started At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem" }}>
                      {new Date(activeTask.started_at).toLocaleString()}
                    </div>
                  </div>
                )}
                {activeTask.completed_at && (
                  <div>
                    <span className="ux-muted">Completed At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem", color: "var(--ux-success)" }}>
                      {new Date(activeTask.completed_at).toLocaleString()}
                    </div>
                  </div>
                )}
                {activeTask.cancelled_at && (
                  <div>
                    <span className="ux-muted">Cancelled At:</span>
                    <div style={{ fontWeight: 600, marginTop: "0.125rem", color: "var(--ux-danger)" }}>
                      {new Date(activeTask.cancelled_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Related Entities */}
              {(activeTask.service_agreement || activeTask.incident || activeTask.suspension_case) && (
                <div
                  style={{
                    marginTop: "1rem",
                    display: "flex",
                    gap: "1rem",
                    flexWrap: "wrap",
                    fontSize: "0.8125rem",
                  }}
                >
                  {activeTask.service_agreement && (
                    <div style={{ background: "var(--surface)", padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid var(--border)" }}>
                      <span className="ux-muted">Agreement:</span> <b>{activeTask.service_agreement.name}</b>
                    </div>
                  )}
                  {activeTask.incident && (
                    <div style={{ background: "var(--surface)", padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid var(--border)" }}>
                      <span className="ux-muted">Parent Incident:</span>{" "}
                      <Link href="/admin/operations/incidents" className="ux-link"><b>{activeTask.incident.title}</b></Link>
                      {" "}<span className="ux-muted">({activeTask.incident.severity} • {activeTask.incident.status})</span>
                    </div>
                  )}
                  {activeTask.suspension_case && (
                    <div style={{ background: "var(--surface)", padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid var(--border)" }}>
                      <span className="ux-muted">Suspension Case:</span>{" "}
                      <Link href="/admin/operations/suspensions" className="ux-link"><b>{activeTask.suspension_case.reason}</b></Link>
                      {" "}<span className="ux-muted">({activeTask.suspension_case.status})</span>
                    </div>
                  )}
                </div>
              )}

              {/* Description & Operational Notes */}
              <div style={{ marginTop: "1.25rem" }}>
                <span className="ux-muted" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Description / Notes:</span>
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
                  {activeTask.description || "No operational description provided."}
                </div>
              </div>

              {/* Activity / Audit History */}
              <div style={{ marginTop: "1.25rem" }}>
                <span className="ux-muted" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Activity History:</span>
                {isAdmin ? (
                  auditUnavailable ? (
                    <div className="ux-muted" style={{ fontSize: "0.8125rem", marginTop: "0.375rem" }}>
                      Unavailable — activity history could not be loaded.{" "}
                      <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
                    </div>
                  ) : activeTaskAudit.length > 0 ? (
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
                      {activeTaskAudit.map((e) => (
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
                      No audit events recorded for this task.
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
            Select a task from the list or create a new one.
          </div>
        )}
      </div>
      )}

      {/* Create Task Modal */}
      {createModalOpen && (
        <Dialog onClose={() => setCreateModalOpen(false)} labelledBy="dialog-create-task-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-create-task-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Create Task
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Assign work connected to a client system or service.
            </p>
            <form onSubmit={handleCreateTask} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Client *</label>
            <select
              id="select-task-client"
              value={taskClientId}
              onChange={(e) => {
                setTaskClientId(e.target.value);
                setTaskSystemId("");
                setTaskResourceId("");
                setTaskAgreementId("");
                setTaskIncidentId("");
                setTaskSuspensionId("");
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
              id="input-task-title"
              type="text"
              required
              placeholder="e.g. Rotate staging database credentials"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="ux-input"
              style={{ width: "100%" }}
            />
          </div>

          <div className="ops-form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="ux-label">Priority</label>
              <select
                id="select-task-priority"
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as "low" | "normal" | "high" | "urgent")}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="ux-label">Assignee</label>
              <select
                id="select-task-assignee"
                value={taskAssignedTo}
                onChange={(e) => setTaskAssignedTo(e.target.value)}
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
                id="select-task-system"
                value={taskSystemId}
                onChange={(e) => setTaskSystemId(e.target.value)}
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
                id="select-task-resource"
                value={taskResourceId}
                onChange={(e) => setTaskResourceId(e.target.value)}
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
            <label className="ux-label">Due Date (Optional)</label>
            <input
              id="input-task-due"
              type="datetime-local"
              value={taskDueAt}
              onChange={(e) => setTaskDueAt(e.target.value)}
              className="ux-input"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label className="ux-label">Description / Instructions</label>
            <textarea
              id="input-task-desc"
              rows={3}
              placeholder="Operational details and execution requirements..."
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
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
              id="submit-create-task"
              type="submit"
              disabled={isSubmitting}
              className="ux-btn ux-btn--primary"
            >
              {isSubmitting ? "Creating..." : "Create Task"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Assign Task Modal */}
      {assignModalOpen && (
        <Dialog onClose={() => setAssignModalOpen(false)} labelledBy="dialog-assign-task-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-assign-task-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Assign Operational Task
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Select an engineer responsible for executing this task.
            </p>
            <form onSubmit={handleAssign} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Assignee</label>
            <select
              id="select-assign-engineer"
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
            <button id="submit-assign-task" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
              {isSubmitting ? "Saving..." : "Save Assignment"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Mark Blocked Modal */}
      {blockModalOpen && (
        <Dialog onClose={() => setBlockModalOpen(false)} labelledBy="dialog-block-task-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-block-task-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Mark Task Blocked
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Record the dependency or blocker preventing task progression.
            </p>
            <form onSubmit={handleBlock} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Blocker Reason</label>
            <textarea
              id="input-block-reason"
              required
              rows={3}
              placeholder="e.g. Awaiting client confirmation on database credentials..."
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="ux-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button type="button" onClick={() => setBlockModalOpen(false)} className="ux-btn ux-btn--secondary">
              Cancel
            </button>
            <button id="submit-block-task" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--danger">
              {isSubmitting ? "Submitting..." : "Mark Blocked"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Complete Task Modal */}
      {completeModalOpen && (
        <Dialog onClose={() => setCompleteModalOpen(false)} labelledBy="dialog-complete-task-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-complete-task-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Complete Operational Task
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Verify technical execution and record operational completion notes.
            </p>
            <form onSubmit={handleComplete} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Completion Notes / Evidence</label>
            <textarea
              id="input-complete-notes"
              rows={3}
              placeholder="Record technical verification notes..."
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              className="ux-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button type="button" onClick={() => setCompleteModalOpen(false)} className="ux-btn ux-btn--secondary">
              Cancel
            </button>
            <button id="submit-complete-task" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
              {isSubmitting ? "Submitting..." : "Confirm Completion"}
            </button>
          </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Cancel Task Modal */}
      {cancelModalOpen && (
        <Dialog onClose={() => setCancelModalOpen(false)} labelledBy="dialog-cancel-task-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-cancel-task-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Cancel Operational Task
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Record reason for cancelling this task.
            </p>
            <form onSubmit={handleCancel} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="ux-label">Cancellation Reason</label>
            <textarea
              id="input-cancel-reason"
              required
              rows={3}
              placeholder="e.g. Work is no longer needed..."
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
            <button id="submit-cancel-task" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--danger">
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
