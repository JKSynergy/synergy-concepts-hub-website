// Safety of the local-to-DEV browser setup: the launcher's environment and target verification, and the credential helper.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDevEnv, headerTargetsOnlyDev, startDevServer, SAFE_OVERRIDES } from "../scripts/phase2c-dev-server.mjs";
import { run } from "../scripts/phase2c-credential.mjs";
import { GuardError } from "../scripts/phase2c-guard.mjs";
import { makeJwt, DEV_REF } from "./helpers/fake-supabase.mjs";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: makeJwt({ role: "anon", ref: DEV_REF }),
  SUPABASE_SERVICE_ROLE_KEY: makeJwt({ role: "service_role", ref: DEV_REF }),
  PHASE2C_DEV_PROJECT_REF: DEV_REF,
  PHASE2C_CONFIRM_DEV_WRITES: DEV_REF,
};

test("launcher forces safe values for every integration the app reads, whatever the shell or .env.local says", () => {
  const { env } = buildDevEnv({ ...base, PAYSTACK_SECRET_KEY: "sk_live_real", RESEND_API_KEY: "re_real", ADMIN_NOTIFY_EMAIL: "boss@real.com", MARKETING_SITE_ORIGIN: "https://real.com", NEXT_PUBLIC_WEBSITE_URL: "https://real.com", PHASE2C_DB_URL: `postgresql://postgres.${DEV_REF}:pw@h/db` }, 3000);
  assert.equal(env.PAYSTACK_SECRET_KEY, "");
  assert.equal(env.RESEND_API_KEY, "");
  assert.equal(env.ADMIN_NOTIFY_EMAIL, "");
  assert.equal(env.MARKETING_SITE_ORIGIN, "");
  assert.equal(env.NEXT_PUBLIC_WEBSITE_URL, "");
  assert.equal(env.NEXT_PUBLIC_PORTAL_URL, "http://localhost:3000");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${DEV_REF}.supabase.co`);
  assert.equal(env.PHASE2C_DB_URL, undefined);
  assert.match(env.EMAIL_FROM, /example\.test/);
});

test("launcher covers every environment variable the application source reads", () => {
  // The app's own variables; if a new one appears in app/lib/components it must be added to the launcher (or be a Supabase key).
  const used = new Set();
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== "node_modules" && n !== ".next") walk(p); } else if (/\.(ts|tsx)$/.test(n)) for (const m of readFileSync(p, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]); } };
  for (const d of ["app", "lib", "components"]) walk(d);
  readFileSync("middleware.ts", "utf8").replace(/process\.env\.([A-Z0-9_]+)/g, (_, n) => used.add(n));
  const handled = new Set([...Object.keys(SAFE_OVERRIDES), "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_PORTAL_URL", "PAYSTACK_CURRENCY",
    // Scheduler secrets pass through from the operator's environment /
    // .env.local; without one the protected endpoint fails closed (401).
    // They gate an internal route, not an external integration.
    "CRON_SECRET", "MONITORING_SCHEDULER_SECRET",
    // Set by the platform/runtime, not configuration: only displayed (the
    // Operations environment badge), never used to make a decision.
    "VERCEL_ENV", "NODE_ENV"]);
  assert.deepEqual([...used].filter((n) => !handled.has(n)), [], "an env var the app reads is not controlled by the launcher");
});

test("launcher refuses without the write confirmation, for a non-DEV project, and with a foreign key", () => {
  assert.throws(() => buildDevEnv({ ...base, PHASE2C_CONFIRM_DEV_WRITES: undefined }), (e) => e instanceof GuardError && /can write to DEV/.test(e.message));
  assert.throws(() => buildDevEnv({ ...base, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", PHASE2C_DEV_PROJECT_REF: "abcdefghijklmnopqrst" }), GuardError);
  assert.throws(() => buildDevEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: makeJwt({ role: "service_role", ref: "prodprodprodprodprod" }) }), GuardError);
  assert.throws(() => buildDevEnv({ ...base, PHASE2C_PRODUCTION_PROJECT_REF: DEV_REF }), GuardError);
});

test("server target check accepts only the DEV project and fails closed", () => {
  const ok = `default-src 'self'; connect-src 'self' https://${DEV_REF}.supabase.co wss://${DEV_REF}.supabase.co`;
  assert.equal(headerTargetsOnlyDev(ok, DEV_REF).ok, true);
  assert.equal(headerTargetsOnlyDev(ok.replace(/outuocpsotiozkpyksex/g, "prodprodprodprodprod"), DEV_REF).ok, false);
  assert.equal(headerTargetsOnlyDev(`${ok} https://prodprodprodprodprod.supabase.co`, DEV_REF).ok, false);
  assert.equal(headerTargetsOnlyDev("default-src 'self'", DEV_REF).ok, false);
  assert.equal(headerTargetsOnlyDev(null, DEV_REF).ok, false);
});

test("credential helper copies the password, never prints it, and clears the clipboard", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cred-"));
  const file = join(dir, "a.json");
  writeFileSync(file, JSON.stringify({ finance: { email: "phase2c.finance@example.test", password: "Sup3r-Secret-Pw-xyz!", role: "finance" }, clientA: { email: "phase2c.clienta@example.test", password: "Another-Secret-abc1!", role: "client" } }));
  const lines = [], copied = [];
  const code = await run({ name: "FINANCE", file, copy: async (t) => { copied.push(t); }, log: (s) => lines.push(s), wait: async () => {} });
  assert.equal(code, 0);
  assert.deepEqual(copied, ["Sup3r-Secret-Pw-xyz!", " "]);
  assert.ok(!lines.join("\n").includes("Sup3r-Secret-Pw-xyz!") && !lines.join("\n").includes("Another-Secret"));
  assert.match(lines.join("\n"), /phase2c\.finance@example\.test/);
  // listing never shows passwords either
  const listed = []; await run({ file, log: (s) => listed.push(s) });
  assert.ok(!listed.join("\n").includes("Secret"));
  assert.equal(await run({ name: "nobody", file, log: () => {}, copy: async () => { throw new Error("must not copy"); } }), 1);
});

test("the launcher and helper never read .env files or print secrets", () => {
  for (const f of ["scripts/phase2c-dev-server.mjs", "scripts/phase2c-credential.mjs"]) {
    const c = readFileSync(f, "utf8").split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    assert.ok(!/dotenv|loadEnvFile|--env-file|readFileSync\([^)]*\.env/.test(c), `${f} reads an env file`);
    assert.ok(!/log\([^)]*(\.password|serviceKey|anonKey|SERVICE_ROLE_KEY)/i.test(c), `${f} may print a secret`);
  }
});

test(".env.phase2c* files (the old runbook's env file) are git-ignored", () => {
  const ig = readFileSync(".gitignore", "utf8").split(/\r?\n/).map((l) => l.trim());
  assert.ok(ig.includes(".env.phase2c*"));
});

// ---- start-up sequencing, against a fake "next" process (no real Next.js, no network beyond localhost) ----
import { existsSync } from "node:fs";
import { createServer } from "node:net";

const FAKE_NEXT = `
import http from "node:http"; import { writeFileSync } from "node:fs";
const [mode, port, marker, csp] = process.argv.slice(2);
let ready = false;
console.log("   ▲ Next.js (fake)"); console.log(" \x1b[32m✓\x1b[0m Starting...");
if (mode !== "never") {
  http.createServer((req, res) => { if (!ready) writeFileSync(marker, "early request"); res.writeHead(200, { "content-security-policy-report-only": csp }); res.end("ok"); }).listen(Number(port));
  setTimeout(() => { ready = true; console.log(" \x1b[32m✓\x1b[0m Ready in 1200ms"); }, 1200);
} else setInterval(() => {}, 1000);
`;
async function freePort() { return new Promise((r) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); }
const up = async (port) => { try { await fetch(`http://localhost:${port}/login`, { signal: AbortSignal.timeout(800) }); return true; } catch { return false; } };

async function launch(mode, csp, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fakenext-"));
  const file = join(dir, "fake.mjs"); writeFileSync(file, FAKE_NEXT);
  const port = await freePort(), marker = join(dir, "early.txt"), lines = [];
  const env = { ...base, PHASE2C_PORT: String(port) };
  const p = startDevServer({ env, log: (l) => lines.push(l), command: process.execPath, args: [file, mode, String(port), marker, csp], ...opts });
  return { p, port, marker, lines };
}

test("launcher sends no request until Next.js reports Ready, then verifies the target and prints the DEV banner", async () => {
  const { p, port, marker, lines } = await launch("ok", `connect-src 'self' https://${DEV_REF}.supabase.co`);
  const child = await p;
  try {
    assert.equal(existsSync(marker), false, "launcher probed the server before Next.js was Ready");
    assert.ok(lines.some((l) => /DEV — verified from the running server/.test(l)));
  } finally { child.kill(); }
});

test("launcher stops the server and refuses when the running server names another project", async () => {
  const { p, port } = await launch("ok", `connect-src 'self' https://prodprodprodprodprod.supabase.co`);
  await assert.rejects(p, (e) => e instanceof GuardError && /another Supabase project/.test(e.message));
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await up(port), false, "server was left running");
});

test("launcher reports a clear Next.js start-up timeout (not a target failure) and kills the server", async () => {
  const { p, lines } = await launch("never", "", { startupTimeoutMs: 1500 });
  await assert.rejects(p, (e) => !(e instanceof GuardError) && /did not report Ready/.test(e.message) && /Next\.js start-up/.test(e.message));
  assert.ok(!lines.some((l) => /verified from the running server/.test(l)));
});
