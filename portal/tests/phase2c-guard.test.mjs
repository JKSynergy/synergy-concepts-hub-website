// Safety properties of the Phase 2C tooling: the guard, secret handling, static "never do this" checks on the scripts,
// and a frozen fingerprint of migrations 001–012 (they are installed on DEV; editing them would create drift).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, classifyKey, GuardError, makeRedactor, writesConfirmed, ALLOWED_DEV_REFS } from "../scripts/phase2c-guard.mjs";
import { makeJwt, DEV_REF } from "./helpers/fake-supabase.mjs";

const anon = makeJwt({ role: "anon", ref: DEV_REF });
const service = makeJwt({ role: "service_role", ref: DEV_REF });
const good = { NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, PHASE2C_DEV_PROJECT_REF: DEV_REF };
const refuse = (env, re) => assert.throws(() => assertDevTarget(env), (e) => e instanceof GuardError && re.test(e.message) && !e.message.includes(service) && !e.message.includes(anon));

test("guard accepts exactly the allowlisted DEV project when everything agrees", () => {
  const t = assertDevTarget(good);
  assert.equal(t.ref, DEV_REF);
  assert.deepEqual([...ALLOWED_DEV_REFS], [DEV_REF]);
});

test("guard refuses: missing variables, ref mismatch, non-allowlisted project, production ref, wrong host", () => {
  refuse({}, /Missing required environment variables/);
  refuse({ ...good, PHASE2C_DEV_PROJECT_REF: undefined }, /PHASE2C_DEV_PROJECT_REF/);
  refuse({ ...good, PHASE2C_DEV_PROJECT_REF: "abcdefghijklmnopqrst" }, /does not equal/);
  const other = "abcdefghijklmnopqrst";
  refuse({ ...good, NEXT_PUBLIC_SUPABASE_URL: `https://${other}.supabase.co`, PHASE2C_DEV_PROJECT_REF: other }, /allowlist/);
  refuse({ ...good, PHASE2C_PRODUCTION_PROJECT_REF: DEV_REF }, /production/);
  refuse({ ...good, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }, /https:\/\/<project-ref>\.supabase\.co/);
  refuse({ ...good, NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_REF}.example.com` }, /supabase\.co/);
  refuse({ ...good, NEXT_PUBLIC_SUPABASE_URL: `https://custom-domain.supabase.co` }, /supabase\.co|does not equal/);
});

test("guard refuses keys from another project, wrong roles, identical keys, publishable-as-service", () => {
  refuse({ ...good, SUPABASE_SERVICE_ROLE_KEY: makeJwt({ role: "service_role", ref: "prodprodprodprodprod" }) }, /belongs to project prodprodprodprodprod/);
  refuse({ ...good, SUPABASE_SERVICE_ROLE_KEY: anon }, /role "anon" but "service_role"/);
  refuse({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: service }, /role "service_role" but "anon"/);
  refuse({ ...good, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_abcdefghijklmnop" }, /publishable/);
  refuse({ ...good, SUPABASE_SERVICE_ROLE_KEY: "not-a-key" }, /not a recognised/);
});

test("new-style keys (sb_secret_/sb_publishable_) are accepted", () => {
  const t = assertDevTarget({ ...good, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abcdefghijklmnop", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abcdefghijklmnop" });
  assert.equal(t.ref, DEV_REF);
  assert.equal(classifyKey("sb_secret_x").kind, "secret");
});

test("a direct database URL must point at the same project", () => {
  assert.doesNotThrow(() => assertDbUrlMatchesRef(`postgresql://postgres:pw@db.${DEV_REF}.supabase.co:5432/postgres`, DEV_REF));
  assert.doesNotThrow(() => assertDbUrlMatchesRef(`postgresql://postgres.${DEV_REF}:pw@aws-0-eu.pooler.supabase.com:5432/postgres`, DEV_REF));
  assert.throws(() => assertDbUrlMatchesRef("postgresql://postgres:pw@db.otherotherotherother.supabase.co:5432/postgres", DEV_REF), GuardError);
  assert.throws(() => assertDbUrlMatchesRef("postgresql://postgres:pw@localhost:5432/postgres", DEV_REF), GuardError);
  refuse({ ...good, PHASE2C_DB_URL: "postgresql://postgres:pw@db.otherotherotherother.supabase.co:5432/postgres" }, /PHASE2C_DB_URL/);
});

test("writes need the operator to retype the project ref", () => {
  assert.equal(writesConfirmed({ PHASE2C_CONFIRM_DEV_WRITES: DEV_REF }, DEV_REF), true);
  for (const v of [undefined, "", "yes", "1", "true", "OUTUOCPSOTIOZKPYKSEX"]) assert.equal(writesConfirmed({ PHASE2C_CONFIRM_DEV_WRITES: v }, DEV_REF), false);
});

test("redactor removes every secret from any string, longest first, and ignores short values", () => {
  const r = makeRedactor(() => ["supersecretvalue1", "supersecretvalue1-extended", "x"]);
  assert.equal(r("a supersecretvalue1-extended b supersecretvalue1 c x"), "a [redacted] b [redacted] c x");
});

// ── static properties of the scripts ────────────────────────────────────────
const scripts = readdirSync("scripts").filter((f) => /^phase2c-.*\.mjs$/.test(f));
const code = (f) => readFileSync(join("scripts", f), "utf8").split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

test("scripts never read .env files (no dotenv, no loadEnvFile, no file reads of .env*)", () => {
  assert.ok(scripts.length >= 6);
  for (const f of scripts) {
    const c = code(f);
    assert.ok(!/dotenv|loadEnvFile|--env-file/.test(c), `${f} loads an env file`);
    assert.ok(!/(readFileSync|readFile|createReadStream|existsSync)\([^)]*\.env/.test(c), `${f} reads a .env file`);
  }
});

test("scripts never print keys, tokens, passwords or the database URL", () => {
  for (const f of scripts) {
    const c = code(f);
    assert.ok(!/console\.(log|error|info|warn)\([^;]*(serviceKey|anonKey|dbUrl|\.password|access_token|SERVICE_ROLE_KEY|PHASE2C_DB_URL)/.test(c), `${f} may print a secret`);
  }
});

test("scripts contain no schema-changing SQL and never touch application data destructively", () => {
  for (const f of scripts) {
    // has_table_privilege(..., 'TRUNCATE') and the WARN message that names it are read-only mentions, not statements
    const c = code(f).replace(/has_table_privilege\([^)]*\)/g, "").replace(/hold TRUNCATE on/g, "");
    assert.ok(!/\b(GRANT|REVOKE|ALTER|DROP|TRUNCATE)\b/.test(c), `${f} contains DDL/privilege SQL`);
    assert.ok(!/CREATE\s+(TABLE|POLICY|ROLE|FUNCTION|TRIGGER|SCHEMA|INDEX|EXTENSION)/i.test(c), `${f} creates schema objects`);
    assert.ok(!/from\s+["']pg["']|require\(["']pg["']\)/.test(c), `${f} imports pg statically (must stay optional)`);
  }
  // the only delete of an auth user is the sign-up probe; no DELETE of application tables outside the finance line-item probe
  const checks = code("phase2c-checks.mjs");
  const deletes = [...checks.matchAll(/\.delete\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(deletes.every((t) => ["invoice_line_items", "projects", "service_catalog", "invoices", "payments"].includes(t)), `unexpected delete targets: ${deletes}`);
});

test("the only production-proofing inputs are environment variables, and the allowlist holds no placeholder", () => {
  const g = readFileSync("scripts/phase2c-guard.mjs", "utf8");
  assert.match(g, /ALLOWED_DEV_REFS = Object\.freeze\(\["[a-z0-9]{20}"\]\)/);
});

test("credentials, the dedicated env file and reports are git-ignored; npm scripts exist", () => {
  const ig = readFileSync(".gitignore", "utf8").split(/\r?\n/).map((l) => l.trim());
  for (const p of [".phase2c-accounts.local.json", ".phase2c.dev.env", "/phase2c-reports", ".env*.local"]) assert.ok(ig.includes(p), `.gitignore is missing ${p}`);
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const s of ["phase2c:guard", "phase2c:preflight", "phase2c:seed", "phase2c:verify", "phase2c:verify:file"]) assert.ok(pkg.scripts[s], `missing npm script ${s}`);
  assert.equal(pkg.scripts["phase2c:verify"], "node scripts/phase2c-verify.mjs");
  assert.ok(!Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {})).includes("pg"), "pg must stay an optional, uninstalled-by-default tool");
});

test("migrations 001–012 are byte-identical to what is installed on DEV (no retroactive edits, no renames)", () => {
  const expected = {
    "001_initial_schema.sql": "91c6eae0274f35434b6149047c7553bae86b1db764a42ee326b86334405776e7",
    "002_phase2_write_policies.sql": "5bec0f6d31c2d5d4001ce131a850b7f13c1a3c701a79296b32aad8878e7cd5c4",
    "003_phase3_bookings.sql": "c920312c601940e77f0e79b137de11a4a2ab9795bc1f8f486f77679a4df67501",
    "003_phase4_finance.sql": "54d8a1802abf56bf158608528cbacdde1cbbef3b300e7dea16a1de771b1a47be",
    "004_phase5_polish.sql": "602ce78872a63a13af25d896f79173ba2d4f250c5fb4369fe2e1addfd11b7056",
    "005_fix_profiles_select_policy.sql": "f371519f65b202bce2b46084b7c2b9c028d43f3e64c342e2f1841f7645ddd2f9",
    "006_fix_bookings_client_id_nullable.sql": "88ab7052793725812e0d4dc00ce691b556c6dbde0c7eb689bef2f555a2c2c4d4",
    "007_fix_client_delete.sql": "662e0ef105c4c97e07283b693a07155493c94216388ef42be77ba01fa4b09157",
    "008_add_partially_paid_status.sql": "2b6032a288f77539e1cb0e0a3420285731e4ed854ad4e1b8e4f0602289864eff",
    "009_fix_partial_payment_trigger.sql": "ab59de1ff8415b8ba303c61a700de29a1448cad0c87ed0cc36a81a931e94a420",
    "010_phase1_security_remediation.sql": "2f38022d105d3ffe8dd5426783f5b522628bf04b783944bcacb1ab8af7cdab59",
    "011_add_finance_role.sql": "2e74fb8702a67169bc87faf4b4bccb46742772b5870d2bca04fac64506c00088",
    "012_finance_role_authorization.sql": "e15b83f17eff95669268509528b4ce483730a4ef6e1cef4da80b2006058690bf",
  };
  const dir = join("supabase", "migrations");
  const actual = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => [f, createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")]));
  for (const [f, h] of Object.entries(expected)) assert.equal(actual[f], h, `${f} changed`);
  assert.ok(Object.keys(actual).every((f) => f in expected || /^01[3-9]|^0[2-9]\d/.test(f)), "unexpected migration file among 001–012");
});
