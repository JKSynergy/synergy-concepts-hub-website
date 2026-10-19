"use client";

import { useState } from "react";
import { Search, Server } from "lucide-react";
import { CopyButton } from "./[id]/system-identity";
import { NavLink as Link } from "@/components/nav-link";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import type { SystemHealthStatus } from "@/lib/providers/system-health";
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

/** Deterministic UTC text: identical on server and client (no hydration mismatch). */
function fmtUtc(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

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
  systemHealth,
  isAdmin,
  isStaff,
}: {
  systems: SystemItem[];
  resources: ResourceItem[];
  clients: ClientOption[];
  providerAccounts: ProviderAccountOption[];
  projects: ProjectOption[];
  systemHealth: { system_id: string; status: SystemHealthStatus; lastEvidenceAt: string | null }[];
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

  // ── Registry view state (filters) and derived figures ──
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const healthInfo = new Map(systemHealth.map((item) => [item.system_id, item]));
  const activeSystems = systems.filter((s) => s.status !== "retired");
  const retiredSystems = systems.filter((s) => s.status === "retired");
  const providersOf = (systemId: string) =>
    [...new Set((attachedResourcesBySystem.get(systemId) || []).map((r) => r.provider_account?.providers?.name).filter(Boolean) as string[])];
  const providerNames = [...new Set(activeSystems.flatMap((s) => providersOf(s.id)))].sort();
  const healthCount = { HEALTHY: 0, ATTENTION: 0, UNKNOWN: 0 } as Record<SystemHealthStatus, number>;
  for (const s of activeSystems) healthCount[healthInfo.get(s.id)?.status ?? "UNKNOWN"]++;
  const lifecycleCount: Record<string, number> = {};
  for (const s of activeSystems) lifecycleCount[s.status] = (lifecycleCount[s.status] ?? 0) + 1;
  const latestEvidence = systemHealth.map((h) => h.lastEvidenceAt).filter(Boolean).sort().pop() ?? null;
  const share = (n: number) => (activeSystems.length ? `${(n / activeSystems.length) * 100}%` : "0%");
  const HEALTH_RANK: Record<SystemHealthStatus, number> = { ATTENTION: 0, UNKNOWN: 1, HEALTHY: 2 };
  const q = query.trim().toLowerCase();
  const visibleSystems = activeSystems
    .filter((s) => {
      const client = `${s.client?.company_name ?? ""} ${s.client?.full_name ?? ""} ${s.client?.email ?? ""}`;
      if (q && !`${s.name} ${client} ${s.primary_url ?? ""}`.toLowerCase().includes(q)) return false;
      if (healthFilter !== "all" && (healthInfo.get(s.id)?.status ?? "UNKNOWN") !== healthFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (providerFilter !== "all" && !providersOf(s.id).includes(providerFilter)) return false;
      return true;
    })
    // problems first (attention, then unknown), then A-Z
    .sort((a, b) =>
      (isAdmin ? HEALTH_RANK[healthInfo.get(a.id)?.status ?? "UNKNOWN"] - HEALTH_RANK[healthInfo.get(b.id)?.status ?? "UNKNOWN"] : 0)
      || a.name.localeCompare(b.name));

  function renderSystemCard(sys: SystemItem) {
    const clientLabel = sys.client?.company_name || sys.client?.full_name || sys.client?.email || "Unknown Client";
    const attached = attachedResourcesBySystem.get(sys.id) || [];
    const info = healthInfo.get(sys.id);
    const health = info?.status;
    const isRetired = sys.status === "retired";
    const providers = providersOf(sys.id);
    const tone = health === "HEALTHY" ? "ok" : health === "ATTENTION" ? "warn" : "idle";
    return (
      <li key={sys.id} id={`system-card-${sys.id}`} className={`sy-card is-${tone}${isRetired ? " is-retired" : ""}`}>
        <div className="sy-card-head">
          <span className={`sy-icon is-${tone}`} aria-hidden="true"><Server size={16} /></span>
          <div className="sy-card-title">
            <Link href={`/admin/systems/${sys.id}`} className="sy-name">{sys.name}</Link>
            <span className="sy-client">{clientLabel}</span>
          </div>
          <StatusMark tone={SYSTEM_STATUS_TONE[sys.status] || "neutral"}>{labelize(sys.status)}</StatusMark>
        </div>

        {sys.primary_url ? (
          <div className="sy-endpoint">
            <a href={sys.primary_url} title={sys.primary_url}>{sys.primary_url.replace(/^https?:\/\//, "")}</a>
            <CopyButton value={sys.primary_url} />
          </div>
        ) : (
          <div className="sy-endpoint is-empty">No production URL recorded</div>
        )}

        <div className="sy-chips">
          <span className="sy-chip">{labelize(sys.system_type)}</span>
          {providers.map((p) => <span key={p} className="sy-chip is-provider">{p}</span>)}
          {sys.origin_project && <span className="sy-chip">Project: {sys.origin_project.title}</span>}
        </div>

        <div className="sy-health">
          {health ? (
            <>
              <span className={`sy-dot is-${tone}`} />
              <b>{health === "HEALTHY" ? "Healthy" : health === "ATTENTION" ? "Needs attention" : "Unknown"}</b>
              <span className="sy-meta">
                {info?.lastEvidenceAt ? `evidence ${fmtUtc(info.lastEvidenceAt)}` : attached.length === 0 ? "no linked infrastructure" : "no provider evidence yet"}
              </span>
            </>
          ) : (
            <span className="sy-meta">Health is visible to administrators</span>
          )}
        </div>

        <details className="sy-resources">
          <summary>{attached.length === 0 ? "No linked resources" : `${attached.length} linked resource${attached.length === 1 ? "" : "s"}`}</summary>
          {attached.length > 0 && (
            <ul>
              {attached.map((r) => (
                <li key={r.id}>
                  <div className="sy-res-main">
                    <b>{r.name}</b>
                    <span className="sy-meta">
                      {labelize(r.resource_type)}
                      {r.provider_account?.account_name ? ` · ${r.provider_account.account_name}` : ""}
                    </span>
                    {r.external_reference && <code className="sy-ref">{r.external_reference}</code>}
                  </div>
                  <div className="sy-res-side">
                    <StatusMark tone={RESOURCE_STATUS_TONE[r.status] || "neutral"}>{labelize(r.status)}</StatusMark>
                    {isStaff && (
                      <button type="button" className="ux-btn ux-btn--small" onClick={() => setEditingNotes({ type: "resource", id: r.id, name: r.name, notes: r.operational_notes || "" })}>
                        Notes
                      </button>
                    )}
                    {isAdmin && r.status !== "retired" && (
                      <button type="button" className="ux-btn ux-btn--small ux-btn--outline-danger" onClick={() => setConfirmingRetire({ type: "resource", id: r.id, name: r.name })}>
                        Retire
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </details>

        <div className="sy-card-foot">
          <Link href={`/admin/systems/${sys.id}`} className="sy-open">Open system →</Link>
          <div className="sy-card-actions">
            {isStaff && (
              <button type="button" className="ux-btn ux-btn--small" onClick={() => setEditingNotes({ type: "system", id: sys.id, name: sys.name, notes: sys.operational_notes || "" })}>
                Notes
              </button>
            )}
            {isAdmin && (
              <>
                <button type="button" className="ux-btn ux-btn--small" onClick={() => setLinkingProject({ systemId: sys.id, systemName: sys.name })}>
                  Link project
                </button>
                {!isRetired && (
                  <button type="button" className="ux-btn ux-btn--small ux-btn--outline-danger" onClick={() => setConfirmingRetire({ type: "system", id: sys.id, name: sys.name })}>
                    Retire
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="ux-systems-manager sy">
      {/* ── Fleet summary + actions ── */}
      <div className="sy-top">
        <div className="sy-summary">
          {isAdmin && (
            <div className="sy-sum-block">
              <h2 className="sy-label">Fleet health</h2>
              <p className="sy-big"><b>{healthCount.HEALTHY}</b> of {activeSystems.length} healthy</p>
              <div className="sy-segbar" role="img" aria-label={`${healthCount.HEALTHY} healthy, ${healthCount.ATTENTION} need attention, ${healthCount.UNKNOWN} unknown`}>
                <span style={{ width: share(healthCount.HEALTHY), background: "var(--sy-ok)" }} />
                <span style={{ width: share(healthCount.ATTENTION), background: "var(--sy-warn)" }} />
                <span style={{ width: share(healthCount.UNKNOWN), background: "var(--sy-idle)" }} />
              </div>
              <p className="sy-sub">
                <span><i className="sy-dot is-ok" />{healthCount.HEALTHY} healthy</span>
                <span><i className="sy-dot is-warn" />{healthCount.ATTENTION} attention</span>
                <span><i className="sy-dot is-idle" />{healthCount.UNKNOWN} unknown</span>
              </p>
            </div>
          )}
          <div className="sy-sum-block">
            <h2 className="sy-label">Lifecycle</h2>
            <p className="sy-big"><b>{lifecycleCount.live ?? 0}</b> live</p>
            <p className="sy-sub">
              {Object.entries(lifecycleCount).filter(([k]) => k !== "live").map(([k, n]) => (
                <span key={k}>{n} {labelize(k).toLowerCase()}</span>
              ))}
              {retiredSystems.length > 0 && <span>{retiredSystems.length} retired</span>}
            </p>
          </div>
          {isAdmin && (
            <div className="sy-sum-block">
              <h2 className="sy-label">Latest provider evidence</h2>
              <p className="sy-big sy-mono">{latestEvidence ? fmtUtc(latestEvidence) : "none yet"}</p>
              <p className="sy-sub"><Link href="/admin/systems/monitoring">Monitoring →</Link></p>
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="sy-actions">
            <button type="button" className="ux-btn ux-btn--primary" onClick={() => setShowNewSystem(true)} id="btn-create-system">
              + New System
            </button>
            <button type="button" className="ux-btn" onClick={() => setShowNewResource(true)} id="btn-create-resource">
              + New Technical Resource
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="ux-alert ux-alert--danger" style={{ marginBottom: "1rem" }}>
          {errorMsg}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="sy-filters">
        <label className="sy-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            className="ux-input"
            placeholder="Search systems, clients or URLs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search systems"
          />
        </label>
        {isAdmin && (
          <select className="ux-select" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} aria-label="Filter by health">
            <option value="all">All health</option>
            <option value="HEALTHY">Healthy</option>
            <option value="ATTENTION">Needs attention</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        )}
        <select className="ux-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by lifecycle">
          <option value="all">All lifecycle states</option>
          {Object.keys(SYSTEM_STATUS_TONE).filter((s) => s !== "retired").map((s) => (
            <option key={s} value={s}>{labelize(s)}</option>
          ))}
        </select>
        {providerNames.length > 0 && (
          <select className="ux-select" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} aria-label="Filter by provider">
            <option value="all">All providers</option>
            {providerNames.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <span className="sy-count">{visibleSystems.length} of {activeSystems.length} systems</span>
      </div>

      {/* ── Systems ── */}
      {systems.length === 0 ? (
        <div className="sy-panel sy-empty">
          <p className="ux-muted">No systems yet. Add a system to begin tracking a client&apos;s digital infrastructure.</p>
        </div>
      ) : visibleSystems.length === 0 ? (
        <div className="sy-panel sy-empty"><p className="ux-muted">No systems match these filters.</p></div>
      ) : (
        <ul className="sy-grid">
          {visibleSystems.map((sys) => renderSystemCard(sys))}
        </ul>
      )}

      {retiredSystems.length > 0 && (
        <details className="sy-retired">
          <summary>Retired systems ({retiredSystems.length})</summary>
          <ul className="sy-grid">{retiredSystems.map((sys) => renderSystemCard(sys))}</ul>
        </details>
      )}

      {/* ── Standalone resources ── */}
      <div className="sy-sechead">
        <h2 className="sy-label">Standalone resources ({standaloneResources.length})</h2>
        <span>Domains, DNS zones and databases not tied to one system</span>
      </div>
      {standaloneResources.length === 0 ? (
        <div className="sy-panel sy-empty"><p className="ux-muted">No standalone resources recorded.</p></div>
      ) : (
        <ul className="sy-panel sy-reslist">
          {standaloneResources.map((r) => (
            <li key={r.id} id={`standalone-resource-${r.id}`}>
              <div className="sy-res-main">
                <b>{r.name}</b>
                <span className="sy-chip">{labelize(r.resource_type)}</span>
                <span className="sy-meta">
                  {r.provider_account?.providers?.name ? `${r.provider_account.providers.name} · ` : ""}
                  {r.provider_account?.account_name || "No provider account"} · {labelize(r.ownership)}
                </span>
                {r.external_reference && <code className="sy-ref">{r.external_reference}</code>}
                {r.operational_notes && <span className="sy-note">{r.operational_notes}</span>}
              </div>
              <div className="sy-res-side">
                <StatusMark tone={RESOURCE_STATUS_TONE[r.status] || "neutral"}>{labelize(r.status)}</StatusMark>
                {isStaff && (
                  <button type="button" className="ux-btn ux-btn--small" onClick={() => setEditingNotes({ type: "resource", id: r.id, name: r.name, notes: r.operational_notes || "" })}>
                    Notes
                  </button>
                )}
                {isAdmin && r.status !== "retired" && (
                  <button type="button" className="ux-btn ux-btn--small ux-btn--outline-danger" onClick={() => setConfirmingRetire({ type: "resource", id: r.id, name: r.name })}>
                    Retire
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

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
