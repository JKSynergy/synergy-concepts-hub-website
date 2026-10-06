/**
 * Vercel adapter — read-only discovery via the REST API.
 * Discovers projects with production domains and latest deployment metadata.
 */

import { providerRead, ProviderHttpError, type EndpointRule } from "./http.ts";
import type {
  ConnectionTestResult,
  DiscoveryResult,
  DiscoveredResource,
  ProviderAdapter,
  ProviderCredentials,
} from "./types.ts";

const RULES: EndpointRule[] = [
  { host: "api.vercel.com", pathPrefix: "/v10/projects", methods: ["GET"] },
  { host: "api.vercel.com", pathPrefix: "/v9/projects", methods: ["GET"] },
  { host: "api.vercel.com", pathPrefix: "/v7/deployments", methods: ["GET"] },
];

interface VercelProject {
  id: string;
  name: string;
  framework?: string | null;
  updatedAt?: number;
}

interface VercelProjectPage {
  projects?: VercelProject[];
  pagination?: { next?: number | string | null };
}

interface VercelDomain {
  name: string;
  verified?: boolean;
  gitBranch?: string | null;
  target?: string | null;
}

interface VercelDeployment {
  uid?: string;
  id?: string;
  name?: string;
  url?: string;
  readyState?: string;
  state?: string;
  target?: string | null;
  createdAt?: number;
  created?: number;
}

function scopedUrl(path: string, accountId?: string, params: Record<string, string> = {}): string {
  const url = new URL(`https://api.vercel.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (accountId) url.searchParams.set("teamId", accountId);
  return url.toString();
}

function projectPage(value: unknown): { projects: VercelProject[]; next: string | null } {
  const body = value as VercelProjectPage | VercelProject[];
  const projects = Array.isArray(body) ? body : body?.projects;
  if (!Array.isArray(projects)) {
    throw new ProviderHttpError("malformed_response", "Unexpected projects response shape");
  }
  if (projects.some((project) => typeof project?.id !== "string" || typeof project?.name !== "string")) {
    throw new ProviderHttpError("malformed_response", "Unexpected project record shape");
  }
  const next = Array.isArray(body) ? null : body.pagination?.next;
  if (next !== undefined && next !== null && typeof next !== "string" && typeof next !== "number") {
    throw new ProviderHttpError("malformed_response", "Unexpected project pagination shape");
  }
  return { projects, next: next === undefined || next === null ? null : String(next) };
}

async function listProjects(creds: ProviderCredentials): Promise<VercelProject[]> {
  const projects: VercelProject[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const data = await providerRead(
      RULES,
      scopedUrl("/v10/projects", creds.accountId, {
        limit: "100",
        ...(cursor ? { from: cursor } : {}),
      }),
      creds.token
    );
    const page = projectPage(data);
    projects.push(...page.projects);
    if (page.next && cursors.has(page.next)) {
      throw new ProviderHttpError("malformed_response", "Provider returned a repeated pagination cursor");
    }
    if (page.next) cursors.add(page.next);
    cursor = page.next;
  } while (cursor);

  return projects;
}

async function productionDomain(creds: ProviderCredentials, projectId: string): Promise<string | null> {
  const data = await providerRead(
    RULES,
    scopedUrl(`/v9/projects/${encodeURIComponent(projectId)}/domains`, creds.accountId, {
      limit: "100",
      production: "true",
    }),
    creds.token
  ) as { domains?: VercelDomain[] };
  if (!data || !Array.isArray(data.domains)) {
    throw new ProviderHttpError("malformed_response", "Unexpected project domains response shape");
  }
  const domain = data.domains.find((item) => typeof item?.name === "string" && item.verified !== false);
  return domain?.name ?? null;
}

async function latestDeployment(
  creds: ProviderCredentials,
  projectId: string,
  target: "production" | "preview"
): Promise<VercelDeployment | null> {
  const data = await providerRead(
    RULES,
    scopedUrl("/v7/deployments", creds.accountId, {
      projectId,
      ...(target === "production" ? { target: "production" } : {}),
      limit: target === "production" ? "1" : "20",
    }),
    creds.token
  ) as { deployments?: VercelDeployment[] };
  if (!data || !Array.isArray(data.deployments)) {
    throw new ProviderHttpError("malformed_response", "Unexpected deployments response shape");
  }
  return target === "production"
    ? data.deployments[0] ?? null
    : data.deployments.find((deployment) => deployment.target !== "production") ?? null;
}

function deploymentMetadata(deployment: VercelDeployment | null): Record<string, unknown> | null {
  if (!deployment) return null;
  const createdAt = deployment.createdAt ?? deployment.created;
  return {
    id: deployment.uid ?? deployment.id ?? null,
    status: deployment.readyState ?? deployment.state ?? null,
    url: deployment.url ? `https://${deployment.url}` : null,
    created_at: typeof createdAt === "number" ? new Date(createdAt).toISOString() : null,
  };
}

export const vercelAdapter: ProviderAdapter = {
  key: "vercel",
  label: "Vercel",
  capabilities: {
    discoverResources: true,
    readResourceMetadata: true,
    create: false,
    update: false,
    delete: false,
    suspend: false,
    restore: false,
    billing: false,
  },

  async testConnection(creds: ProviderCredentials): Promise<ConnectionTestResult> {
    try {
      const data = await providerRead(
        RULES,
        scopedUrl("/v10/projects", creds.accountId, { limit: "1" }),
        creds.token
      );
      projectPage(data);
      return { ok: true, message: "Connection verified" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof ProviderHttpError ? e.category : "network_error",
        message: "Connection failed",
      };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveryResult> {
    try {
      const projects = await listProjects(creds);
      const resources: DiscoveredResource[] = [];
      for (const project of projects) {
        const [domain, production, preview] = await Promise.all([
          productionDomain(creds, project.id),
          latestDeployment(creds, project.id, "production"),
          latestDeployment(creds, project.id, "preview"),
        ]);
        resources.push({
          externalId: project.id,
          type: "project",
          name: project.name,
          status: production?.readyState ?? production?.state ?? "active",
          url: domain ? `https://${domain}` : undefined,
          metadata: {
            project_id: project.id,
            framework: project.framework ?? null,
            updated_at: typeof project.updatedAt === "number" ? new Date(project.updatedAt).toISOString() : null,
            production_domain: domain,
            environments: {
              production: deploymentMetadata(production),
              preview: deploymentMetadata(preview),
            },
            latest_deployment: deploymentMetadata(production) ?? deploymentMetadata(preview),
          },
        });
      }
      return { ok: true, resources };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof ProviderHttpError ? e.category : "network_error",
        message: "Discovery failed",
        resources: [],
      };
    }
  },
};
