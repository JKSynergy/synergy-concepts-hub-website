import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessSystemHealth, SYSTEM_HEALTH_STALE_AFTER_MS } from "../lib/providers/system-health.ts";
import type { SystemDetailResource } from "../lib/providers/system-detail.ts";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const FRESH = "2026-10-06T11:00:00.000Z";

function resource(providerKey: "railway" | "vercel", name: string, overrides: Partial<SystemDetailResource> = {}): SystemDetailResource {
  const vercelMetadata = {
    production_domain: `${name}.example.com`,
    environments: { production: { status: "READY" } },
    latest_deployment: { id: `dpl-${name}`, status: "READY", created_at: FRESH },
  };
  return {
    id: `${providerKey}-${name}`,
    name,
    resource_type: "web_app",
    status: providerKey === "vercel" ? "READY" : "active",
    external_reference: `provider:${name}`,
    provider: providerKey === "vercel" ? "Vercel" : "Railway",
    provider_key: providerKey,
    provider_account: `${providerKey}-account`,
    provider_connection_status: "connected",
    discovered_name: name,
    external_id: name,
    discovered_status: providerKey === "vercel" ? "READY" : "active",
    production_domain: providerKey === "vercel" ? `${name}.example.com` : null,
    deployment_status: providerKey === "vercel" ? "READY" : null,
    deployment_id: providerKey === "vercel" ? `dpl-${name}` : null,
    deployment_created_at: providerKey === "vercel" ? FRESH : null,
    last_discovered_at: FRESH,
    metadata: providerKey === "vercel" ? vercelMetadata : { project_id: name },
    ...overrides,
  };
}

test("healthy Railway and Vercel evidence produces HEALTHY without claiming uptime", () => {
  const result = assessSystemHealth("Elgon BMS", [resource("railway", "elgon-bottling"), resource("vercel", "elgon-bottling")], {}, NOW);
  assert.equal(result.overallStatus, "HEALTHY");
  assert.equal(result.infrastructureStatus, "HEALTHY");
  assert.equal(result.deploymentStatus, "HEALTHY");
  assert.match(result.explanation, /not an uptime check/i);
});

test("Railway-only and Vercel-only systems evaluate their linked evidence", () => {
  assert.equal(assessSystemHealth("Synergy Rent App", [resource("railway", "caring-bravery")], {}, NOW).overallStatus, "HEALTHY");
  assert.equal(assessSystemHealth("Vercel Only", [resource("vercel", "frontend")], {}, NOW).overallStatus, "HEALTHY");
});

test("multiple Railway resources remain independent", () => {
  const result = assessSystemHealth("Generic System", [resource("railway", "api"), resource("railway", "worker")], {}, NOW);
  assert.equal(result.resources.length, 2);
  assert.deepEqual(result.resources.map((item) => item.resourceName), ["api", "worker"]);
});

test("SMA keeps both Railway projects and Vercel as three health inputs", () => {
  const result = assessSystemHealth("SMA Learning Management System", [
    resource("railway", "sma-backend"),
    resource("railway", "SMA Digital Lab Pilot"),
    resource("vercel", "sma-frontend"),
  ], {}, NOW);
  assert.equal(result.overallStatus, "HEALTHY");
  assert.equal(result.resources.length, 3);
});

test("QuickCredit is healthy with Railway evidence and does not require Vercel", () => {
  const result = assessSystemHealth("QuickCredit Loan Management System", [resource("railway", "charismatic-optimism")], {}, NOW);
  assert.equal(result.overallStatus, "HEALTHY");
  assert.ok(!result.attentionItems.some((item) => item.includes("Vercel")));
});

test("non-READY Vercel deployment requires attention", () => {
  const failing = resource("vercel", "frontend", {
    discovered_status: "ERROR",
    deployment_status: "ERROR",
    metadata: { environments: { production: { status: "ERROR" } }, latest_deployment: { status: "ERROR" } },
  });
  const result = assessSystemHealth("Vercel Only", [failing], {}, NOW);
  assert.equal(result.overallStatus, "ATTENTION");
  assert.ok(result.attentionItems.some((item) => item.includes("not READY")));
});

test("non-healthy Railway evidence requires attention", () => {
  const result = assessSystemHealth("Railway Only", [resource("railway", "api", { discovered_status: "FAILED" })], {}, NOW);
  assert.equal(result.overallStatus, "ATTENTION");
  assert.ok(result.attentionItems.some((item) => item.includes("non-healthy")));
});

test("missing infrastructure evidence is UNKNOWN", () => {
  const result = assessSystemHealth("No Infrastructure", [], {}, NOW);
  assert.equal(result.overallStatus, "UNKNOWN");
  assert.ok(result.attentionItems.includes("No linked infrastructure evidence."));
});

test("stale discovery evidence is UNKNOWN using one explicit threshold", () => {
  const staleTime = new Date(NOW.getTime() - SYSTEM_HEALTH_STALE_AFTER_MS - 1).toISOString();
  const result = assessSystemHealth("Railway Only", [resource("railway", "api", { last_discovered_at: staleTime })], {}, NOW);
  assert.equal(result.overallStatus, "UNKNOWN");
  assert.ok(result.attentionItems.some((item) => item.includes("stale")));
});

test("unrecognized or insufficient evidence is UNKNOWN", () => {
  const result = assessSystemHealth("Railway Only", [resource("railway", "api", { discovered_status: null })], {}, NOW);
  assert.equal(result.overallStatus, "UNKNOWN");
});

test("missing expected Vercel evidence is UNKNOWN rather than a downtime claim", () => {
  const result = assessSystemHealth("Diani Art Gallery", [resource("railway", "artistic-determination")], {}, NOW);
  assert.equal(result.overallStatus, "UNKNOWN");
  assert.ok(result.attentionItems.includes("Vercel evidence is not linked."));
  assert.ok(!JSON.stringify(result).toLowerCase().includes("website is down"));
});

test("unlinked discovery and similar names cannot create System mappings", () => {
  const server = readFileSync(new URL("../lib/providers/system-health-server.ts", import.meta.url), "utf8");
  assert.match(server, /\.in\("linked_resource_id", resourceIds\)/);
  assert.match(server, /\.eq\("link_status", "linked"\)/);
  assert.doesNotMatch(server, /ilike|similarity|resource\.name\s*===\s*system\.name/);
});

test("health output contains no metadata or credential fields", () => {
  const input = resource("vercel", "frontend", { metadata: { token: "secret-value", production_domain: "example.com", environments: { production: { status: "READY" } }, latest_deployment: { status: "READY" } } });
  const result = assessSystemHealth("Vercel Only", [input], {}, NOW);
  assert.ok(!JSON.stringify(result).includes("secret-value"));
  assert.ok(!("metadata" in result.resources[0]));
  assert.ok(!("credential" in result.resources[0]));
});

test("provider connectivity failure requires attention", () => {
  const result = assessSystemHealth("Railway Only", [resource("railway", "api", { provider_connection_status: "failed" })], {}, NOW);
  assert.equal(result.overallStatus, "ATTENTION");
  assert.ok(result.attentionItems.includes("A linked provider account connection is failing."));
});

test("health layer introduces no provider mutations or direct provider calls", () => {
  const health = readFileSync(new URL("../lib/providers/system-health.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../lib/providers/system-health-server.ts", import.meta.url), "utf8");
  for (const source of [health, server]) {
    assert.doesNotMatch(source, /providerMutate|fetch\(|api\.vercel\.com|backboard\.railway/);
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\(/);
  }
});
