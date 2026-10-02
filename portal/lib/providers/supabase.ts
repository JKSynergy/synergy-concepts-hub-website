/**
 * Supabase adapter — Management API.
 * Requires a Supabase Personal Access Token. Discovers projects only.
 *
 * Phase 3G-3 adds two typed lifecycle operations on projects:
 *   pause_resource  → POST /v1/projects/{ref}/pause
 *   resume_resource → POST /v1/projects/{ref}/restore
 * Both are reversible and verified by re-reading the project status
 * (GET /v1/projects/{ref}) after execution. No other mutation endpoint is
 * declared — pathSuffix rules pin POSTs to exactly /pause and /restore.
 */

import { providerRead, providerMutate, ProviderHttpError, type EndpointRule } from "./http.ts";
import type {
  ConnectionTestResult,
  DiscoveryResult,
  DiscoveredResource,
  ProviderAdapter,
  ProviderCredentials,
  ProviderOperationAdapter,
  ProviderOperationRequest,
  ProviderOperationResult,
  ProviderVerificationResult,
} from "./types.ts";

const RULES: EndpointRule[] = [
  { host: "api.supabase.com", pathPrefix: "/v1/projects", methods: ["GET"] },
];

// Mutation allowlist — one rule per operation endpoint, suffix-pinned.
const OP_RULES: EndpointRule[] = [
  { host: "api.supabase.com", pathPrefix: "/v1/projects/", pathSuffix: "/pause", methods: ["POST"] },
  { host: "api.supabase.com", pathPrefix: "/v1/projects/", pathSuffix: "/restore", methods: ["POST"] },
  { host: "api.supabase.com", pathPrefix: "/v1/projects/", methods: ["GET"] },
];

// Supabase project status vocabulary (normalized provider-side states).
const PAUSE_TARGET = ["INACTIVE"];
const PAUSE_PENDING = ["GOING_DOWN", "PAUSING", "SUSPENDING"];
const RESUME_TARGET = ["ACTIVE_HEALTHY", "ACTIVE_UNHEALTHY"];
const RESUME_PENDING = ["COMING_UP", "RESTORING", "UPGRADING"];

interface SupaProject {
  id: string;
  name: string;
  region?: string;
  status?: string;
  created_at?: string;
  organization_id?: string;
}

async function listProjects(token: string): Promise<SupaProject[]> {
  const data = await providerRead(RULES, "https://api.supabase.com/v1/projects", token);
  if (!Array.isArray(data)) {
    throw new ProviderHttpError("malformed_response", "Unexpected projects response shape");
  }
  return data as SupaProject[];
}

const supabaseOperations: ProviderOperationAdapter = {
  supportsOperation(operation, resourceType) {
    return resourceType === "project" &&
      (operation === "pause_resource" || operation === "resume_resource");
  },

  async executeOperation(req: ProviderOperationRequest): Promise<ProviderOperationResult> {
    const endpoint = req.operation === "pause_resource" ? "pause" : "restore";
    const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(req.externalResourceId)}/${endpoint}`;
    try {
      const res = await providerMutate(OP_RULES, url, req.creds.token, {
        method: "POST",
        idempotencyKey: req.idempotencyKey,
      });
      const ref = (res.body as { id?: string } | undefined)?.id;
      return { category: res.category, providerReference: ref, message: res.message };
    } catch (e) {
      return {
        category: "malformed_response",
        message: e instanceof ProviderHttpError ? e.message : "Operation request failed",
      };
    }
  },

  async verifyOperation(req: ProviderOperationRequest): Promise<ProviderVerificationResult> {
    const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(req.externalResourceId)}`;
    let project: SupaProject;
    try {
      const data = await providerRead(OP_RULES, url, req.creds.token);
      project = data as SupaProject;
    } catch (e) {
      // Auth/permission/not-found errors make verification unknowable — the
      // caller marks the result unknown rather than success.
      return { outcome: "unknown" };
    }
    const status = (project?.status ?? "").toUpperCase();
    const target = req.operation === "pause_resource" ? PAUSE_TARGET : RESUME_TARGET;
    const pending = req.operation === "pause_resource" ? PAUSE_PENDING : RESUME_PENDING;
    if (target.includes(status)) return { outcome: "verified", observedStatus: project.status };
    if (pending.includes(status)) return { outcome: "pending", observedStatus: project.status };
    return { outcome: "mismatch", observedStatus: project.status };
  },
};

export const supabaseAdapter: ProviderAdapter = {
  key: "supabase",
  label: "Supabase",
  capabilities: {
    discoverResources: true,
    readResourceMetadata: true,
    create: false,
    update: false,
    delete: false,
    suspend: true,
    restore: true,
    billing: false,
  },
  operations: supabaseOperations,

  async testConnection(creds: ProviderCredentials): Promise<ConnectionTestResult> {
    try {
      await listProjects(creds.token);
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
        status: p.status,
        region: p.region,
        url: `https://supabase.com/dashboard/project/${p.id}`,
        metadata: {
          organization_id: p.organization_id,
          created_at: p.created_at,
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
