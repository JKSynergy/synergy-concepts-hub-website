// Standalone Migration 034 Runner & Verification Tooling
// Booking delete: delete_booking_admin(uuid) + tightened DELETE policy.
// Target: DEV project ref: outuocpsotiozkpyksex ONLY.
// Applies the migration, verifies the catalog/ACL state on real Postgres,
// then exercises the behaviour with disposable fixtures (tagged
// b034verify-<ts>), including an audit-failure rollback proof.
// Fixture audit rows are append-only and retained — same convention as the
// phase-4 concurrency run.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const TAG = `b034verify-${Date.now().toString(36)}`;

export async function runMigration034({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) throw new GuardError("PHASE2C_DB_URL is required to execute Migration 034.");
  assertDbUrlMatchesRef(target.dbUrl, target.ref);
  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 034 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);
  console.log(`[MIGRATION 034] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);
  const results = [];
  const check = (name, cond, extra = "") => {
    console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
    results.push({ name, passed: !!cond });
  };

  try {
    const migrationPath = resolve("supabase/migrations/034_booking_delete_admin.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    const sha256 = createHash("sha256").update(rawSql).digest("hex");
    console.log(`[MIGRATION 034] Applying ${migrationPath} (${rawSql.length} bytes, sha256 ${sha256})...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 034] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 034] SQL execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    // ── Catalog / ACL evidence ──────────────────────────────────────────────
    const defRes = await client.query(`
      SELECT p.oid, p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
             p.proconfig, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='delete_booking_admin' AND p.pronargs=1`);
    const def = defRes.rows[0]?.def ?? "";
    check("function exists (1 row)", defRes.rows.length === 1);
    check("SECURITY DEFINER", defRes.rows[0]?.prosecdef === true);
    check("owner is postgres", defRes.rows[0]?.owner === "postgres", defRes.rows[0]?.owner);
    check("fixed search_path=public", (defRes.rows[0]?.proconfig ?? []).includes("search_path=public"));
    check("body: is_admin() guard", /is_admin\(\)/.test(def));
    check("body: row lock FOR UPDATE", /FOR UPDATE/.test(def));
    check("body: linked-project check before delete",
      def.indexOf("linked_project") > -1 && def.indexOf("FROM public.projects") < def.indexOf("DELETE FROM public.bookings"));
    check("body: write_audit_log present", def.includes("write_audit_log"));

    const aclRes = await client.query(`
      SELECT ac.grantee::regrole::text AS grantee, ac.privilege_type
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      LEFT JOIN LATERAL aclexplode(p.proacl) ac ON true
      WHERE n.nspname='public' AND p.proname='delete_booking_admin' AND p.pronargs=1`);
    const grantees = aclRes.rows.filter(r => r.privilege_type === "EXECUTE").map(r => r.grantee);
    check("explicit EXECUTE grantees = {postgres, authenticated}",
      grantees.sort().join(",") === "authenticated,postgres", grantees.join(",") || "none");

    const eff = await client.query(`
      SELECT has_function_privilege('anon',          p.oid,'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid,'EXECUTE') AS auth,
             has_function_privilege('service_role',  p.oid,'EXECUTE') AS svc
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='delete_booking_admin' AND p.pronargs=1`);
    const e0 = eff.rows[0] ?? {};
    check("effective EXECUTE: anon=F authenticated=T service_role=F",
      e0.anon === false && e0.auth === true && e0.svc === false, JSON.stringify(e0));

    const pol = await client.query(`
      SELECT polname, pg_get_expr(polqual, polrelid) AS qual
      FROM pg_policy WHERE polrelid='public.bookings'::regclass AND polcmd='d'`);
    check("delete policy is admin-only",
      pol.rows.length === 1 && pol.rows[0].polname === "bookings_delete_admin" && /is_admin\(\)/.test(pol.rows[0].qual ?? ""),
      pol.rows.map(r => `${r.polname}:${r.qual}`).join(" | "));

    // ── Behavioural fixtures ────────────────────────────────────────────────
    // Real DEV test-account profiles supply the actor identities; the JWT
    // claim is set the same way PostgREST does (request.jwt.claims).
    const prof = await client.query(`
      SELECT id, role FROM public.profiles
      WHERE email IN ('phase2c.admin@example.test','phase2c.staff@example.test',
                      'phase2c.finance@example.test','phase2c.clienta@example.test')`);
    const ids = Object.fromEntries(prof.rows.map(r => [r.role, r.id]));
    if (!ids.admin || !ids.staff || !ids.finance || !ids.client) {
      throw new Error(`Missing DEV fixture profiles: ${JSON.stringify(ids)}`);
    }

    const asCaller = async (role, sub, sql) => {
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL ROLE ${role}`);
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
        const r = await client.query(sql);
        await client.query("COMMIT");
        return r;
      } catch (e2) {
        await client.query("ROLLBACK").catch(() => {});
        throw e2;
      }
    };
    const callRpc = (role, sub, bookingId) =>
      asCaller(role, sub, `SELECT public.delete_booking_admin('${bookingId}'::uuid) AS r`).then(r => r.rows[0].r);
    const bookingExists = async (id) =>
      (await client.query(`SELECT count(*)::int AS n FROM public.bookings WHERE id=$1`, [id])).rows[0].n === 1;
    const addBooking = async (status = "pending") =>
      (await client.query(
        `INSERT INTO public.bookings (client_id, type, title, status, scheduled_at, metadata)
         VALUES ($1,'consultation',$2,$3::booking_status, now() + interval '3 days', $4::jsonb) RETURNING id`,
        [ids.client, `${TAG} disposable`, status, JSON.stringify({ tag: TAG })])).rows[0].id;

    // 1. Admin delete + full audit snapshot
    const b1 = await addBooking();
    const r1 = await callRpc("authenticated", ids.admin, b1);
    check("admin delete: deleted=1", r1.deleted === 1, JSON.stringify(r1));
    check("admin delete: row gone", !(await bookingExists(b1)));
    const audit = await client.query(
      `SELECT actor_id, actor_role, action, table_name, old_data FROM public.audit_logs
       WHERE record_id=$1 AND action='booking.deleted'`, [b1]);
    check("admin delete: audit row with actor+snapshot",
      audit.rows.length === 1 && audit.rows[0].actor_id === ids.admin &&
      audit.rows[0].actor_role === "admin" && audit.rows[0].old_data?.metadata?.tag === TAG);

    // 2-4. Role denials through the RPC + staff direct-table RLS
    for (const [label, role, sub] of [["staff", "authenticated", ids.staff], ["finance", "authenticated", ids.finance], ["client", "authenticated", ids.client]]) {
      const b = await addBooking();
      const err = await callRpc(role, sub, b).then(() => null).catch(e2 => e2.message);
      check(`${label} RPC delete rejected`, /administrator|insufficient_privilege/i.test(err ?? ""), err ?? "none");
      check(`${label} row intact`, await bookingExists(b));
    }
    const bStaff = await addBooking();
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids.staff, role: "authenticated" })]);
    const delRows = await client.query(`DELETE FROM public.bookings WHERE id=$1`, [bStaff]);
    await client.query("COMMIT");
    check("staff direct DELETE silently affects 0 rows (RLS)", delRows.rowCount === 0);
    check("staff direct DELETE: row intact", await bookingExists(bStaff));

    // 5. anon has no EXECUTE
    const bAnon = await addBooking();
    const anonErr = await asCaller("anon", null, `SELECT public.delete_booking_admin('${bAnon}'::uuid)`)
      .then(() => null).catch(e2 => e2.message);
    check("anon EXECUTE denied", /permission denied/i.test(anonErr ?? ""), anonErr ?? "none");
    check("anon: row intact", await bookingExists(bAnon));

    // 6. Linked project blocks
    const bLinked = await addBooking("completed");
    const projId = (await client.query(
      `INSERT INTO public.projects (client_id, booking_id, title, status)
       VALUES ($1,$2,$3,'lead') RETURNING id`, [ids.client, bLinked, `${TAG} linked project`])).rows[0].id;
    const r6 = await callRpc("authenticated", ids.admin, bLinked);
    check("linked project: blocked", r6.deleted === 0 && r6.reason === "linked_project", JSON.stringify(r6));
    check("linked project: booking intact", await bookingExists(bLinked));
    check("linked project: project link intact",
      (await client.query(`SELECT count(*)::int AS n FROM public.projects WHERE id=$1 AND booking_id=$2`, [projId, bLinked])).rows[0].n === 1);

    // 7. Missing + repeat delete
    const bGone = await addBooking();
    await callRpc("authenticated", ids.admin, bGone);
    const r7 = await callRpc("authenticated", ids.admin, bGone);
    check("repeat delete: not_found", r7.deleted === 0 && r7.reason === "not_found", JSON.stringify(r7));
    const r7b = await callRpc("authenticated", ids.admin, randomUUID());
    check("never-existed: not_found", r7b.deleted === 0 && r7b.reason === "not_found");

    // 8. Audit-write failure rolls back the DELETE (real atomicity proof).
    //    A raising BEFORE INSERT trigger is created and dropped inside one
    //    transaction — transactional DDL leaves nothing behind.
    const bRb = await addBooking();
    await client.query("BEGIN");
    await client.query(`
      CREATE OR REPLACE FUNCTION public.__b034_audit_fail() RETURNS trigger
      LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'probe: forced audit failure'; END; $f$;
      CREATE TRIGGER __b034_audit_fail BEFORE INSERT ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION public.__b034_audit_fail();`);
    // Role switch comes AFTER the postgres-owned probe objects exist; claims
    // are set the same way PostgREST sets them for a real request.
    await client.query(`SET LOCAL ROLE authenticated`);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids.admin, role: "authenticated" })]);
    let rbErr = null;
    await client.query("SAVEPOINT s1");
    try { await client.query(`SELECT public.delete_booking_admin('${bRb}'::uuid)`); }
    catch (e2) { rbErr = e2.message; }
    await client.query("ROLLBACK TO SAVEPOINT s1");
    const rbRow = await client.query(`SELECT count(*)::int AS n FROM public.bookings WHERE id=$1`, [bRb]);
    await client.query("ROLLBACK"); // drops probe trigger + function + outer tx
    check("audit failure raised", /forced audit failure/.test(rbErr ?? ""), rbErr ?? "none");
    check("audit failure: delete rolled back (row intact)", rbRow.rows[0].n === 1);

    // 9. Staff cancel/complete still work (update path untouched)
    const bUp = await addBooking("confirmed");
    await asCaller("authenticated", ids.staff, `UPDATE public.bookings SET status='completed' WHERE id='${bUp}'`);
    check("staff complete still works",
      (await client.query(`SELECT status FROM public.bookings WHERE id=$1`, [bUp])).rows[0].status === "completed");
    const bCx = await addBooking("pending");
    await asCaller("authenticated", ids.staff, `UPDATE public.bookings SET status='cancelled' WHERE id='${bCx}'`);
    check("staff cancel still works",
      (await client.query(`SELECT status FROM public.bookings WHERE id=$1`, [bCx])).rows[0].status === "cancelled");

    // ── Cleanup disposable fixtures (audit rows stay, append-only) ──────────
    const cleaned = await client.query(
      `DELETE FROM public.bookings WHERE metadata->>'tag' LIKE 'b034verify-%' RETURNING id`);
    await client.query(`DELETE FROM public.projects WHERE title LIKE 'b034verify-%'`);
    console.log(`[MIGRATION 034] Cleanup: removed ${cleaned.rowCount} fixture bookings + linked fixture project(s); audit rows retained (append-only).`);

    const failed = results.filter(r => !r.passed);
    const report = {
      projectRef: target.ref, timestamp: new Date().toISOString(),
      migration: "034_booking_delete_admin.sql", sha256, tag: TAG,
      status: failed.length ? "FAIL" : "PASS",
      checks: results, retainedAuditRows: true,
    };
    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-034-report.json"), redact(JSON.stringify(report, null, 2)));
    console.log(`[MIGRATION 034] ${report.status} — ${results.length - failed.length}/${results.length} checks; report at phase2c-reports/migration-034-report.json`);
    return report;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) &&
  resolve(process.argv[1]).endsWith("apply-migration-034.mjs");
if (isMain) {
  const env = {};
  if (existsSync(".env.phase2c")) {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";
  runMigration034({ env }).then((r) => {
    if (r.status !== "PASS") process.exit(1);
  }).catch((err) => {
    console.error("[MIGRATION 034] ERROR:", err);
    process.exit(1);
  });
}
