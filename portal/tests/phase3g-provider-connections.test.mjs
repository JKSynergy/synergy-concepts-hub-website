// Phase 3G-1: Provider Connections & Read-Only Discovery — Unit & Invariant Tests
// Validates: connection state model, credential safety (no plaintext columns,
// vault-gated RPCs, service_role-only), external identity uniqueness, explicit
// linking with same-client integrity, RBAC boundaries, audit logging, delete
// safety, and adapter read-only/normalization behaviour.
//
// 3G-REG-* regression coverage is provided by the other phase test files in
// this suite (phase2c/3a/3b/3c/3d/3e/3f tests all run under npm test).

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, asService, rejects, q } from "./helpers/db.mjs";

// Adapter unit tests import the real TypeScript adapter layer.
import { getAdapter, PROVIDER_ADAPTER_KEYS } from "../lib/providers/registry.ts";

const IDS = {
  provider: "aaaa0000-0000-0000-0000-000000000001",
  account: "aaaa0000-0000-0000-0000-000000000002",
  accountB: "aaaa0000-0000-0000-0000-0000000000b2",
  sysA: "aaaa0000-0000-0000-0000-000000000003",
  sysB: "aaaa0000-0000-0000-0000-000000000004",
  disc1: "aaaa0000-0000-0000-0000-000000000005",
  disc2: "aaaa0000-0000-0000-0000-000000000006",
  run1: "aaaa0000-0000-0000-0000-000000000007",
};

const ADMIN = "00000000-0000-0000-0000-000000000001";
const STAFF = "00000000-0000-0000-0000-000000000002";
const FINANCE = "00000000-0000-0000-0000-000000000003";
const CLIENT_A = "00000000-0000-0000-0000-000000000004";
const CLIENT_B = "00000000-0000-0000-0000-000000000005";

async function setup(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@synergy.ug'), ('${STAFF}', 'staff@synergy.ug'),
      ('${FINANCE}', 'finance@synergy.ug'),
      ('${CLIENT_A}', 'clienta@company.com'), ('${CLIENT_B}', 'clientb@corp.com')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'admin@synergy.ug', 'admin'), ('${STAFF}', 'staff@synergy.ug', 'staff'),
      ('${FINANCE}', 'finance@synergy.ug', 'finance'),
      ('${CLIENT_A}', 'clienta@company.com', 'client'), ('${CLIENT_B}', 'clientb@corp.com', 'client')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.providers (id, name, slug, adapter_key)
      VALUES ('${IDS.provider}', 'Supabase', 'supabase', 'supabase') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership)
      VALUES ('${IDS.account}', '${IDS.provider}', 'SCH Supabase', 'sch_managed') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, client_id)
      VALUES ('${IDS.accountB}', '${IDS.provider}', 'Client B Supabase', 'client_owned', '${CLIENT_B}') ON CONFLICT DO NOTHING;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysA}', '${CLIENT_A}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysB}', '${CLIENT_B}', 'Client B System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
  `);
}

// ============================================================================
// 3G1-SCHEMA — structure & safety
// ============================================================================

test("3G1-SCHEMA-1: discovery tables and connection state exist", async () => {
  const db = await createDb();
  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN
      ('provider_discovery_runs','provider_discovered_resources')`);
  assert.equal(tables.rows.length, 2);
  const col = await db.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name='provider_accounts' AND column_name='connection_status'`);
  assert.equal(col.rows.length, 1);
  const adapter = await db.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name='providers' AND column_name='adapter_key'`);
  assert.equal(adapter.rows.length, 1);
});

test("3G1-SCHEMA-2: no plaintext secret/credential columns exist", async () => {
  const db = await createDb();
  const cols = await db.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public'
      AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|secret|bearer|private_key)(_|$)'
           OR column_name IN ('token','secret','key','api_key','password'))`);
  assert.equal(cols.rows.length, 0, `plaintext credential columns: ${JSON.stringify(cols.rows)}`);
  // credential_reference is a vault pointer, not a credential
  const ref = await db.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name='provider_accounts' AND column_name='credential_reference'`);
  assert.equal(ref.rows[0].data_type, "text");
});

test("3G1-SCHEMA-3: external identity (account + external_resource_id) is unique", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name)
    VALUES ('${IDS.disc1}', '${IDS.account}', 'proj-abc', 'project', 'Alpha Project')`);
  const dup = await rejects(db.exec(`
    INSERT INTO public.provider_discovered_resources
      (provider_account_id, external_resource_id, resource_type, name)
    VALUES ('${IDS.account}', 'proj-abc', 'project', 'Duplicate')`));
  assert.match(dup.message, /uq_discovered_external_identity|duplicate key/);
  // Same external ID under a DIFFERENT account is a distinct identity — allowed.
  await db.exec(`
    INSERT INTO public.provider_discovered_resources
      (provider_account_id, external_resource_id, resource_type, name)
    VALUES ('${IDS.accountB}', 'proj-abc', 'project', 'Other Account Same ID')`);
});

test("3G1-SCHEMA-4: RLS enabled on discovery tables; discovered rows are not inventory", async () => {
  const db = await createDb();
  const rls = await db.query(`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('provider_discovery_runs','provider_discovered_resources')`);
  assert.equal(rls.rows.length, 2);
  for (const r of rls.rows) assert.equal(r.relrowsecurity, true, `${r.relname} RLS`);
  // Discovered resources are a separate review staging table; resources stays
  // the sole managed-inventory table (linked via linked_resource_id only).
  const fk = await db.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name='provider_discovered_resources' AND column_name='linked_resource_id'`);
  assert.equal(fk.rows.length, 1);
});

// ============================================================================
// 3G1-RBAC
// ============================================================================

test("3G1-RBAC-1: admin can manage provider connections", async () => {
  const db = await createDb();
  await setup(db);
  await asUser(db, ADMIN, async () => {
    await db.exec(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, initiated_by)
      VALUES ('${IDS.account}', '${ADMIN}')`);
    const r = await db.query(`SELECT * FROM public.provider_connection_overview`);
    assert.ok(r.rows.length >= 1);
  });
});

test("3G1-RBAC-2: finance can read but cannot write discovery data", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name)
    VALUES ('${IDS.disc1}', '${IDS.account}', 'p1', 'project', 'P1')`);
  await asUser(db, FINANCE, async () => {
    const sel = await db.query(`SELECT id FROM public.provider_discovered_resources`);
    assert.equal(sel.rows.length, 1);
    const ov = await db.query(`SELECT id, credential_configured FROM public.provider_connection_overview`);
    assert.ok(ov.rows.length >= 1);
    const ins = await rejects(db.exec(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name)
      VALUES ('${IDS.account}', 'pX', 'project', 'PX')`));
    assert.match(ins.message, /row-level security|new row violates/i);
    // RLS filters UPDATE silently — assert the row is untouched, not an error.
    await db.exec(`UPDATE public.provider_discovered_resources SET name='hax' WHERE id='${IDS.disc1}'`);
    const after = await db.query(`SELECT name FROM public.provider_discovered_resources WHERE id='${IDS.disc1}'`);
    assert.equal(after.rows[0].name, "P1", "finance update must be a silent no-op");
  });
});

test("3G1-RBAC-3: staff cannot read raw discovered table or run history; linked view only", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name)
    VALUES ('${IDS.disc1}', '${IDS.account}', 'p1', 'project', 'P1');
    INSERT INTO public.provider_discovery_runs (provider_account_id, initiated_by)
      VALUES ('${IDS.account}', '${ADMIN}')`);
  await asUser(db, STAFF, async () => {
    const raw = await db.query(`SELECT id FROM public.provider_discovered_resources`);
    assert.equal(raw.rows.length, 0, "staff sees zero raw discovered rows");
    const runs = await db.query(`SELECT id FROM public.provider_discovery_runs`);
    assert.equal(runs.rows.length, 0, "staff sees zero discovery runs");
    const linked = await db.query(`SELECT id FROM public.staff_linked_provider_resources`);
    assert.equal(linked.rows.length, 0, "unlinked rows hidden from staff view");
  });
});

test("3G1-RBAC-4: client cannot access provider administration data", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name)
    VALUES ('${IDS.disc1}', '${IDS.account}', 'p1', 'project', 'P1')`);
  await asUser(db, CLIENT_A, async () => {
    assert.equal((await db.query(`SELECT id FROM public.provider_discovered_resources`)).rows.length, 0);
    assert.equal((await db.query(`SELECT id FROM public.provider_discovery_runs`)).rows.length, 0);
    assert.equal((await db.query(`SELECT id FROM public.provider_connection_overview`)).rows.length, 0);
    assert.equal((await db.query(`SELECT id FROM public.staff_linked_provider_resources`)).rows.length, 0);
    // provider_accounts table has internal-select policy — zero for clients
    assert.equal((await db.query(`SELECT id FROM public.provider_accounts`)).rows.length, 0);
  });
});

// ============================================================================
// 3G1-CONN — credential handling (vault-gated)
// ============================================================================

test("3G1-CONN-1/2: credential RPCs refuse non-service callers; vault absence fails closed", async () => {
  const db = await createDb();
  await setup(db);
  // Authenticated users cannot even execute the functions (EXECUTE revoked).
  await asUser(db, ADMIN, async () => {
    const e1 = await rejects(db.query(
      `SELECT public.store_provider_credential('${IDS.account}', 'tok_example_secret')`));
    assert.match(e1.message, /permission denied for function/);
    const e2 = await rejects(db.query(
      `SELECT public.reveal_provider_credential('${IDS.account}')`));
    assert.match(e2.message, /permission denied for function/);
  });
  // Service role may execute, but without vault the store fails CLOSED — the
  // secret is never written to a plaintext column.
  await asService(db, async () => {
    const e = await rejects(db.query(
      `SELECT public.store_provider_credential('${IDS.account}', 'tok_example_secret')`));
    assert.match(e.message, /supabase_vault|unavailable/i);
    const ref = await db.query(
      `SELECT credential_reference, connection_status FROM public.provider_accounts WHERE id='${IDS.account}'`);
    assert.equal(ref.rows[0].credential_reference, null);
    assert.equal(ref.rows[0].connection_status, "unconfigured");
    const e2 = await rejects(db.query(
      `SELECT public.reveal_provider_credential('${IDS.account}')`));
    assert.match(e2.message, /supabase_vault|unavailable/i);
  });
});

test("3G1-CONN-3: connection state model supports safe status + error category", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    UPDATE public.provider_accounts
    SET connection_status='failed', connection_checked_at=now(), connection_error='auth_failed'
    WHERE id='${IDS.account}'`);
  const r = await db.query(
    `SELECT connection_status, connection_error FROM public.provider_accounts WHERE id='${IDS.account}'`);
  assert.equal(r.rows[0].connection_status, "failed");
  assert.equal(r.rows[0].connection_error, "auth_failed");
  // invalid status rejected
  const bad = await rejects(db.exec(`
    UPDATE public.provider_accounts SET connection_status='pwned' WHERE id='${IDS.account}'`));
  assert.match(bad.message, /check constraint|violates/i);
});

// ============================================================================
// 3G1-DISC — discovery records
// ============================================================================

test("3G1-DISC-1/2: re-discovery upsert updates in place, no duplicates", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, async () => {
    const upsert = `
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, last_seen_at)
      VALUES ('${IDS.account}', 'proj-1', 'project', 'Alpha', 'ACTIVE_HEALTHY', now())
      ON CONFLICT (provider_account_id, external_resource_id)
      DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status,
                    last_seen_at = now()`;
    await db.exec(upsert);
    await db.exec(upsert.replace("'Alpha'", "'Alpha Renamed'"));
    const rows = await db.query(
      `SELECT name FROM public.provider_discovered_resources
       WHERE provider_account_id='${IDS.account}' AND external_resource_id='proj-1'`);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].name, "Alpha Renamed");
  });
});

test("3G1-DISC-3: metadata rejects secret-shaped content", async () => {
  const db = await createDb();
  await setup(db);
  const e = await rejects(db.exec(`
    INSERT INTO public.provider_discovered_resources
      (provider_account_id, external_resource_id, resource_type, name, metadata)
    VALUES ('${IDS.account}', 'leak-1', 'project', 'Leak', '{"token":"sb_secret_abcdefghijklmnop"}')`));
  assert.match(e.message, /check constraint|violates|secret/i);
});

test("3G1-DISC-4: run lifecycle + failure recording", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, async () => {
    await db.exec(`
      INSERT INTO public.provider_discovery_runs (id, provider_account_id, initiated_by)
      VALUES ('${IDS.run1}', '${IDS.account}', '${ADMIN}')`);
    await db.exec(`
      UPDATE public.provider_discovery_runs
      SET status='failed', completed_at=now(), error_count=1, error_summary='auth_failed'
      WHERE id='${IDS.run1}'`);
    const r = await db.query(`SELECT status, error_summary FROM public.provider_discovery_runs WHERE id='${IDS.run1}'`);
    assert.equal(r.rows[0].status, "failed");
    assert.equal(r.rows[0].error_summary, "auth_failed");
    // started/failed both audited
    const audit = await db.query(`
      SELECT action FROM public.audit_logs
      WHERE table_name='provider_discovery_runs' AND record_id='${IDS.run1}' ORDER BY created_at`);
    const actions = audit.rows.map((x) => x.action);
    assert.ok(actions.includes("provider_discovery.started"));
    assert.ok(actions.includes("provider_discovery.failed"));
  });
});

// ============================================================================
// 3G1-LINK — explicit linking & same-client integrity
// ============================================================================

async function seedDiscovered(db, id = IDS.disc1, extId = "proj-link-1", account = IDS.account) {
  await db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status)
    VALUES ('${id}', '${account}', ${q(extId)}, 'project', 'Discovered Project', 'ACTIVE_HEALTHY')`);
}

test("3G1-LINK-1/2/3: admin links discovered resource with explicit client+system", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await asService(db, async () => {
    const res = await db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}') AS rid`);
    const resourceId = res.rows[0].rid;
    assert.ok(resourceId);
    const r = await db.query(`SELECT * FROM public.resources WHERE id='${resourceId}'`);
    assert.equal(r.rows[0].client_id, CLIENT_A);
    assert.equal(r.rows[0].system_id, IDS.sysA);
    assert.equal(r.rows[0].external_reference, "provider:proj-link-1");
    const d = await db.query(
      `SELECT link_status, linked_resource_id FROM public.provider_discovered_resources WHERE id='${IDS.disc1}'`);
    assert.equal(d.rows[0].link_status, "linked");
    assert.equal(d.rows[0].linked_resource_id, resourceId);
  });
});

test("3G1-LINK-4: cross-client linking rejected at database level", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await asService(db, async () => {
    const e = await rejects(db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysB}', '${ADMIN}')`));
    assert.match(e.message, /cross-client|different client/i);
    const d = await db.query(
      `SELECT link_status FROM public.provider_discovered_resources WHERE id='${IDS.disc1}'`);
    assert.equal(d.rows[0].link_status, "unlinked");
  });
});

test("3G1-LINK-4b: client-owned provider account rejects linking to a different client", async () => {
  const db = await createDb();
  await setup(db);
  // discovered under Client-B-owned account; linking to Client A must fail
  await seedDiscovered(db, IDS.disc2, "proj-b-1", IDS.accountB);
  await asService(db, async () => {
    const e = await rejects(db.query(
      `SELECT public.link_discovered_resource('${IDS.disc2}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
    assert.match(e.message, /cross-client|forbidden|client/i);
  });
});

test("3G1-LINK-2/3: null client or system rejected; unknown client rejected", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await asService(db, async () => {
    const e1 = await rejects(db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', NULL, '${IDS.sysA}', '${ADMIN}')`));
    assert.match(e1.message, /explicitly selected/i);
    const e2 = await rejects(db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', NULL, '${ADMIN}')`));
    assert.match(e2.message, /explicitly selected/i);
    const e3 = await rejects(db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${ADMIN}', '${IDS.sysA}', '${ADMIN}')`));
    assert.match(e3.message, /not a client account/i);
  });
});

test("3G1-LINK-5/6: linking never creates clients or systems", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  const before = await db.query(`SELECT (SELECT count(*) FROM profiles WHERE role='client') c, (SELECT count(*) FROM systems) s`);
  await asService(db, async () => {
    await db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`);
  });
  const after = await db.query(`SELECT (SELECT count(*) FROM profiles WHERE role='client') c, (SELECT count(*) FROM systems) s`);
  assert.equal(before.rows[0].c, after.rows[0].c);
  assert.equal(before.rows[0].s, after.rows[0].s);
});

test("3G1-LINK-7: repeated linking is idempotent", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await asService(db, async () => {
    const r1 = await db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}') AS rid`);
    const r2 = await db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}') AS rid`);
    assert.equal(r1.rows[0].rid, r2.rows[0].rid);
    const count = await db.query(`SELECT count(*) c FROM public.resources WHERE external_reference='provider:proj-link-1'`);
    assert.equal(Number(count.rows[0].c), 1);
  });
});

test("3G1-LINK-8: non-admin/non-service callers cannot execute link RPC", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await asUser(db, STAFF, async () => {
    const e = await rejects(db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysA}', '${STAFF}')`));
    assert.match(e.message, /permission denied for function|administrators/i);
  });
  await asUser(db, FINANCE, async () => {
    const e = await rejects(db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysA}', '${FINANCE}')`));
    assert.match(e.message, /permission denied for function|administrators/i);
  });
});

test("3G1-LINK-9: unlink keeps SCH resource and discovery evidence", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await asService(db, async () => {
    const r = await db.query(
      `SELECT public.link_discovered_resource('${IDS.disc1}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}') AS rid`);
    await db.query(`SELECT public.unlink_discovered_resource('${IDS.disc1}', '${ADMIN}')`);
    const d = await db.query(
      `SELECT link_status, linked_resource_id FROM public.provider_discovered_resources WHERE id='${IDS.disc1}'`);
    assert.equal(d.rows[0].link_status, "unlinked");
    // SCH resource retained for audit/history
    const res = await db.query(`SELECT id FROM public.resources WHERE id='${r.rows[0].rid}'`);
    assert.equal(res.rows.length, 1);
    const audit = await db.query(`
      SELECT action FROM public.audit_logs
      WHERE table_name='provider_discovered_resources' AND record_id='${IDS.disc1}'`);
    const actions = audit.rows.map((x) => x.action);
    assert.ok(actions.includes("provider_resource.linked"));
    assert.ok(actions.includes("provider_resource.unlinked"));
  });
});

// ============================================================================
// 3G1-SEC / 3G1-AUDIT
// ============================================================================

test("3G1-SEC-1: anon sees zero rows on discovery data (RLS + view guards)", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await db.exec(`SET ROLE anon`);
  try {
    assert.equal((await db.query(`SELECT * FROM public.provider_discovered_resources`)).rows.length, 0);
    assert.equal((await db.query(`SELECT * FROM public.provider_discovery_runs`)).rows.length, 0);
    assert.equal((await db.query(`SELECT * FROM public.provider_connection_overview`)).rows.length, 0);
    assert.equal((await db.query(`SELECT * FROM public.staff_linked_provider_resources`)).rows.length, 0);
  } finally {
    await db.exec(`RESET ROLE`);
  }
});

test("3G1-SEC-2: destructive deletes blocked on discovery tables", async () => {
  const db = await createDb();
  await setup(db);
  await seedDiscovered(db);
  await asService(db, async () => {
    const e = await rejects(db.exec(
      `DELETE FROM public.provider_discovered_resources WHERE id='${IDS.disc1}'`));
    assert.match(e.message, /auditable|cannot be deleted/i);
  });
});

test("3G1-SEC-3: credential functions carry no EXECUTE for anon/authenticated/public", async () => {
  const db = await createDb();
  const fns = await db.query(`
    SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname IN ('store_provider_credential','reveal_provider_credential',
                      'clear_provider_credential','link_discovered_resource',
                      'unlink_discovered_resource')`);
  assert.equal(fns.rows.length, 5);
  for (const { proname } of fns.rows) {
    const granted = await db.query(`
      SELECT grantee FROM information_schema.routine_privileges
      WHERE routine_schema='public' AND routine_name='${proname}' AND grantee IN ('anon','authenticated','public','PUBLIC')`);
    assert.equal(granted.rows.length, 0, `${proname} must not be executable by ${JSON.stringify(granted.rows)}`);
  }
});

test("3G1-SEC-4: staff linked view has no financial or credential fields", async () => {
  const db = await createDb();
  const cols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='staff_linked_provider_resources'`);
  const names = cols.rows.map((r) => r.column_name);
  for (const banned of ["amount", "currency", "credential", "credential_reference", "token", "metadata"]) {
    assert.ok(!names.some((n) => n.includes(banned)), `staff view leaks ${banned}`);
  }
});

test("3G1-AUDIT-1: connection test + credential change audited without secret values", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    UPDATE public.provider_accounts
    SET connection_status='failed', connection_checked_at=now(), connection_error='auth_failed'
    WHERE id='${IDS.account}'`);
  const audit = await db.query(`
    SELECT action, details FROM public.audit_logs
    WHERE table_name='provider_accounts' AND record_id='${IDS.account}'
      AND action='provider_connection.tested'`);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].details.error_category, "auth_failed");
  assert.ok(!JSON.stringify(audit.rows[0]).match(/token|secret|bearer/i));
});

// ============================================================================
// ADAPTERS — read-only enforcement, normalization, failure handling
// ============================================================================

test("3G1-ADAPT-1: adapters declare bounded capability sets (3G-3: typed lifecycle on Supabase only)", () => {
  for (const key of PROVIDER_ADAPTER_KEYS) {
    const a = getAdapter(key);
    assert.ok(a, `adapter ${key} registered`);
    assert.equal(a.capabilities.discoverResources, true);
    assert.equal(a.capabilities.create, false);
    assert.equal(a.capabilities.update, false);
    assert.equal(a.capabilities.delete, false);
    // Phase 3G-3 adds typed lifecycle capabilities to Supabase only — and even
    // there they are confined to the `operations` interface, never bare methods.
    assert.equal(a.capabilities.suspend, key === "supabase", `${key} suspend flag`);
    assert.equal(a.capabilities.restore, key === "supabase", `${key} restore flag`);
    assert.equal(a.capabilities.billing, false);
    // No bare mutation methods exist on the interface
    for (const m of ["create", "update", "delete", "suspend", "restore", "deploy", "restart"]) {
      assert.equal(typeof a[m], "undefined", `${key} must not expose ${m}()`);
    }
    if (key !== "supabase") {
      assert.equal(a.operations, undefined, `${key} must not expose provider operations`);
    }
  }
  assert.equal(getAdapter("unknown"), null);
});

test("3G1-ADAPT-2: transport blocks non-allowlisted hosts and mutation methods", async () => {
  const { providerRead } = await import("../lib/providers/http.ts");
  const rules = [{ host: "api.supabase.com", pathPrefix: "/v1/projects", methods: ["GET"] }];
  await assert.rejects(
    providerRead(rules, "https://evil.example.com/x", "tok"),
    /allowlist/
  );
  await assert.rejects(
    providerRead(rules, "https://api.supabase.com/v1/organizations", "tok"),
    /allowlist/
  );
  // GraphQL mutation blocked before any network call
  const gqlRules = [{ host: "backboard.railway.com", pathPrefix: "/graphql/v2", methods: ["POST"] }];
  await assert.rejects(
    providerRead(gqlRules, "https://backboard.railway.com/graphql/v2", "tok", "mutation { projectDelete(id:\"x\") }"),
    /not permitted/i
  );
});

test("3G1-ADAPT-3: supabase adapter normalizes projects; only GET is used", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method ?? "GET" });
    return new Response(JSON.stringify([
      { id: "abc123", name: "elgon-inventory-prod", region: "eu-west-1", status: "ACTIVE_HEALTHY", created_at: "2026-01-01", organization_id: "org1" },
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const a = getAdapter("supabase");
    const conn = await a.testConnection({ token: "sbp_test" });
    assert.equal(conn.ok, true);
    const res = await a.discoverResources({ token: "sbp_test" });
    assert.equal(res.ok, true);
    assert.equal(res.resources.length, 1);
    const r = res.resources[0];
    assert.equal(r.externalId, "abc123");
    assert.equal(r.type, "project");
    assert.equal(r.region, "eu-west-1");
    assert.equal(r.metadata.organization_id, "org1");
    for (const c of calls) assert.equal(c.method, "GET", "adapter must only issue GET");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("3G1-ADAPT-4: auth failure normalizes to auth_failed without leaking secrets", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "unauthorized", token: "sbp_secret_should_not_leak" }), { status: 401 });
  try {
    const a = getAdapter("supabase");
    const conn = await a.testConnection({ token: "sbp_secret_should_not_leak" });
    assert.equal(conn.ok, false);
    assert.equal(conn.error, "auth_failed");
    assert.ok(!conn.message.includes("sbp_secret"), "error must not echo credentials");
    const res = await a.discoverResources({ token: "sbp_secret_should_not_leak" });
    assert.equal(res.ok, false);
    assert.equal(res.error, "auth_failed");
    assert.ok(!res.message.includes("sbp_secret"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("3G1-ADAPT-5: railway adapter posts a query (no mutation) and normalizes projects+services", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method, body: opts?.body });
    return new Response(JSON.stringify({
      data: { projects: { edges: [{ node: {
        id: "p1", name: "sch-api", createdAt: "2026-01-01",
        services: { edges: [{ node: { id: "s1", name: "api" } }] },
      } }] } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const a = getAdapter("railway");
    const res = await a.discoverResources({ token: "rw_test" });
    assert.equal(res.ok, true);
    assert.equal(res.resources.length, 2);
    assert.equal(res.resources[0].type, "project");
    assert.equal(res.resources[1].type, "service");
    assert.equal(res.resources[1].metadata.project_id, "p1");
    for (const c of calls) {
      assert.equal(c.method, "POST");
      assert.ok(!/\bmutation\b/i.test(c.body), "no mutations allowed");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("3G1-ADAPT-6: rate limit and 5xx normalize to safe categories", async () => {
  const realFetch = globalThis.fetch;
  try {
    const a = getAdapter("vercel");
    globalThis.fetch = async () => new Response("{}", { status: 429 });
    assert.equal((await a.testConnection({ token: "t" })).error, "rate_limited");
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    assert.equal((await a.testConnection({ token: "t" })).error, "unavailable");
    globalThis.fetch = async () => { throw new Error("ECONNREFUSED"); };
    assert.equal((await a.testConnection({ token: "t" })).error, "network_error");
  } finally {
    globalThis.fetch = realFetch;
  }
});
