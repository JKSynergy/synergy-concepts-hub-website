// Pure UI helper: turn flat provider_discovered_resources rows into a
// project-centric tree for the Providers page. No data fetching, no secrets.
import type { DiscoveredItem } from "./providers-manager";

export interface EnvironmentNode {
  environment: DiscoveredItem;
  services: DiscoveredItem[];
}

export interface ProjectNode {
  project: DiscoveredItem;
  environments: EnvironmentNode[];
  orphanServices: DiscoveredItem[];
}

export interface DiscoveryTree {
  workspace?: DiscoveredItem;
  projects: ProjectNode[];
  other: DiscoveredItem[];
}

function isProjectResource(d: DiscoveredItem): boolean {
  return d.resource_type === "project";
}

function isEnvironmentResource(d: DiscoveredItem): boolean {
  return d.resource_type === "environment";
}

function isServiceResource(d: DiscoveredItem): boolean {
  return d.resource_type === "service";
}

function isWorkspaceResource(d: DiscoveredItem): boolean {
  return d.resource_type === "workspace";
}

function getProjectId(d: DiscoveredItem): string | undefined {
  return (d.metadata?.project_id as string) || undefined;
}

function getEnvironmentIds(d: DiscoveredItem): string[] {
  const ids = d.metadata?.environment_ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

/**
 * Build a project-centric tree from a flat list of discovered resources.
 *
 * - workspace resource becomes the top-level workspace header (non-linkable)
 * - project resources become top-level project nodes
 * - environment resources are grouped under their project
 * - service resources are placed under the first matching environment, or
 *   kept as orphan services under the project when no environment matches
 * - resources that are not workspace/project/environment/service are kept in
 *   `other` so existing discovery output is not lost
 */
export function buildDiscoveryTree(items: DiscoveredItem[]): DiscoveryTree {
  const workspace = items.find(isWorkspaceResource);
  const other = items.filter(
    (d) => !isWorkspaceResource(d) && !isProjectResource(d) && !isEnvironmentResource(d) && !isServiceResource(d)
  );

  const projectsById = new Map<string, ProjectNode>();
  for (const d of items) {
    if (isProjectResource(d)) {
      projectsById.set(d.external_resource_id, {
        project: d,
        environments: [],
        orphanServices: [],
      });
    }
  }

  const envById = new Map<string, EnvironmentNode>();
  for (const d of items) {
    if (!isEnvironmentResource(d)) continue;
    const projectId = getProjectId(d);
    if (!projectId) continue;
    const projectNode = projectsById.get(projectId);
    if (!projectNode) continue;
    const envNode: EnvironmentNode = { environment: d, services: [] };
    projectNode.environments.push(envNode);
    envById.set(d.external_resource_id, envNode);
  }

  for (const d of items) {
    if (!isServiceResource(d)) continue;
    const projectId = getProjectId(d);
    if (!projectId) continue;
    const projectNode = projectsById.get(projectId);
    if (!projectNode) continue;

    const envIds = getEnvironmentIds(d);
    let assigned = false;
    for (const envId of envIds) {
      const envNode = envById.get(envId);
      if (envNode) {
        envNode.services.push(d);
        assigned = true;
      }
    }

    if (!assigned) {
      projectNode.orphanServices.push(d);
    }
  }

  return {
    workspace,
    projects: Array.from(projectsById.values()),
    other,
  };
}

/**
 * Names produced by the Railway adapter are of the form `Project / Child`.
 * When rendering a child inside its project, only show the child part.
 */
export function shortName(item: DiscoveredItem): string {
  const parts = item.name.split(" / ");
  return parts.length > 1 ? parts.slice(1).join(" / ") : item.name;
}

export interface ProjectCounts {
  environments: number;
  services: number;
}

export function projectCounts(node: ProjectNode): ProjectCounts {
  const services =
    node.environments.reduce((sum, env) => sum + env.services.length, 0) +
    node.orphanServices.length;
  return {
    environments: node.environments.length,
    services,
  };
}
