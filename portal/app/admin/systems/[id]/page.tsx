import { notFound, redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { createClient } from "@/lib/supabase/server";
import { isInternal, isOperationalStaff, isAdmin as checkIsAdmin } from "@/lib/security/roles";
import { buildSystemDetailResources } from "@/lib/providers/system-detail";
import { assessSystemHealth, type SystemHealthStatus } from "@/lib/providers/system-health";
import SystemNotes from "./system-notes";
import SystemEdit from "./system-edit";
import SystemIdentity from "./system-identity";

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
    .select("id, client_id, name, system_type, status, description, primary_url, origin_project_id, operational_notes, archived_at, suspended_at, suspended_by, suspension_reason, suspension_note, resumed_at, resumed_by")
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

  return (
    <div className="ux-page ux-page--wide">
      <Link href="/admin/systems" className="ux-back">← Systems</Link>

      <header style={{ padding: "1.75rem 0", borderBottom: "1px solid var(--border)" }}>
        <h1 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.15 }}>{system.name}</h1>
        <p style={{ margin: "0.4rem 0 0", fontSize: "1rem" }}>
          <Link href={`/admin/clients/${system.client_id}`}>{clientName}</Link>
        </p>
        <div className="ux-muted" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.65rem", fontSize: "0.875rem" }}>
          <span>{label(system.system_type)}</span>
          <StatusMark tone={SYSTEM_TONE[system.status] ?? "neutral"}>{label(system.status)}</StatusMark>
          {canEditSystem && <SystemEdit system={system} clients={clientOptions} />}
        </div>
        {system.primary_url && (
          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <div className="ux-muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Production endpoint</div>
            <a href={system.primary_url} style={{ display: "inline-block", marginTop: "0.25rem", fontWeight: 600 }}>{system.primary_url}</a>
          </div>
        )}
        <SystemIdentity systemId={system.id} />
        {system.description && <p style={{ maxWidth: "70ch", margin: "1.25rem 0 0", lineHeight: 1.6 }}>{system.description}</p>}
      </header>

      <section style={{ padding: "1.5rem 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Service Status</h2>
          <StatusMark tone={SYSTEM_TONE[system.status] ?? "neutral"}>{label(system.status)}</StatusMark>
        </div>
        <p style={{ margin: "0.65rem 0 0", maxWidth: "75ch" }}>
          Commercial application access status. This is independent of infrastructure health.
        </p>
        {system.status === "suspended" && (
          <div className="ux-muted" style={{ marginTop: "0.75rem", fontSize: "0.825rem" }}>
            <div>Suspended at: {system.suspended_at ? new Date(system.suspended_at).toLocaleString() : "—"}</div>
            <div>Reason: {system.suspension_reason ? label(system.suspension_reason) : "—"}</div>
            {system.suspension_note && <div>Note: {system.suspension_note}</div>}
          </div>
        )}
      </section>

      <section style={{ padding: "1.5rem 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>System Health</h2>
          <StatusMark tone={HEALTH_TONE[health.overallStatus]}>{health.overallStatus}</StatusMark>
        </div>
        <p style={{ margin: "0.65rem 0 0", maxWidth: "75ch" }}>{health.explanation}</p>
        {health.attentionItems.length > 0 && (
          <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem" }}>
            {health.attentionItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
        <div className="ux-muted" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.75rem", fontSize: "0.825rem" }}>
          <span>Infrastructure: {health.infrastructureStatus}</span>
          <span>Deployments: {health.deploymentStatus}</span>
          <span>Provider evidence: {health.providerEvidenceStatus}</span>
        </div>
      </section>

      <section style={{ padding: "1.5rem 0", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.2rem" }}>Infrastructure</h2>
        {infrastructure.length === 0 ? (
          <p className="ux-muted">No infrastructure resources are explicitly linked to this system.</p>
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
                        {resource.deployment_status && <><dt className="ux-muted">Latest deployment</dt><dd style={{ margin: 0 }}>{resource.deployment_status}{resource.deployment_created_at ? ` · ${new Date(resource.deployment_created_at).toLocaleString()}` : ""}</dd></>}
                        {production && <><dt className="ux-muted">Production environment</dt><dd style={{ margin: 0 }}>{String(production.status ?? "Known")}</dd></>}
                        {preview && <><dt className="ux-muted">Preview environment</dt><dd style={{ margin: 0 }}>{String(preview.status ?? "Known")}</dd></>}
                        {resource.last_discovered_at && <><dt className="ux-muted">Last discovered</dt><dd style={{ margin: 0 }}>{new Date(resource.last_discovered_at).toLocaleString()}</dd></>}
                      </dl>
                    </details>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>

      <section style={{ padding: "1.5rem 0", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.2rem" }}>Client and project relationship</h2>
        <p><strong>Client:</strong> <Link href={`/admin/clients/${system.client_id}`}>{clientName}</Link></p>
        {(projects ?? []).length > 0 ? (
          <ul style={{ marginBottom: 0 }}>
            {(projects ?? []).map((project) => <li key={project.id}><Link href={`/admin/projects/${project.id}`}>{project.title}</Link> · {label(project.status)}</li>)}
          </ul>
        ) : (
          <p className="ux-muted">No SCH Project is currently linked to this system.</p>
        )}
      </section>

      <section style={{ padding: "1.5rem 0" }}>
        <SystemNotes systemId={system.id} systemName={system.name} notes={system.operational_notes} canEdit={canEditNotes} />
      </section>
    </div>
  );
}
