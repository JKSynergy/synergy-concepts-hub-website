import { notFound, redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { createClient } from "@/lib/supabase/server";
import { isInternal, isOperationalStaff, isAdmin as checkIsAdmin } from "@/lib/security/roles";
import { buildSystemDetailResources } from "@/lib/providers/system-detail";
import { assessSystemHealth, type SystemHealthStatus } from "@/lib/providers/system-health";
import SystemNotes from "./system-notes";
import SystemEdit from "./system-edit";
import SystemIntegration from "./system-integration";
import { CopyButton } from "./system-identity";
import "../systems.css";

const SYSTEM_TONE: Record<string, Tone> = {
  planned: "neutral",
  in_build: "info",
  live: "success",
  maintenance_only: "warning",
  suspended: "danger",
  retired: "neutral",
};

const HEALTH_TONE: Record<SystemHealthStatus, Tone> = {
  HEALTHY: "success",
  ATTENTION: "warning",
  UNKNOWN: "neutral",
};

const RESOURCE_TONE: Record<string, Tone> = {
  READY: "success",
  SUCCESS: "success",
  active: "success",
  ERROR: "danger",
  FAILED: "danger",
  degraded: "warning",
  BUILDING: "info",
  provisioning: "info",
};

function label(value: string | null | undefined): string {
  return value ? value.replace(/_/g, " ").replace(/^\w/, (character) => character.toUpperCase()) : "—";
}

/** Deterministic UTC text, matching the rest of the Systems and Operations pages. */
function utc(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function deploymentDetail(metadata: Record<string, unknown> | null, environment: "production" | "preview") {
  const environments = metadata?.environments && typeof metadata.environments === "object"
    ? metadata.environments as Record<string, unknown>
    : null;
  const value = environments?.[environment];
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export default async function SystemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isInternal(profile.role)) redirect("/client");

  const { data: system } = await supabase
    .from("systems")
    .select("id, client_id, name, system_type, status, description, primary_url, origin_project_id, operational_notes, archived_at, suspended_at, suspended_by, suspension_reason, suspension_note, resumed_at, resumed_by, status_token_last_rotated_at")
    .eq("id", id)
    .single();
  if (!system) notFound();

  const [{ data: client }, { data: resources }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select("id, company_name, full_name, email").eq("id", system.client_id).single(),
    supabase
      .from("resources")
      .select("id, name, resource_type, status, external_reference, provider_account_id, provider_account:provider_accounts(account_name, connection_status, provider:providers(name, adapter_key))")
      .eq("system_id", id)
      .is("retired_at", null)
      .order("name"),
    supabase.from("projects").select("id, title, status").eq("system_id", id).order("title"),
  ]);

  const resourceIds = (resources ?? []).map((resource) => resource.id);
  const { data: discovered } = resourceIds.length
    ? await supabase
        .from("provider_discovered_resources")
        .select("linked_resource_id, external_resource_id, resource_type, name, status, external_url, metadata, last_seen_at, link_status")
        .in("linked_resource_id", resourceIds)
        .eq("link_status", "linked")
    : { data: [] };

  const normalizedResources = (resources ?? []).map((resource) => {
    const account = Array.isArray(resource.provider_account) ? resource.provider_account[0] : resource.provider_account;
    const provider = account && (Array.isArray(account.provider) ? account.provider[0] : account.provider);
    return {
      id: resource.id,
      name: resource.name,
      resource_type: resource.resource_type,
      status: resource.status,
      external_reference: resource.external_reference,
      provider: provider?.name ?? "Unknown provider",
      provider_key: provider?.adapter_key ?? null,
      provider_account: account?.account_name ?? "Unknown account",
      provider_connection_status: account?.connection_status ?? null,
    };
  });
  const infrastructure = buildSystemDetailResources(normalizedResources, (discovered ?? []).map((item) => ({
    ...item,
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : null,
  })));
  const grouped = new Map<string, typeof infrastructure>();
  for (const resource of infrastructure) {
    const list = grouped.get(resource.provider) ?? [];
    list.push(resource);
    grouped.set(resource.provider, list);
  }

  const clientName = client?.company_name ?? client?.full_name ?? client?.email ?? "Unknown client";
  const health = assessSystemHealth(system.name, infrastructure);
  const canEditNotes = isOperationalStaff(profile.role);
  const canEditSystem = checkIsAdmin(profile.role);

  const { data: clientRows } = canEditSystem
    ? await supabase
        .from("profiles")
        .select("id, email, company_name, full_name")
        .eq("role", "client")
        .order("company_name")
    : { data: [] };
  const clientOptions = (clientRows ?? []).map((c) => ({
    id: c.id,
    label: c.company_name ? `${c.company_name} (${c.email})` : (c.full_name || c.email),
  }));

  const healthLabel = health.overallStatus === "HEALTHY" ? "Healthy" : health.overallStatus === "ATTENTION" ? "Needs attention" : "Unknown";
  const healthDot = health.overallStatus === "HEALTHY" ? "is-ok" : health.overallStatus === "ATTENTION" ? "is-warn" : "";
  const firstItems = health.attentionItems.slice(0, 3);
  const moreItems = health.attentionItems.slice(3);

  return (
    <div className="ux-page ux-page--wide ops-page sy-detail">
      <Link href="/admin/systems" className="ux-back">← Systems</Link>

      <header className="sy-panel sy-detail-head">
        <h1>{system.name}</h1>
        <p className="sy-detail-client">
          <Link href={`/admin/clients/${system.client_id}`}>{clientName}</Link>
        </p>
        <div className="sy-detail-meta">
          <span className="sy-chip">{label(system.system_type)}</span>
          <StatusMark tone={SYSTEM_TONE[system.status] ?? "neutral"}>{label(system.status)}</StatusMark>
          <span className="sy-meta"><i className={`sy-dot ${healthDot}`} /> {healthLabel}</span>
          {canEditSystem && <SystemEdit system={system} clients={clientOptions} />}
        </div>
        {system.primary_url && (
          <div className="sy-detail-endpoint">
            <div className="sy-label">Production endpoint</div>
            <div className="sy-endpoint">
              <a href={system.primary_url}>{system.primary_url}</a>
              <CopyButton value={system.primary_url} />
            </div>
          </div>
        )}
        {system.description && <p className="sy-detail-desc">{system.description}</p>}
      </header>

      <div className="sy-cols">
        <div className="sy-col">
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>System Health</h2>
              <StatusMark tone={HEALTH_TONE[health.overallStatus]}>{health.overallStatus}</StatusMark>
            </div>
            <div className="sy-health-big"><i className={`sy-dot ${healthDot}`} /><b>{healthLabel}</b></div>
            <p style={{ margin: "0.25rem 0 0", maxWidth: "75ch" }}>{health.explanation}</p>
            {firstItems.length > 0 && (
              <ul className="sy-attn">
                {firstItems.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {moreItems.length > 0 && (
              <details className="sy-attn-more">
                <summary>Show {moreItems.length} more</summary>
                <ul className="sy-attn">{moreItems.map((item) => <li key={item}>{item}</li>)}</ul>
              </details>
            )}
            <div className="sy-substatus">
              <span className="sy-chip">Infrastructure: {health.infrastructureStatus}</span>
              <span className="sy-chip">Deployments: {health.deploymentStatus}</span>
              <span className="sy-chip">Provider evidence: {health.providerEvidenceStatus}</span>
              {health.lastEvidenceAt && <span className="sy-chip">Last evidence: {utc(health.lastEvidenceAt)}</span>}
            </div>
          </section>

          <SystemIntegration
            systemId={system.id}
            status={system.status}
            tokenConfigured={Boolean(system.status_token_last_rotated_at)}
            isAdmin={canEditSystem}
          />

          <section>
            <h2 style={{ margin: "0 0 1rem" }}>Infrastructure</h2>
            {infrastructure.length === 0 ? (
              <div className="sy-link-cta">
                <p>No infrastructure is linked to this system yet, so its health cannot be checked.</p>
                <Link href="/admin/systems/providers" className="ux-btn">Link infrastructure →</Link>
              </div>
            ) : (
              [...grouped.entries()].map(([provider, providerResources]) => (
                <div key={provider} style={{ padding: "1rem 0", borderTop: "1px solid var(--border)" }}>
                  <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{provider}</h3>
                  {providerResources.map((resource) => {
                    const production = deploymentDetail(resource.metadata, "production");
                    const preview = deploymentDetail(resource.metadata, "preview");
                    const status = resource.discovered_status ?? resource.status;
                    return (
                      <div key={resource.id} style={{ padding: "1rem 0", borderTop: "1px solid color-mix(in srgb, var(--border) 65%, transparent)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                          <div>
                            <strong style={{ fontSize: "1rem" }}>{resource.discovered_name ?? resource.name}</strong>
                            {resource.provider_key === "railway" && resource.railway_project_name ? (
                              <div className="ux-muted" style={{ marginTop: "0.2rem", fontSize: "0.85rem" }}>
                                Project: {resource.railway_project_name}
                                {resource.railway_environment_name ? ` · Environment: ${resource.railway_environment_name}` : ""}
                                {resource.railway_service_name ? ` · Service: ${resource.railway_service_name}` : ""}
                              </div>
                            ) : (
                              <div className="ux-muted" style={{ marginTop: "0.2rem", fontSize: "0.85rem" }}>{label(resource.resource_type)}</div>
                            )}
                          </div>
                          <StatusMark tone={RESOURCE_TONE[status] ?? "neutral"}>{label(status)}</StatusMark>
                        </div>
                        {resource.production_domain && (
                          <div style={{ marginTop: "0.75rem" }}>
                            <span className="ux-muted" style={{ marginRight: "0.5rem", fontSize: "0.8rem" }}>Production</span>
                            <a href={resource.production_domain.startsWith("http") ? resource.production_domain : `https://${resource.production_domain}`}>{resource.production_domain}</a>
                          </div>
                        )}
                        <details style={{ marginTop: "0.75rem", fontSize: "0.825rem" }}>
                          <summary className="ux-muted" style={{ cursor: "pointer", width: "fit-content" }}>Technical details</summary>
                          <dl style={{ display: "grid", gridTemplateColumns: "minmax(9rem, auto) 1fr", gap: "0.35rem 1rem", margin: "0.65rem 0 0", paddingLeft: "0.75rem", borderLeft: "1px solid var(--border)" }}>
                            <dt className="ux-muted">Provider account</dt><dd style={{ margin: 0 }}>{resource.provider_account}</dd>
                            {resource.external_id && <><dt className="ux-muted">External provider ID</dt><dd style={{ margin: 0 }}><code>{resource.external_id}</code></dd></>}
                            {resource.deployment_status && <><dt className="ux-muted">Latest deployment</dt><dd style={{ margin: 0 }}>{resource.deployment_status}{resource.deployment_created_at ? ` · ${utc(resource.deployment_created_at)}` : ""}</dd></>}
                            {production && <><dt className="ux-muted">Production environment</dt><dd style={{ margin: 0 }}>{String(production.status ?? "Known")}</dd></>}
                            {preview && <><dt className="ux-muted">Preview environment</dt><dd style={{ margin: 0 }}>{String(preview.status ?? "Known")}</dd></>}
                            {resource.last_discovered_at && <><dt className="ux-muted">Last discovered</dt><dd style={{ margin: 0 }}>{utc(resource.last_discovered_at)}</dd></>}
                          </dl>
                        </details>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </section>
        </div>

        <div className="sy-col">
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Service Status</h2>
              <StatusMark tone={SYSTEM_TONE[system.status] ?? "neutral"}>{label(system.status)}</StatusMark>
            </div>
            <p style={{ margin: "0.65rem 0 0" }} className="ux-muted">
              Commercial application access status. This is independent of infrastructure health.
            </p>
            {system.status === "suspended" && (
              <div className="ux-muted" style={{ marginTop: "0.75rem", fontSize: "0.825rem" }}>
                <div>Suspended at: {system.suspended_at ? utc(system.suspended_at) : "—"}</div>
                <div>Reason: {system.suspension_reason ? label(system.suspension_reason) : "—"}</div>
                {system.suspension_note && <div>Note: {system.suspension_note}</div>}
              </div>
            )}
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
              <Link href="/admin/operations/suspensions">Manage in Suspensions →</Link>
            </p>
          </section>

          <section>
            <h2 style={{ margin: "0 0 1rem" }}>Client and project relationship</h2>
            <p><strong>Client:</strong> <Link href={`/admin/clients/${system.client_id}`}>{clientName}</Link></p>
            {(projects ?? []).length > 0 ? (
              <ul style={{ marginBottom: 0 }}>
                {(projects ?? []).map((project) => <li key={project.id}><Link href={`/admin/projects/${project.id}`}>{project.title}</Link> · {label(project.status)}</li>)}
              </ul>
            ) : (
              <p className="ux-muted">No SCH Project is currently linked to this system.</p>
            )}
          </section>

          <section>
            <SystemNotes systemId={system.id} systemName={system.name} notes={system.operational_notes} canEdit={canEditNotes} />
          </section>
        </div>
      </div>
    </div>
  );
}
