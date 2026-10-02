// npm run phase2c:verify — the remaining Phase 2C verification against the DEV Supabase project, from your PC.
//
// Safety model (see scripts/phase2c-guard.mjs):
//   * nothing runs unless the DEV project ref is on the allowlist, declared by you, and matches the URL and keys;
//   * .env / .env.local are never read — values come from the process environment only;
//   * stages A–E are strictly read-only; stages F–M create test accounts and tagged test rows, and only run when
//     PHASE2C_CONFIRM_DEV_WRITES equals the project ref AND the database looks like a test database;
//   * no schema change, migration, GRANT, policy change or deletion of application data is ever issued;
//   * keys, tokens, passwords and the database URL are redacted from every line of output and every report.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { assertDevTarget, classifyKey, GuardError, isMain, makeRedactor, writesConfirmed } from "./phase2c-guard.mjs";
import { createClient, Recorder, overallStatus, renderMarkdown } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";
import {
  stageSchema, stagePrivileges, stageDatabase, stageDatabaseFunctions, stageAccounts, stageAuth, stageData, stageClients, stageFinance, stageStaff,
  stageLifecycle, stageStorage, REMAINING_BROWSER_VERIFICATION,
} from "./phase2c-checks.mjs";

async function openDb(dbUrl) {
  let pg;
  try { pg = await import("pg"); } catch { return { error: "the 'pg' package is not installed (run: npm install --no-save pg)" }; }
  const Client = pg.Client || pg.default?.Client;
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try { await c.connect(); await c.query("begin read only"); }
  catch (e) { return { error: `could not connect: ${e?.code || e?.message || "error"}` }; }
  return { query: async (sql) => (await c.query(sql)).rows, close: () => c.end().catch(() => {}) };
}

export async function runVerification({
  env = process.env, fetchImpl = globalThis.fetch, dbQuery, accountsFile = ACCOUNT_FILE, reportDir = "phase2c-reports",
  baselineSqlPath = join("docs", "phase2c-baseline.sql"), readText = (p) => (existsSync(p) ? readFileSync(p, "utf8") : undefined),
  now = () => new Date(), log = (s) => console.log(s),
} = {}) {
  const target = assertDevTarget(env); // throws GuardError BEFORE any network call
  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);
  const say = (s) => log(redact(s));
  const startedAt = now().toISOString();
  const runId = `r${Date.now().toString(36)}`;
  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey, fetchImpl });
  const rec = new Recorder(redact);
  const api = { service: client.rest({ kind: "service" }), anon: client.rest({ kind: "anon" }) };
  const confirmed = writesConfirmed(env, target.ref);
  const ctx = { rec, client, api, runId, secrets, accountsFile, accountsFileName: accountsFile.replace(/^.*[\\/]/, ""), readText, baselineSql: readText(baselineSqlPath) };
  const notes = [];

  say(`Target project ref: ${target.ref} (confirmed dev/staging by operator + allowlist)`);
  const sk = classifyKey(target.serviceKey), ak = classifyKey(target.anonKey);
  rec.add("A1", "A–B. Identity and environment", "Target is the allowlisted DEV project; URL, declared ref and key claims agree; production ref refused", "PASS",
    `ref ${target.ref}; service key: ${sk.kind}${sk.role ? ` (role ${sk.role})` : ""}; anon key: ${ak.kind}${ak.role ? ` (role ${ak.role})` : ""}; production ref ${env.PHASE2C_PRODUCTION_PROJECT_REF ? "declared and differs" : "not declared (optional)"}`);
  rec.add("B1", "A–B. Identity and environment", "Required environment variables are present (values are never printed)", "PASS",
    `NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PHASE2C_DEV_PROJECT_REF set; PHASE2C_DB_URL ${target.dbUrl ? "set" : "not set"}; write gate ${confirmed ? "confirmed" : "not confirmed"}`);
  const reach = await client.auth.settings();
  rec.add("A2", "A–B. Identity and environment", "The project's Auth service answers with the anon key", reach.ok ? "PASS" : "FAIL", reach.ok ? "HTTP 200" : `HTTP ${reach.status}${reach.error ? ` (${reach.error})` : ""}`);
  if (!reach.ok) ctx.abort = "project unreachable";

  let db;
  if (!ctx.abort) {
    if (dbQuery) ctx.dbQuery = dbQuery;
    else if (target.dbUrl) { db = await openDb(target.dbUrl); if (db.query) ctx.dbQuery = db.query; else notes.push(`Direct database checks skipped: ${db.error}`); }
    await stageSchema(ctx);
    if (!ctx.abort) await stagePrivileges(ctx);
    if (!ctx.abort) { await stageDatabase(ctx); await stageDatabaseFunctions(ctx); }
    else rec.add("E0", "E. Direct database checks", "Read-only baseline and privilege matrix", "NOT_TESTED", `skipped: ${ctx.abort}`, false);
  }
  try { await db?.close?.(); } catch { /* ignore */ }

  const writeStages = [["F–G", stageAccounts], ["H", stageAuth], ["S", stageData], ["I", stageClients], ["J", stageFinance], ["K", stageStaff], ["L", stageLifecycle], ["M", stageStorage]];
  const label = "F–M. Write stages (test accounts, auth, isolation, finance, staff, lifecycle, storage)";
  if (ctx.abort) {
    rec.add("F-M", label, "Accounts, authentication, isolation, finance, staff, lifecycle and storage checks", "NOT_TESTED", `not run: ${ctx.abort}`);
  } else if (!confirmed) {
    rec.add("F-M", label, "Accounts, authentication, isolation, finance, staff, lifecycle and storage checks", "NOT_TESTED",
      `write gate not confirmed — set PHASE2C_CONFIRM_DEV_WRITES=${target.ref} to create the test accounts and tagged test rows in DEV`);
  } else {
    for (const [name, fn] of writeStages) {
      if (ctx.abort) { rec.add(`${name}-skip`, label, `Stage ${name}`, "NOT_TESTED", `not run: ${ctx.abort}`); break; }
      await fn(ctx);
    }
    notes.push(`Test rows created in DEV are tagged "PHASE2C ${runId}" (projects, services, invoices, payments, leads, bookings). Nothing is deleted automatically; they are harmless on DEV.`);
    notes.push("No Paystack API call was made. One 'Paystack-style' payment row (reference prefix phase2c-) was inserted by the service role to prove server-side settlement.");
  }
  notes.push("The privilege model checked in stage E3 is documented in docs/PHASE2C-PRIVILEGE-BOOTSTRAP-RECOMMENDATION.md (recommendation only; no migration was created or applied).");

  const finishedAt = now().toISOString();
  const results = rec.results;
  const counts = { PASS: 0, FAIL: 0, WARN: 0, NOT_TESTED: 0 };
  for (const r of results) counts[r.status]++;
  const overall = overallStatus(results);
  const report = {
    schema: "phase2c-verification/v1", overall, target: { ref: target.ref }, runId, startedAt, finishedAt,
    gates: { writesConfirmed: confirmed, dbChecks: !!ctx.dbQuery }, counts, results, notes, remaining: REMAINING_BROWSER_VERIFICATION,
  };

  const json = JSON.stringify(report, null, 2);
  const md = renderMarkdown(report);
  for (const s of secrets) if (s && s.length >= 8 && (json.includes(s) || md.includes(s))) throw new Error("Refusing to write the report: it contains a secret value.");
  mkdirSync(reportDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const files = [];
  for (const [name, body] of [[`phase2c-report-${stamp}.json`, json], [`phase2c-report-${stamp}.md`, md], ["latest.json", json], ["latest.md", md]]) {
    const p = join(reportDir, name); writeFileSync(p, body); files.push(p);
  }

  for (const r of results) say(`${{ PASS: "PASS      ", FAIL: "FAIL      ", WARN: "WARN      ", NOT_TESTED: "NOT TESTED" }[r.status]} ${r.id.padEnd(9)} ${r.title}${r.status !== "PASS" || r.detail ? `\n           ${r.detail}` : ""}`);
  say("");
  say(`Overall: ${overall}  (${counts.PASS} pass, ${counts.FAIL} fail, ${counts.WARN} warn, ${counts.NOT_TESTED} not tested)`);
  say(`Reports: ${files[2]} and ${files[3]} (timestamped copies alongside)`);
  const exitCode = overall === "FAIL" ? 1 : overall === "INCOMPLETE" ? 3 : 0;
  return { report, exitCode, files };
}

if (isMain(import.meta.url)) {
  try {
    if (!existsSync("package.json") || !existsSync(join("supabase", "migrations"))) throw new GuardError("Run this from the portal/ folder (package.json and supabase/migrations must be in the current directory).");
    const { exitCode } = await runVerification();
    process.exit(exitCode);
  } catch (e) {
    if (e instanceof GuardError) { console.error(e.message); process.exit(2); }
    console.error(`phase2c:verify stopped: ${e?.message || e}`);
    process.exit(1);
  }
}
