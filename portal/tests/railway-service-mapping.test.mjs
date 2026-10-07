// Phase 3A: Railway service-level resource mapping tests.
// Verifies service resources can be discovered, explicitly linked, and rendered
// in System Detail with full project/environment/service scope. No provider
// mutations are tested or permitted.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asService, asUser, q, rejects } from "./helpers/db.mjs";
import { buildSystemDetailResources } from "../lib/providers/system-detail.ts";
import { buildDiscoveryTree } from "../app/admin/systems/providers/discovery-tree.ts";

const IDS = {
  admin: "00000000-0000-0000-0000-0000000000a1",
  clientA: "00000000-0000-0000-0000-0000000000c1",
};

async function seedBase(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${IDS.admin}', 'admin@example.test'),
      ('${IDS.clientA}', 'clienta@example.test');
    UPDATE public.profiles SET role = 'admin' WHERE id = '${IDS.admin}';
  `);

  const provider = await db.query(`INSERT INTO public.providers (name, slug, adapter_key) VALUES ('Railway', 'railway', 'railway') RETURNING id`);
  const account = await db.query(`INSERT INTO public.provider_accounts (provider_id, account_name, ownership, connection_status) VALUES ('${provider.rows[0].id}', 'SCH Railway', 'sch_managed', 'connected') RETURNING id`);
  const system = await db.query(`INSERT INTO public.systems (client_id, name, system_type, status) VALUES ('${IDS.clientA}', 'Elgon BMS', 'web_platform', 'live') RETURNING id`);
  return { providerId: provider.rows[0].id, accountId: account.rows[0].id, systemId: system.rows[0].id };
}

function insertServiceDiscovered(db, accountId, overrides = {}) {
  const id = overrides.id ?? "00000000-0000-0000-0000-0000000000d1";
  const ext = overrides.externalId ?? "svc-elgon-api";
  const name = overrides.name ?? "elgon-bottling / elgon-bms-api";
  const projectName = overrides.projectName ?? "elgon-bottling";
  const envName = overrides.environmentName ?? "production";
  const metadata = JSON.stringify({
    workspace_id: "ws1",
    workspace_name: "SCH Railway",
    project_id: "proj-elgon",
    project_name: projectName,
    service_id: ext,
    service_name: "elgon-bms-api",
    environment_ids: ["env-prod"],
    environment_names: [envName],
    latest_deployment: {
      id: "dep-1",
      status: "SUCCESS",
      created_at: "2026-10-06T00:00:00.000Z",
      environment_id: "env-prod",
      environment_name: envName,
    },
  });
  return db.query(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, metadata, external_missing, last_run_id)
    VALUES
      ('${id}', '${accountId}', '${ext}', 'service', ${q(name)}, 'SUCCESS', ${q(metadata)}::jsonb, false, NULL)
    RETURNING id
  `);
}

function insertProjectDiscovered(db, accountId, overrides = {}) {
  const id = overrides.id ?? "00000000-0000-0000-0000-0000000000d2";
  const ext = overrides.externalId ?? "proj-elgon";
  const name = overrides.name ?? "elgon-bottling";
  const metadata = JSON.stringify({
    workspace_id: "ws1",
    project_id: ext,
    project_name: name,
  });
  return db.query(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, metadata, external_missing, last_run_id)
    VALUES
      ('${id}', '${accountId}', '${ext}', 'project', ${q(name)}, 'active', ${q(metadata)}::jsonb, false, NULL)
    RETURNING id
  `);
}

test("PHASE 3A-RAILWAY-1: service resource linking maps to api_service resource type", async () => {
  const db = await createDb();
  const { accountId, systemId } = await seedBase(db);
  const disc = await insertServiceDiscovered(db, accountId);

  const linked = await asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${disc.rows[0].id}', '${IDS.clientA}', '${systemId}', '${IDS.admin}') AS resource_id`)
  );
  const resourceId = linked.rows[0].resource_id;
  assert.ok(resourceId, "link_discovered_resource must return a resource id");

  const resource = await asService(db, () =>
    db.query(`SELECT resource_type, system_id, provider_account_id, external_reference FROM public.resources WHERE id = '${resourceId}'`)
  );
  assert.equal(resource.rows[0].resource_type, "api_service", "service discovered resource must become api_service");
  assert.equal(resource.rows[0].system_id, systemId);
  assert.ok(resource.rows[0].external_reference.includes("svc-elgon-api"));
});

test("PHASE 3A-RAILWAY-2: project resource linking maps to web_app resource type", async () => {
  const db = await createDb();
  const { accountId, systemId } = await seedBase(db);
  const disc = await insertProjectDiscovered(db, accountId);

  const linked = await asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${disc.rows[0].id}', '${IDS.clientA}', '${systemId}', '${IDS.admin}') AS resource_id`)
  );
  const resourceId = linked.rows[0].resource_id;

  const resource = await asService(db, () =>
    db.query(`SELECT resource_type FROM public.resources WHERE id = '${resourceId}'`)
  );
  assert.equal(resource.rows[0].resource_type, "web_app", "project discovered resource must become web_app");
});

test("PHASE 3A-RAILWAY-3: discovery tree surfaces services under environments", () => {
  const project = {
    id: "proj-elgon",
    external_resource_id: "proj-elgon",
    resource_type: "project",
    name: "elgon-bottling",
    status: "active",
    metadata: { project_id: "proj-elgon", project_name: "elgon-bottling" },
    link_status: "unlinked",
  };
  const environment = {
    id: "env-prod",
    external_resource_id: "env-prod",
    resource_type: "environment",
    name: "elgon-bottling / production",
    status: "active",
    metadata: { project_id: "proj-elgon" },
    link_status: "unlinked",
  };
  const service = {
    id: "svc-api",
    external_resource_id: "svc-api",
    resource_type: "service",
    name: "elgon-bottling / elgon-bms-api",
    status: "SUCCESS",
    metadata: { project_id: "proj-elgon", environment_ids: ["env-prod"] },
    link_status: "unlinked",
  };

  const tree = buildDiscoveryTree([project, environment, service]);
  assert.equal(tree.projects.length, 1);
  assert.equal(tree.projects[0].environments.length, 1);
  assert.equal(tree.projects[0].environments[0].services.length, 1);
  assert.equal(tree.projects[0].environments[0].services[0].resource_type, "service");
});

test("PHASE 3A-RAILWAY-4: System Detail renders project/environment/service scope for linked service", () => {
  const resource = {
    id: "res-1",
    name: "Elgon BMS API",
    resource_type: "api_service",
    status: "active",
    external_reference: "provider:svc-elgon-api",
    provider: "Railway",
    provider_key: "railway",
    provider_account: "SCH Railway",
  };
  const discovered = {
    linked_resource_id: "res-1",
    external_resource_id: "svc-elgon-api",
    resource_type: "service",
    name: "elgon-bottling / elgon-bms-api",
    status: "SUCCESS",
    external_url: null,
    metadata: {
      project_name: "elgon-bottling",
      service_name: "elgon-bms-api",
      environment_names: ["production"],
      latest_deployment: { status: "SUCCESS", environment_name: "production" },
    },
    last_seen_at: "2026-10-06T00:00:00.000Z",
    link_status: "linked",
  };

  const result = buildSystemDetailResources([resource], [discovered]);
  assert.equal(result.length, 1);
  assert.equal(result[0].railway_project_name, "elgon-bottling");
  assert.equal(result[0].railway_environment_name, "production");
  assert.equal(result[0].railway_service_name, "elgon-bms-api");
});

test("PHASE 3A-RAILWAY-5: project-level resource does not claim service-level scope", () => {
  const resource = {
    id: "res-2",
    name: "elgon-bottling",
    resource_type: "web_app",
    status: "active",
    external_reference: "provider:proj-elgon",
    provider: "Railway",
    provider_key: "railway",
    provider_account: "SCH Railway",
  };
  const discovered = {
    linked_resource_id: "res-2",
    external_resource_id: "proj-elgon",
    resource_type: "project",
    name: "elgon-bottling",
    status: "active",
    external_url: null,
    metadata: { project_name: "elgon-bottling" },
    last_seen_at: "2026-10-06T00:00:00.000Z",
    link_status: "linked",
  };

  const result = buildSystemDetailResources([resource], [discovered]);
  assert.equal(result[0].railway_project_name, null);
  assert.equal(result[0].railway_environment_name, null);
  assert.equal(result[0].railway_service_name, null);
});

test("PHASE 3A-RAILWAY-6: cross-client service linking is rejected", async () => {
  const db = await createDb();
  const { accountId } = await seedBase(db);
  const otherClient = "00000000-0000-0000-0000-0000000000c2";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${otherClient}', 'other@example.test') ON CONFLICT (id) DO NOTHING;`);
  const otherSystem = await db.query(`INSERT INTO public.systems (client_id, name, system_type, status) VALUES ('${otherClient}', 'Other System', 'web_platform', 'live') RETURNING id`);
  const disc = await insertServiceDiscovered(db, accountId);

  await rejects(
    asService(db, () =>
      db.query(`SELECT public.link_discovered_resource('${disc.rows[0].id}', '${IDS.clientA}', '${otherSystem.rows[0].id}', '${IDS.admin}')`)
    ),
    /Cross-client linking forbidden/
  );
});

test("PHASE 3A-RAILWAY-7: provider mutation is not present in the Railway adapter vocabulary", async () => {
  const { railwayAdapter } = await import("../lib/providers/railway.ts");
  assert.equal(railwayAdapter.capabilities.create, false);
  assert.equal(railwayAdapter.capabilities.update, false);
  assert.equal(railwayAdapter.capabilities.delete, false);
  assert.equal(railwayAdapter.capabilities.suspend, false);
  assert.equal(railwayAdapter.capabilities.restore, false);
});
