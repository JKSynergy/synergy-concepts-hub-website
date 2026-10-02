/**
 * Vercel adapter — read-only discovery via the REST API.
 * Discovers projects only (deployments intentionally excluded in 3G-1).
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
  { host: "api.vercel.com", pathPrefix: "/v9/projects", methods: ["GET"] },
  { host: "api.vercel.com", pathPrefix: "/v2/user", methods: ["GET"] },
];

interface VercelProjects {
  projects?: {
    id: string;
    name: string;
    framework?: string | null;
    updatedAt?: number;
    link?: { type?: string };
  }[];
}

async function listProjects(token: string): Promise<NonNullable<VercelProjects["projects"]>> {
  const data = (await providerRead(RULES, "https://api.vercel.com/v9/projects?limit=100", token)) as VercelProjects;
  if (typeof data !== "object" || data === null || !Array.isArray(data.projects)) {
    throw new ProviderHttpError("malformed_response", "Unexpected projects response shape");
  }
  return data.projects ?? [];
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
      await providerRead(RULES, "https://api.vercel.com/v2/user", creds.token);
      return { ok: true, message: "Connection verified" };
    } catch (e) {
      return { ok: false, error: e instanceof ProviderHttpError ? e.category : "network_error", message: "Connection failed" };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveryResult> {
    try {
      const projects = await listProjects(creds.token);
      const resources: DiscoveredResource[] = projects.map((p) => ({
        externalId: p.id,
        type: "project",
        name: p.name,
        status: "active",
        url: `https://vercel.com/${p.name}`,
        metadata: {
          framework: p.framework ?? null,
          updated_at: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
        },
      }));
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
