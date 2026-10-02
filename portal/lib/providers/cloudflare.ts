/**
 * Cloudflare adapter — read-only discovery via the REST API.
 * Discovers zones only. Token verification uses the dedicated verify endpoint.
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
  { host: "api.cloudflare.com", pathPrefix: "/client/v4/zones", methods: ["GET"] },
  { host: "api.cloudflare.com", pathPrefix: "/client/v4/user/tokens/verify", methods: ["GET"] },
];

interface CfResponse<T> {
  success?: boolean;
  result?: T;
}

interface CfZone {
  id: string;
  name: string;
  status?: string;
  account?: { id?: string; name?: string };
}

async function listZones(token: string, accountId?: string): Promise<CfZone[]> {
  const url = accountId
    ? `https://api.cloudflare.com/client/v4/zones?account.id=${encodeURIComponent(accountId)}&per_page=50`
    : "https://api.cloudflare.com/client/v4/zones?per_page=50";
  const res = (await providerRead(RULES, url, token)) as CfResponse<CfZone[]>;
  if (!res.success || !Array.isArray(res.result)) {
    throw new ProviderHttpError("malformed_response", "Unexpected zones response shape");
  }
  return res.result;
}

export const cloudflareAdapter: ProviderAdapter = {
  key: "cloudflare",
  label: "Cloudflare",
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
      const res = (await providerRead(
        RULES,
        "https://api.cloudflare.com/client/v4/user/tokens/verify",
        creds.token
      )) as CfResponse<unknown>;
      if (!res.success) {
        throw new ProviderHttpError("auth_failed", "Token verification rejected");
      }
      return { ok: true, message: "Connection verified" };
    } catch (e) {
      return { ok: false, error: e instanceof ProviderHttpError ? e.category : "network_error", message: "Connection failed" };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveryResult> {
    try {
      const zones = await listZones(creds.token, creds.accountId);
      const resources: DiscoveredResource[] = zones.map((z) => ({
        externalId: z.id,
        type: "zone",
        name: z.name,
        status: z.status,
        url: `https://dash.cloudflare.com/${z.account?.id ?? ""}/${z.id}`,
        metadata: { account_name: z.account?.name ?? null },
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
