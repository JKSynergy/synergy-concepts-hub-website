/**
 * Railway adapter — read-only discovery via the public GraphQL API.
 * Railway's API is GraphQL-only, so reads use POST — the transport asserts the
 * body contains no `mutation`. Discovers projects and their services.
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
  { host: "backboard.railway.com", pathPrefix: "/graphql/v2", methods: ["POST"] },
  { host: "backboard.railway.app", pathPrefix: "/graphql/v2", methods: ["POST"] },
];

const PROJECTS_QUERY = `query {
  projects {
    edges {
      node {
        id
        name
        createdAt
        services { edges { node { id name } } }
      }
    }
  }
}`;

const ME_QUERY = `query { me { id name } }`;

interface GqlProject {
  node: {
    id: string;
    name: string;
    createdAt?: string;
    services?: { edges?: { node: { id: string; name: string } }[] };
  };
}

interface GqlResponse<T> {
  data?: T;
  errors?: unknown[];
}

async function gql<T>(token: string, query: string): Promise<T> {
  const res = (await providerRead(RULES, "https://backboard.railway.com/graphql/v2", token, query)) as GqlResponse<T>;
  if (res.errors?.length) {
    throw new ProviderHttpError("malformed_response", "Provider returned GraphQL errors");
  }
  if (!res.data) {
    throw new ProviderHttpError("malformed_response", "Provider returned empty GraphQL data");
  }
  return res.data;
}

export const railwayAdapter: ProviderAdapter = {
  key: "railway",
  label: "Railway",
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
      await gql(creds.token, ME_QUERY);
      return { ok: true, message: "Connection verified" };
    } catch (e) {
      return { ok: false, error: e instanceof ProviderHttpError ? e.category : "network_error", message: "Connection failed" };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveryResult> {
    try {
      const data = await gql<{ projects?: { edges?: GqlProject[] } }>(creds.token, PROJECTS_QUERY);
      const edges = data.projects?.edges ?? [];
      const resources: DiscoveredResource[] = [];
      for (const { node: p } of edges) {
        resources.push({
          externalId: p.id,
          type: "project",
          name: p.name,
          status: "active",
          metadata: { created_at: p.createdAt },
        });
        for (const { node: s } of p.services?.edges ?? []) {
          resources.push({
            externalId: s.id,
            type: "service",
            name: `${p.name} / ${s.name}`,
            status: "active",
            metadata: { project_id: p.id },
          });
        }
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
