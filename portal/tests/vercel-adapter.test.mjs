import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAdapter, PROVIDER_ADAPTER_KEYS } from "../lib/providers/registry.ts";

const actions = readFileSync(new URL("../lib/actions/provider-connections.ts", import.meta.url), "utf8");
const adapterSource = readFileSync(new URL("../lib/providers/vercel.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/020_phase3g_provider_connections.sql", import.meta.url), "utf8");

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deployment(id, status, url, createdAt) {
  return { uid: id, readyState: status, url, createdAt };
}

test("Vercel provider is registered and exposes no mutation operations", () => {
  const adapter = getAdapter("vercel");
  assert.ok(PROVIDER_ADAPTER_KEYS.includes("vercel"));
  assert.equal(adapter?.key, "vercel");
  assert.equal(adapter?.capabilities.discoverResources, true);
  for (const capability of ["create", "update", "delete", "suspend", "restore", "billing"]) {
    assert.equal(adapter?.capabilities[capability], false);
  }
  assert.equal(adapter?.operations, undefined);
  assert.doesNotMatch(adapterSource, /providerMutate|\bPOST\b|\bmutation\b/i);
});

test("Vercel credentials use the existing Vault-only provider flow", () => {
  assert.match(actions, /rpc\("store_provider_credential"/);
  assert.match(actions, /Credential storage failed/);
  assert.doesNotMatch(actions, /\.from\("provider_accounts"\)[\s\S]{0,300}\.update\([^)]*token/);
  assert.match(migration, /reveal_provider_credential/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.reveal_provider_credential/);
});

test("Vercel connection test validates the project-list response", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options?.method, "GET");
    assert.match(String(url), /\/v10\/projects\?limit=1/);
    return json({ projects: [], pagination: { next: null } });
  };
  try {
    assert.deepEqual(await getAdapter("vercel").testConnection({ token: "vercel_test_token" }), {
      ok: true,
      message: "Connection verified",
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Vercel discovery paginates projects and embeds domains and deployment metadata", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, method: options?.method });
    if (parsed.pathname === "/v10/projects") {
      if (parsed.searchParams.get("from") === "cursor-2") {
        return json({ projects: [{ id: "prj_two", name: "project-two", framework: "nextjs", updatedAt: 1720000000000 }], pagination: { next: null } });
      }
      return json({ projects: [{ id: "prj_one", name: "project-one", framework: "nextjs", updatedAt: 1710000000000 }], pagination: { next: "cursor-2" } });
    }
    if (parsed.pathname.endsWith("/domains")) {
      const projectId = parsed.pathname.split("/")[3];
      return json({ domains: [{ name: `${projectId}.example.com`, verified: true, target: "production" }] });
    }
    if (parsed.pathname === "/v7/deployments") {
      const projectId = parsed.searchParams.get("projectId");
      const target = parsed.searchParams.get("target") ?? "preview";
      return json({ deployments: [{ ...deployment(`${projectId}-${target}`, "READY", `${projectId}-${target}.vercel.app`, 1730000000000), target: target === "production" ? "production" : null }] });
    }
    return json({}, 404);
  };
  try {
    const result = await getAdapter("vercel").discoverResources({ token: "vercel_test_token", accountId: "team_test" });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.resources.length, 2);
    const first = result.resources.find((resource) => resource.externalId === "prj_one");
    assert.equal(first.type, "project");
    assert.equal(first.name, "project-one");
    assert.equal(first.url, "https://prj_one.example.com");
    assert.equal(first.metadata.framework, "nextjs");
    assert.equal(first.metadata.production_domain, "prj_one.example.com");
    assert.equal(first.metadata.environments.production.status, "READY");
    assert.equal(first.metadata.environments.preview.status, "READY");
    assert.equal(first.metadata.latest_deployment.id, "prj_one-production");
    assert.ok(calls.every((call) => call.method === "GET"));
    assert.ok(calls.every((call) => call.url.searchParams.get("teamId") === "team_test"));
    assert.ok(calls.some((call) => call.url.searchParams.get("from") === "cursor-2"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

for (const [status, category] of [[401, "auth_failed"], [403, "permission_denied"], [429, "rate_limited"], [503, "unavailable"]]) {
  test(`Vercel HTTP ${status} normalizes to ${category} without credential leakage`, async () => {
    const realFetch = globalThis.fetch;
    const token = `vercel_secret_${status}`;
    globalThis.fetch = async () => json({ error: { message: `failure ${token}` } }, status);
    try {
      const connection = await getAdapter("vercel").testConnection({ token });
      assert.equal(connection.ok, false);
      assert.equal(connection.error, category);
      assert.ok(!JSON.stringify(connection).includes(token));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
}

test("Vercel malformed project and deployment responses fail closed", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => json({ unexpected: [] });
    assert.equal((await getAdapter("vercel").testConnection({ token: "token" })).error, "malformed_response");

    globalThis.fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/v10/projects") return json({ projects: [{ id: "prj_one", name: "one" }], pagination: {} });
      if (parsed.pathname.endsWith("/domains")) return json({ domains: [] });
      return json({ unexpected: [] });
    };
    const discovery = await getAdapter("vercel").discoverResources({ token: "token" });
    assert.equal(discovery.ok, false);
    assert.equal(discovery.error, "malformed_response");
    assert.deepEqual(discovery.resources, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("explicit linking and same-client integrity remain database-enforced", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.link_discovered_resource/);
  assert.match(migration, /Cross-client linking forbidden: selected system belongs to a different client/);
  assert.match(actions, /Client and system must be explicitly selected/);
  assert.match(actions, /rpc\("link_discovered_resource"/);
});
