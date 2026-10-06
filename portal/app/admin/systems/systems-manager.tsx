"use client";

import { useState } from "react";
import { NavLink as Link } from "@/components/nav-link";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  createSystem,
  updateSystemOperationalNotes,
  retireSystem,
  createResource,
  updateResourceOperationalNotes,
  retireResource,
  linkProjectToSystem,
} from "@/lib/actions/systems";

export interface SystemItem {
  id: string;
  client_id: string;
  name: string;
  system_type: string;
  status: string;
  description: string | null;
  primary_url: string | null;
  origin_project_id: string | null;
  operational_notes: string | null;
  archived_at: string | null;
  created_at: string;
  client?: {
    full_name: string | null;
    company_name: string | null;
    email: string;
  } | null;
  origin_project?: {
    id: string;
    title: string;
  } | null;
}

export interface ResourceItem {
  id: string;
  system_id: string | null;
  provider_account_id: string;
  name: string;
  resource_type: string;
  ownership: string;
  client_id: string | null;
  external_reference: string | null;
  status: string;
  suspension_capability: string;
  backup_verifiable: boolean;
  operational_notes: string | null;
  retired_at: string | null;
  created_at: string;
  provider_account?: {
    account_name: string;
    providers?: {
      name: string;
    } | null;
  } | null;
}

export interface ClientOption {
  id: string;
  label: string;
}

export interface ProviderAccountOption {
  id: string;
  label: string;
}

export interface ProjectOption {
  id: string;
  title: string;
  system_id: string | null;
}

const SYSTEM_STATUS_TONE: Record<string, Tone> = {
  planned: "neutral",
  in_build: "info",
  live: "success",
  maintenance_only: "warning",
  suspended: "danger",
  retired: "neutral",
};

const RESOURCE_STATUS_TONE: Record<string, Tone> = {
  provisioning: "info",
  active: "success",
  degraded: "warning",
  maintenance: "neutral",
  suspended: "danger",
  retired: "neutral",
};

/** "in_build" -> "In build" — display only, enum values are unchanged. */
function labelize(s: string | null | undefined): string {
  return s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";
}

export default function SystemsManager({
  systems,
  resources,
  clients,
  providerAccounts,
  projects,
  isAdmin,
  isStaff,
}: {
  systems: SystemItem[];
  resources: ResourceItem[];
  clients: ClientOption[];
  providerAccounts: ProviderAccountOption[];
  projects: ProjectOption[];
  isAdmin: boolean;
  isStaff: boolean;
}) {
  const [showNewSystem, setShowNewSystem] = useState(false);
  const [showNewResource, setShowNewResource] = useState(false);
  const [editingNotes, setEditingNotes] = useState<{
    type: "system" | "resource";
    id: string;
    name: string;
    notes: string;
  } | null>(null);
  const [linkingProject, setLinkingProject] = useState<{
    systemId: string;
    systemName: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Separate attached resources vs standalone resources
  const standaloneResources = resources.filter((r) => !r.system_id);
  const attachedResourcesBySystem = new Map<string, ResourceItem[]>();
  for (const r of resources) {
    if (r.system_id) {
      const list = attachedResourcesBySystem.get(r.system_id) || [];
      list.push(r);
      attachedResourcesBySystem.set(r.system_id, list);
    }
  }

  async function handleCreateSystem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await createSystem(fd);
    setLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setShowNewSystem(false);
    }
  }

  async function handleCreateResource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await createResource(fd);
    setLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setShowNewResource(false);
    }
  }

  async function handleSaveNotes(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingNotes) return;
    setLoading(true);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    const notes = fd.get("notes")?.toString() || "";

    let res;
    if (editingNotes.type === "system") {
      res = await updateSystemOperationalNotes(editingNotes.id, notes);
    } else {
      res = await updateResourceOperationalNotes(editingNotes.id, notes);
    }
    setLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setEditingNotes(null);
    }
  }

  const [confirmingRetire, setConfirmingRetire] = useState<{
    type: "system" | "resource";
    id: string;
    name: string;
  } | null>(null);

  async function executeRetire() {
    if (!confirmingRetire) return;
    setLoading(true);
    if (confirmingRetire.type === "system") {
      await retireSystem(confirmingRetire.id);
    } else {
      await retireResource(confirmingRetire.id);
    }
    setLoading(false);
    setConfirmingRetire(null);
  }

  async function handleLinkProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!linkingProject) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const projectId = fd.get("project_id")?.toString();
    if (projectId) {
      await linkProjectToSystem(projectId, linkingProject.systemId);
    }
    setLoading(false);
    setLinkingProject(null);
  }

  return (
    <div className="ux-systems-manager">
      {/* Top Action Bar */}
      {isAdmin && (
        <div className="ux-actions" style={{ marginBottom: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ux-btn ux-btn--primary"
            onClick={() => setShowNewSystem(true)}
            id="btn-create-system"
          >
            + New System
          </button>
          <button
            type="button"
            className="ux-btn"
            onClick={() => setShowNewResource(true)}
            id="btn-create-resource"
          >
            + New Technical Resource
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="ux-alert ux-alert--danger" style={{ marginBottom: "1rem", padding: "0.75rem 1rem", borderRadius: "6px", backgroundColor: "rgba(220, 38, 38, 0.1)", color: "#ef4444" }}>
          {errorMsg}
        </div>
      )}

      {/* Systems Catalog */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
          Client Digital Systems ({systems.length})
        </h2>

        {systems.length === 0 ? (
          <div className="ux-empty" style={{ padding: "2rem", border: "1px dashed var(--border)", borderRadius: 0, textAlign: "center" }}>
            <p className="ux-muted">No systems yet. Add a system to begin tracking a client's digital infrastructure.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {systems.map((sys) => {
              const clientLabel = sys.client?.company_name || sys.client?.full_name || sys.client?.email || "Unknown Client";
              const attached = attachedResourcesBySystem.get(sys.id) || [];
              const isRetired = sys.status === "retired";

              return (
                <div
                  key={sys.id}
                  className="ux-card"
                  id={`system-card-${sys.id}`}
                  style={{
                    padding: "1.25rem",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    backgroundColor: isRetired ? "var(--bg-muted, rgba(255,255,255,0.02))" : "var(--card-bg, rgba(255,255,255,0.04))",
                    opacity: isRetired ? 0.75 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}><Link href={`/admin/systems/${sys.id}`}>{sys.name}</Link></h3>
                        <StatusMark tone={SYSTEM_STATUS_TONE[sys.status] || "neutral"}>{labelize(sys.status)}</StatusMark>
                        <span className="ux-badge">{labelize(sys.system_type)}</span>
                      </div>
                      <p className="ux-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
                        Client: <b>{clientLabel}</b>
                        {sys.primary_url && (
                          <> · <span style={{ textDecoration: "underline" }}>{sys.primary_url}</span></>
                        )}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      {isStaff && (
                        <button
                          type="button"
                          className="ux-btn ux-btn--small"
                          onClick={() => setEditingNotes({ type: "system", id: sys.id, name: sys.name, notes: sys.operational_notes || "" })}
                        >
                          Notes
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            className="ux-btn ux-btn--small"
                            onClick={() => setLinkingProject({ systemId: sys.id, systemName: sys.name })}
                          >
                            Link Project
                          </button>
                          {!isRetired && (
                            <button
                              type="button"
                              className="ux-btn ux-btn--small ux-btn--outline-danger"
                              onClick={() => setConfirmingRetire({ type: "system", id: sys.id, name: sys.name })}
                            >
                              Retire
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {sys.description && (
                    <p style={{ fontSize: "0.875rem", margin: "0.5rem 0 0.75rem", color: "var(--fg-muted)" }}>
                      {sys.description}
                    </p>
                  )}

                  {sys.operational_notes && (
                    <div style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem", backgroundColor: "var(--bg-muted)", borderLeft: "2px solid var(--border)", marginBottom: "0.75rem" }}>
                      <b>Operational notes:</b> {sys.operational_notes}
                    </div>
                  )}

                  {/* Attached Resources */}
                  <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--fg-muted)", marginBottom: "0.5rem" }}>
                      Attached Infrastructure Resources ({attached.length})
                    </div>
                    {attached.length === 0 ? (
                      <p className="ux-muted" style={{ fontSize: "0.8rem", margin: 0 }}>No attached technical resources.</p>
                    ) : (
                      <div style={{ display: "grid", gap: "0.4rem" }}>
                        {attached.map((r) => (
                          <div
                            key={r.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "0.85rem",
                              padding: "0.4rem 0.6rem",
                              backgroundColor: "rgba(255,255,255,0.02)",
                              borderRadius: "4px",
                            }}
                          >
                            <div>
                              <b>{r.name}</b> · <span className="ux-muted">{labelize(r.resource_type)}</span>
                              {r.provider_account?.account_name && (
                                <span className="ux-muted"> ({r.provider_account.account_name})</span>
                              )}
                              {r.external_reference && (
                                <code style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>{r.external_reference}</code>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <StatusMark tone={RESOURCE_STATUS_TONE[r.status] || "neutral"}>{labelize(r.status)}</StatusMark>
                              {isStaff && (
                                <button
                                  type="button"
                                  className="ux-btn ux-btn--small"
                                  style={{ padding: "0.1rem 0.4rem", fontSize: "0.75rem" }}
                                  onClick={() => setEditingNotes({ type: "resource", id: r.id, name: r.name, notes: r.operational_notes || "" })}
                                >
                                  Notes
                                </button>
                              )}
                              {isAdmin && r.status !== "retired" && (
                                <button
                                  type="button"
                                  className="ux-btn ux-btn--small ux-btn--outline-danger"
                                  style={{ padding: "0.1rem 0.4rem", fontSize: "0.75rem" }}
                                  onClick={() => setConfirmingRetire({ type: "resource", id: r.id, name: r.name })}
                                >
                                  Retire
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Standalone Resources Section */}
      <div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
          Standalone / Independent Resources ({standaloneResources.length})
        </h2>
        <p className="ux-muted" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
          Infrastructure components operating independently of a System (e.g. standalone domains, DNS zones, isolated databases).
        </p>

        {standaloneResources.length === 0 ? (
          <div className="ux-empty" style={{ padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 0, textAlign: "center" }}>
            <p className="ux-muted">No standalone resources recorded.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {standaloneResources.map((r) => (
              <div
                key={r.id}
                className="ux-card"
                id={`standalone-resource-${r.id}`}
                style={{
                  padding: "0.9rem 1.25rem",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <b style={{ fontSize: "0.95rem" }}>{r.name}</b>
                    <span className="ux-badge">{labelize(r.resource_type)}</span>
                    <span className="ux-muted" style={{ fontSize: "0.75rem" }}>({labelize(r.ownership)})</span>
                  </div>
                  <div className="ux-muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                    Provider Account: {r.provider_account?.account_name || "Unspecified"}
                    {r.external_reference && <> · <code>{r.external_reference}</code></>}
                  </div>
                  {r.operational_notes && (
                    <div style={{ fontSize: "0.75rem", marginTop: "0.4rem", color: "var(--fg-muted)" }}>
                      Notes: {r.operational_notes}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <StatusMark tone={RESOURCE_STATUS_TONE[r.status] || "neutral"}>{labelize(r.status)}</StatusMark>
                  {isStaff && (
                    <button
                      type="button"
                      className="ux-btn ux-btn--small"
                      onClick={() => setEditingNotes({ type: "resource", id: r.id, name: r.name, notes: r.operational_notes || "" })}
                    >
                      Notes
                    </button>
                  )}
                  {isAdmin && r.status !== "retired" && (
                    <button
                      type="button"
                      className="ux-btn ux-btn--small ux-btn--outline-danger"
                      onClick={() => setConfirmingRetire({ type: "resource", id: r.id, name: r.name })}
                    >
                      Retire
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New System Dialog (Admin only) */}
      {showNewSystem && (
        <Dialog labelledBy="dialog-new-system-title" onClose={() => setShowNewSystem(false)} maxWidth={550}>
          <form onSubmit={handleCreateSystem} style={{ display: "grid", gap: "1rem" }}>
            <h2 id="dialog-new-system-title" style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              Create Digital System
            </h2>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Client *</span>
              <select name="client_id" required className="ux-input" defaultValue="">
                <option value="" disabled>Select Client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>System Name *</span>
              <input type="text" name="name" required placeholder="e.g. Client X Lending Platform" className="ux-input" />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>System Type</span>
                <select name="system_type" className="ux-input" defaultValue="web_platform">
                  <option value="web_platform">Web Platform</option>
                  <option value="mobile_app">Mobile App</option>
                  <option value="ecommerce">E-Commerce</option>
                  <option value="sacco_platform">SACCO Platform</option>
                  <option value="lending_system">Lending System</option>
                  <option value="corporate_website">Corporate Website</option>
                  <option value="custom_api">Custom API</option>
                  <option value="internal_tool">Internal Tool</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Status</span>
                <select name="status" className="ux-input" defaultValue="planned">
                  <option value="planned">Planned</option>
                  <option value="in_build">In Build</option>
                  <option value="live">Live</option>
                  <option value="maintenance_only">Maintenance Only</option>
                  <option value="suspended">Suspended</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Primary URL (Optional)</span>
              <input type="url" name="primary_url" placeholder="https://clientapp.com" className="ux-input" />
            </label>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Origin Project (Optional link to build project)</span>
              <select name="origin_project_id" className="ux-input" defaultValue="">
                <option value="">None / Standalone</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Description / Scope</span>
              <textarea name="description" rows={3} placeholder="Operational overview of this system..." className="ux-input" />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button type="button" className="ux-btn" onClick={() => setShowNewSystem(false)}>Cancel</button>
              <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                {loading ? "Creating..." : "Create System"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* New Technical Resource Dialog (Admin only) */}
      {showNewResource && (
        <Dialog labelledBy="dialog-new-resource-title" onClose={() => setShowNewResource(false)} maxWidth={550}>
          <form onSubmit={handleCreateResource} style={{ display: "grid", gap: "1rem" }}>
            <h2 id="dialog-new-resource-title" style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              Create Technical Resource
            </h2>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Resource Name *</span>
              <input type="text" name="name" required placeholder="e.g. Client X PostgreSQL Database" className="ux-input" />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Provider Account *</span>
                <select name="provider_account_id" required className="ux-input" defaultValue="">
                  <option value="" disabled>Select Account</option>
                  {providerAccounts.map((pa) => (
                    <option key={pa.id} value={pa.id}>{pa.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Resource Type *</span>
                <select name="resource_type" required className="ux-input" defaultValue="web_app">
                  <option value="web_app">Web App / Frontend</option>
                  <option value="database">Database</option>
                  <option value="storage_bucket">Storage Bucket</option>
                  <option value="dns_zone">DNS Zone</option>
                  <option value="domain">Domain Name</option>
                  <option value="api_service">API Service</option>
                  <option value="auth_service">Auth Service</option>
                  <option value="worker_cron">Worker / Cron</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Attached System (Nullable)</span>
                <select name="system_id" className="ux-input" defaultValue="">
                  <option value="">(Standalone / None)</option>
                  {systems.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Ownership</span>
                <select name="ownership" className="ux-input" defaultValue="sch_managed">
                  <option value="sch_managed">SCH Managed</option>
                  <option value="client_owned">Client Owned</option>
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Dedicated Client (Optional)</span>
                <select name="client_id" className="ux-input" defaultValue="">
                  <option value="">Inherit / None</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Suspension Capability</span>
                <select name="suspension_capability" className="ux-input" defaultValue="none">
                  <option value="none">None (Protected)</option>
                  <option value="manual_only">Manual Only</option>
                  <option value="application_level">Application Level</option>
                  <option value="via_dependency">Via Dependency</option>
                  <option value="independent">Independent</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>External Identifier / Reference (Non-secret)</span>
              <input type="text" name="external_reference" placeholder="e.g. prj_xyz123, bucket-name, domain.com" className="ux-input" />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button type="button" className="ux-btn" onClick={() => setShowNewResource(false)}>Cancel</button>
              <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                {loading ? "Creating..." : "Create Resource"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Edit Operational Notes Dialog (Staff & Admin) */}
      {editingNotes && (
        <Dialog labelledBy="dialog-edit-notes-title" onClose={() => setEditingNotes(null)} maxWidth={500}>
          <form onSubmit={handleSaveNotes} style={{ display: "grid", gap: "1rem" }}>
            <h2 id="dialog-edit-notes-title" style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              Operational Notes: {editingNotes.name}
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8rem", margin: 0 }}>
              Operational tracking records only. Never store passwords, API keys, or secrets.
            </p>

            <textarea
              name="notes"
              rows={4}
              defaultValue={editingNotes.notes}
              placeholder="e.g. Scheduled maintenance performed; backup frequency verified."
              className="ux-input"
              autoFocus
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button type="button" className="ux-btn" onClick={() => setEditingNotes(null)}>Cancel</button>
              <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                {loading ? "Saving..." : "Save Notes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Link Project Dialog (Admin only) */}
      {linkingProject && (
        <Dialog labelledBy="dialog-link-project-title" onClose={() => setLinkingProject(null)} maxWidth={480}>
          <form onSubmit={handleLinkProject} style={{ display: "grid", gap: "1rem" }}>
            <h2 id="dialog-link-project-title" style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              Link Project to {linkingProject.systemName}
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              Attach an existing delivery Project to this digital System.
            </p>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Select Project</span>
              <select name="project_id" required className="ux-input" defaultValue="">
                <option value="" disabled>Select Delivery Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button type="button" className="ux-btn" onClick={() => setLinkingProject(null)}>Cancel</button>
              <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                Link Project
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Confirm Retirement Dialog (Admin only) */}
      {confirmingRetire && (
        <Dialog labelledBy="dialog-retire-title" onClose={() => setConfirmingRetire(null)} maxWidth={440}>
          <div style={{ display: "grid", gap: "1rem" }}>
            <h2 id="dialog-retire-title" style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              Retire {confirmingRetire.type === "system" ? "System" : "Resource"}
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.875rem", margin: 0 }}>
              Are you sure you want to retire <b>{confirmingRetire.name}</b>? This performs an operational retirement; history is preserved and no data is destroyed.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button type="button" className="ux-btn" onClick={() => setConfirmingRetire(null)}>Cancel</button>
              <button type="button" className="ux-btn ux-btn--danger" onClick={executeRetire} disabled={loading}>
                {loading ? "Retiring..." : "Confirm Retirement"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
