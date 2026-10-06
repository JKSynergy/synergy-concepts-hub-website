import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemDetailResources, type LinkedDiscoveryRecord, type SystemResourceRecord } from "../lib/providers/system-detail.ts";
import { reconcileSystemInfrastructure } from "../lib/providers/infrastructure-reconciliation.ts";

const baseResource = (id: string, provider: string, providerKey: string): SystemResourceRecord => ({
  id,
  name: `${provider} resource`,
  resource_type: "web_app",
  status: "active",
  external_reference: `provider:external-${id}`,
  provider,
  provider_key: providerKey,
  provider_account: `${provider} account`,
});

const linked = (resourceId: string, name: string, metadata: Record<string, unknown> = {}): LinkedDiscoveryRecord => ({
  linked_resource_id: resourceId,
  external_resource_id: `external-${resourceId}`,
  resource_type: "project",
  name,
  status: "READY",
  external_url: null,
  metadata,
  last_seen_at: "2026-10-06T00:00:00.000Z",
  link_status: "linked",
});

test("System Detail keeps Railway and Vercel projects as independent explicit resources", () => {
  const resources = [baseResource("railway", "Railway", "railway"), baseResource("vercel", "Vercel", "vercel")];
  const result = buildSystemDetailResources(resources, [linked("railway", "elgon-bottling"), linked("vercel", "elgon-bottling")]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => `${item.provider}:${item.discovered_name}`), ["Railway:elgon-bottling", "Vercel:elgon-bottling"]);
});

test("SMA displays both linked Railway projects independently", () => {
  const resources = [baseResource("backend", "Railway", "railway"), baseResource("pilot", "Railway", "railway")];
  const result = buildSystemDetailResources(resources, [linked("backend", "sma-backend"), linked("pilot", "SMA Digital Lab Pilot")]);
  assert.deepEqual(result.map((item) => item.discovered_name), ["sma-backend", "SMA Digital Lab Pilot"]);
});

test("System Detail supports Railway-only, Vercel-only, and no-infrastructure systems", () => {
  assert.equal(buildSystemDetailResources([baseResource("r", "Railway", "railway")], [linked("r", "charismatic-optimism")]).length, 1);
  assert.equal(buildSystemDetailResources([baseResource("v", "Vercel", "vercel")], [linked("v", "frontend")]).length, 1);
  assert.deepEqual(buildSystemDetailResources([], []), []);
});

test("unlinked discovered resources are never attached to a System Detail resource", () => {
  const resource = baseResource("linked", "Vercel", "vercel");
  const unlinked = { ...linked("linked", "similar-but-unlinked"), link_status: "unlinked" };
  const result = buildSystemDetailResources([resource], [unlinked]);
  assert.equal(result[0].discovered_name, null);
  assert.equal(result[0].external_id, "external-linked");
  assert.equal(result[0].discovered_status, null);
});

test("provider deployment metadata is normalized without returning credentials", () => {
  const metadata = {
    production_domain: "system.example.com",
    latest_deployment: { id: "dpl_1", status: "READY", created_at: "2026-10-06T00:00:00.000Z" },
    token: "must-not-be-read",
  };
  const result = buildSystemDetailResources([baseResource("v", "Vercel", "vercel")], [linked("v", "frontend", metadata)])[0];
  assert.equal(result.production_domain, "system.example.com");
  assert.equal(result.deployment_status, "READY");
  assert.equal(result.deployment_id, "dpl_1");
  assert.ok(!JSON.stringify({
    production_domain: result.production_domain,
    deployment_status: result.deployment_status,
    deployment_id: result.deployment_id,
  }).includes("must-not-be-read"));
});

test("QuickCredit does not require a Vercel resource", () => {
  const result = reconcileSystemInfrastructure({
    systemName: "QuickCredit Loan Management System",
    client: "QuickCredit Ug",
    resources: [{
      provider: "Railway",
      providerKey: "railway",
      resourceName: "charismatic-optimism",
      resourceType: "web_app",
      status: "active",
      externalMissing: false,
      retired: false,
      metadata: null,
    }],
  });
  assert.equal(result.assessment, "Complete");
  assert.ok(!result.missing.some((item) => item.includes("Vercel")));
});

test("System Detail route is read-only and filters discovery by explicit linked resource IDs", () => {
  const page = readFileSync(new URL("../app/admin/systems/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.eq\("system_id", id\)/);
  assert.match(page, /\.in\("linked_resource_id", resourceIds\)/);
  assert.match(page, /\.eq\("link_status", "linked"\)/);
  assert.doesNotMatch(page, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.match(page, /system\.client_id/);
  assert.match(page, /\.eq\("system_id", id\)\.order\("title"\)/);
});
