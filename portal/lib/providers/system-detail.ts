export type SystemResourceRecord = {
  id: string;
  name: string;
  resource_type: string;
  status: string;
  external_reference: string | null;
  provider: string;
  provider_key: string | null;
  provider_account: string;
  provider_connection_status?: string | null;
};

export type LinkedDiscoveryRecord = {
  linked_resource_id: string;
  external_resource_id: string;
  resource_type: string;
  name: string;
  status: string | null;
  external_url: string | null;
  metadata: Record<string, unknown> | null;
  last_seen_at: string;
  link_status: string;
};

export type SystemDetailResource = SystemResourceRecord & {
  discovered_name: string | null;
  external_id: string | null;
  discovered_status: string | null;
  production_domain: string | null;
  deployment_status: string | null;
  deployment_id: string | null;
  deployment_created_at: string | null;
  last_discovered_at: string | null;
  metadata: Record<string, unknown> | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function buildSystemDetailResources(
  resources: SystemResourceRecord[],
  discovered: LinkedDiscoveryRecord[]
): SystemDetailResource[] {
  const linkedByResource = new Map(
    discovered
      .filter((item) => item.link_status === "linked")
      .map((item) => [item.linked_resource_id, item])
  );

  return resources.map((resource) => {
    const evidence = linkedByResource.get(resource.id) ?? null;
    const metadata = evidence?.metadata ?? null;
    const deployment = record(metadata?.latest_deployment);
    return {
      ...resource,
      discovered_name: evidence?.name ?? null,
      external_id: evidence?.external_resource_id ?? resource.external_reference?.replace(/^provider:/, "") ?? null,
      discovered_status: evidence?.status ?? null,
      production_domain: text(metadata?.production_domain) ?? evidence?.external_url ?? null,
      deployment_status: text(deployment?.status),
      deployment_id: text(deployment?.id),
      deployment_created_at: text(deployment?.created_at),
      last_discovered_at: evidence?.last_seen_at ?? null,
      metadata,
    };
  });
}
