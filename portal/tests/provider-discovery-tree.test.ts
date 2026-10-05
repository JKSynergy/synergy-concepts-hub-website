import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildDiscoveryTree,
  projectCounts,
  shortName,
} from "../app/admin/systems/providers/discovery-tree.ts";
import type { DiscoveredItem } from "../app/admin/systems/providers/providers-manager.tsx";

function item(
  id: string,
  resource_type: string,
  name: string,
  metadata?: Record<string, unknown>
): DiscoveredItem {
  return {
    id,
    provider_account_id: "acc-1",
    provider_name: "Railway",
    account_name: "SCH Railway",
    external_resource_id: id,
    resource_type,
    name,
    status: "active",
    region: null,
    external_url: null,
    metadata,
    first_discovered_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-01-01T00:00:00Z",
    link_status: "unlinked",
    linked_resource_id: null,
    linked_at: null,
  };
}

describe("provider discovery tree", () => {
  it("builds a project-centric tree", () => {
    const resources: DiscoveredItem[] = [
      item("ws", "workspace", "SCH Workspace"),
      item("p1", "project", "alluring-magic"),
      item("p2", "project", "sma-backend"),
      item("e1", "environment", "alluring-magic / production", { project_id: "p1" }),
      item("s1", "service", "alluring-magic / Postgres", { project_id: "p1", environment_ids: ["e1"] }),
      item("s2", "service", "alluring-magic / web", { project_id: "p1", environment_ids: ["e1"] }),
      item("e2", "environment", "sma-backend / production", { project_id: "p2" }),
      item("e3", "environment", "sma-backend / staging", { project_id: "p2" }),
      item("s3", "service", "sma-backend / api", { project_id: "p2", environment_ids: ["e2", "e3"] }),
      item("s4", "service", "sma-backend / orphan", { project_id: "p2", environment_ids: [] }),
      item("db1", "database", "Standalone DB"),
    ];

    const tree = buildDiscoveryTree(resources);
    assert.equal(tree.workspace?.id, "ws");
    assert.equal(tree.projects.length, 2);
    assert.equal(tree.other.length, 1);
    assert.equal(tree.other[0].id, "db1");

    const p1 = tree.projects.find((p) => p.project.id === "p1")!;
    assert.equal(p1.environments.length, 1);
    assert.equal(p1.environments[0].services.length, 2);
    assert.equal(p1.orphanServices.length, 0);

    const p2 = tree.projects.find((p) => p.project.id === "p2")!;
    assert.equal(p2.environments.length, 2);
    assert.equal(p2.environments[0].services.length, 1);
    assert.equal(p2.environments[1].services.length, 1);
    assert.equal(p2.orphanServices.length, 1);
  });

  it("shortName strips the project prefix", () => {
    const env = item("e1", "environment", "alluring-magic / production");
    assert.equal(shortName(env), "production");
    const svc = item("s1", "service", "alluring-magic / Postgres");
    assert.equal(shortName(svc), "Postgres");
    const plain = item("p1", "project", "plain");
    assert.equal(shortName(plain), "plain");
  });

  it("counts environments and services per project", () => {
    const node = {
      project: item("p2", "project", "sma-backend"),
      environments: [
        { environment: item("e2", "environment", "sma-backend / production"), services: [item("s3", "service", "sma-backend / api")] },
        { environment: item("e3", "environment", "sma-backend / staging"), services: [item("s4", "service", "sma-backend / worker")] },
      ],
      orphanServices: [item("s5", "service", "sma-backend / orphan")],
    };
    const counts = projectCounts(node);
    assert.equal(counts.environments, 2);
    assert.equal(counts.services, 3);
  });

  it("keeps projects with no children", () => {
    const resources = [item("p1", "project", "lonely-project")];
    const tree = buildDiscoveryTree(resources);
    assert.equal(tree.projects.length, 1);
    assert.equal(tree.projects[0].environments.length, 0);
    assert.equal(tree.projects[0].orphanServices.length, 0);
  });
});
