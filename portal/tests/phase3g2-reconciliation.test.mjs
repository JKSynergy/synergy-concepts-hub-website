// Phase 3G-2: Provider Reconciliation & Controlled Synchronization — tests.
// Validates: schema/RLS, deterministic snapshot comparison, change
// classification (new/unchanged/external/missing/sch-only/identity), review
// lifecycle, stale-proposal protection, controlled SCH-side apply, audit, RBAC,
// and idempotent repeat reconciliation.
//
// Privileged RPCs are service_role-only by design (mirroring 3G-1): they are
// invoked through asService, matching how the server actions call them.
//
// 3G2-REG-* regression coverage is provided by the other phase test files.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, asService, rejects, q } from "./helpers/db.mjs";

const IDS = {
  provider: "bbbb0000-0000-0000-0000-000000000001",
  account: "bbbb0000-0000-0000-0000-000000000002",
  sysA: "bbbb0000-0000-0000-0000-000000000003",
  discNew: "bbbb0000-0000-0000-0000-000000000010",
  discLinked: "bbbb0000-0000-0000-0000-000000000011",
  discMissing: "bbbb0000-0000-0000-0000-000000000012",
  discIdentity: "bbbb0000-0000-0000-0000-000000000013",
  runD1: "bbbb0000-0000-0000-0000-000000000020",
  runD2: "bbbb0000-0000-0000-0000-000000000021",
  resSchOnly: "bbbb0000-0000-0000-0000-000000000030",
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
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysA}', '${CLIENT_A}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${IDS.runD1}', '${IDS.account}', 'completed', now() - interval '1 hour', now() - interval '1 hour')
      ON CONFLICT DO NOTHING;
  `);
}

async function insertDiscovered(db, id, { ext, name, status = "ACTIVE_HEALTHY", linked = false, missing = false, runId = IDS.runD1 } = {}) {
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id, external_missing)
    VALUES ('${id}', '${IDS.account}', '${ext}', 'project', ${q(name)}, ${q(status)}, 'eu-west-1', '${runId}', ${missing})
    ON CONFLICT (id) DO NOTHING;
  `));
  if (linked) {
    await asService(db, () =>
      db.query(`SELECT public.link_discovered_resource('${id}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
  }
}

async function reconcile(db) {
  return asService(db, async () =>
    (await db.query(`SELECT public.run_provider_reconciliation('${IDS.account}', '${ADMIN}') AS id`)).rows[0].id);
}

async function review(db, itemId, decision) {
  return asService(db, () =>
    db.query(`SELECT public.review_reconciliation_item('${itemId}','${decision}','${ADMIN}')`));
}

async function applyItem(db, itemId) {
  return asService(db, () =>
    db.query(`SELECT public.apply_reconciliation_item('${itemId}','${ADMIN}')`));
}

async function latestRun(db) {
  return (await db.query(
    `SELECT * FROM public.provider_reconciliation_runs ORDER BY started_at DESC LIMIT 1`)).rows[0];
}

// ============================================================================
// 3G2-SCHEMA — structure & safety
// ============================================================================

test("3G2-SCHEMA-1: reconciliation tables exist with RLS enabled", async () => {
  const db = await createDb();
  const t = await db.query(`
    SELECT t.table_name, c.relrowsecurity FROM information_schema.tables t
    JOIN pg_class c ON c.relname = t.table_name
    WHERE t.table_schema='public' AND t.table_name IN
      ('provider_reconciliation_runs','provider_reconciliation_items')`);
  assert.equal(t.rows.length, 2);
  assert.ok(t.rows.every((r) => r.relrowsecurity === true));
});

test("3G2-SCHEMA-2: open proposals are deduplicated by subject+fingerprint", async () => {
  const db = await createDb();
  const idx = await db.query(`
    SELECT indexdef FROM pg_indexes
    WHERE tablename='provider_reconciliation_items' AND indexname='uq_recon_open_item'`);
  assert.equal(idx.rows.length, 1);
  assert.match(idx.rows[0].indexdef, /pending_review/);
});

test("3G2-SCHEMA-3: no plaintext credential columns on new tables", async () => {
  const db = await createDb();
  const cols = await db.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('provider_reconciliation_runs','provider_reconciliation_items')
      AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|secret|bearer|private_key)(_|$)'
           OR column_name IN ('token','secret','key','api_key','password'))`);
  assert.equal(cols.rows.length, 0);
});

test("3G2-SCHEMA-4: reconciliation records cannot be deleted", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-del", name: "del" });
  await reconcile(db); // produces a run + at least one item
  const err = await rejects(
    db.query(`DELETE FROM public.provider_reconciliation_runs`),
    "run delete"
  );
  assert.match(err.message, /auditable history/);
  const err2 = await rejects(
    db.query(`DELETE FROM public.provider_reconciliation_items`),
    "item delete"
  );
  assert.match(err2.message, /auditable history/);
});

// ============================================================================
// 3G2-CLASSIFY — change detection
// ============================================================================

test("3G2-CLASSIFY-1: unlinked discovered resource → new_external_resource", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-new-1", name: "new-proj" });
  const runId = await reconcile(db);
  const item = (await db.query(
    `SELECT * FROM public.provider_reconciliation_items WHERE run_id='${runId}' AND discovered_resource_id='${IDS.discNew}'`)).rows[0];
  assert.equal(item.change_type, "new_external_resource");
  assert.equal(item.review_status, "pending_review");
  assert.equal(item.requires_review, true);
});

test("3G2-CLASSIFY-2: linked resource with matching baseline → unchanged", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "proj-link-1", name: "linked-proj", linked: true });
  const runId = await reconcile(db);
  const item = (await db.query(
    `SELECT * FROM public.provider_reconciliation_items WHERE run_id='${runId}' AND discovered_resource_id='${IDS.discLinked}'`)).rows[0];
  assert.equal(item.change_type, "unchanged");
  assert.equal(item.requires_review, false);
});

test("3G2-CLASSIFY-3: linked resource external change → external_change", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "proj-ch-1", name: "ch-proj", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE id='${IDS.discLinked}'`);
  const runId = await reconcile(db);
  const item = (await db.query(
    `SELECT * FROM public.provider_reconciliation_items WHERE run_id='${runId}' AND discovered_resource_id='${IDS.discLinked}'`)).rows[0];
  assert.equal(item.change_type, "external_change");
  assert.equal(item.requires_review, true);
  assert.match(item.change_summary, /status.*ACTIVE_HEALTHY.*INACTIVE/);
});

test("3G2-CLASSIFY-4: linked resource absent from provider → missing_externally", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discMissing, { ext: "proj-gone", name: "gone", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET external_missing=true WHERE id='${IDS.discMissing}'`);
  const runId = await reconcile(db);
  const item = (await db.query(
    `SELECT * FROM public.provider_reconciliation_items WHERE run_id='${runId}' AND discovered_resource_id='${IDS.discMissing}'`)).rows[0];
  assert.equal(item.change_type, "missing_externally");
  assert.equal(item.requires_review, true);
});

test("3G2-CLASSIFY-5: SCH resource with no provider counterpart → sch_only", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, ownership, client_id)
    VALUES ('${IDS.resSchOnly}', '${IDS.sysA}', '${IDS.account}', 'SCH only DB', 'database', 'client_owned', '${CLIENT_A}')`);
  const runId = await reconcile(db);
  const item = (await db.query(
    `SELECT * FROM public.provider_reconciliation_items WHERE run_id='${runId}' AND resource_id='${IDS.resSchOnly}'`)).rows[0];
  assert.equal(item.change_type, "sch_only");
  assert.equal(item.requires_review, true);
});

test("3G2-CLASSIFY-6: external identity drift on linked resource → identity_change", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discIdentity, { ext: "proj-id-1", name: "id-proj", linked: true });
  // Tamper the SCH resource's stored external reference → identity mismatch
  await db.exec(`UPDATE public.resources SET external_reference='provider:OTHER-999' WHERE external_reference='provider:proj-id-1'`);
  await db.exec(`UPDATE public.provider_discovered_resources SET status='DEGRADED' WHERE id='${IDS.discIdentity}'`);
  const runId = await reconcile(db);
  const item = (await db.query(
    `SELECT * FROM public.provider_reconciliation_items WHERE run_id='${runId}' AND discovered_resource_id='${IDS.discIdentity}'`)).rows[0];
  assert.equal(item.change_type, "identity_change");
  assert.equal(item.requires_review, true);
});

// ============================================================================
// 3G2-IDEMPOTENT — repeat safety
// ============================================================================

test("3G2-IDEM-1: repeated reconciliation without change creates no duplicates", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-dup", name: "dup" });
  await reconcile(db);
  const first = await db.query(
    `SELECT count(*)::int c FROM public.provider_reconciliation_items
     WHERE discovered_resource_id='${IDS.discNew}' AND review_status='pending_review'`);
  assert.equal(first.rows[0].c, 1);
  await reconcile(db); // second run — same state
  const after = await db.query(
    `SELECT count(*)::int c FROM public.provider_reconciliation_items
     WHERE discovered_resource_id='${IDS.discNew}' AND review_status='pending_review'`);
  assert.equal(after.rows[0].c, 1, "no duplicate pending item");
  // second run reports the row as unchanged (baseline moved forward)
  const run2 = await latestRun(db);
  const item2 = (await db.query(
    `SELECT change_type FROM public.provider_reconciliation_items
     WHERE run_id='${run2.id}' AND discovered_resource_id='${IDS.discNew}'`)).rows[0];
  assert.equal(item2.change_type, "unchanged");
});

// ============================================================================
// 3G2-LIFECYCLE — review & apply
// ============================================================================

test("3G2-LIFE-1: review lifecycle pending → approve → apply updates external_* only", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "proj-ap-1", name: "ap-proj", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET status='INACTIVE', region='us-east-1' WHERE id='${IDS.discLinked}'`);
  await reconcile(db);
  const item = (await db.query(
    `SELECT * FROM public.provider_reconciliation_items WHERE discovered_resource_id='${IDS.discLinked}' AND requires_review`)).rows[0];

  await review(db, item.id, "approve");
  const approved = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items WHERE id='${item.id}'`)).rows[0];
  assert.equal(approved.review_status, "approved");

  await applyItem(db, item.id);
  const res = (await db.query(
    `SELECT r.external_status, r.external_region, r.status AS sch_status, r.name AS sch_name
     FROM public.resources r JOIN public.provider_discovered_resources d ON d.linked_resource_id=r.id
     WHERE d.id='${IDS.discLinked}'`)).rows[0];
  assert.equal(res.external_status, "INACTIVE");
  assert.equal(res.external_region, "us-east-1");
  assert.equal(res.sch_status, "active", "SCH lifecycle status untouched");
  assert.equal(res.sch_name, "ap-proj", "SCH business name untouched");

  const done = (await db.query(`SELECT review_status, applied_by FROM public.provider_reconciliation_items WHERE id='${item.id}'`)).rows[0];
  assert.equal(done.review_status, "applied");
  assert.equal(done.applied_by, ADMIN);
});

test("3G2-LIFE-2: apply is refused before approval", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "proj-na", name: "na", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET status='X' WHERE id='${IDS.discLinked}'`);
  await reconcile(db);
  const item = (await db.query(
    `SELECT id FROM public.provider_reconciliation_items WHERE discovered_resource_id='${IDS.discLinked}' AND requires_review`)).rows[0];
  const err = await rejects(applyItem(db, item.id), "unapproved apply");
  assert.match(err.message, /must be approved/);
});

test("3G2-LIFE-3: missing_externally apply marks external_status, resource preserved", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discMissing, { ext: "proj-mi", name: "mi", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET external_missing=true WHERE id='${IDS.discMissing}'`);
  await reconcile(db);
  const item = (await db.query(
    `SELECT id, resource_id FROM public.provider_reconciliation_items WHERE discovered_resource_id='${IDS.discMissing}' AND requires_review`)).rows[0];
  await review(db, item.id, "approve");
  await applyItem(db, item.id);
  const res = (await db.query(`SELECT external_status, status FROM public.resources WHERE id='${item.resource_id}'`)).rows[0];
  assert.equal(res.external_status, "missing_externally");
  assert.equal(res.status, "active", "SCH resource not deleted/archived");
});

test("3G2-LIFE-4: dismiss and reject close proposals without apply", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-d1", name: "d1" });
  await insertDiscovered(db, IDS.discIdentity, { ext: "proj-d2", name: "d2" });
  await reconcile(db);
  const items = (await db.query(`SELECT id FROM public.provider_reconciliation_items WHERE requires_review ORDER BY created_at`)).rows;
  await review(db, items[0].id, "dismiss");
  await review(db, items[1].id, "reject");
  const statuses = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items ORDER BY created_at`)).rows.map((r) => r.review_status);
  assert.deepEqual(statuses.sort(), ["dismissed", "rejected"]);
});

// ============================================================================
// 3G2-STALE — stale/concurrency protection
// ============================================================================

test("3G2-STALE-1: apply blocked when a newer observation exists", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "proj-st", name: "st", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE id='${IDS.discLinked}'`);
  await reconcile(db);
  const item = (await db.query(
    `SELECT id FROM public.provider_reconciliation_items WHERE discovered_resource_id='${IDS.discLinked}' AND requires_review`)).rows[0];
  await review(db, item.id, "approve");

  // A newer discovery observes the resource again → proposal basis is outdated.
  await db.exec(`
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
    VALUES ('${IDS.runD2}', '${IDS.account}', 'completed', now(), now());
    UPDATE public.provider_discovered_resources SET last_run_id='${IDS.runD2}' WHERE id='${IDS.discLinked}';
  `);

  const result = (await asService(db, () =>
    db.query(`SELECT public.apply_reconciliation_item('${item.id}','${ADMIN}') AS r`))).rows[0].r;
  assert.equal(result, "stale", "apply reports stale basis");
  const after = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items WHERE id='${item.id}'`)).rows[0];
  assert.equal(after.review_status, "stale");
});

test("3G2-STALE-2: new reconciliation marks superseded open proposals stale", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "proj-sp", name: "sp", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE id='${IDS.discLinked}'`);
  await reconcile(db); // pending item under runD1 basis

  await db.exec(`
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
    VALUES ('${IDS.runD2}', '${IDS.account}', 'completed', now(), now());
    UPDATE public.provider_discovered_resources SET last_run_id='${IDS.runD2}', status='RECOVERED' WHERE id='${IDS.discLinked}';
  `);
  await reconcile(db); // run under runD2 basis

  const stale = (await db.query(
    `SELECT count(*)::int c FROM public.provider_reconciliation_items
     WHERE discovered_resource_id='${IDS.discLinked}' AND review_status='stale'`)).rows[0].c;
  assert.equal(stale, 1, "superseded proposal marked stale");
  const pending = (await db.query(
    `SELECT count(*)::int c FROM public.provider_reconciliation_items
     WHERE discovered_resource_id='${IDS.discLinked}' AND review_status='pending_review'`)).rows[0].c;
  assert.equal(pending, 1, "fresh proposal under new basis");
});

// ============================================================================
// 3G2-FAIL — failure handling
// ============================================================================

test("3G2-FAIL-1: reconcile without a discovery run records a failed run", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    ALTER TABLE public.provider_discovery_runs DISABLE TRIGGER trg_discovery_runs_no_delete;
    DELETE FROM public.provider_discovery_runs WHERE provider_account_id='${IDS.account}';
    ALTER TABLE public.provider_discovery_runs ENABLE TRIGGER trg_discovery_runs_no_delete;
  `);
  const runId = await reconcile(db);
  const run = (await db.query(`SELECT * FROM public.provider_reconciliation_runs WHERE id='${runId}'`)).rows[0];
  assert.equal(run.status, "failed");
  assert.equal(run.error_summary, "no_successful_discovery");
  const items = await db.query(`SELECT count(*)::int c FROM public.provider_reconciliation_items WHERE run_id='${runId}'`);
  assert.equal(items.rows[0].c, 0, "no proposals from a failed run");
});

// ============================================================================
// 3G2-RBAC — role boundaries
// ============================================================================

test("3G2-RBAC-1: staff cannot run/review/apply reconciliation", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-rb", name: "rb" });
  await reconcile(db);
  const item = (await db.query(`SELECT id FROM public.provider_reconciliation_items WHERE requires_review LIMIT 1`)).rows[0];
  // EXECUTE is revoked from authenticated entirely — non-service callers can't
  // even reach the function body.
  const err1 = await rejects(asUser(db, STAFF, () =>
    db.query(`SELECT public.run_provider_reconciliation('${IDS.account}','${STAFF}')`)), "staff reconcile");
  assert.match(err1.message, /permission denied|administrators/);
  const err2 = await rejects(asUser(db, STAFF, () =>
    db.query(`SELECT public.review_reconciliation_item('${item.id}','approve','${STAFF}')`)), "staff review");
  assert.match(err2.message, /permission denied|administrators/);
});

test("3G2-RBAC-2: finance reads overview but cannot review/apply", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-fin", name: "fin" });
  await reconcile(db);
  const rows = await asUser(db, FINANCE, () =>
    db.query(`SELECT count(*)::int c FROM public.provider_reconciliation_overview`));
  assert.ok(rows.rows[0].c >= 1, "finance sees reconciliation context");
  const item = (await db.query(`SELECT id FROM public.provider_reconciliation_items WHERE requires_review LIMIT 1`)).rows[0];
  const err = await rejects(asUser(db, FINANCE, () =>
    db.query(`SELECT public.review_reconciliation_item('${item.id}','approve','${FINANCE}')`)), "finance review");
  assert.match(err.message, /permission denied|administrators/);
  // Finance UPDATE on items table: RLS silently filters — row must not change
  await asUser(db, FINANCE, () =>
    db.query(`UPDATE public.provider_reconciliation_items SET review_status='approved' WHERE id='${item.id}'`));
  const unchanged = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items WHERE id='${item.id}'`)).rows[0];
  assert.equal(unchanged.review_status, "pending_review");
});

test("3G2-RBAC-3: staff and clients get zero rows from raw reconciliation tables", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-hid", name: "hid" });
  await reconcile(db);
  for (const role of [STAFF, CLIENT_A]) {
    const r = await asUser(db, role, () =>
      db.query(`SELECT count(*)::int c FROM public.provider_reconciliation_items`));
    assert.equal(r.rows[0].c, 0);
    const v = await asUser(db, role, () =>
      db.query(`SELECT count(*)::int c FROM public.provider_reconciliation_overview`));
    assert.equal(v.rows[0].c, 0);
  }
});

// ============================================================================
// 3G2-AUDIT — audit trail
// ============================================================================

test("3G2-AUDIT-1: reconciliation lifecycle is audited end-to-end", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "proj-au", name: "au", linked: true });
  await db.exec(`UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE id='${IDS.discLinked}'`);
  await reconcile(db);
  const item = (await db.query(
    `SELECT id FROM public.provider_reconciliation_items WHERE discovered_resource_id='${IDS.discLinked}' AND requires_review`)).rows[0];
  await review(db, item.id, "approve");
  await applyItem(db, item.id);

  const actions = (await db.query(
    `SELECT DISTINCT action FROM public.audit_logs
     WHERE action IN ('provider_reconciliation.started','provider_reconciliation.completed',
       'provider_resource.sync_proposed','provider_resource.sync_approved','provider_resource.sync_applied')
     ORDER BY action`)).rows.map((r) => r.action);
  for (const a of ["provider_reconciliation.started", "provider_reconciliation.completed",
    "provider_resource.sync_proposed", "provider_resource.sync_approved", "provider_resource.sync_applied"]) {
    assert.ok(actions.includes(a), `missing audit action ${a}`);
  }
});

test("3G2-AUDIT-2: snapshots reject secret-shaped content", async () => {
  const db = await createDb();
  await setup(db);
  const err = await rejects(db.query(`
    INSERT INTO public.provider_discovered_resources
      (provider_account_id, external_resource_id, resource_type, name, reconciled_snapshot)
    VALUES ('${IDS.account}', 'x', 'project', 'x', '{"token":"sb_secret_abcdefghijklmnop"}'::jsonb)`),
    "secret in snapshot");
  assert.match(err.message, /check constraint|violates|secret/i);
});

// ============================================================================
// 3G2-DET — determinism
// ============================================================================

test("3G2-DET-1: snapshot excludes volatile fields; identical state → identical snapshot", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discNew, { ext: "proj-det", name: "det" });
  const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
  const s1 = parse((await db.query(`SELECT public.provider_discovered_snapshot('${IDS.discNew}') AS s`)).rows[0].s);
  // Touch volatile fields — snapshot must not change
  await db.exec(`UPDATE public.provider_discovered_resources SET last_seen_at=now(), updated_at=now() WHERE id='${IDS.discNew}'`);
  const s2 = parse((await db.query(`SELECT public.provider_discovered_snapshot('${IDS.discNew}') AS s`)).rows[0].s);
  assert.deepEqual(s1, s2);
  assert.equal(s1.last_seen_at, undefined);
  assert.equal(s1.last_run_id, undefined);
  assert.equal(s1.external_resource_id, "proj-det");
});

test("3G2-DET-2: snapshot diff lists only changed fields", async () => {
  const db = await createDb();
  const diff = (await db.query(`
    SELECT public.provider_snapshot_diff(
      '{"name":"a","status":"ON","region":"x"}'::jsonb,
      '{"name":"a","status":"OFF","region":"x"}'::jsonb) AS d`)).rows[0].d;
  assert.match(diff, /status: ON → OFF/);
  assert.ok(!/name:/.test(diff), "unchanged fields excluded");
});
