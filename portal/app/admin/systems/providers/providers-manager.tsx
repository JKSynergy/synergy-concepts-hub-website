"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Plus, RefreshCw, Link2, Unlink, XCircle, KeyRound, EyeOff, FileSearch } from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  createProvider,
  createProviderAccount,
  configureProviderCredential,
  clearProviderCredential,
  testProviderConnection,
  runProviderDiscovery,
  auditSystemInfrastructure,
  linkDiscoveredResource,
  unlinkDiscoveredResource,
  dismissDiscoveredResource,
} from "@/lib/actions/provider-connections";
import type { SystemInfrastructureAssessment } from "@/lib/providers/infrastructure-reconciliation";
import {
  buildDiscoveryTree,
  projectCounts,
  shortName,
  type DiscoveryTree,
  type ProjectNode,
} from "./discovery-tree";

export interface ProviderAccountItem {
  id: string;
  provider_id: string;
  provider_name: string | null;
  adapter_key: string | null;
  account_name: string;
  account_identifier: string | null;
  ownership: string;
  client_id: string | null;
  client_company: string | null;
  client_email: string | null;
  account_status: string;
  connection_status: string;
  connection_checked_at: string | null;
  connection_error: string | null;
  last_discovery_at: string | null;
  discovery_capabilities: Record<string, unknown>;
  credential_configured: boolean;
  discovered_count: number;
  linked_count: number;
  last_run_at: string | null;
  railway_workspace_id: string | null;
  railway_workspace_name: string | null;
}

export interface DiscoveredItem {
  id: string;
  provider_account_id: string;
  provider_name: string | null;
  account_name: string | null;
  external_resource_id: string;
  resource_type: string;
  name: string;
  status: string | null;
  region: string | null;
  external_url: string | null;
  metadata?: Record<string, unknown> | null;
  first_discovered_at: string;
  last_seen_at: string;
  link_status: "unlinked" | "linked" | "dismissed";
  linked_resource_id: string | null;
  linked_at: string | null;
}

export interface RunItem {
  id: string;
  provider_account_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  discovered_count: number;
  new_count: number;
  linked_count: number;
  error_count: number;
  error_summary: string | null;
}

export interface StaffLinkedItem {
  id: string;
  provider_name: string | null;
  provider_account_name: string;
  resource_type: string;
  name: string;
  status: string | null;
  region: string | null;
  external_url: string | null;
  system_name: string | null;
  client_company: string | null;
  client_email: string | null;
  linked_at: string | null;
}

export interface ProviderOption {
  id: string;
  name: string;
  slug: string;
  adapter_key: string | null;
  category: string;
}

export interface SelectOption {
  id: string;
  label?: string;
  name?: string;
  client_id?: string;
}

interface Props {
  accounts: ProviderAccountItem[];
  discovered: DiscoveredItem[];
  staffLinked: StaffLinkedItem[];
  runs: RunItem[];
  providers: ProviderOption[];
  clients: { id: string; label: string }[];
  systems: { id: string; name: string; client_id: string }[];
  isAdmin: boolean;
  isFinance: boolean;
  isStaff: boolean;
}

const CAPABILITY_LABELS: [keyof Record<string, unknown>, string][] = [
  ["discoverResources", "Discover resources"],
  ["readResourceMetadata", "Read metadata"],
  ["create", "Create"],
  ["update", "Update"],
  ["delete", "Delete"],
  ["suspend", "Suspend"],
  ["billing", "Billing"],
];

function connTone(status: string): Tone {
  switch (status) {
    case "connected": return "success";
    case "failed": return "danger";
    case "configured": return "info";
    default: return "neutral";
  }
}

function linkTone(status: string): Tone {
  switch (status) {
    case "linked": return "success";
    case "dismissed": return "neutral";
    default: return "warning";
  }
}

function runTone(status: string): Tone {
  switch (status) {
    case "completed": return "success";
    case "failed": return "danger";
    case "partial": return "warning";
    default: return "info";
  }
}

function assessmentTone(status: SystemInfrastructureAssessment["assessment"]): Tone {
  if (status === "Complete") return "success";
  if (status === "Partial") return "warning";
  return "neutral";
}

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function isLinkableResource(type: string): boolean {
  return ["project", "service", "database", "zone", "hosting", "storage"].includes(type);
}

export default function ProvidersManager({
  accounts,
  discovered,
  staffLinked,
  runs,
  providers,
  clients,
  systems,
  isAdmin,
  isFinance,
  isStaff,
}: Props) {
  const router = useRouter();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [infrastructureAudit, setInfrastructureAudit] = useState<SystemInfrastructureAssessment[] | null>(null);

  const [credModalFor, setCredModalFor] = useState<string | null>(null);
  const [credToken, setCredToken] = useState("");
  const [credAccountId, setCredAccountId] = useState("");

  const [newProviderOpen, setNewProviderOpen] = useState(false);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pSlug, setPSlug] = useState("");
  const [pAdapter, setPAdapter] = useState("supabase");
  const [aProviderId, setAProviderId] = useState("");
  const [aName, setAName] = useState("");
  const [aIdentifier, setAIdentifier] = useState("");
  const [aOwnership, setAOwnership] = useState<"sch_managed" | "client_owned">("sch_managed");
  const [aClientId, setAClientId] = useState("");

  const [linkModalFor, setLinkModalFor] = useState<string | null>(null);
  const [linkClientId, setLinkClientId] = useState("");
  const [linkSystemId, setLinkSystemId] = useState("");

  const canManage = isAdmin;
  const activeAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;
  const selectedProvider = providers.find((p) => p.id === aProviderId);
  const accountDiscovered = discovered.filter((d) => d.provider_account_id === activeAccount?.id);
  const accountRuns = runs.filter((r) => r.provider_account_id === activeAccount?.id);
  const linkSystems = systems.filter((s) => s.client_id === linkClientId);
  const linkTarget = discovered.find((d) => d.id === linkModalFor);
  const tree = buildDiscoveryTree(accountDiscovered);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(tree.projects.map((p) => p.project.id))
  );

  async function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okMsg?: string) {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Operation failed");
    } else if (okMsg) {
      setNotice(okMsg);
    }
    router.refresh();
    return res;
  }

  async function runInfrastructureAudit() {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    const res = await auditSystemInfrastructure();
    setBusy(false);
    if (!res.ok) {
      setInfrastructureAudit(null);
      setErrorMessage(res.error || "Infrastructure reconciliation failed");
      return;
    }
    setInfrastructureAudit(res.data ?? []);
    setNotice(`Infrastructure reconciliation completed — ${res.data?.length ?? 0} systems reviewed`);
  }

  function ResourceActions({ item }: { item: DiscoveredItem }) {
    if (!canManage) return null;
    return (
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {item.link_status === "unlinked" && (
          <>
            {isLinkableResource(item.resource_type) && (
              <button
                className="ux-button ux-button-secondary"
                data-action="link-resource"
                disabled={busy}
                onClick={() => { setLinkModalFor(item.id); setLinkClientId(""); setLinkSystemId(""); }}
              >
                <Link2 size={13} /> Link
              </button>
            )}
            <button
              className="ux-button ux-button-secondary"
              data-action="dismiss-resource"
              disabled={busy}
              onClick={() => run(() => dismissDiscoveredResource(item.id), "Dismissed")}
            >
              <XCircle size={13} /> Dismiss
            </button>
          </>
        )}
        {item.link_status === "linked" && (
          <button
            className="ux-button ux-button-secondary"
            data-action="unlink-resource"
            disabled={busy}
            onClick={() => run(() => unlinkDiscoveredResource(item.id), "Unlinked — SCH resource retained for audit")}
          >
            <Unlink size={13} /> Unlink
          </button>
        )}
      </div>
    );
  }

  function ProjectSummary({ node }: { node: ProjectNode }) {
    if (activeAccount?.adapter_key === "vercel") {
      const metadata = node.project.metadata ?? {};
      const framework = typeof metadata.framework === "string" ? metadata.framework : null;
      const domain = typeof metadata.production_domain === "string" ? metadata.production_domain : null;
      return <span className="ux-muted" style={{ fontSize: "0.85rem" }}>{[framework, domain].filter(Boolean).join(" · ") || "Vercel project"}</span>;
    }
    const counts = projectCounts(node);
    const envLabel = counts.environments === 1 ? "1 environment" : `${counts.environments} environments`;
    const svcLabel = counts.services === 1 ? "1 service" : `${counts.services} services`;
    return <span className="ux-muted" style={{ fontSize: "0.85rem" }}>{envLabel} · {svcLabel}</span>;
  }

  function VercelProjectDetails({ item }: { item: DiscoveredItem }) {
    const metadata = item.metadata ?? {};
    const environments = metadata.environments && typeof metadata.environments === "object"
      ? metadata.environments as Record<string, unknown>
      : {};
    const production = environments.production && typeof environments.production === "object"
      ? environments.production as Record<string, unknown>
      : null;
    const preview = environments.preview && typeof environments.preview === "object"
      ? environments.preview as Record<string, unknown>
      : null;
    const deployment = metadata.latest_deployment && typeof metadata.latest_deployment === "object"
      ? metadata.latest_deployment as Record<string, unknown>
      : null;
    const detail = (value: Record<string, unknown> | null) => {
      if (!value) return "No deployment found";
      const status = typeof value.status === "string" ? value.status : "Unknown status";
      const createdAt = typeof value.created_at === "string" ? fmt(value.created_at) : null;
      return createdAt ? `${status} · ${createdAt}` : status;
    };

    return (
      <div style={{ padding: "0.35rem 0 0.6rem 3rem", display: "grid", gap: "0.25rem" }}>
        <span><strong>Production:</strong> {typeof metadata.production_domain === "string" ? metadata.production_domain : "No production domain"} · {detail(production)}</span>
        <span><strong>Preview:</strong> {detail(preview)}</span>
        <span><strong>Latest deployment:</strong> {detail(deployment)}</span>
      </div>
    );
  }

  // ---------------------------------------------------------------- staff ---
  if (isStaff) {
    return (
      <div>
        <div className="ux-card">
          <div className="ux-card-header"><h2>Linked Provider Resources</h2></div>
          {staffLinked.length === 0 ? (
            <p className="ux-muted" style={{ padding: "1rem" }}>No linked provider resources.</p>
          ) : (
            <div className="ux-tablewrap">
              <table className="ux-table">
                <thead>
                  <tr><th>Provider</th><th>Account</th><th>Type</th><th>Name</th><th>Status</th><th>Region</th><th>System</th><th>Client</th></tr>
                </thead>
                <tbody>
                  {staffLinked.map((r) => (
                    <tr key={r.id}>
                      <td>{r.provider_name}</td>
                      <td>{r.provider_account_name}</td>
                      <td>{r.resource_type}</td>
                      <td>{r.name}</td>
                      <td>{r.status ?? "—"}</td>
                      <td>{r.region ?? "—"}</td>
                      <td>{r.system_name ?? "—"}</td>
                      <td>{r.client_company ?? r.client_email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------- admin/finance ---
  return (
    <div>
      {errorMessage && <p className="ux-alert ux-alert-error" role="alert">{errorMessage}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      <div className="ux-card">
        <div className="ux-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Provider Accounts</h2>
          {canManage && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="ux-button ux-button-secondary" onClick={runInfrastructureAudit} disabled={busy} data-action="audit-system-infrastructure">
                <FileSearch size={14} /> Reconcile infrastructure
              </button>
              <button className="ux-button ux-button-secondary" onClick={() => setNewProviderOpen(true)}>
                <Plus size={14} /> Provider
              </button>
              <button className="ux-button" onClick={() => setNewAccountOpen(true)} disabled={providers.length === 0}>
                <Plus size={14} /> Provider account
              </button>
            </div>
          )}
        </div>

        {accounts.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>No provider accounts connected. Connect a provider account to begin discovery.</p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table">
              <thead>
                <tr>
                  <th>Provider</th><th>Account</th><th>Ownership</th><th>Connection</th>
                  <th>Credentials</th><th>Last discovery</th><th>Discovered</th><th>Linked</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedAccountId(a.id)}
                    style={{ cursor: "pointer", background: a.id === selectedAccountId ? "var(--ux-surface-alt, rgba(255,255,255,0.04))" : undefined }}
                  >
                    <td>{a.provider_name}{a.adapter_key ? "" : " (manual)"}</td>
                    <td>
                      {a.account_name}
                      {a.adapter_key === "railway" && a.railway_workspace_id ? (
                        <span className="ux-muted"> · {a.railway_workspace_id}</span>
                      ) : null}
                    </td>
                    <td>{a.ownership}{a.client_company ? ` · ${a.client_company}` : ""}</td>
                    <td>
                      <StatusMark tone={connTone(a.connection_status)}>{a.connection_status}</StatusMark>
                      {a.connection_error ? <span className="ux-muted"> {a.connection_error}</span> : null}
                    </td>
                    <td>{a.credential_configured ? "Credentials configured" : "Not configured"}</td>
                    <td>{fmt(a.last_discovery_at)}</td>
                    <td>{a.discovered_count}</td>
                    <td>{a.linked_count}</td>
                    {canManage && (
                      <td>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          <button
                            className="ux-button ux-button-secondary"
                            data-action="configure-credential"
                            onClick={(e) => { e.stopPropagation(); setCredModalFor(a.id); setCredToken(""); setCredAccountId(""); }}
                          >
                            <KeyRound size={13} /> Credential
                          </button>
                          <button
                            className="ux-button ux-button-secondary"
                            data-action="test-connection"
                            disabled={busy}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const res = await run(
                                () => testProviderConnection(a.id),
                                "Connection verified"
                              );
                              if (res.ok) setNotice(`Connection verified: ${a.account_name}`);
                            }}
                          >
                            <Plug size={13} /> Test
                          </button>
                          <button
                            className="ux-button ux-button-secondary"
                            data-action="discover"
                            disabled={busy}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const res = await run(() => runProviderDiscovery(a.id));
                              if (res.ok) {
                                const d = res.data as { discovered: number; newCount: number };
                                setNotice(`Discovery completed — ${d.discovered} found, ${d.newCount} new`);
                              }
                            }}
                          >
                            <RefreshCw size={13} /> Discover
                          </button>
                          {a.credential_configured && (
                            <button
                              className="ux-button ux-button-secondary"
                              data-action="clear-credential"
                              disabled={busy}
                              onClick={async (e) => {
                                e.stopPropagation();
                                await run(() => clearProviderCredential(a.id), "Credential cleared");
                              }}
                            >
                              <EyeOff size={13} /> Clear
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {infrastructureAudit !== null && (
        <div className="ux-card" data-testid="system-infrastructure-audit">
          <div className="ux-card-header">
            <h2>System infrastructure reconciliation</h2>
            <p className="ux-muted">Read-only evidence from existing SCH systems, resources, and explicit provider links.</p>
          </div>
          <div className="ux-tablewrap">
            <table className="ux-table">
              <thead>
                <tr><th>System / client</th><th>Railway</th><th>Vercel</th><th>Other infrastructure</th><th>Findings</th><th>Assessment</th></tr>
              </thead>
              <tbody>
                {infrastructureAudit.map((system) => {
                  const names = (items: SystemInfrastructureAssessment["resources"]) => items.length
                    ? items.map((item) => `${item.resourceName}${item.status ? ` (${item.status})` : ""}`).join(", ")
                    : "—";
                  const findings = [
                    ...system.missing.map((item) => `Missing: ${item}`),
                    ...system.context,
                    ...system.possibleDuplicatesOrLegacy.map((item) => `Review: ${item}`),
                    ...system.potentiallyIncorrect.map((item) => `Potential issue: ${item}`),
                  ];
                  return (
                    <tr key={`${system.client}:${system.systemName}`}>
                      <td><strong>{system.systemName}</strong><br /><span className="ux-muted">{system.client}</span></td>
                      <td>{names(system.railway)}</td>
                      <td>{names(system.vercel)}</td>
                      <td>{names(system.other)}</td>
                      <td>{findings.length ? findings.join(" · ") : "No gaps indicated by linked evidence"}</td>
                      <td><StatusMark tone={assessmentTone(system.assessment)}>{system.assessment}</StatusMark></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeAccount && (
        <div className="ux-card">
          <div className="ux-card-header">
            <h2>{activeAccount.provider_name} — {activeAccount.account_name}</h2>
            <p className="ux-muted">Capabilities and read-only discovery results</p>
          </div>
          <div style={{ padding: "0 1rem" }}>
            <p className="ux-muted">Capabilities:</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {CAPABILITY_LABELS.map(([key, label]) => {
                const caps = activeAccount.discovery_capabilities ?? {};
                const has = (caps as Record<string, unknown>)[key];
                return (
                  <li key={key} data-capability={key}>
                    {has === true ? "✓" : "✕"} {label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="ux-discovery-tree" style={{ padding: "0 1rem 1rem" }}>
            {accountDiscovered.length === 0 ? (
              <p className="ux-muted" style={{ padding: "1rem 0" }}>No discovered resources yet. Run discovery to populate this list.</p>
            ) : (
              <div style={{ borderTop: "1px solid var(--ux-border, #E5E7EB)", borderBottom: "1px solid var(--ux-border, #E5E7EB)" }}>
                {tree.workspace && (
                  <div
                    key={tree.workspace.id}
                    className="ux-discovery-row"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.5rem 0" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="ux-discovery-icon" style={{ width: "1.25rem", textAlign: "center" }}>▾</span>
                      <strong>{tree.workspace.name}</strong>
                      <span className="ux-muted" style={{ fontSize: "0.85rem" }}>workspace</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <StatusMark tone={linkTone(tree.workspace.link_status)}>{tree.workspace.link_status}</StatusMark>
                      <ResourceActions item={tree.workspace} />
                    </div>
                  </div>
                )}

                {tree.projects.map((p) => {
                  const expanded = expandedProjects.has(p.project.id);
                  const toggleProject = () => {
                    const next = new Set(expandedProjects);
                    if (next.has(p.project.id)) next.delete(p.project.id);
                    else next.add(p.project.id);
                    setExpandedProjects(next);
                  };

                  return (
                    <div key={p.project.id} className="ux-discovery-project">
                      <div
                        className="ux-discovery-row"
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.5rem 0 0.5rem 1.5rem" }}
                      >
                        <button
                          type="button"
                          onClick={toggleProject}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleProject();
                            }
                          }}
                          style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
                        >
                          <span className="ux-discovery-icon" style={{ width: "1.25rem", textAlign: "center" }}>
                            {expanded ? "▾" : "▸"}
                          </span>
                          <strong>{p.project.name}</strong>
                          <ProjectSummary node={p} />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <StatusMark tone={linkTone(p.project.link_status)}>{p.project.link_status}</StatusMark>
                          <ResourceActions item={p.project} />
                        </div>
                      </div>

                      {expanded && (
                        <div style={{ paddingLeft: "1.5rem" }}>
                          {activeAccount.adapter_key === "vercel" && <VercelProjectDetails item={p.project} />}
                          {p.environments.map((env) => (
                            <div key={env.environment.id}>
                              <div
                                className="ux-discovery-row"
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.35rem 0 0.35rem 1.5rem" }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span className="ux-discovery-icon" style={{ width: "1.25rem", textAlign: "center" }}>▾</span>
                                  {shortName(env.environment)}
                                  <span className="ux-muted" style={{ fontSize: "0.8rem" }}>{env.services.length === 1 ? "1 service" : `${env.services.length} services`}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <StatusMark tone={linkTone(env.environment.link_status)}>{env.environment.link_status}</StatusMark>
                                  <ResourceActions item={env.environment} />
                                </div>
                              </div>
                              <div style={{ paddingLeft: "1.5rem" }}>
                                {env.services.map((svc) => (
                                  <div
                                    key={svc.id}
                                    className="ux-discovery-row"
                                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.35rem 0 0.35rem 1.5rem" }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                      <span style={{ width: "1.25rem", textAlign: "center" }}>•</span>
                                      {shortName(svc)}
                                      <span className="ux-muted" style={{ fontSize: "0.8rem" }}>{svc.status ?? "—"}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                      <StatusMark tone={linkTone(svc.link_status)}>{svc.link_status}</StatusMark>
                                      <ResourceActions item={svc} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {p.orphanServices.length > 0 && (
                            <div>
                              {p.orphanServices.map((svc) => (
                                <div
                                  key={svc.id}
                                  className="ux-discovery-row"
                                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.35rem 0 0.35rem 3rem" }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <span style={{ width: "1.25rem", textAlign: "center" }}>•</span>
                                    {shortName(svc)}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <StatusMark tone={linkTone(svc.link_status)}>{svc.link_status}</StatusMark>
                                    <ResourceActions item={svc} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {tree.other.length > 0 && (
                  <div style={{ paddingTop: "0.5rem" }}>
                    {tree.other.map((d) => (
                      <div
                        key={d.id}
                        className="ux-discovery-row"
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.35rem 0" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ width: "1.25rem", textAlign: "center" }}>•</span>
                          {d.name} <span className="ux-muted" style={{ fontSize: "0.8rem" }}>{d.resource_type}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <StatusMark tone={linkTone(d.link_status)}>{d.link_status}</StatusMark>
                          <ResourceActions item={d} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {accountRuns.length > 0 && (
            <>
              <div className="ux-card-header" style={{ marginTop: "1rem" }}><h3>Discovery runs</h3></div>
              <div className="ux-tablewrap">
                <table className="ux-table">
                  <thead>
                    <tr><th>Started</th><th>Status</th><th>Found</th><th>New</th><th>Linked</th><th>Errors</th><th>Detail</th></tr>
                  </thead>
                  <tbody>
                    {accountRuns.map((r) => (
                      <tr key={r.id}>
                        <td>{fmt(r.started_at)}</td>
                        <td><StatusMark tone={runTone(r.status)}>{r.status}</StatusMark></td>
                        <td>{r.discovered_count}</td>
                        <td>{r.new_count}</td>
                        <td>{r.linked_count}</td>
                        <td>{r.error_count}</td>
                        <td className="ux-muted">{r.error_summary ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Configure credential */}
      {credModalFor && (
        <Dialog onClose={() => setCredModalFor(null)} labelledBy="cred-title" maxWidth={460}>
          <h2 id="cred-title">Configure credential</h2>
          <p className="ux-muted">
            The credential is stored in the server-side secrets vault and is never displayed again.
            Only its configured state is shown.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await run(
                () => configureProviderCredential({ providerAccountId: credModalFor, token: credToken, accountId: credAccountId || null }),
                "Credential stored securely"
              );
              if (res.ok) setCredModalFor(null);
            }}
          >
            <div>
              <label className="ux-label">API token *</label>
              <input
                id="input-credential-token"
                type="password"
                autoComplete="off"
                required
                value={credToken}
                onChange={(e) => setCredToken(e.target.value)}
                className="ux-input"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label className="ux-label">
                {accounts.find((account) => account.id === credModalFor)?.adapter_key === "vercel"
                  ? "Vercel team ID (optional)"
                  : "Account/workspace ID (optional)"}
              </label>
              <input
                id="input-credential-account"
                type="text"
                autoComplete="off"
                value={credAccountId}
                onChange={(e) => setCredAccountId(e.target.value)}
                className="ux-input"
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="button" className="ux-button ux-button-secondary" onClick={() => setCredModalFor(null)}>Cancel</button>
              <button type="submit" className="ux-button" disabled={busy}>Store securely</button>
            </div>
          </form>
        </Dialog>
      )}

      {/* New provider */}
      {newProviderOpen && (
        <Dialog onClose={() => setNewProviderOpen(false)} labelledBy="np-title" maxWidth={460}>
          <h2 id="np-title">Register provider</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await run(
                () => createProvider({ name: pName, slug: pSlug, adapterKey: pAdapter || null }),
                "Provider registered"
              );
              if (res.ok) setNewProviderOpen(false);
            }}
          >
            <div>
              <label className="ux-label">Name *</label>
              <input id="input-provider-name" required value={pName} onChange={(e) => setPName(e.target.value)} className="ux-input" style={{ width: "100%" }} />
            </div>
            <div>
              <label className="ux-label">Slug *</label>
              <input id="input-provider-slug" required value={pSlug} onChange={(e) => setPSlug(e.target.value)} className="ux-input" style={{ width: "100%" }} />
            </div>
            <div>
              <label className="ux-label">Discovery adapter</label>
              <select id="select-provider-adapter" value={pAdapter} onChange={(e) => setPAdapter(e.target.value)} className="ux-select" style={{ width: "100%" }}>
                <option value="supabase">Supabase</option>
                <option value="railway">Railway</option>
                <option value="vercel">Vercel</option>
                <option value="cloudflare">Cloudflare</option>
                <option value="">None (manual inventory)</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="button" className="ux-button ux-button-secondary" onClick={() => setNewProviderOpen(false)}>Cancel</button>
              <button type="submit" className="ux-button" disabled={busy}>Register</button>
            </div>
          </form>
        </Dialog>
      )}

      {/* New provider account */}
      {newAccountOpen && (
        <Dialog onClose={() => setNewAccountOpen(false)} labelledBy="na-title" maxWidth={460}>
          <h2 id="na-title">New provider account</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const isRailway = selectedProvider?.adapter_key === "railway";
              const res = await run(
                () => createProviderAccount({
                  providerId: aProviderId,
                  accountName: aName,
                  accountIdentifier: aIdentifier || null,
                  ownership: aOwnership,
                  clientId: aClientId || null,
                  railwayWorkspaceId: isRailway ? aIdentifier || null : null,
                }),
                "Provider account created"
              );
              if (res.ok) setNewAccountOpen(false);
            }}
          >
            <div>
              <label className="ux-label">Provider *</label>
              <select id="select-account-provider" required value={aProviderId} onChange={(e) => setAProviderId(e.target.value)} className="ux-select" style={{ width: "100%" }}>
                <option value="">Select provider...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.adapter_key ? "" : " (manual)"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ux-label">Account label *</label>
              <input id="input-account-name" required value={aName} onChange={(e) => setAName(e.target.value)} className="ux-input" style={{ width: "100%" }} />
            </div>
            <div>
              <label className="ux-label">
                {selectedProvider?.adapter_key === "railway" ? "Railway workspace ID (optional)" : "Account identifier"}
              </label>
              <input
                id="input-account-identifier"
                value={aIdentifier}
                onChange={(e) => setAIdentifier(e.target.value)}
                placeholder={selectedProvider?.adapter_key === "railway" ? "Leave blank to discover from the token" : ""}
                className="ux-input"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label className="ux-label">Ownership *</label>
              <select id="select-account-ownership" value={aOwnership} onChange={(e) => setAOwnership(e.target.value as "sch_managed" | "client_owned")} className="ux-select" style={{ width: "100%" }}>
                <option value="sch_managed">SCH managed</option>
                <option value="client_owned">Client owned</option>
              </select>
            </div>
            {aOwnership === "client_owned" && (
              <div>
                <label className="ux-label">Client *</label>
                <select id="select-account-client" required value={aClientId} onChange={(e) => setAClientId(e.target.value)} className="ux-select" style={{ width: "100%" }}>
                  <option value="">Select client...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="button" className="ux-button ux-button-secondary" onClick={() => setNewAccountOpen(false)}>Cancel</button>
              <button type="submit" className="ux-button" disabled={busy}>Create account</button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Link discovered resource */}
      {linkModalFor && linkTarget && (
        <Dialog onClose={() => setLinkModalFor(null)} labelledBy="link-title" maxWidth={480}>
          <h2 id="link-title">Link discovered resource</h2>
          <p className="ux-muted">
            {linkTarget.provider_name} · {linkTarget.name} · <code>{linkTarget.external_resource_id}</code>
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await run(
                () => linkDiscoveredResource({ discoveredId: linkModalFor, clientId: linkClientId, systemId: linkSystemId }),
                "Resource linked to SCH inventory"
              );
              if (res.ok) setLinkModalFor(null);
            }}
          >
            <div>
              <label className="ux-label">SCH Client *</label>
              <select
                id="select-link-client"
                required
                value={linkClientId}
                onChange={(e) => { setLinkClientId(e.target.value); setLinkSystemId(""); }}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="ux-label">SCH System *</label>
              <select
                id="select-link-system"
                required
                value={linkSystemId}
                onChange={(e) => setLinkSystemId(e.target.value)}
                disabled={!linkClientId}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">{linkClientId ? "Select system..." : "Select a client first"}</option>
                {linkSystems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {linkClientId && linkSystems.length === 0 && (
                <p className="ux-muted">No systems for this client — create one in Systems first.</p>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="button" className="ux-button ux-button-secondary" onClick={() => setLinkModalFor(null)}>Cancel</button>
              <button type="submit" className="ux-button" disabled={busy || !linkClientId || !linkSystemId}>Link resource</button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
