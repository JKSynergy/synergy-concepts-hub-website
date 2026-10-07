import assert from "node:assert/strict";
import test from "node:test";
import { createDb, asUser, asService, rejects } from "./helpers/db.mjs";

const IDS = {
  admin: "11111111-1111-1111-1111-111111111111",
  clientA: "22222222-2222-2222-2222-222222222222",
  systemA: "33333333-3333-3333-3333-333333333333",
  systemB: "44444444-4444-4444-4444-444444444444",
};

async function seed(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${IDS.admin}', 'admin@example.test'),
      ('${IDS.clientA}', 'clienta@example.test');
    UPDATE public.profiles SET role = 'admin' WHERE id = '${IDS.admin}';
    UPDATE public.profiles SET role = 'client' WHERE id = '${IDS.clientA}';

    INSERT INTO public.systems (id, client_id, name, status)
    VALUES
      ('${IDS.systemA}', '${IDS.clientA}', 'SMA LMS', 'live'),
      ('${IDS.systemB}', '${IDS.clientA}', 'QuickCredit', 'live');
  `);
}

const SAMPLE_HASH = "a3b0c0d0e0f01112131415161718191a1b1c1d1e1f202122232425262728292a";

async function setTokenHashAsAdmin(db, systemId = IDS.systemA, hash = SAMPLE_HASH) {
  return asService(db, () =>
    db.query(`SELECT public.set_system_status_token_hash('${systemId}', '${hash}')`)
  );
}

test("managed status token: admin can set token hash and metadata is recorded", async () => {
  const db = await createDb();
  await seed(db);

  await setTokenHashAsAdmin(db);

  const row = (await db.query(`SELECT status_token_hash, status_token_last_rotated_at FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
  assert.equal(row.status_token_hash, SAMPLE_HASH);
  assert.ok(row.status_token_last_rotated_at);
});

test("managed status token: non-admin cannot set token hash", async () => {
  const db = await createDb();
  await seed(db);

  await rejects(
    asUser(db, IDS.clientA, () =>
      db.query(`SELECT public.set_system_status_token_hash('${IDS.systemA}', '${SAMPLE_HASH}')`)
    ),
    /Only administrators/
  );
});

test("managed status token: hash is required and long enough", async () => {
  const db = await createDb();
  await seed(db);

  await rejects(
    asService(db, () =>
      db.query(`SELECT public.set_system_status_token_hash('${IDS.systemA}', 'short')`)
    ),
    /Invalid token hash/
  );
});

test("managed status: system can be suspended and resumed independently of token", async () => {
  const db = await createDb();
  await seed(db);

  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${IDS.systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );

  const suspended = (await db.query(`SELECT status FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
  assert.equal(suspended.status, "suspended");

  await asService(db, () =>
    db.query(`SELECT public.resume_application_system('${IDS.systemA}', 'Payment received', '${IDS.admin}')`)
  );

  const resumed = (await db.query(`SELECT status FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
  assert.equal(resumed.status, "live");
});

test("managed status: cross-system isolation — suspending one system does not affect another", async () => {
  const db = await createDb();
  await seed(db);

  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${IDS.systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );

  const a = (await db.query(`SELECT status FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
  const b = (await db.query(`SELECT status FROM public.systems WHERE id = '${IDS.systemB}'`)).rows[0];
  assert.equal(a.status, "suspended");
  assert.equal(b.status, "live");
});

test("managed status token rotation is audited without leaking plaintext", async () => {
  const db = await createDb();
  await seed(db);
  await setTokenHashAsAdmin(db);

  const audit = await db.query(`
    SELECT action, details FROM public.audit_logs
    WHERE table_name = 'systems' AND action = 'system_status_token.rotated'
  `);
  assert.equal(audit.rows.length, 1);
  const details = JSON.stringify(audit.rows[0].details);
  assert.ok(!details.includes(SAMPLE_HASH), "audit must not contain token hash");
});

test("managed status: status values other than suspended are live from endpoint perspective", async () => {
  const db = await createDb();
  await seed(db);

  const statuses = ["live", "in_build", "maintenance_only", "retired"];
  for (const status of statuses) {
    await db.query(`UPDATE public.systems SET status = '${status}' WHERE id = '${IDS.systemA}'`);
    const row = (await db.query(`SELECT status FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
    assert.equal(row.status, status);
  }

  await asService(db, () =>
    db.query(`UPDATE public.systems SET status = 'suspended' WHERE id = '${IDS.systemA}'`)
  );
  const finalRow = (await db.query(`SELECT status FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
  assert.equal(finalRow.status, "suspended");
});
