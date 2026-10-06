import type { SystemDetailResource } from "./system-detail";

export const SYSTEM_HEALTH_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export type SystemHealthStatus = "HEALTHY" | "ATTENTION" | "UNKNOWN";

export type ResourceHealth = {
  resourceId: string;
  provider: string;
  providerKey: string | null;
  resourceName: string;
  status: SystemHealthStatus;
  observedStatus: string | null;
  lastEvidenceAt: string | null;
  productionDomain: string | null;
  environment: string | null;
  reason: string;
};

export type SystemHealthAssessment = {
  overallStatus: SystemHealthStatus;
  infrastructureStatus: SystemHealthStatus;
  deploymentStatus: SystemHealthStatus;
  providerEvidenceStatus: SystemHealthStatus;
  explanation: string;
  attentionItems: string[];
  resources: ResourceHealth[];
  lastEvidenceAt: string | null;
};

const HEALTHY_STATES = new Set(["ACTIVE", "HEALTHY", "SUCCESS", "READY", "DEPLOYED", "RUNNING"]);
const ATTENTION_STATES = new Set(["ERROR", "FAILED", "CRASHED", "CANCELED", "CANCELLED", "DEGRADED", "INACTIVE", "PAUSED", "STOPPED", "SUSPENDED", "REMOVED"]);
const EXPECTED_PROVIDERS: Record<string, string[]> = {
  "sma learning management system": ["railway", "vercel"],
  "elgon bms": ["railway", "vercel"],
  "solvers bookings management system": ["railway", "vercel"],
  "diani art gallery": ["railway", "vercel"],
  "quickcredit loan management system": ["railway"],
};

function normalized(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim().toUpperCase() : null;
}

function stateOf(value: string | null | undefined): SystemHealthStatus {
  const state = normalized(value);
  if (!state) return "UNKNOWN";
  if (HEALTHY_STATES.has(state)) return "HEALTHY";
  if (ATTENTION_STATES.has(state)) return "ATTENTION";
  return "UNKNOWN";
}

function combine(statuses: SystemHealthStatus[]): SystemHealthStatus {
  if (statuses.includes("ATTENTION")) return "ATTENTION";
  if (statuses.includes("UNKNOWN")) return "UNKNOWN";
  return statuses.length ? "HEALTHY" : "UNKNOWN";
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isStale(timestamp: string | null, now: Date): boolean {
  if (!timestamp) return true;
  const observed = new Date(timestamp).getTime();
  return !Number.isFinite(observed) || now.getTime() - observed > SYSTEM_HEALTH_STALE_AFTER_MS;
}

function resourceAssessment(resource: SystemDetailResource, now: Date): ResourceHealth {
  const name = resource.discovered_name ?? resource.name;
  if (!resource.last_discovered_at) {
    return {
      resourceId: resource.id,
      provider: resource.provider,
      providerKey: resource.provider_key,
      resourceName: name,
      status: "UNKNOWN",
      observedStatus: resource.discovered_status,
      lastEvidenceAt: null,
      productionDomain: resource.production_domain,
      environment: null,
      reason: "No current provider discovery evidence is linked.",
    };
  }
  if (isStale(resource.last_discovered_at, now)) {
    return {
      resourceId: resource.id,
      provider: resource.provider,
      providerKey: resource.provider_key,
      resourceName: name,
      status: "UNKNOWN",
      observedStatus: resource.discovered_status,
      lastEvidenceAt: resource.last_discovered_at,
      productionDomain: resource.production_domain,
      environment: null,
      reason: "Provider discovery evidence is stale.",
    };
  }

  const metadata = resource.metadata;
  const environments = object(metadata?.environments);
  const production = object(environments?.production);
  const productionStatus = text(production?.status);
  const latestDeployment = object(metadata?.latest_deployment);
  const latestDeploymentStatus = text(latestDeployment?.status) ?? resource.deployment_status;
  const observed = resource.discovered_status;
  const statuses = [stateOf(observed)];
  if (resource.provider_key === "vercel") {
    statuses.push(stateOf(productionStatus), stateOf(latestDeploymentStatus));
  }
  const status = combine(statuses);
  let reason = "Available provider evidence does not indicate a problem.";
  if (status === "ATTENTION") {
    reason = resource.provider_key === "vercel"
      ? "A Vercel production or deployment status is not READY."
      : "The linked provider resource reports a non-healthy state.";
  } else if (status === "UNKNOWN") {
    reason = resource.provider_key === "vercel"
      ? "Vercel production deployment evidence is incomplete."
      : "The provider status is not recognized as healthy or unhealthy.";
  }
  return {
    resourceId: resource.id,
    provider: resource.provider,
    providerKey: resource.provider_key,
    resourceName: name,
    status,
    observedStatus: productionStatus ?? latestDeploymentStatus ?? observed,
    lastEvidenceAt: resource.last_discovered_at,
    productionDomain: resource.production_domain,
    environment: production ? "production" : null,
    reason,
  };
}

export function assessSystemHealth(
  systemName: string,
  resources: SystemDetailResource[],
  providerConnectionStatuses: Record<string, string | null> = {},
  now = new Date()
): SystemHealthAssessment {
  const assessedResources = resources.map((resource) => resourceAssessment(resource, now));
  const attentionItems: string[] = [];
  for (const resource of assessedResources) {
    if (resource.status !== "HEALTHY") attentionItems.push(`${resource.provider} ${resource.resourceName}: ${resource.reason}`);
  }

  const expected = EXPECTED_PROVIDERS[systemName.trim().toLowerCase()] ?? [];
  const linkedProviders = new Set(resources.map((resource) => resource.provider_key).filter(Boolean));
  for (const provider of expected) {
    if (!linkedProviders.has(provider)) attentionItems.push(`${provider === "vercel" ? "Vercel" : "Railway"} evidence is not linked.`);
  }
  if (resources.length === 0) attentionItems.push("No linked infrastructure evidence.");

  const connectionStates = resources.map((resource) => {
    const state = resource.provider_connection_status ?? providerConnectionStatuses[resource.provider_account];
    if (!state) return "UNKNOWN" as const;
    if (state === "connected") return "HEALTHY" as const;
    if (state === "failed") return "ATTENTION" as const;
    return "UNKNOWN" as const;
  });
  const providerEvidenceStatus = combine(connectionStates);
  if (providerEvidenceStatus === "ATTENTION") attentionItems.push("A linked provider account connection is failing.");
  if (resources.length > 0 && providerEvidenceStatus === "UNKNOWN") attentionItems.push("Provider connection evidence is incomplete.");

  const infrastructureStatus = combine(assessedResources.map((resource) => resource.status));
  const deploymentResources = assessedResources.filter((resource) => resource.providerKey === "vercel");
  const deploymentStatus = deploymentResources.length
    ? combine(deploymentResources.map((resource) => resource.status))
    : "UNKNOWN";
  const missingExpectedEvidence = expected.some((provider) => !linkedProviders.has(provider));
  const overallStatus = infrastructureStatus === "ATTENTION" || providerEvidenceStatus === "ATTENTION"
    ? "ATTENTION"
    : missingExpectedEvidence || infrastructureStatus === "UNKNOWN" || providerEvidenceStatus === "UNKNOWN"
      ? "UNKNOWN"
      : "HEALTHY";
  const lastEvidenceAt = assessedResources
    .map((resource) => resource.lastEvidenceAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const explanation = overallStatus === "HEALTHY"
    ? "Available provider evidence does not currently indicate a problem. This is not an uptime check."
    : overallStatus === "ATTENTION"
      ? "Current linked provider evidence indicates an operational condition that requires review."
      : "Available provider evidence is incomplete or too old for a reliable assessment.";

  return {
    overallStatus,
    infrastructureStatus,
    deploymentStatus,
    providerEvidenceStatus,
    explanation,
    attentionItems: [...new Set(attentionItems)],
    resources: assessedResources,
    lastEvidenceAt,
  };
}
