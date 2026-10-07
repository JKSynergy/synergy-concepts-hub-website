import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDb, asService } from "./helpers/db.mjs";

// Application Integration section: one-click env-var copy for managed-app
// onboarding. Guards prove the env block is derived from the canonical
// systems.id, contains exactly the four required variables, exposes the
// plaintext token only via the one-time generation state, and introduces no
// persistence, logging, or retrieval of secrets.

const PAGE_SRC = readFileSync("app/admin/systems/[id]/page.tsx", "utf8");
const SRC = readFileSync("app/admin/systems/[id]/system-integration.tsx", "utf8");
const ACTION_SRC = readFileSync("lib/actions/system-status.ts", "utf8");

const IDS = {
  admin: "11111111-1111-1111-1111-111111111111",
  clientA: "22222222-2222-2222-2222-222222222222",
  systemA: "33333333-3333-3333-3333-333333333333",
};

async function seed(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${IDS.admin}', 'admin@example.test'),
      ('${IDS.clientA}', 'clienta@example.test');
    UPDATE public.profiles SET role = 'admin' WHERE id = '${IDS.admin}';
    UPDATE public.profiles SET role = 'client' WHERE id = '${IDS.clientA}';
    INSERT INTO public.systems (id, client_id, name, status)
    VALUES ('${IDS.systemA}', '${IDS.clientA}', 'SMA LMS', 'live');
  `);
}

test("integration: System ID comes from canonical systems.id", () => {
  assert.match(PAGE_SRC, /systemId=\{system\.id\}/, "page passes systems.id");
  assert.match(SRC, /SCH_SYSTEM_ID=\$\{systemId\}/, "env var uses the same id");
});

test("integration: status endpoint is derived from canonical systems.id", () => {
  assert.match(SRC, /https:\/\/portal\.synergyconceptshub\.com\/api\/systems\/\$\{systemId\}\/status/);
  assert.match(SRC, /SCH_STATUS_ENDPOINT=\$\{statusEndpoint\}/, "env var reuses the derived endpoint");
});

test("integration: env block contains exactly the four required variables", () => {
  const envStart = SRC.indexOf("const envText");
  assert.ok(envStart > -1);
  const envBlock = SRC.slice(envStart, SRC.indexOf("].join", envStart));
  const vars = [...envBlock.matchAll(/(SCH_[A-Z_]+)=/g)].map((m) => m[1]);
  assert.deepEqual(vars, [
    "SCH_SYSTEM_ID",
    "SCH_STATUS_ENDPOINT",
    "SCH_STATUS_TOKEN",
    "SCH_STATUS_CACHE_TTL_SECONDS",
  ]);
});

test("integration: cache TTL is fixed at 30 seconds", () => {
  assert.match(SRC, /SCH_STATUS_CACHE_TTL_SECONDS=30/);
});

test("integration: plaintext token appears only via the one-time generation state", () => {
  assert.match(SRC, /SCH_STATUS_TOKEN=\$\{generatedToken \?\? ""\}/,
    "token line is empty unless the token was just generated");
  assert.match(SRC, /const \[generatedToken, setGeneratedToken\] = useState/,
    "token lives in component state only");
  assert.match(SRC, /generateSystemStatusToken\(systemId\)/,
    "reuses the existing secure generation action");
  assert.ok(!/generateStatusToken\(|hashStatusToken|createHash/.test(SRC),
    "component does not implement its own token logic");
});

test("integration: copy-env control only exists while the plaintext token is available", () => {
  const copyPos = SRC.indexOf("Copy Environment Variables");
  const genGuard = SRC.lastIndexOf("generatedToken ? (", copyPos);
  assert.ok(genGuard > -1, "copy button lives inside the generatedToken branch");
  assert.match(SRC, /navigator\.clipboard\.writeText\(envText\)/,
    "clipboard receives the exact env text");
  assert.match(SRC, /\{envCopied \? "Copied" : "Copy Environment Variables"\}/,
    "button returns to its label after copy");
});

test("integration: token is never persisted, logged, or sent anywhere", () => {
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(SRC), "no browser persistence");
  assert.ok(!/console\.(log|info|warn|error|debug)/.test(SRC), "no console output");
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(SRC), "no outbound requests");
  assert.ok(!/writeAuditLog|audit_logs/.test(SRC), "no audit writes from the component");
  assert.ok(!/window\.location|router\.push|router\.replace/.test(SRC.replace("router.refresh()", "")),
    "token never enters a URL");
});

test("integration: no token hash or secret material is rendered or fetched", () => {
  assert.ok(!/status_token_hash/.test(SRC), "component never references the hash");
  const select = PAGE_SRC.match(/\.from\("systems"\)\s*\.select\("([^"]+)"\)/);
  assert.ok(select);
  assert.ok(!/status_token_hash/.test(select[1]), "page does not select the hash");
  assert.match(select[1], /status_token_last_rotated_at/, "configured flag uses the rotation timestamp");
  assert.match(PAGE_SRC, /tokenConfigured=\{Boolean\(system\.status_token_last_rotated_at\)\}/,
    "client receives a boolean, not secret material");
});

test("integration: configuration indicator distinguishes configured vs not", () => {
  assert.match(SRC, /"Token configured"/);
  assert.match(SRC, /"Not configured"/);
  assert.match(SRC, /Status token configured\. Generate a new token/,
    "explains a stored token cannot be retrieved");
});

test("integration: generate/rotate is admin-gated and reuses the existing action", () => {
  assert.match(SRC, /\{isAdmin && \([\s\S]*?onGenerateToken/, "button gated on isAdmin prop");
  assert.match(SRC, /import \{ generateSystemStatusToken \} from "@\/lib\/actions\/system-status"/);
  const adminCheck = ACTION_SRC.indexOf("isAdmin(");
  const rpcCall = ACTION_SRC.indexOf('admin.rpc("set_system_status_token_hash"');
  assert.ok(adminCheck > -1 && adminCheck < rpcCall, "action remains admin-guarded");
});

test("integration: token rotation invalidates the previous hash at the database level", async () => {
  const db = await createDb();
  await seed(db);
  const oldHash = "a3b0c0d0e0f01112131415161718191a1b1c1d1e1f202122232425262728292a";
  const newHash = "b4c1d1e1f0212231415161718191a1b1c1d1e1f202122232425262728292a3b";
  await asService(db, () => db.query(`SELECT public.set_system_status_token_hash('${IDS.systemA}', '${oldHash}')`));
  await asService(db, () => db.query(`SELECT public.set_system_status_token_hash('${IDS.systemA}', '${newHash}')`));

  const row = (await db.query(`SELECT status_token_hash FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
  assert.equal(row.status_token_hash, newHash, "rotation replaces the stored hash");
  assert.notEqual(row.status_token_hash, oldHash, "previous token no longer verifies");
});

test("integration: rotation audit entries never carry plaintext or hash", async () => {
  const db = await createDb();
  await seed(db);
  await asService(db, () => db.query(`SELECT public.set_system_status_token_hash('${IDS.systemA}', 'c5d1e1f0212231415161718191a1b1c1d1e1f202122232425262728292a3b4c')`));
  const audit = await db.query(`SELECT details FROM public.audit_logs WHERE action = 'system_status_token.rotated'`);
  assert.equal(audit.rows.length, 1);
  const details = JSON.stringify(audit.rows[0].details);
  assert.ok(!/[0-9a-f]{64}/.test(details), "audit details contain no token hash");
});
