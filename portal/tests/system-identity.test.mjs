import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// System Detail exposes the canonical systems.id UUID with a copy control so
// admins can retrieve SCH_SYSTEM_ID / SCH_STATUS_ENDPOINT values when
// onboarding managed applications — no Supabase queries needed. These guards
// prove the displayed value is the registry UUID (not a provider/external ID),
// the status endpoint is derived from it, and no secret material is rendered.
// The identity rows are rendered inside the Application Integration section.

const PAGE_SRC = readFileSync("app/admin/systems/[id]/page.tsx", "utf8");
const IDENTITY_SRC = readFileSync("app/admin/systems/[id]/system-identity.tsx", "utf8");
const INTEGRATION_SRC = readFileSync("app/admin/systems/[id]/system-integration.tsx", "utf8");

test("detail page renders SystemIntegration with the canonical system UUID", () => {
  assert.match(PAGE_SRC, /<SystemIntegration\s+[\s\S]*?systemId=\{system\.id\}/,
    "page passes system.id — the public.systems primary key");
});

test("integration section renders the identity rows for the same system ID", () => {
  assert.match(INTEGRATION_SRC, /<SystemIdentity systemId=\{systemId\}\s+bare\s*\/>/,
    "identity rows reuse the same systemId prop");
});

test("identity component displays the exact UUID, not a provider/external ID", () => {
  assert.match(IDENTITY_SRC, /\{systemId\}/, "UUID rendered verbatim");
  assert.ok(!/external_reference|external_resource_id|origin_project_id|provider/.test(IDENTITY_SRC),
    "component must not surface provider or external identifiers");
});

test("copy control writes the exact UUID to the clipboard", () => {
  assert.match(IDENTITY_SRC, /navigator\.clipboard\.writeText\(value\)/,
    "clipboard receives the prop value verbatim");
  assert.match(IDENTITY_SRC, /<CopyButton value=\{systemId\}\s*\/>/,
    "System ID copy button copies the canonical UUID");
});

test("status endpoint is derived from the same canonical UUID", () => {
  assert.match(IDENTITY_SRC, /api\/systems\/\$\{systemId\}\/status/,
    "endpoint template interpolates systemId");
  assert.match(IDENTITY_SRC, /https:\/\/portal\.synergyconceptshub\.com/,
    "endpoint uses the canonical portal origin");
  assert.match(IDENTITY_SRC, /<CopyButton value=\{statusEndpoint\}\s*\/>/,
    "endpoint copy button copies the derived endpoint");
});

test("no token, hash, or secret material is rendered by identity rows", () => {
  assert.ok(!/status_token_hash/.test(IDENTITY_SRC), "token hash never rendered");
  assert.ok(!/SCH_STATUS_TOKEN|statusToken|generatedToken/.test(IDENTITY_SRC),
    "identity component must not reference tokens");
  const select = PAGE_SRC.match(/\.from\("systems"\)\s*\.select\("([^"]+)"\)/);
  assert.ok(select, "systems select found");
  assert.ok(!/status_token_hash/.test(select[1]), "select does not include token hash");
});
