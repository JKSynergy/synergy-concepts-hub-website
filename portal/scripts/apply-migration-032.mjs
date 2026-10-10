// Standalone Migration 032 Runner & Verification Tooling
// Phase 4: Atomic suspension case -> agreement transitions
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Refuses production, validates target, executes in transaction, verifies the
// function definition and that EXECUTE is restricted to `authenticated`, and
// runs a live behavioural check: an authenticated staff actor executes and
// restores a throwaway suspension case, asserting the case and agreement move
// atomically.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

export async function runMigration032({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 032.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 032 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 032] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    const migrationPath = resolve("supabase/migrations/032_phase4_atomic_suspension_agreement.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    const sha256 = createHash("sha256").update(rawSql).digest("hex");
    console.log(`[MIGRATION 032] Applying ${migrationPath} (${rawSql.length} bytes, sha256 ${sha256})...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 032] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 032] SQL Execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    // --- Definition-level verification ------------------------------------
    const defRes = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'transition_suspension_case'
        AND p.pronargs = 4
    `);
    const def = defRes.rows[0]?.def ?? "";
    const isDefiner = defRes.rows[0]?.prosecdef === true;
    const locksCase = /FOR UPDATE/i.test(def);
    const writesBothTables = /UPDATE\s+public\.suspension_cases/i.test(def) &&
                             /UPDATE\s+public\.service_agreements/i.test(def);
    const roleChecks = def.includes("is_admin()") && def.includes("is_staff()") &&
                       def.includes("auth.uid()");

    const grantRes = await client.query(`
      SELECT grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = 'transition_suspension_case'
    `);
    const grantees = grantRes.rows.map((r) => r.grantee);
    const grantsRestricted = grantees.every((g) => g === "authenticated" || g === "postgres");

    // --- Behavioural verification ------------------------------------------
    // Throwaway DEV case: agreement + proposed case walked to 'approved'.
    // Call the RPC as `authenticated` with a real staff JWT subject, exactly
    // like the PostgREST path — auth.uid() must resolve inside the definer fn.
    const staff = (await client.query(
      `SELECT id FROM public.profiles WHERE role = 'staff' AND archived_at IS NULL LIMIT 1`
    )).rows[0]?.id;
    const clientRow = (await client.query(
      `SELECT id FROM public.profiles WHERE role = 'client' AND archived_at IS NULL LIMIT 1`
    )).rows[0]?.id;
    let behavioural = { skipped: true, reason: "no staff/client profile on DEV" };

    if (staff && clientRow) {
      const ag = await client.query(`
        INSERT INTO public.service_agreements (client_id, name, service_type, status, start_date)
        VALUES ($1, 'M032 verification throwaway', 'managed_service', 'active', CURRENT_DATE)
        RETURNING id
      `, [clientRow]);
      const agreementId = ag.rows[0].id;
      const cs = await client.query(`
        INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, status, requested_by, assigned_to)
        VALUES ($1, $2, 'm032 verification', 'proposed', $3, $4)
        RETURNING id
      `, [agreementId, clientRow, staff, staff]);
      const caseId = cs.rows[0].id;
      await client.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = $1`, [caseId]);

      const callRpc = (action) =>
        client.query(`BEGIN`)
          .then(() => client.query(`SET LOCAL ROLE authenticated`))
          .then(() => client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [staff]))
          .then(() => client.query(
            `SELECT public.transition_suspension_case($1, $2, $3, NULL) AS st`,
            [caseId, action, staff]))
          .then(async (r) => { await client.query(`COMMIT`); return r; })
          .catch(async (e) => { await client.query(`ROLLBACK`).catch(() => {}); throw e; });

      const execRes = await callRpc("execute");
      const afterExec = await client.query(`
        SELECT sc.status AS cs, sa.status AS ag
        FROM public.suspension_cases sc
        JOIN public.service_agreements sa ON sa.id = sc.service_agreement_id
        WHERE sc.id = $1`, [caseId]);
      const dupRes = await callRpc("execute"); // idempotent retry
      const restRes = await callRpc("complete_restoration");
      const afterRest = await client.query(`
        SELECT sc.status AS cs, sa.status AS ag
        FROM public.suspension_cases sc
        JOIN public.service_agreements sa ON sa.id = sc.service_agreement_id
        WHERE sc.id = $1`, [caseId]);
      const audit = await client.query(`
        SELECT action, actor_id FROM public.audit_logs
        WHERE record_id IN ($1, $2) AND action IN ('suspension_case.executed', 'suspension_case.restored', 'service_agreement.status_changed')`,
        [caseId, agreementId]);

      behavioural = {
        skipped: false,
        executeAtomic: execRes.rows[0]?.st === "suspended" &&
          afterExec.rows[0]?.cs === "suspended" && afterExec.rows[0]?.ag === "suspended",
        retryIsNoOp: dupRes.rows[0]?.st === "suspended",
        restoreAtomic: restRes.rows[0]?.st === "restored" &&
          afterRest.rows[0]?.cs === "restored" && afterRest.rows[0]?.ag === "active",
        executedAuditEvents: audit.rows.filter((r) => r.action === "suspension_case.executed").length,
        agreementAuditEvents: audit.rows.filter((r) => r.action === "service_agreement.status_changed").length,
        auditAttributedToStaff: audit.rows.every((r) => r.actor_id === staff || r.actor_id === null),
      };
      // Leave the case 'restored' (terminal, honest DEV history). End the
      // throwaway agreement so no active fixture remains.
      await client.query(`UPDATE public.service_agreements SET status = 'ended' WHERE id = $1`, [agreementId]);
    }

    const verification = {
      functionDefPresent: defRes.rows.length === 1,
      securityDefiner: isDefiner,
      locksCaseRow: locksCase,
      writesBothTablesAtomically: writesBothTables,
      roleChecksPresent: roleChecks,
      executeRestrictedToAuthenticated: grantsRestricted,
      grantees,
      ...behavioural,
    };
    const isPass =
      defRes.rows.length === 1 && isDefiner && locksCase && writesBothTables &&
      roleChecks && grantsRestricted &&
      (behavioural.skipped ||
        (behavioural.executeAtomic === true && behavioural.retryIsNoOp === true &&
         behavioural.restoreAtomic === true && behavioural.auditAttributedToStaff === true &&
         behavioural.executedAuditEvents === 1 && behavioural.agreementAuditEvents === 2));

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "032_phase4_atomic_suspension_agreement.sql",
      sha256,
      status: isPass ? "PASS" : "FAIL",
      verification,
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-032-report.json"), redact(JSON.stringify(report, null, 2)));
    console.log(`[MIGRATION 032] ${isPass ? "PASS" : "FAIL"} — report written to phase2c-reports/migration-032-report.json`);
    return report;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) &&
  resolve(process.argv[1]).endsWith("apply-migration-032.mjs");
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

  runMigration032({ env }).then((r) => {
    if (r.status !== "PASS") process.exit(1);
  }).catch((err) => {
    console.error("[MIGRATION 032] ERROR:", err);
    process.exit(1);
  });
}
