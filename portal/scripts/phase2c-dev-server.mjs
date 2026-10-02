// npm run phase2c:dev — starts the portal locally (http://localhost:3000) against the DEV Supabase project ONLY.
//
// Why a launcher instead of `npm run dev`: `next dev` auto-loads portal/.env.local, which may hold production
// values (Supabase, live Paystack key, Resend key, notification address). This launcher
//   1. runs the same guard as every Phase 2C script (allowlisted DEV ref, URL/keys agree, production ref refused);
//   2. requires PHASE2C_CONFIRM_DEV_WRITES=<ref>, because the running portal can write to DEV;
//   3. sets EVERY environment variable the app reads in the child process. Process variables win over .env.local,
//      so nothing in that file can change the target. Paystack, e-mail (Resend) and enquiry notifications are
//      switched off for the session;
//   4. refuses to start if something already answers on the port (an old server may use other settings);
//   5. after start-up, reads the Content-Security-Policy-Report-Only header the server derived from its own
//      NEXT_PUBLIC_SUPABASE_URL and stops the server if it names any Supabase project except the DEV ref.
// It never reads .env / .env.local and never prints keys.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { assertDevTarget, GuardError, isMain, writesConfirmed } from "./phase2c-guard.mjs";

/** Values forced for the browser session so real integrations cannot fire. Empty string = "configured as off". */
export const SAFE_OVERRIDES = Object.freeze({
  PAYSTACK_SECRET_KEY: "",          // /api/paystack/* answers "not configured"; Paystack is NOT TESTED in this stage
  RESEND_API_KEY: "",               // lib/email/notify.ts logs "[email skipped]" instead of sending
  ADMIN_NOTIFY_EMAIL: "",           // no enquiry/booking notification target
  NEXT_PUBLIC_WEBSITE_URL: "",      // login "back to website" link falls back to "/"
  MARKETING_SITE_ORIGIN: "",        // public quote endpoint accepts no cross-origin caller
  EMAIL_FROM: "SCH Portal DEV <noreply@example.test>",
  NEXT_TELEMETRY_DISABLED: "1",
});

export function buildDevEnv(env, port = 3000) {
  const target = assertDevTarget(env);
  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`The running portal can write to DEV. Set PHASE2C_CONFIRM_DEV_WRITES=${target.ref} to confirm.`);
  }
  const child = {
    ...env, ...SAFE_OVERRIDES,
    NEXT_PUBLIC_SUPABASE_URL: target.url,
    NEXT_PUBLIC_PORTAL_URL: `http://localhost:${port}`,
  };
  delete child.PHASE2C_DB_URL; // the portal never needs a direct database connection
  return { target, env: child };
}

/** The CSP header lists the Supabase origin the server was configured with. Fail closed. */
export function headerTargetsOnlyDev(cspReportOnly, ref) {
  if (!cspReportOnly) return { ok: false, reason: "the server did not send a Content-Security-Policy-Report-Only header" };
  const hosts = new Set([...cspReportOnly.matchAll(/(?:https|wss):\/\/([a-z0-9-]+)\.supabase\.co/gi)].map((m) => m[1].toLowerCase()));
  if (hosts.size === 0) return { ok: false, reason: "the server names no Supabase project" };
  const other = [...hosts].filter((h) => h !== ref);
  return other.length ? { ok: false, reason: `the server is configured for another Supabase project (${other.join(", ")})` } : { ok: true };
}

async function answers(url) {
  try { await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2500) }); return true; } catch { return false; }
}

function stop(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

const ANSI = /\x1b\[[0-9;]*m/g;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Start the portal. Test hooks (`command`, `args`, `startupTimeoutMs`, `firstPageTimeoutMs`) are function parameters only,
 * never environment variables, so the target guard and the running-server check cannot be bypassed from the shell.
 */
export async function startDevServer({ env = process.env, log = (s) => console.log(s), command, args, startupTimeoutMs, firstPageTimeoutMs } = {}) {
  const port = Number(env.PHASE2C_PORT || 3000);
  const { target, env: childEnv } = buildDevEnv(env, port);
  const base = `http://localhost:${port}`;
  if (await answers(`${base}/login`)) throw new GuardError(`Something is already running on port ${port}. Stop it first: an existing server may be using different (possibly production) settings.`);

  const startupMs = startupTimeoutMs ?? Number(env.PHASE2C_STARTUP_TIMEOUT_S || 300) * 1000;
  const firstPageMs = firstPageTimeoutMs ?? 240_000;
  const cmd = command ?? process.execPath;
  const cmdArgs = args ?? [createRequire(import.meta.url).resolve("next/dist/bin/next"), "dev", "-p", String(port)];
  // Output is piped (and always drained/forwarded) so the launcher can see Next.js's own "Ready" line.
  const child = spawn(cmd, cmdArgs, { env: childEnv, stdio: ["inherit", "pipe", "pipe"] });
  let ready = false, tail = "";
  const forward = (sink) => (chunk) => {
    sink.write(chunk);
    if (!ready) { tail = (tail + chunk.toString()).replace(ANSI, "").slice(-300); if (/\bReady in\b/i.test(tail)) ready = true; }
  };
  child.stdout.on("data", forward(process.stdout));
  child.stderr.on("data", forward(process.stderr));
  let stopping = false;                      // set when the launcher itself ends the server (check failed / timeout)
  const halt = () => { stopping = true; stop(child); };
  const quit = () => { halt(); process.exit(0); };
  process.on("SIGINT", quit); process.on("SIGTERM", quit);
  child.on("exit", (code) => { if (stopping) return; log(`Portal stopped (exit ${code ?? "signal"}).`); process.exit(code ?? 0); });
  child.on("error", (e) => { log(`Could not start Next.js: ${e.message}`); process.exit(1); });

  log(`Starting the portal on ${base} against Supabase project ${target.ref} (DEV)…`);

  // Phase 1: wait for Next.js itself to say Ready. No request is sent to the server during this phase.
  const t0 = Date.now();
  let lastBeat = t0;
  while (!ready) {
    const waited = Date.now() - t0;
    if (waited > startupMs) {
      halt();
      throw new Error(`Next.js did not report Ready within ${Math.round(startupMs / 1000)} s. This is Next.js start-up (before any DEV target check), not the launcher's check. The portal was NOT left running.`);
    }
    if (Date.now() - lastBeat >= 15_000) { lastBeat = Date.now(); log(`…still waiting for Next.js to report Ready (${Math.round(waited / 1000)} s)`); }
    await sleep(300);
  }
  log(`Next.js reported Ready after ${Math.round((Date.now() - t0) / 1000)} s. Verifying the target from the running server (the first page compiles now)…`);

  // Phase 2: first request compiles middleware and /login (slow on a first run); read the header the server derived from its own Supabase URL.
  const t1 = Date.now();
  lastBeat = t1;
  let csp, answered = false;
  while (Date.now() - t1 < firstPageMs) {
    try {
      const r = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(Math.max(1000, firstPageMs - (Date.now() - t1))) });
      if (r.status < 500) { csp = r.headers.get("content-security-policy-report-only"); answered = true; break; }
    } catch { /* retry */ }
    if (Date.now() - lastBeat >= 15_000) { lastBeat = Date.now(); log(`…still waiting for the first page (${Math.round((Date.now() - t1) / 1000)} s)`); }
    await sleep(1500);
  }
  if (!answered) { halt(); throw new Error(`Next.js is Ready but /login did not answer within ${Math.round(firstPageMs / 1000)} s. The portal was NOT left running.`); }
  const v = headerTargetsOnlyDev(csp, target.ref);
  if (!v.ok) { halt(); throw new GuardError(`Stopped: ${v.reason}. The portal was NOT left running.`); }

  log("");
  log("────────────────────────────────────────────────────────────");
  log(` Portal:    ${base}/login`);
  log(` Supabase:  ${target.ref}  (DEV — verified from the running server)`);
  log(" Disabled for this session: Paystack, e-mail (Resend), enquiry notifications.");
  log(" Credentials: npm run phase2c:cred -- <admin|finance|staff|clientA|clientB>");
  log(" Stop with Ctrl+C.");
  log("────────────────────────────────────────────────────────────");
  return child;
}

if (isMain(import.meta.url)) {
  try { await startDevServer(); }
  catch (e) {
    if (e instanceof GuardError) { console.error(e.message); process.exit(2); }
    console.error(`phase2c:dev stopped: ${e?.message || e}`); process.exit(1);
  }
}
