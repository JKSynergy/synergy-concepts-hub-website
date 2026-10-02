// Shared safety guard for every Phase 2C script.
//
// What it can and cannot prove
//   Supabase exposes no "this is the development project" flag to API keys, so the strongest
//   evidence available offline is the conjunction below. Every condition must hold or the
//   script refuses to run. Nothing here reads a .env file; values come from process.env only.
//
//   1. The project ref is on the ALLOWLIST below (edit this file to add another DEV/staging project).
//   2. PHASE2C_DEV_PROJECT_REF is set by the operator and equals the ref in NEXT_PUBLIC_SUPABASE_URL.
//   3. The URL is https://<ref>.supabase.co (no custom domains, no localhost, no other host).
//   4. If PHASE2C_PRODUCTION_PROJECT_REF is set, the ref must differ from it.
//   5. Legacy JWT keys must carry the same project ref (a production key with a DEV URL is refused);
//      the service key must have role=service_role and the anon key role=anon.
//   6. Writes additionally need PHASE2C_CONFIRM_DEV_WRITES=<the ref> and a "looks like a test
//      database" check (see phase2c-verify.mjs).
// Keys are never printed, and error messages never contain them.
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** DEV/staging projects the Phase 2C tooling may ever touch. Production must never be added here. */
export const ALLOWED_DEV_REFS = Object.freeze(["outuocpsotiozkpyksex"]);

export class GuardError extends Error {
  constructor(message) { super(message); this.name = "GuardError"; }
}

/** Describe a key without revealing it: format, and for legacy JWTs the non-secret role/ref claims. */
export function classifyKey(key) {
  if (!key) return { kind: "missing" };
  if (key.startsWith("sb_secret_")) return { kind: "secret" };
  if (key.startsWith("sb_publishable_")) return { kind: "publishable" };
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return { kind: "legacy-jwt", role: c.role, ref: c.ref };
    } catch { /* fall through */ }
  }
  return { kind: "unknown" };
}

/** True when the key must be sent only in the apikey header (new-style keys are not JWTs). */
export const isOpaqueKey = (key) => typeof key === "string" && key.startsWith("sb_");

/**
 * Pure validation. Returns { url, ref, anonKey, serviceKey, dbUrl } or throws GuardError.
 * `env` is normally process.env; tests pass their own object.
 */
export function assertDevTarget(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const declared = env.PHASE2C_DEV_PROJECT_REF;
  const prodRef = env.PHASE2C_PRODUCTION_PROJECT_REF;

  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!declared) missing.push("PHASE2C_DEV_PROJECT_REF");
  if (missing.length) throw new GuardError(`Missing required environment variables: ${missing.join(", ")}.`);

  let parsed;
  try { parsed = new URL(url); } catch { throw new GuardError("NEXT_PUBLIC_SUPABASE_URL is not a valid URL."); }
  const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  if (parsed.protocol !== "https:" || !m) {
    throw new GuardError("Refusing: the target URL must be https://<project-ref>.supabase.co (no localhost, custom domains or other hosts).");
  }
  const ref = m[1];

  if (declared !== ref) throw new GuardError(`Refusing: PHASE2C_DEV_PROJECT_REF (${declared}) does not equal the URL's project ref (${ref}).`);
  if (!ALLOWED_DEV_REFS.includes(ref)) throw new GuardError(`Refusing: project ${ref} is not on the DEV/staging allowlist in scripts/phase2c-guard.mjs.`);
  if (prodRef && prodRef === ref) throw new GuardError("Refusing: this is the production project.");

  for (const [label, key, wantRole] of [["SUPABASE_SERVICE_ROLE_KEY", serviceKey, "service_role"], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, "anon"]]) {
    const c = classifyKey(key);
    if (c.kind === "legacy-jwt") {
      if (c.ref && c.ref !== ref) throw new GuardError(`Refusing: ${label} belongs to project ${c.ref}, not ${ref}. A key from another project is loaded.`);
      if (c.role !== wantRole) throw new GuardError(`Refusing: ${label} has role "${c.role}" but "${wantRole}" is required.`);
    } else if (label === "SUPABASE_SERVICE_ROLE_KEY" && c.kind === "publishable") {
      throw new GuardError("Refusing: SUPABASE_SERVICE_ROLE_KEY holds a publishable key.");
    } else if (label === "NEXT_PUBLIC_SUPABASE_ANON_KEY" && c.kind === "secret") {
      throw new GuardError("Refusing: NEXT_PUBLIC_SUPABASE_ANON_KEY holds a secret key.");
    } else if (c.kind === "unknown") {
      throw new GuardError(`Refusing: ${label} is not a recognised Supabase key format.`);
    }
  }
  if (serviceKey === anonKey) throw new GuardError("Refusing: the service-role key and the anon key are the same value.");

  const dbUrl = env.PHASE2C_DB_URL || undefined;
  if (dbUrl) assertDbUrlMatchesRef(dbUrl, ref);
  return { url: `https://${ref}.supabase.co`, ref, anonKey, serviceKey, dbUrl };
}

/** A direct Postgres URL must point at the same project (host db.<ref>.supabase.co or pooler user postgres.<ref>). */
export function assertDbUrlMatchesRef(dbUrl, ref) {
  let u;
  try { u = new URL(dbUrl); } catch { throw new GuardError("PHASE2C_DB_URL is not a valid URL."); }
  const hostOk = u.hostname === `db.${ref}.supabase.co`;
  const userOk = decodeURIComponent(u.username || "").endsWith(`.${ref}`);
  if (!hostOk && !userOk) throw new GuardError(`Refusing: PHASE2C_DB_URL does not point at project ${ref}.`);
}

/** Writes (test accounts, test rows) need the operator to retype the ref. */
export function writesConfirmed(env, ref) {
  return env.PHASE2C_CONFIRM_DEV_WRITES === ref;
}

/** Back-compatible entry point used by the standalone scripts. */
export function guard(env = process.env) {
  try {
    const t = assertDevTarget(env);
    console.log(`Target project ref: ${t.ref} (confirmed dev/staging by operator)`);
    return t;
  } catch (e) {
    if (e instanceof GuardError) { console.error(e.message); process.exit(2); }
    throw e;
  }
}

/** Build a function that removes every secret value from a string. */
export function makeRedactor(secrets) {
  const list = () => [...new Set(secrets())].filter((s) => typeof s === "string" && s.length >= 8).sort((a, b) => b.length - a.length);
  return (text) => {
    let out = String(text);
    for (const s of list()) out = out.split(s).join("[redacted]");
    return out;
  };
}

/** True when this module is the script being run (case-insensitive on Windows, where drive-letter case can differ). */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  const a = resolve(process.argv[1]); const b = fileURLToPath(metaUrl);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
