// Automated Phase 3A Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Tests real REST API & direct PostgreSQL triggers/constraints against DEV with real test accounts.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3aHostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3A DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  // Load test accounts
  const accountsPath = resolve(ACCOUNT_FILE);
  const accountsData = JSON.parse(readFileSync(accountsPath, "utf8"));
  const { admin, staff, finance, clientA, clientB } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });

  // Sign in as each role to acquire tokens
  console.log("[PHASE 3A DEV VERIFY] Signing in test accounts via Supabase Auth...");
  const authResults = {};
  for (const [key, acc] of Object.entries({ admin, staff, finance, clientA, clientB })) {
    const res = await client.auth.signIn(acc.email, acc.password);
    if (!res.ok) {
      throw new Error(`Failed to sign in as ${key}: ${res.error || res.status}`);
    }
    const token = res.body?.access_token || res.token;
    const userId = res.body?.user?.id || acc.id;
    authResults[key] = {
      token,
      userId,
      role: acc.role,
      rest: client.rest({ kind: "user", token })
    };
  }

  const results = [];
  function check(id, title, pass, detail = "") {
    results.push({ id, title, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${title}${detail ? " - " + detail : ""}`);
  }

  const anonRest = client.rest({ kind: "anon" });
  const adminRest = authResults.admin.rest;
  const staffRest = authResults.staff.rest;
  const financeRest = authResults.finance.rest;
  const clientARest = authResults.clientA.rest;
  const clientBRest = authResults.clientB.rest;

  const runTag = `dev3a_${Date.now().toString(36)}`;

  // 1. Anon access check
  const anonP = await anonRest.get("providers");
  check("3A-ANON-1", "Anon caller cannot read providers", anonP.status === 401 || anonP.status === 403 || (Array.isArray(anonP.body) && anonP.body.length === 0), `Status: ${anonP.status}`);

  const anonS = await anonRest.get("systems");
  check("3A-ANON-2", "Anon caller cannot read systems", anonS.status === 401 || anonS.status === 403 || (Array.isArray(anonS.body) && anonS.body.length === 0), `Status: ${anonS.status}`);

  const anonPost = await anonRest.insert("providers", { name: "Rogue Provider", slug: `rogue_${runTag}` });
  check("3A-ANON-3", "Anon caller cannot insert providers", anonPost.status === 401 || anonPost.status === 403 || !anonPost.ok, `Status: ${anonPost.status}`);

  // 2. Admin operations
  let provId, acctId, sysAId, resStandaloneId, resAttachedId;

  const createProv = await adminRest.insert("providers", {
    name: `Dev Provider ${runTag}`,
    slug: `prov_${runTag}`,
    category: "cloud_hosting",
    website_url: "https://example.com",
    operational_notes: "Automated test provider on DEV"
  });
  check("3A-ADMIN-1", "Admin can create a provider", createProv.ok, `Status: ${createProv.status}`);
  provId = createProv.body?.[0]?.id;

  const createAcct = await adminRest.insert("provider_accounts", {
    provider_id: provId,
    account_name: `Dev Team ${runTag}`,
    ownership: "sch_managed",
    account_identifier: `org_${runTag}`,
    credential_reference: "Vault / SCH Core / Dev Team"
  });
  check("3A-ADMIN-2", "Admin can create a provider account", createAcct.ok, `Status: ${createAcct.status}`);
  acctId = createAcct.body?.[0]?.id;

  const createSys = await adminRest.insert("systems", {
    client_id: authResults.clientA.userId,
    name: `Client A Digital Portal ${runTag}`,
    system_type: "web_platform",
    status: "live",
    description: "Production web platform on DEV"
  });
  check("3A-ADMIN-3", "Admin can create a system for Client A", createSys.ok, `Status: ${createSys.status}`);
  sysAId = createSys.body?.[0]?.id;

  // Standalone resource (system_id = null)
  const createResStandalone = await adminRest.insert("resources", {
    system_id: null,
    provider_account_id: acctId,
    name: `Standalone DNS Zone ${runTag}`,
    resource_type: "dns_zone",
    ownership: "sch_managed",
    status: "active",
    suspension_capability: "none"
  });
  check("3A-ADMIN-4", "Admin can create standalone resource (system_id = null)", createResStandalone.ok, `Status: ${createResStandalone.status}`);
  resStandaloneId = createResStandalone.body?.[0]?.id;

  // Attached resource (system_id = sysAId, client_id = clientA)
  const createResAttached = await adminRest.insert("resources", {
    system_id: sysAId,
    provider_account_id: acctId,
    name: `Web App Service ${runTag}`,
    resource_type: "web_app",
    ownership: "client_owned",
    client_id: authResults.clientA.userId,
    status: "active",
    suspension_capability: "none"
  });
  check("3A-ADMIN-5", "Admin can create resource attached to Client A system", createResAttached.ok, `Status: ${createResAttached.status}`);
  resAttachedId = createResAttached.body?.[0]?.id;

  // Destructive delete blocked by privilege / RLS
  const adminDelSys = await adminRest.delete("systems", { id: `eq.${sysAId}` });
  check("3A-ADMIN-6", "Destructive DELETE on systems is blocked (HTTP 403 or 0 rows deleted)", adminDelSys.status === 403 || (adminDelSys.ok && Array.isArray(adminDelSys.body) && adminDelSys.body.length === 0), `Status: ${adminDelSys.status}`);

  const adminDelRes = await adminRest.delete("resources", { id: `eq.${resAttachedId}` });
  check("3A-ADMIN-7", "Destructive DELETE on resources is blocked (HTTP 403 or 0 rows deleted)", adminDelRes.status === 403 || (adminDelRes.ok && Array.isArray(adminDelRes.body) && adminDelRes.body.length === 0), `Status: ${adminDelRes.status}`);

  // 3. Staff permissions
  const staffReadSys = await staffRest.get("systems", { id: `eq.${sysAId}` });
  check("3A-STAFF-1", "Staff can read systems", staffReadSys.ok && staffReadSys.body?.length === 1);

  const staffReadRes = await staffRest.get("resources", { id: `eq.${resAttachedId}` });
  check("3A-STAFF-2", "Staff can read resources", staffReadRes.ok && staffReadRes.body?.length === 1);

  const staffUpdateNotes = await staffRest.patch("resources", { id: `eq.${resAttachedId}` }, {
    operational_notes: "Staff checked deployment health: 100% OK"
  });
  check("3A-STAFF-3", "Staff can update operational metadata on resources", staffUpdateNotes.ok && staffUpdateNotes.body?.length === 1);

  const staffInsertProv = await staffRest.insert("providers", { name: "Staff Provider", slug: `staff_${runTag}` });
  check("3A-STAFF-4", "Staff cannot insert providers (RLS blocked)", !staffInsertProv.ok || staffInsertProv.status === 403 || staffInsertProv.status === 401);

  const staffDelRes = await staffRest.delete("resources", { id: `eq.${resAttachedId}` });
  check("3A-STAFF-5", "Staff cannot delete resources (HTTP 403 or 0 rows deleted)", staffDelRes.status === 403 || (staffDelRes.ok && Array.isArray(staffDelRes.body) && staffDelRes.body.length === 0), `Status: ${staffDelRes.status}`);

  // 4. Finance permissions (Read-only operational context)
  const finReadSys = await financeRest.get("systems", { id: `eq.${sysAId}` });
  check("3A-FIN-1", "Finance has read-only operational access to systems", finReadSys.ok && finReadSys.body?.length === 1);

  const finReadRes = await financeRest.get("resources", { id: `eq.${resAttachedId}` });
  check("3A-FIN-2", "Finance has read-only operational access to resources", finReadRes.ok && finReadRes.body?.length === 1);

  const finUpdateSys = await financeRest.patch("systems", { id: `eq.${sysAId}` }, { name: "Finance Renamed System" });
  check("3A-FIN-3", "Finance cannot modify systems (0 rows updated by RLS)", finUpdateSys.ok && (Array.isArray(finUpdateSys.body) ? finUpdateSys.body.length === 0 : true));

  const finInsertSys = await financeRest.insert("systems", {
    client_id: authResults.clientA.userId,
    name: "Finance Created System"
  });
  check("3A-FIN-4", "Finance cannot create systems", !finInsertSys.ok || finInsertSys.status === 403);

  // 5. Client permissions (D8: NO access)
  const clientAReadSys = await clientARest.get("systems");
  check("3A-CLIENT-1", "Client A cannot read systems (0 rows returned)", clientAReadSys.ok && clientAReadSys.body?.length === 0);

  const clientAReadRes = await clientARest.get("resources");
  check("3A-CLIENT-2", "Client A cannot read resources (0 rows returned)", clientAReadRes.ok && clientAReadRes.body?.length === 0);

  const clientBReadSys = await clientBRest.get("systems");
  check("3A-CLIENT-3", "Client B cannot read systems (0 rows returned)", clientBReadSys.ok && clientBReadSys.body?.length === 0);

  const clientAInsert = await clientARest.insert("systems", { name: "Client System", client_id: authResults.clientA.userId });
  check("3A-CLIENT-4", "Client cannot create systems", !clientAInsert.ok || clientAInsert.status === 403);

  // 6. Direct Database Triggers & Constraints Verification
  console.log("[PHASE 3A DEV VERIFY] Connecting via pg to test triggers and constraints on DEV...");
  const pgClient = await openPgConnection(target.dbUrl);
  try {
    // Cross-client attachment trigger test
    let crossClientCaught = false;
    try {
      await pgClient.query(`
        INSERT INTO public.resources (
          system_id, provider_account_id, name, resource_type, ownership, client_id
        ) VALUES (
          $1, $2, 'Rogue Cross Client Resource', 'database', 'client_owned', $3
        )
      `, [sysAId, acctId, authResults.clientB.userId]);
    } catch (e) {
      if (e.message.includes("Cross-client resource attachment forbidden")) {
        crossClientCaught = true;
      }
    }
    check("3A-DB-1", "Trigger forbids attaching Client B resource to Client A system", crossClientCaught);

    // Anti-secrets guard test on DEV
    let secretCaught = false;
    try {
      await pgClient.query(`
        INSERT INTO public.providers (name, slug, operational_notes)
        VALUES ('Secret Leaker', $1, '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...')
      `, [`secret_${runTag}`]);
    } catch (e) {
      if (e.message.includes("violates check constraint")) {
        secretCaught = true;
      }
    }
    check("3A-DB-2", "Check constraint prevents storing private key in operational notes", secretCaught);

    // Nullability check on DEV
    const colNull = await pgClient.query(`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'resources' AND column_name = 'system_id')
             OR (table_name = 'projects' AND column_name = 'system_id'))
      ORDER BY table_name;
    `);
    const resNullable = colNull.rows.find(r => r.table_name === 'resources' && r.column_name === 'system_id')?.is_nullable === 'YES';
    const projNullable = colNull.rows.find(r => r.table_name === 'projects' && r.column_name === 'system_id')?.is_nullable === 'YES';
    check("3A-DB-3", "resources.system_id is NULLABLE on DEV", resNullable);
    check("3A-DB-4", "projects.system_id is NULLABLE on DEV", projNullable);
  } finally {
    await pgClient.end();
  }

  const passCount = results.filter(r => r.pass).length;
  const failCount = results.filter(r => !r.pass).length;
  console.log(`\n[PHASE 3A DEV VERIFY] SUMMARY: ${passCount} PASS, ${failCount} FAIL`);

  const report = {
    targetRef: target.ref,
    timestamp: new Date().toISOString(),
    passCount,
    failCount,
    status: failCount === 0 ? "PASS" : "FAIL",
    results
  };

  mkdirSync("phase2c-reports", { recursive: true });
  writeFileSync(join("phase2c-reports", "phase3a-dev-verification.json"), redact(JSON.stringify(report, null, 2)));

  return report;
}

if (process.argv[1]?.endsWith("verify-phase3a-hosted-dev.mjs")) {
  runPhase3aHostedVerification().catch(err => {
    console.error("[PHASE 3A DEV VERIFY] ERROR:", err);
    process.exit(1);
  });
}
