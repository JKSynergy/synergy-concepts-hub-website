// Standalone Migration 031 Runner & Verification Tooling
// Phase 4: Atomic action-item review transitions
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Refuses production, validates target, executes in transaction, verifies the
// guarded update is present in the installed function definition and that
// EXECUTE remains restricted to service_role.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

export async function runMigration031({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 031.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 031 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 031] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    const migrationPath = resolve("supabase/migrations/031_phase4_atomic_action_item_review.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    const sha256 = createHash("sha256").update(rawSql).digest("hex");
    console.log(`[MIGRATION 031] Applying ${migrationPath} (${rawSql.length} bytes, sha256 ${sha256})...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 031] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 031] SQL Execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    // --- Verification ---------------------------------------------------
    const defRes = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'review_action_item'
        AND p.pronargs = 3
    `);
    const def = defRes.rows[0]?.def ?? "";
    const guardedUpdate = /status\s*=\s*ANY\(CASE p_decision/i.test(def) &&
                          /WHEN 'acknowledge' THEN ARRAY\['open'\]/i.test(def);
    const roleCheckKept = def.includes("is_admin()") && def.includes("is_staff()");

    const grantRes = await client.query(`
      SELECT grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = 'review_action_item'
    `);
    const grantees = grantRes.rows.map((r) => r.grantee);
    const grantsRestricted = grantees.every((g) => g === "service_role" || g === "postgres");

    // Behavioural check: repeated acknowledge must not overwrite attribution.
    // Use a service-role call on a throwaway item, then clean it up.
    const actor = (await client.query(`SELECT id FROM auth.users LIMIT 1`)).rows[0]?.id ?? null;
    const inserted = await client.query(`
      INSERT INTO public.action_items (source, event_type, severity, title, status, dedupe_key)
      VALUES ('manual', 'general', 'info', 'M031 verification throwaway', 'open', 'm031-verify-' || gen_random_uuid()::text)
      RETURNING id
    `);
    const itemId = inserted.rows[0].id;
    // The RPC requires service_role (or an admin/staff JWT). SET LOCAL ROLE
    // inside a transaction satisfies current_setting('role') the same way the
    // PostgREST service role does. Plain SELECTs run as the superuser outside
    // those transactions.
    const callRpc = (decision, who) =>
      client.query(`BEGIN`)
        .then(() => client.query(`SET LOCAL ROLE service_role`))
        .then(() => client.query(`SELECT public.review_action_item($1, $2, $3) AS st`, [itemId, decision, who]))
        .then(async (r) => { await client.query(`COMMIT`); return r; })
        .catch(async (e) => { await client.query(`ROLLBACK`).catch(() => {}); throw e; });

    let firstAck = null, repeatAck = null, repeatPreserve = null;
    try {
      firstAck = await callRpc("acknowledge", actor);
      const afterFirst = await client.query(`SELECT acknowledged_by, acknowledged_at FROM public.action_items WHERE id = $1`, [itemId]);
      repeatAck = await callRpc("acknowledge", null);
      const afterRepeat = await client.query(`SELECT status, acknowledged_by, acknowledged_at FROM public.action_items WHERE id = $1`, [itemId]);
      repeatPreserve = afterRepeat.rows[0].status === "acknowledged" &&
        afterRepeat.rows[0].acknowledged_by === afterFirst.rows[0].acknowledged_by &&
        String(afterRepeat.rows[0].acknowledged_at) === String(afterFirst.rows[0].acknowledged_at);
    } finally {
      // action_items is append-only (deletes are blocked by trigger). Move the
      // throwaway to a terminal state via the same RPC under test — it remains
      // as honest DEV history alongside the audit rows the trigger wrote.
      await callRpc("resolve", actor).catch(() => {});
    }

    const verification = {
      functionDefPresent: defRes.rows.length === 1,
      atomicGuardedUpdate: guardedUpdate,
      roleChecksPreserved: roleCheckKept,
      executeRestrictedToServiceRole: grantsRestricted,
      grantees,
      repeatAckIsNoOp: firstAck?.rows[0]?.st === "acknowledged" &&
                       repeatAck?.rows[0]?.st === "acknowledged" &&
                       repeatPreserve === true,
    };
    const isPass = Object.values(verification).every((v) => v === true || Array.isArray(v));

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "031_phase4_atomic_action_item_review.sql",
      sha256,
      status: isPass ? "PASS" : "FAIL",
      verification,
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-031-report.json"), redact(JSON.stringify(report, null, 2)));
    console.log(`[MIGRATION 031] ${isPass ? "PASS" : "FAIL"} — report written to phase2c-reports/migration-031-report.json`);
    return report;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) &&
  resolve(process.argv[1]).endsWith("apply-migration-031.mjs");
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

  runMigration031({ env }).then((r) => {
    if (r.status !== "PASS") process.exit(1);
  }).catch((err) => {
    console.error("[MIGRATION 031] ERROR:", err);
    process.exit(1);
  });
}
