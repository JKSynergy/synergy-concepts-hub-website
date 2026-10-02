// Phase 3A: Inventory & Technical Hierarchy Tests
// Validates providers, provider_accounts, systems, resources, and projects.system_id
// Uses the PGlite in-memory Postgres harness.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, q } from "./helpers/db.mjs";

async function setupAccounts(db) {
  const adminId = "00000000-0000-0000-0000-000000000001";
  const staffId = "00000000-0000-0000-0000-000000000002";
  const financeId = "00000000-0000-0000-0000-000000000003";
  const clientAId = "00000000-0000-0000-0000-000000000004";
  const clientBId = "00000000-0000-0000-0000-000000000005";

  for (const [id, email, role] of [
    [adminId, "admin@synergy.ug", "admin"],
    [staffId, "staff@synergy.ug", "staff"],
    [financeId, "finance@synergy.ug", "finance"],
    [clientAId, "clienta@company.com", "client"],
    [clientBId, "clientb@corp.com", "client"],
  ]) {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}') ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.profiles (id, email, role) VALUES ('${id}', '${email}', '${role}') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `);
  }

  return { adminId, staffId, financeId, clientAId, clientBId };
}

test("PHASE 3A: Schema creation and nullability invariants", async () => {
  const db = await createDb();
  await setupAccounts(db);

  // 1. Verify resources.system_id is nullable
  const resCol = await db.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'resources' AND column_name = 'system_id'
  `);
  assert.equal(resCol.rows[0]?.is_nullable, "YES", "resources.system_id MUST be nullable");

  // 2. Verify projects.system_id is nullable
  const projCol = await db.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'system_id'
  `);
  assert.equal(projCol.rows[0]?.is_nullable, "YES", "projects.system_id MUST be nullable");

  // 3. Verify no clients table was created
  const clientsTbl = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  `);
  assert.equal(clientsTbl.rows.length, 0, "No clients table should exist; profiles.id is reused");
});

test("PHASE 3A: RBAC on providers and provider_accounts", async () => {
  const db = await createDb();
  const { adminId, staffId, financeId, clientAId } = await setupAccounts(db);

  // Admin inserts provider
  let provId;
  await asUser(db, adminId, async () => {
    const res = await db.query(`
      INSERT INTO public.providers (name, slug, category, website_url, operational_notes)
      VALUES ('Vercel Inc', 'vercel', 'cloud_hosting', 'https://vercel.com', 'Edge hosting platform')
      RETURNING id
    `);
    provId = res.rows[0].id;
    assert.ok(provId, "Admin should create provider");
  });

  // Staff can read providers
  await asUser(db, staffId, async () => {
    const res = await db.query(`SELECT * FROM public.providers WHERE id = '${provId}'`);
    assert.equal(res.rows.length, 1, "Staff should read providers");
  });

  // Finance can read providers
  await asUser(db, financeId, async () => {
    const res = await db.query(`SELECT * FROM public.providers WHERE id = '${provId}'`);
    assert.equal(res.rows.length, 1, "Finance should read providers");
  });

  // Client cannot read providers (0 rows)
  await asUser(db, clientAId, async () => {
    const res = await db.query(`SELECT * FROM public.providers WHERE id = '${provId}'`);
    assert.equal(res.rows.length, 0, "Client must NOT read providers");
  });

  // Staff cannot insert provider
  await assert.rejects(
    () => asUser(db, staffId, async () => {
      await db.query(`INSERT INTO public.providers (name, slug) VALUES ('AWS', 'aws')`);
    }),
    /violates row-level security policy/,
    "Staff must not insert providers"
  );

  // Admin inserts provider_account
  let acctId;
  await asUser(db, adminId, async () => {
    const res = await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, account_identifier)
      VALUES ('${provId}', 'SCH Main Team', 'sch_managed', 'team_sch_core')
      RETURNING id
    `);
    acctId = res.rows[0].id;
    assert.ok(acctId, "Admin should create provider account");
  });

  // Staff and Finance can read provider account
  await asUser(db, staffId, async () => {
    const res = await db.query(`SELECT * FROM public.provider_accounts WHERE id = '${acctId}'`);
    assert.equal(res.rows.length, 1, "Staff should read provider accounts");
  });
  await asUser(db, financeId, async () => {
    const res = await db.query(`SELECT * FROM public.provider_accounts WHERE id = '${acctId}'`);
    assert.equal(res.rows.length, 1, "Finance should read provider accounts");
  });

  // Client cannot read provider account
  await asUser(db, clientAId, async () => {
    const res = await db.query(`SELECT * FROM public.provider_accounts WHERE id = '${acctId}'`);
    assert.equal(res.rows.length, 0, "Client must NOT read provider accounts");
  });

  // Destructive delete on provider is blocked by RLS
  await asUser(db, adminId, async () => {
    const delRes = await db.query(`DELETE FROM public.providers WHERE id = '${provId}'`);
    assert.equal(delRes.rowCount, 0, "DELETE on providers must be blocked by RLS");
  });
});

test("PHASE 3A: Systems lifecycle and RBAC", async () => {
  const db = await createDb();
  const { adminId, staffId, financeId, clientAId, clientBId } = await setupAccounts(db);

  let systemId;
  // Admin creates System for Client A
  await asUser(db, adminId, async () => {
    const res = await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status, description)
      VALUES ('${clientAId}', 'Client A Web Platform', 'web_platform', 'live', 'E-commerce web platform')
      RETURNING id
    `);
    systemId = res.rows[0].id;
    assert.ok(systemId, "Admin should create system");
  });

  // Staff can read system and update operational metadata
  await asUser(db, staffId, async () => {
    const read = await db.query(`SELECT * FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(read.rows.length, 1, "Staff should read system");

    // Staff updates operational notes
    await db.query(`
      UPDATE public.systems
      SET operational_notes = 'SSL certificate renewed; responsive design verified'
      WHERE id = '${systemId}'
    `);
    const after = await db.query(`SELECT operational_notes FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(after.rows[0].operational_notes, 'SSL certificate renewed; responsive design verified');
  });

  // Finance has read-only access to system
  await asUser(db, financeId, async () => {
    const read = await db.query(`SELECT * FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(read.rows.length, 1, "Finance should read system");

    // Finance cannot update system (affects 0 rows due to USING policy)
    const updateRes = await db.query(`UPDATE public.systems SET name = 'Renamed By Finance' WHERE id = '${systemId}'`);
    assert.equal(updateRes.rowCount, 0, "Finance UPDATE must affect 0 rows under RLS");

    const checkUnchanged = await db.query(`SELECT name FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(checkUnchanged.rows[0].name, 'Client A Web Platform', "System name must remain unchanged");
  });

  // Clients cannot read systems (D8 deferred)
  await asUser(db, clientAId, async () => {
    const read = await db.query(`SELECT * FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(read.rows.length, 0, "Client A must NOT read systems in Phase 3A");
  });
  await asUser(db, clientBId, async () => {
    const read = await db.query(`SELECT * FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(read.rows.length, 0, "Client B must NOT read systems in Phase 3A");
  });

  // Destructive delete is blocked
  await asUser(db, adminId, async () => {
    const del = await db.query(`DELETE FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(del.rowCount, 0, "DELETE on systems must be blocked by RLS");
  });

  // Archival lifecycle works
  await asUser(db, adminId, async () => {
    await db.query(`
      UPDATE public.systems
      SET status = 'retired', archived_at = now()
      WHERE id = '${systemId}'
    `);
    const check = await db.query(`SELECT status, archived_at FROM public.systems WHERE id = '${systemId}'`);
    assert.equal(check.rows[0].status, 'retired');
    assert.ok(check.rows[0].archived_at);
  });
});

test("PHASE 3A: Standalone Resources & Same-Client Integrity Constraint", async () => {
  const db = await createDb();
  const { adminId, staffId, clientAId, clientBId } = await setupAccounts(db);

  let provId, acctId, acctClientAId;
  await asUser(db, adminId, async () => {
    const p = await db.query(`INSERT INTO public.providers (name, slug) VALUES ('Cloudflare', 'cloudflare') RETURNING id`);
    provId = p.rows[0].id;
    const a = await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${provId}', 'SCH Global Cloudflare', 'sch_managed')
      RETURNING id
    `);
    acctId = a.rows[0].id;
    const aA = await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, client_id)
      VALUES ('${provId}', 'Client A Dedicated Cloudflare', 'client_owned', '${clientAId}')
      RETURNING id
    `);
    acctClientAId = aA.rows[0].id;
  });

  // 1. Standalone resource (system_id = NULL) succeeds
  let standaloneResId;
  await asUser(db, adminId, async () => {
    const r = await db.query(`
      INSERT INTO public.resources (
        system_id, provider_account_id, name, resource_type, ownership, external_reference, suspension_capability
      ) VALUES (
        NULL, '${acctId}', 'synergyconcepts.ug DNS', 'dns_zone', 'sch_managed', 'zone_12345', 'none'
      ) RETURNING id
    `);
    standaloneResId = r.rows[0].id;
    assert.ok(standaloneResId, "Standalone resource without system must be allowed");
  });

  // Verify it has NULL system_id
  const checkStandalone = await db.query(`SELECT system_id FROM public.resources WHERE id = '${standaloneResId}'`);
  assert.equal(checkStandalone.rows[0].system_id, null, "Standalone resource has NULL system_id");

  // 2. Attached resource with matching client succeeds
  let sysAId;
  await asUser(db, adminId, async () => {
    const s = await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAId}', 'Client A SACCO Portal', 'sacco_platform', 'live')
      RETURNING id
    `);
    sysAId = s.rows[0].id;

    const r = await db.query(`
      INSERT INTO public.resources (
        system_id, provider_account_id, name, resource_type, ownership, client_id
      ) VALUES (
        '${sysAId}', '${acctClientAId}', 'Client A Frontend App', 'web_app', 'client_owned', '${clientAId}'
      ) RETURNING id
    `);
    assert.ok(r.rows[0].id, "Attached resource with same client must succeed");
  });

  // 3. Cross-client resource attachment FAILS
  // Attempt to attach Client B resource to Client A's system
  await assert.rejects(
    () => asUser(db, adminId, async () => {
      await db.query(`
        INSERT INTO public.resources (
          system_id, provider_account_id, name, resource_type, ownership, client_id
        ) VALUES (
          '${sysAId}', '${acctId}', 'Client B Rogue Resource', 'database', 'client_owned', '${clientBId}'
        )
      `);
    }),
    /Cross-client resource attachment forbidden/,
    "Cross-client resource attachment must be blocked by trigger"
  );

  // 4. Cross-client provider account assignment FAILS
  // Resource assigned to Client B under Client A's provider account
  await assert.rejects(
    () => asUser(db, adminId, async () => {
      await db.query(`
        INSERT INTO public.resources (
          provider_account_id, name, resource_type, ownership, client_id
        ) VALUES (
          '${acctClientAId}', 'Client B Storage', 'storage_bucket', 'client_owned', '${clientBId}'
        )
      `);
    }),
    /Cross-client resource account forbidden/,
    "Resource assigned to Client B under Client A's provider account must be rejected"
  );
});

test("PHASE 3A: Anti-Secrets Guard rejects credential leaks", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  let provId, acctId;
  await asUser(db, adminId, async () => {
    const p = await db.query(`INSERT INTO public.providers (name, slug) VALUES ('Railway', 'railway') RETURNING id`);
    provId = p.rows[0].id;
    const a = await db.query(`INSERT INTO public.provider_accounts (provider_id, account_name) VALUES ('${provId}', 'SCH Railway') RETURNING id`);
    acctId = a.rows[0].id;
  });

  // Attempt to store private key in operational notes
  await assert.rejects(
    () => asUser(db, adminId, async () => {
      await db.query(`
        INSERT INTO public.providers (name, slug, operational_notes)
        VALUES ('Bad Provider', 'bad', '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...')
      `);
    }),
    /violates check constraint/,
    "Private keys must be rejected by check_no_secrets_in_text"
  );

  // Attempt to store database connection string with password in resource external_reference
  await assert.rejects(
    () => asUser(db, adminId, async () => {
      await db.query(`
        INSERT INTO public.resources (
          provider_account_id, name, resource_type, external_reference
        ) VALUES (
          '${acctId}', 'Database Res', 'database', 'postgresql://postgres:SuperSecretPassword123!@db.host.com:5432/db'
        )
      `);
    }),
    /violates check constraint/,
    "Connection strings with passwords must be rejected"
  );

  // Attempt to store secret API token in credential_reference
  await assert.rejects(
    () => asUser(db, adminId, async () => {
      await db.query(`
        INSERT INTO public.provider_accounts (
          provider_id, account_name, credential_reference
        ) VALUES (
          '${provId}', 'Leaky Account', 'sk_live_' || '1234567890abcdef1234567890'
        )
      `);
    }),
    /violates check constraint/,
    "Secret API keys must be rejected"
  );

  // Non-secret reference pointer succeeds
  await asUser(db, adminId, async () => {
    const validAcct = await db.query(`
      INSERT INTO public.provider_accounts (
        provider_id, account_name, credential_reference
      ) VALUES (
        '${provId}', 'Good Account', 'Bitwarden Vault / SCH Core / Railway Production'
      ) RETURNING id
    `);
    assert.ok(validAcct.rows[0].id, "Non-secret vault pointer must be allowed");
  });
});

test("PHASE 3A: Additive projects.system_id relationship", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  let sysId, projId;
  await asUser(db, adminId, async () => {
    const s = await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAId}', 'Delivery Platform', 'web_platform', 'live')
      RETURNING id
    `);
    sysId = s.rows[0].id;

    // Create a project linked to the system
    const p = await db.query(`
      INSERT INTO public.projects (client_id, title, status, system_id)
      VALUES ('${clientAId}', 'Phase 1 Buildout', 'active', '${sysId}')
      RETURNING id
    `);
    projId = p.rows[0].id;
    assert.ok(projId, "Project linked to system created");
  });

  const projRow = await db.query(`SELECT system_id FROM public.projects WHERE id = '${projId}'`);
  assert.equal(projRow.rows[0].system_id, sysId, "Project system_id should match");

  // Existing project without system_id works
  let unlinkedProjId;
  await asUser(db, adminId, async () => {
    const p = await db.query(`
      INSERT INTO public.projects (client_id, title, status)
      VALUES ('${clientAId}', 'Standalone Design Project', 'active')
      RETURNING id
    `);
    unlinkedProjId = p.rows[0].id;
  });
  const unlinked = await db.query(`SELECT system_id FROM public.projects WHERE id = '${unlinkedProjId}'`);
  assert.equal(unlinked.rows[0].system_id, null, "Unlinked project has NULL system_id");
});

test("PHASE 3A: Resources operational metadata update and destructive delete protection", async () => {
  const db = await createDb();
  const { adminId, staffId, financeId, clientAId } = await setupAccounts(db);

  let resId;
  await asUser(db, adminId, async () => {
    const p = await db.query(`INSERT INTO public.providers (name, slug) VALUES ('Supabase', 'supabase') RETURNING id`);
    const a = await db.query(`INSERT INTO public.provider_accounts (provider_id, account_name) VALUES ('${p.rows[0].id}', 'SCH Supabase') RETURNING id`);
    const r = await db.query(`
      INSERT INTO public.resources (
        provider_account_id, name, resource_type, ownership, status
      ) VALUES (
        '${a.rows[0].id}', 'Postgres Production Cluster', 'database', 'sch_managed', 'active'
      ) RETURNING id
    `);
    resId = r.rows[0].id;
    assert.ok(resId, "Resource created");
  });

  // Staff can read and update operational metadata
  await asUser(db, staffId, async () => {
    const read = await db.query(`SELECT * FROM public.resources WHERE id = '${resId}'`);
    assert.equal(read.rows.length, 1, "Staff should read resource");

    await db.query(`
      UPDATE public.resources
      SET operational_notes = 'Daily backup verified; latency 12ms'
      WHERE id = '${resId}'
    `);
    const after = await db.query(`SELECT operational_notes FROM public.resources WHERE id = '${resId}'`);
    assert.equal(after.rows[0].operational_notes, 'Daily backup verified; latency 12ms');
  });

  // Finance has read-only access (cannot update)
  await asUser(db, financeId, async () => {
    const read = await db.query(`SELECT * FROM public.resources WHERE id = '${resId}'`);
    assert.equal(read.rows.length, 1, "Finance should read resource");

    const updateRes = await db.query(`UPDATE public.resources SET operational_notes = 'Hacked' WHERE id = '${resId}'`);
    assert.equal(updateRes.rowCount, 0, "Finance UPDATE must affect 0 rows under RLS");
  });

  // Client cannot read resources (0 rows)
  await asUser(db, clientAId, async () => {
    const read = await db.query(`SELECT * FROM public.resources WHERE id = '${resId}'`);
    assert.equal(read.rows.length, 0, "Client must NOT read resources in Phase 3A");
  });

  // Destructive delete is blocked for all users (including Admin)
  await asUser(db, adminId, async () => {
    const del = await db.query(`DELETE FROM public.resources WHERE id = '${resId}'`);
    assert.equal(del.rowCount, 0, "DELETE on resources must be blocked by RLS");
  });

  // Retirement works via update
  await asUser(db, adminId, async () => {
    await db.query(`
      UPDATE public.resources
      SET status = 'retired', retired_at = now()
      WHERE id = '${resId}'
    `);
    const check = await db.query(`SELECT status, retired_at FROM public.resources WHERE id = '${resId}'`);
    assert.equal(check.rows[0].status, 'retired');
    assert.ok(check.rows[0].retired_at);
  });
});
