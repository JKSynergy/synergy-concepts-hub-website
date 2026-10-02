// The Phase 2C verification workflow (scripts/phase2c-verify.mjs) run end to end against a local stand-in for the
// hosted Supabase HTTP surface backed by REAL Postgres with migrations 001–012 and DEV-style table privileges.
// This proves the workflow's logic and expectations. It does NOT prove hosted Auth/PostgREST/Storage behaviour:
// that is what running `npm run phase2c:verify` against the DEV project is for.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVerification } from "../scripts/phase2c-verify.mjs";
import { GuardError } from "../scripts/phase2c-guard.mjs";
import { createFakeSupabase } from "./helpers/fake-supabase.mjs";

async function run(fake, { gate = true, dbChecks = true, envExtra = {}, dir = mkdtempSync(join(tmpdir(), "p2c-")) } = {}) {
  const lines = [];
  const env = { ...fake.env, ...envExtra };
  if (gate) env.PHASE2C_CONFIRM_DEV_WRITES = fake.ref;
  const out = await runVerification({
    env, fetchImpl: fake.fetch, dbQuery: dbChecks ? fake.dbQuery : undefined,
    accountsFile: join(dir, ".phase2c-accounts.local.json"), reportDir: join(dir, "reports"), log: (s) => lines.push(s),
  });
  return { ...out, lines, dir };
}
const failures = (rep) => rep.results.filter((r) => r.status === "FAIL").map((r) => `${r.id}: ${r.detail}`);
const byId = (rep, id) => rep.results.find((r) => r.id === id);

test("happy path: a DEV-like project passes every stage, with test data and accounts created", async () => {
  const fake = await createFakeSupabase();
  const r = await run(fake);
  assert.deepEqual(failures(r.report), []);
  assert.equal(r.report.results.filter((x) => x.status === "NOT_TESTED" && x.mandatory).length, 0);
  assert.ok(["PASS", "PASS_WITH_GAPS"].includes(r.report.overall), r.report.overall);
  assert.equal(r.exitCode, 0);
  for (const id of ["C1", "C3", "D1", "D2", "E2", "E3", "F0", "F1", "G1", "H1", "H2", "H3", "H4", "S1", "S2", "S3", "I-A1", "I-A2", "I-A3", "I-B1", "I-B2", "I-B3", "I4", "I5", "ISO9", "J1", "J2", "J3", "J4", "J5", "K1", "K2", "K3", "K4", "K5", "L1", "L2", "L3", "L4", "L5", "M-deliverables", "M-finance-docs"]) {
    assert.equal(byId(r.report, id)?.status, "PASS", `${id}: ${byId(r.report, id)?.detail}`);
  }
  // reports written, both formats, plus "latest"
  const files = readdirSync(join(r.dir, "reports"));
  assert.ok(files.includes("latest.json") && files.includes("latest.md"));
  const md = readFileSync(join(r.dir, "reports", "latest.md"), "utf8");
  assert.match(md, /Not covered by this command/);
});

test("no key, token, password or database URL is ever printed or written to a report", async () => {
  const fake = await createFakeSupabase();
  const r = await run(fake, { envExtra: { PHASE2C_DB_URL: `postgres://postgres.${fake.ref}:SuperSecretDbPassword123@aws-0-eu.pooler.supabase.com:5432/postgres` } });
  const accounts = JSON.parse(readFileSync(join(r.dir, ".phase2c-accounts.local.json"), "utf8"));
  const secrets = [fake.keys.anonKey, fake.keys.serviceKey, "SuperSecretDbPassword123", ...Object.values(accounts).map((a) => a.password)];
  assert.ok(Object.keys(accounts).length === 5 && secrets.every((s) => s.length > 8));
  const haystack = [r.lines.join("\n"), ...readdirSync(join(r.dir, "reports")).map((f) => readFileSync(join(r.dir, "reports", f), "utf8"))].join("\n");
  for (const s of secrets) assert.ok(!haystack.includes(s), "a secret leaked into output or a report");
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(haystack), "a JWT-shaped value leaked");
});

test("second run is idempotent: accounts are kept (same passwords), everything still passes", async () => {
  const fake = await createFakeSupabase();
  const first = await run(fake);
  const before = JSON.parse(readFileSync(join(first.dir, ".phase2c-accounts.local.json"), "utf8"));
  const second = await run(fake, { dir: first.dir });
  assert.deepEqual(failures(second.report), []);
  const after = JSON.parse(readFileSync(join(first.dir, ".phase2c-accounts.local.json"), "utf8"));
  assert.deepEqual(after, before);
  assert.match(byId(second.report, "F1").detail, /kept/);
});

test("an account that exists without a saved password gets a fresh password (test accounts only)", async () => {
  const fake = await createFakeSupabase();
  const first = await run(fake);
  const file = join(first.dir, ".phase2c-accounts.local.json");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  delete saved.staff; // lose one credential
  (await import("node:fs")).writeFileSync(file, JSON.stringify(saved));
  const second = await run(fake, { dir: first.dir });
  assert.deepEqual(failures(second.report), []);
  assert.match(byId(second.report, "F1").detail, /staff: password-reset/);
  assert.ok(JSON.parse(readFileSync(file, "utf8")).staff.password);
});

test("read-only run (write gate not confirmed): nothing is written, write stages are NOT TESTED, exit code 3", async () => {
  const fake = await createFakeSupabase();
  const r = await run(fake, { gate: false });
  assert.deepEqual(failures(r.report), []);
  assert.equal(r.report.overall, "INCOMPLETE");
  assert.equal(r.exitCode, 3);
  assert.equal(fake.calls.writes, 0, "a write was issued without the gate");
  assert.equal(fake.users.size, 0, "an auth user was created without the gate");
  assert.equal((await fake.db.query("select count(*)::int c from public.profiles")).rows[0].c, 0);
  assert.equal(byId(r.report, "F-M").status, "NOT_TESTED");
  assert.ok(!existsSync(join(r.dir, ".phase2c-accounts.local.json")));
  assert.equal(byId(r.report, "D1").status, "PASS");
});

test("a wrong write confirmation is treated as not confirmed", async () => {
  const fake = await createFakeSupabase();
  const r = await run(fake, { gate: false, envExtra: { PHASE2C_CONFIRM_DEV_WRITES: "yes" } });
  assert.equal(r.report.overall, "INCOMPLETE");
  assert.equal(fake.users.size, 0);
});

test("guard: refuses before any network call when the ref is wrong, not allowlisted, or keys belong elsewhere", async () => {
  const fake = await createFakeSupabase();
  const other = "abcdefghijklmnopqrst";
  for (const env of [
    { ...fake.env, PHASE2C_DEV_PROJECT_REF: other },
    { ...fake.env, NEXT_PUBLIC_SUPABASE_URL: `https://${other}.supabase.co`, PHASE2C_DEV_PROJECT_REF: other },
    { ...fake.env, PHASE2C_PRODUCTION_PROJECT_REF: fake.ref },
    { ...fake.env, PHASE2C_DEV_PROJECT_REF: undefined },
  ]) {
    await assert.rejects(runVerification({ env, fetchImpl: fake.fetch, reportDir: tmpdir(), log: () => {} }), GuardError);
  }
  assert.equal(fake.calls.total, 0, "the guard let a request through");
});

test("a privilege gap like the one found on DEV is reported as a FAIL and stops the run", async () => {
  const fake = await createFakeSupabase({ grants: "none" });
  const r = await run(fake, { dbChecks: false });
  assert.equal(r.report.overall, "FAIL");
  assert.equal(r.exitCode, 1);
  assert.match(byId(r.report, "D1").detail, /service_role blocked on: .*profiles\(403 42501\)/);
  assert.equal(byId(r.report, "F-M").status, "NOT_TESTED");
  assert.equal(fake.users.size, 0);
});

test("blanket grants (the local test model) pass functionally but are flagged as broader than the model", async () => {
  const fake = await createFakeSupabase({ grants: "harness-all" });
  const r = await run(fake);
  assert.deepEqual(failures(r.report), []);
  assert.equal(byId(r.report, "E3").status, "WARN");
  assert.equal(r.report.overall, "PASS_WITH_GAPS");
});

test("MUTATION: if Staff could read invoices the verification FAILS (K1) — the tests can catch a regression", async () => {
  const fake = await createFakeSupabase({ afterSetupSql: `CREATE POLICY staff_reads_invoices ON public.invoices FOR SELECT USING (public.is_staff());` });
  const r = await run(fake);
  assert.equal(r.report.overall, "FAIL");
  assert.equal(byId(r.report, "K1").status, "FAIL");
});

test("MUTATION: if a client could read every invoice the verification FAILS (isolation)", async () => {
  const fake = await createFakeSupabase({ afterSetupSql: `CREATE POLICY everyone_reads ON public.invoices FOR SELECT TO authenticated USING (true);` });
  const r = await run(fake);
  assert.equal(r.report.overall, "FAIL");
  assert.equal(byId(r.report, "I-A3").status, "FAIL");
});

test("MUTATION: if the lifecycle trigger is missing the verification FAILS (L1)", async () => {
  const fake = await createFakeSupabase();
  const trg = (await fake.db.query(`select t.tgname from pg_trigger t join pg_proc p on p.oid=t.tgfoid where p.proname='invoices_status_guard'`)).rows.map((x) => x.tgname);
  assert.ok(trg.length > 0, "guard trigger not found in the local schema");
  for (const t of trg) await fake.db.exec(`DROP TRIGGER ${t} ON public.invoices`);
  const r = await run(fake);
  assert.equal(r.report.overall, "FAIL");
  assert.equal(byId(r.report, "L1").status, "FAIL");
});

test("MUTATION: if Staff could write Services the verification FAILS (K3)", async () => {
  const fake = await createFakeSupabase({ afterSetupSql: `CREATE POLICY staff_writes_services ON public.service_catalog FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());` });
  const r = await run(fake);
  assert.equal(byId(r.report, "K3").status, "FAIL");
});

test("safety: refuses to write to a database that looks like production (real-looking users)", async () => {
  const fake = await createFakeSupabase();
  await fake.db.exec(`INSERT INTO auth.users (email) VALUES ('a@company.com'),('b@company.com'),('c@company.com'),('d@company.com');`);
  const r = await run(fake);
  assert.equal(byId(r.report, "F0").status, "FAIL");
  assert.equal(r.report.overall, "FAIL");
  assert.equal(fake.users.size, 0, "accounts were created on a production-looking database");
});

test("safety: refuses to write when real settled Paystack payments exist", async () => {
  const fake = await createFakeSupabase();
  await fake.db.exec(`INSERT INTO auth.users (id,email) VALUES ('00000000-0000-0000-0000-0000000000aa','o@example.test');
    INSERT INTO public.invoices (id, client_id, invoice_number, status) VALUES ('00000000-0000-0000-0000-0000000000ab','00000000-0000-0000-0000-0000000000aa','SCH-2099-0001','sent');
    INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('00000000-0000-0000-0000-0000000000ab','x',1,100);
    INSERT INTO public.payments (invoice_id, amount, method, paid_at, paystack_reference) VALUES ('00000000-0000-0000-0000-0000000000ab', 5, 'paystack', now(), 'T123456789');`);
  const r = await run(fake);
  assert.equal(byId(r.report, "F0").status, "FAIL");
  assert.equal(fake.users.size, 0);
});
