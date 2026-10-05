/**
 * Railway adapter — read-only discovery via the public GraphQL API.
 *
 * Authentication: workspace token via `Authorization: Bearer <token>`.
 * The adapter discovers the workspace (when the token/API allows), then the
 * hierarchy: Workspace → Projects → Environments → Services.
 *
 * Deployment/status metadata is attached to service resources as read-only
 * metadata; no deployment rows are emitted as separate resources.
 *
 * No mutation queries are ever issued. The transport layer rejects any body
 * containing the word "mutation" before it reaches the network.
 */

import { providerRead, ProviderHttpError, type EndpointRule } from "./http.ts";
import type {
  ConnectionErrorCategory,
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

const ENDPOINT = "https://backboard.railway.com/graphql/v2";

// Shared fragments to keep queries compact and consistent.
const PAGE_INFO_FRAGMENT = "pageInfo { hasNextPage endCursor }";

const PROJECT_NODE = `id name description createdAt updatedAt`;
const ENVIRONMENT_NODE = `id name createdAt`;
const SERVICE_NODE = `id name icon`;

// Root queries used during discovery.
const ME_QUERY = `query { me { id name email } }`;

const WORKSPACES_QUERY = `query {
  workspaces { edges { node { id name } } }
}`;

const ME_WORKSPACES_QUERY = `query {
  me {
    id
    workspaces { id name }
  }
}`;

const WORKSPACE_BY_ID_QUERY = `query ($id: String!) {
  workspace(id: $id) { id name }
}`;

const PROJECTS_QUERY = `query ($workspaceId: String, $first: Int, $after: String) {
  projects(workspaceId: $workspaceId, first: $first, after: $after) {
    edges { node { ${PROJECT_NODE} } }
    ${PAGE_INFO_FRAGMENT}
  }
}`;

const FALLBACK_PROJECTS_QUERY = `query {
  me {
    id
    workspaces {
      id
      name
      projects(first: 100) {
        edges { node { ${PROJECT_NODE} } }
        ${PAGE_INFO_FRAGMENT}
      }
    }
  }
}`;

const PROJECT_DETAILS_QUERY = `query ($id: String!, $first: Int, $after: String) {
  project(id: $id) {
    id
    environments(first: $first, after: $after) {
      edges { node { ${ENVIRONMENT_NODE} } }
      ${PAGE_INFO_FRAGMENT}
    }
    services(first: $first, after: $after) {
      edges { node { ${SERVICE_NODE} } }
      ${PAGE_INFO_FRAGMENT}
    }
  }
}`;

const DEPLOYMENTS_QUERY = `query ($input: DeploymentListInput!) {
  deployments(input: $input, first: 1) {
    edges { node { id status createdAt environmentId } }
  }
}`;

interface GqlError {
  message?: string;
  extensions?: { code?: string };
}

interface GqlResponse<T> {
  data?: T;
  errors?: GqlError[];
}

interface RailwayWorkspace {
  id: string;
  name?: string | null;
}

interface RailwayProject {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface RailwayEnvironment {
  id: string;
  name: string;
  createdAt?: string | null;
}

interface RailwayService {
  id: string;
  name: string;
  icon?: string | null;
}

interface RailwayDeployment {
  id: string;
  status: string;
  createdAt?: string | null;
  environmentId?: string | null;
}

interface ConnectionPage<T> {
  edges?: { node: T }[] | null;
  pageInfo?: {
    hasNextPage?: boolean | null;
    endCursor?: string | null;
  } | null;
}

async function gql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = (await providerRead(RULES, ENDPOINT, token, query, variables)) as GqlResponse<T>;
  if (res.errors?.length) {
    throw gqlError(res.errors);
  }
  if (!res.data) {
    throw new ProviderHttpError("malformed_response", "Provider returned empty GraphQL data");
  }
  return res.data;
}

function gqlError(errors: GqlError[]): ProviderHttpError {
  const messages = errors.map((e) => e.message ?? "").join("; ");
  const lower = messages.toLowerCase();
  let category: ConnectionErrorCategory = "malformed_response";
  if (lower.includes("unauthenticated") || lower.includes("unauthorized") || lower.includes("invalid credentials")) {
    category = "auth_failed";
  } else if (lower.includes("permission") || lower.includes("forbidden") || lower.includes("not allowed")) {
    category = "permission_denied";
  } else if (lower.includes("rate limit") || lower.includes("too many requests")) {
    category = "rate_limited";
  }
  return new ProviderHttpError(category, messages || "GraphQL error");
}

async function fetchConnection<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  page: (data: unknown) => ConnectionPage<T> | null | undefined
): Promise<T[]> {
  const nodes: T[] = [];
  let cursor: string | null = null;
  const perPage = 100;

  do {
    const vars: Record<string, unknown> = { ...variables, first: perPage };
    if (cursor) vars.after = cursor;

    const data = await gql<unknown>(token, query, vars);
    const conn = page(data);
    const edges = conn?.edges ?? [];
    for (const edge of edges) {
      if (edge?.node) nodes.push(edge.node);
    }
    cursor = conn?.pageInfo?.hasNextPage && conn.pageInfo.endCursor ? conn.pageInfo.endCursor : null;
  } while (cursor);

  return nodes;
}

async function fetchWorkspaces(token: string): Promise<RailwayWorkspace[]> {
  // Try the root connection first, then me.workspaces.
  try {
    const data = await gql<{ workspaces?: ConnectionPage<RailwayWorkspace> }>(token, WORKSPACES_QUERY);
    return (data.workspaces?.edges ?? []).map((e) => e.node);
  } catch {
    /* ignore: fall through */
  }

  try {
    const data = await gql<{ me?: { workspaces?: RailwayWorkspace[] } }>(token, ME_WORKSPACES_QUERY);
    return data.me?.workspaces ?? [];
  } catch {
    return [];
  }
}

async function fetchWorkspaceById(
  token: string,
  id: string
): Promise<RailwayWorkspace | null> {
  try {
    const data = await gql<{ workspace?: RailwayWorkspace | null }>(token, WORKSPACE_BY_ID_QUERY, { id });
    return data.workspace ?? null;
  } catch {
    return null;
  }
}

async function fetchProjects(
  token: string,
  workspaceId?: string
): Promise<RailwayProject[]> {
  // Prefer an explicit workspace-scoped listing.
  try {
    const variables: Record<string, unknown> = {};
    if (workspaceId) variables.workspaceId = workspaceId;
    return await fetchConnection<RailwayProject>(
      token,
      PROJECTS_QUERY,
      variables,
      (data) => (data as { projects?: ConnectionPage<RailwayProject> })?.projects
    );
  } catch (e) {
    // If the root projects query fails (common for account tokens), fall back to
    // me.workspaces.projects.
    if (workspaceId) throw e; // explicit workspace id should not fall back silently
  }

  // Fallback for account tokens that cannot use root projects.
  const data = await gql<{
    me?: {
      workspaces?: Array<{
        projects?: ConnectionPage<RailwayProject>;
      }>;
    };
  }>(token, FALLBACK_PROJECTS_QUERY);

  const nodes: RailwayProject[] = [];
  for (const ws of data.me?.workspaces ?? []) {
    for (const edge of ws.projects?.edges ?? []) {
      if (edge?.node) nodes.push(edge.node);
    }
  }
  return nodes;
}

async function fetchProjectDetails(
  token: string,
  projectId: string
): Promise<{
  environments: RailwayEnvironment[];
  services: RailwayService[];
}> {
  const data = await gql<{
    project?: {
      environments?: ConnectionPage<RailwayEnvironment>;
      services?: ConnectionPage<RailwayService>;
    };
  }>(token, PROJECT_DETAILS_QUERY, { id: projectId, first: 100 });

  const environments: RailwayEnvironment[] = [];
  for (const edge of data.project?.environments?.edges ?? []) {
    if (edge?.node) environments.push(edge.node);
  }

  const services: RailwayService[] = [];
  for (const edge of data.project?.services?.edges ?? []) {
    if (edge?.node) services.push(edge.node);
  }

  return { environments, services };
}

async function fetchLatestDeployment(
  token: string,
  projectId: string,
  serviceId: string
): Promise<RailwayDeployment | null> {
  try {
    const data = await gql<{
      deployments?: ConnectionPage<RailwayDeployment>;
    }>(token, DEPLOYMENTS_QUERY, { input: { projectId, serviceId } });
    const edge = data.deployments?.edges?.[0];
    return edge?.node ?? null;
  } catch {
    return null;
  }
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
      const data = await gql<{ me?: { id: string; name?: string | null } }>(creds.token, ME_QUERY);
      const name = data.me?.name ?? "Railway";
      return { ok: true, message: `Connected as ${name}` };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof ProviderHttpError ? e.category : "network_error",
        message: "Connection failed",
      };
    }
  },

  async discoverResources(creds: ProviderCredentials): Promise<DiscoveryResult> {
    const resources: DiscoveredResource[] = [];
    const warnings: string[] = [];
    const explicitWorkspaceId = creds.accountId?.trim();
    let workspaceId = explicitWorkspaceId;
    let workspaceName: string | undefined;

    try {
      // 1. Resolve workspace identity.
      if (workspaceId) {
        const configured = await fetchWorkspaceById(creds.token, workspaceId);
        if (configured) {
          workspaceName = configured.name ?? undefined;
        }
      }

      if (!workspaceName) {
        const workspaces = await fetchWorkspaces(creds.token);
        if (workspaceId) {
          const match = workspaces.find((w) => w.id === workspaceId);
          if (match) workspaceName = match.name ?? undefined;
        } else if (workspaces.length === 1) {
          workspaceId = workspaces[0].id;
          workspaceName = workspaces[0].name ?? undefined;
        }
      }

      if (workspaceId) {
        resources.push({
          externalId: workspaceId,
          type: "workspace",
          name: workspaceName || "Railway workspace",
          status: "active",
          metadata: { workspace_id: workspaceId, workspace_name: workspaceName },
        });
      }

      // 2. Discover projects within the resolved workspace (or token scope).
      // When the user explicitly configured a workspace ID we scope the listing;
      // otherwise we trust the token's own scope and use the root listing.
      const projects = await fetchProjects(creds.token, explicitWorkspaceId);

      for (const project of projects) {
        resources.push({
          externalId: project.id,
          type: "project",
          name: project.name,
          status: "active",
          metadata: {
            workspace_id: workspaceId,
            workspace_name: workspaceName,
            project_id: project.id,
            description: project.description ?? null,
            created_at: project.createdAt ?? null,
            updated_at: project.updatedAt ?? null,
          },
        });

        // 3. Environments and services for each project.
        let details: { environments: RailwayEnvironment[]; services: RailwayService[] };
        try {
          details = await fetchProjectDetails(creds.token, project.id);
        } catch (detailError) {
          warnings.push(`Could not read details for project ${project.name}`);
          continue;
        }

        for (const env of details.environments) {
          resources.push({
            externalId: env.id,
            type: "environment",
            name: `${project.name} / ${env.name}`,
            status: "active",
            metadata: {
              workspace_id: workspaceId,
              workspace_name: workspaceName,
              project_id: project.id,
              project_name: project.name,
              environment_id: env.id,
              created_at: env.createdAt ?? null,
            },
          });
        }

        const environmentIds = details.environments.map((e) => e.id);

        for (const service of details.services) {
          const deployment = await fetchLatestDeployment(creds.token, project.id, service.id);
          const deploymentMeta = deployment
            ? {
                id: deployment.id,
                status: deployment.status,
                created_at: deployment.createdAt ?? null,
                environment_id: deployment.environmentId ?? null,
              }
            : null;

          resources.push({
            externalId: service.id,
            type: "service",
            name: `${project.name} / ${service.name}`,
            status: deployment?.status ?? "unknown",
            metadata: {
              workspace_id: workspaceId,
              workspace_name: workspaceName,
              project_id: project.id,
              project_name: project.name,
              service_id: service.id,
              service_icon: service.icon ?? null,
              environment_ids: environmentIds,
              latest_deployment: deploymentMeta,
            },
          });
        }
      }

      return {
        ok: true,
        resources,
        ...(warnings.length ? { message: warnings.join("; ") } : {}),
      };
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
