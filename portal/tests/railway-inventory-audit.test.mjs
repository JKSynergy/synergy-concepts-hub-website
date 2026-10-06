import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync(new URL("../lib/actions/provider-connections.ts", import.meta.url), "utf8");
const manager = readFileSync(new URL("../app/admin/systems/providers/providers-manager.tsx", import.meta.url), "utf8");
const audit = actions.slice(
  actions.indexOf("export async function auditRailwayProjectLinks"),
  actions.indexOf("// ============================================================================\n// EXPLICIT LINKING")
);

test("Railway inventory audit requires an authenticated administrator", () => {
  assert.match(audit, /callerProfile\(\)/);
  assert.match(audit, /if \(!user\).*Authentication required/);
  assert.match(audit, /requireAdmin\(role\)/);
  assert.ok(audit.indexOf("requireAdmin(role)") < audit.indexOf("createAdminClient()"));
});

test("Railway inventory audit is read-only and project-scoped", () => {
  assert.match(audit, /\.eq\("adapter_key", "railway"\)/);
  assert.match(audit, /\.eq\("resource_type", "project"\)/);
  assert.doesNotMatch(audit, /\.(insert|update|upsert|delete|rpc)\(/);
  for (const table of ["provider_accounts", "provider_discovered_resources", "resources", "systems", "profiles"]) {
    assert.match(audit, new RegExp(`\\.from\\(\"${table}\"\\)`));
  }
});

test("Railway inventory audit returns only mapping fields and has an admin UI trigger", () => {
  for (const field of ["accountName", "railwayProject", "linkStatus", "linkedResource", "linkedResourceType", "schSystem", "client"]) {
    assert.match(audit, new RegExp(`${field}:`));
  }
  assert.match(manager, /data-action="audit-railway-links"/);
  assert.match(manager, /data-testid="railway-inventory-audit"/);
  assert.match(manager, /auditRailwayProjectLinks\(\)/);
});
