import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileSystemInfrastructure, type InfrastructureEvidence } from "../lib/providers/infrastructure-reconciliation.ts";

const resource = (providerKey: string, resourceName: string, overrides: Partial<InfrastructureEvidence> = {}): InfrastructureEvidence => ({
  provider: providerKey === "railway" ? "Railway" : providerKey === "vercel" ? "Vercel" : "Other",
  providerKey,
  resourceName,
  resourceType: "web_app",
  status: "active",
  externalMissing: false,
  retired: false,
  metadata: null,
  ...overrides,
});

test("named production systems require their verified Railway and Vercel evidence", () => {
  const complete = reconcileSystemInfrastructure({
    systemName: "Elgon BMS",
    client: "Elgon Bottling Company",
    resources: [resource("railway", "elgon-bottling"), resource("vercel", "elgon-bms")],
  });
  assert.equal(complete.assessment, "Complete");
  assert.deepEqual(complete.missing, []);

  const partial = reconcileSystemInfrastructure({
    systemName: "Diani Art Gallery",
    client: "Dream Kenya Safaris",
    resources: [resource("railway", "artistic-determination")],
  });
  assert.equal(partial.assessment, "Partial");
  assert.deepEqual(partial.missing, ["No linked Vercel project evidence"]);
});

test("QuickCredit does not treat its intentionally Netlify-hosted frontend as missing Vercel infrastructure", () => {
  const result = reconcileSystemInfrastructure({
    systemName: "QuickCredit Loan Management System",
    client: "QuickCredit Ug",
    resources: [resource("railway", "charismatic-optimism")],
  });
  assert.equal(result.assessment, "Complete");
  assert.ok(!result.missing.some((item) => item.includes("Vercel")));
  assert.deepEqual(result.context, ["Frontend is hosted on Netlify; no Vercel project is required."]);
});

test("SMA permits its two verified Railway projects without a duplicate warning", () => {
  const result = reconcileSystemInfrastructure({
    systemName: "SMA Learning Management System",
    client: "Synergy Multimedia Academy",
    resources: [
      resource("railway", "SMA Digital Lab Pilot"),
      resource("railway", "sma-backend"),
      resource("vercel", "sma-learning"),
    ],
  });
  assert.equal(result.assessment, "Complete");
  assert.deepEqual(result.possibleDuplicatesOrLegacy, []);
});

test("retired, externally missing, legacy, and cross-client evidence is surfaced without changing mappings", () => {
  const result = reconcileSystemInfrastructure({
    systemName: "Other System",
    client: "Client",
    resources: [
      resource("railway", "legacy-api", { retired: true }),
      resource("vercel", "frontend-test", { externalMissing: true, mappingIssue: "Vercel resource client mismatch" }),
    ],
  });
  assert.equal(result.assessment, "Partial");
  assert.ok(result.possibleDuplicatesOrLegacy.some((item) => item.includes("retired")));
  assert.ok(result.possibleDuplicatesOrLegacy.some((item) => item.includes("legacy or experimental")));
  assert.ok(result.potentiallyIncorrect.some((item) => item.includes("missing externally")));
  assert.ok(result.potentiallyIncorrect.includes("Vercel resource client mismatch"));
});

test("a system without linked evidence remains uncertain", () => {
  const result = reconcileSystemInfrastructure({ systemName: "Unmapped System", client: "Client", resources: [] });
  assert.equal(result.assessment, "Uncertain");
  assert.deepEqual(result.missing, ["No linked provider infrastructure evidence"]);
});

test("temporary reconciliation action is admin-only and read-only", () => {
  const source = readFileSync(new URL("../lib/actions/provider-connections.ts", import.meta.url), "utf8");
  const action = source.slice(source.indexOf("export async function auditSystemInfrastructure"), source.indexOf("// ============================================================================\n// EXPLICIT LINKING"));
  assert.match(action, /callerProfile\(\)/);
  assert.match(action, /requireAdmin\(role\)/);
  assert.ok(action.indexOf("requireAdmin(role)") < action.indexOf("createAdminClient()"));
  assert.doesNotMatch(action, /\.(insert|update|upsert|delete|rpc)\(/);
  for (const table of ["systems", "resources", "provider_accounts", "providers", "provider_discovered_resources", "profiles"]) {
    assert.match(action, new RegExp(`\\.from\\(\"${table}\"\\)`));
  }
});
