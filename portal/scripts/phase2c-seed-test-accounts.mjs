// Creates ONLY dedicated test accounts (phase2c.*@example.test) in the confirmed DEV project.
//   admin, staff, finance, clientA, clientB
// Idempotent: existing accounts whose saved password still works are kept; an account that exists
// without a usable saved password gets a fresh random password (test accounts only). Passwords are
// random, written ONLY to the git-ignored .phase2c-accounts.local.json, and never printed.
// Can be imported (phase2c-verify.mjs does) or run directly:  npm run phase2c:seed
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "./phase2c-lib.mjs";
import { assertDevTarget, GuardError, isMain, writesConfirmed, makeRedactor } from "./phase2c-guard.mjs";

export const ACCOUNT_FILE = ".phase2c-accounts.local.json";
export const TEST_ACCOUNTS = [
  ["admin", "admin"], ["staff", "staff"], ["finance", "finance"], ["clientA", "client"], ["clientB", "client"],
];
const EMAIL_RE = /^phase2c\.[a-z]+@example\.test$/;
const newPassword = () => randomBytes(18).toString("base64url") + "aA1!";

export function loadAccounts(file = ACCOUNT_FILE) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; }
}
function saveAccounts(file, data) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

async function findUserId(client, email) {
  for (let page = 1; page <= 25; page++) {
    const r = await client.auth.adminList(page, 200);
    if (!r.ok) return { error: `list users: HTTP ${r.status}` };
    const users = Array.isArray(r.body) ? r.body : r.body?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return { id: hit.id };
    if (users.length < 200) break;
  }
  return { error: "user not found" };
}

/**
 * @returns {{ accounts: Record<string,{email,password,id,role}>, actions: Record<string,string>, errors: string[] }}
 */
export async function seedTestAccounts({ client, includeFinance = true, file = ACCOUNT_FILE, generatePassword = newPassword }) {
  const service = client.rest({ kind: "service" });
  const saved = loadAccounts(file);
  const accounts = { ...saved };
  const actions = {};
  const errors = [];

  for (const [name, role] of TEST_ACCOUNTS) {
    if (name === "finance" && !includeFinance) { actions[name] = "skipped (finance role not installed)"; continue; }
    const email = `phase2c.${name.toLowerCase()}@example.test`;
    if (!EMAIL_RE.test(email)) throw new Error("refusing to manage a non-test email");
    let entry = saved[name];
    let action = "kept";
    let id;

    if (entry?.password && entry.email === email) {
      const s = await client.auth.signIn(email, entry.password);
      if (s.ok) id = s.body?.user?.id;
    }
    if (!id) {
      const password = generatePassword();
      const c = await client.auth.adminCreate({ email, password, email_confirm: true });
      if (c.ok && c.body?.id) { id = c.body.id; entry = { email, password }; action = "created"; }
      else if (c.status === 422 || c.status === 409 || /exist|registered/i.test(JSON.stringify(c.body || {}))) {
        const f = await findUserId(client, email);
        if (f.error) { errors.push(`${name}: ${f.error}`); continue; }
        const u = await client.auth.adminUpdate(f.id, { password, email_confirm: true });
        if (!u.ok) { errors.push(`${name}: password reset failed (HTTP ${u.status})`); continue; }
        id = f.id; entry = { email, password }; action = "password-reset";
      } else { errors.push(`${name}: create failed (HTTP ${c.status})`); continue; }
    }

    // Roles are assigned server-side only (service context), exactly like the admin API route does.
    const p = await service.get("profiles", { select: "role", id: `eq.${id}` });
    const current = Array.isArray(p.body) ? p.body[0]?.role : undefined;
    if (current !== role) {
      const u = await service.patch("profiles", { id: `eq.${id}` }, { role });
      if (!u.ok) { errors.push(`${name}: could not set role ${role} (HTTP ${u.status}${u.code ? `, ${u.code}` : ""})`); continue; }
    }
    accounts[name] = { email, password: entry.password, id, role };
    actions[name] = action;
    saveAccounts(file, accounts); // persist after every account so partial progress is never lost
  }
  return { accounts, actions, errors };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  try {
    const t = assertDevTarget(process.env);
    console.log(`Target project ref: ${t.ref} (confirmed dev/staging by operator)`);
    if (!writesConfirmed(process.env, t.ref)) {
      console.error(`Creating accounts writes to the DEV project. Set PHASE2C_CONFIRM_DEV_WRITES=${t.ref} to confirm.`);
      process.exit(2);
    }
    const client = createClient({ url: t.url, anonKey: t.anonKey, serviceKey: t.serviceKey });
    const redact = makeRedactor(() => [t.anonKey, t.serviceKey, t.dbUrl]);
    const { actions, errors } = await seedTestAccounts({ client, includeFinance: process.env.PHASE2C_INCLUDE_FINANCE !== "0" });
    for (const [n, a] of Object.entries(actions)) console.log(`${n}: ${a}`);
    for (const e of errors) console.error(redact(e));
    console.log(`Credentials are in ${ACCOUNT_FILE} (git-ignored; do not commit or paste into chat).`);
    process.exit(errors.length ? 1 : 0);
  } catch (e) {
    if (e instanceof GuardError) { console.error(e.message); process.exit(2); }
    throw e;
  }
}
