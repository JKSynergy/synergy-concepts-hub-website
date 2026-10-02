// The Phase 2C check stages. Each stage takes a context and records results; nothing here prints secrets.
// Transport is Supabase's public HTTP APIs only (Auth, PostgREST, Storage) plus, optionally, a
// READ-ONLY direct database connection supplied by the orchestrator (PHASE2C_DB_URL).
import { expect, skip } from "./phase2c-lib.mjs";
import { seedTestAccounts } from "./phase2c-seed-test-accounts.mjs";

export const TABLES = ["profiles", "service_catalog", "bookings", "leads", "projects", "project_assignments", "project_milestones",
  "project_updates", "deliverables", "invoices", "invoice_line_items", "payments", "receipts", "audit_logs", "document_counters", "academy_courses"];

const ALL4 = ["SELECT", "INSERT", "UPDATE", "DELETE"];
/** Privilege model the authorization design assumes (see docs/PHASE2C-PRIVILEGE-BOOTSTRAP-RECOMMENDATION.md). */
export const PRIVILEGE_MODEL = {
  service_role: Object.fromEntries(TABLES.map((t) => [t, ALL4])),
  authenticated: Object.fromEntries(TABLES.map((t) => [t, t === "audit_logs" ? ["SELECT"] : t === "document_counters" ? [] : ALL4])),
  anon: Object.fromEntries(TABLES.map((t) => [t, []])),
};

/** Tables whose RLS SELECT policy is deliberately open to any caller for active rows. */
const PUBLIC_CATALOG = ["service_catalog", "academy_courses"];
const eq = (v) => `eq.${v}`;
const inList = (a) => `in.(${a.join(",")})`;
const denied = (r) => !r.ok && r.status >= 400 && r.status < 500;
const list = (r, what) => { expect(r.ok, `${what}: HTTP ${r.status}${r.code ? ` (${r.code})` : ""}${typeof r.body?.message === "string" ? ` — ${r.body.message.slice(0, 120)}` : ""}`); expect(Array.isArray(r.body), `${what}: expected a list`); return r.body; };
const idsOf = (r) => (Array.isArray(r.body) ? r.body.map((x) => x.id) : []);
/** Denied, or allowed but returned nothing. */
const hidden = (r) => denied(r) || (r.ok && Array.isArray(r.body) && r.body.length === 0);
const num = (v) => Number(v);
const tag = (ctx, extra = "") => `PHASE2C ${ctx.runId}${extra ? ` ${extra}` : ""}`;

export const REMAINING_BROWSER_VERIFICATION = [
  "Browser sign-in, sign-out, password reset and set-password flows through the real hosted Auth (emails, links, cookies, session expiry).",
  "Middleware redirects and role landing pages (/admin, /client, Finance-only routes) as each of Admin, Finance, Staff and Client.",
  "Role-based navigation: Finance must not see Staff/Team/Services-write controls; Staff must not see Finance, Invoices, Payments, Receipts or Reports.",
  "Server-action and API-route guards (invoice/payment actions, PDF routes, /api/admin/*) exercised through the running app, including the application-level lifecycle messages.",
  "Deliverable and invoice/receipt PDF download through the app (signed-URL issuance rules); this command only proves the buckets are private and that no user role can read them directly.",
  "Visual/UX pass at 1920×1080, 1366×768, 768×1024 and 390×844 for Admin, Finance, Staff and Client.",
  "Paystack: no real transaction was made and none is planned; the Paystack webhook/checkout path is NOT TESTED here.",
];

// ── C: schema state ─────────────────────────────────────────────────────────
export async function stageSchema(ctx) {
  const { rec } = ctx; const svc = ctx.api.service;
  await rec.check("C1", "C. Schema state", "All 16 expected application tables exist in the API schema", async () => {
    const missing = [];
    for (const t of TABLES) { const r = await svc.get(t, { limit: 0 }); if (r.status === 404 || r.code === "PGRST205" || r.code === "42P01") missing.push(t); }
    expect(missing.length === 0, `missing tables: ${missing.join(", ")} — migrations 001–012 are not fully installed`);
    return `${TABLES.length} tables present`;
  });
  await rec.check("C2", "C. Schema state", "Migration markers visible through the API: finance role, 'partially paid' status, archived_at, document_counters", async () => {
    const r = await svc.openapi();
    const defs = r.ok && r.body?.definitions;
    if (!defs) skip(`OpenAPI schema not available to the service key (HTTP ${r.status}); covered by the direct-database check when PHASE2C_DB_URL is set`);
    const role = defs.profiles?.properties?.role?.enum;
    const status = defs.invoices?.properties?.status?.enum;
    if (!role || !status) skip("OpenAPI schema does not list enum values on this project");
    expect(role.includes("finance"), "profiles.role does not include 'finance' — migration 011 is not applied");
    expect(status.includes("partially paid"), "invoice status does not include 'partially paid' — migration 008 is not applied");
    expect(!!defs.profiles?.properties?.archived_at, "profiles.archived_at missing — migration 010 is not applied");
    expect(!!defs.document_counters, "document_counters missing — migration 010 is not applied");
    return "011, 008, 010 markers present";
  }, { mandatory: false });
  await rec.check("C3", "C. Schema state", "Authorization helper functions from 012 exist (is_finance, can_access_finance) and return false in a server context", async () => {
    for (const fn of ["is_finance", "can_access_finance"]) {
      const r = await svc.rpc(fn);
      expect(r.ok, `${fn}: HTTP ${r.status}${r.code ? ` (${r.code})` : ""} — migration 012 is not applied or not executable`);
      expect(r.body === false, `${fn}() returned ${JSON.stringify(r.body)} for the service context (expected false)`);
    }
    ctx.financeInstalled = true;
    return "012 functions present";
  });
  if (rec.results.some((x) => x.id === "C1" && x.status === "FAIL")) ctx.abort = "schema incomplete";
}

// ── D: privileges (read-only) ───────────────────────────────────────────────
export async function stagePrivileges(ctx, { final = false } = {}) {
  const { rec } = ctx; const svc = ctx.api.service; const anon = ctx.api.anon;
  if (!final) {
    await rec.check("D1", "D. Table privileges", "service_role can SELECT every application table through PostgREST (no HTTP 403 / 42501)", async () => {
      const bad = [];
      for (const t of TABLES) { const r = await svc.get(t, { limit: 0 }); if (!r.ok) bad.push(`${t}(${r.status}${r.code ? ` ${r.code}` : ""})`); }
      if (bad.length) ctx.abort = "service_role cannot read tables";
      expect(bad.length === 0, `service_role blocked on: ${bad.join(", ")}. This is a table-privilege gap, not RLS. See docs/PHASE2C-PRIVILEGE-BOOTSTRAP-RECOMMENDATION.md`);
      return `${TABLES.length}/${TABLES.length} tables readable`;
    });
  }
  const id = final ? "ISO9" : "D2";
  await rec.check(id, final ? "I. Client isolation" : "D. Table privileges", final ? "After test data exists: an unauthenticated (anon-key) caller reads no rows from any table" : "anon-key caller reads no rows from any table", async () => {
    let refused = 0, empty = 0; const leaks = [];
    let publicCatalog = 0;
    for (const t of TABLES) {
      const r = await anon.get(t, { limit: 5 });
      if (denied(r)) refused++;
      else if (r.ok && Array.isArray(r.body) && r.body.length === 0) empty++;
      else if (PUBLIC_CATALOG.includes(t) && r.ok && Array.isArray(r.body) && r.body.every((x) => x.is_active === true)) publicCatalog++;
      else leaks.push(`${t}(HTTP ${r.status})`);
    }
    expect(leaks.length === 0, `anon can read: ${leaks.join(", ")}`);
    return `${refused} refused at privilege level, ${empty} returned empty${publicCatalog ? `, ${publicCatalog} show ACTIVE catalogue rows only (policies services_select / academy_courses_select_all are open to everyone by design once anon holds SELECT)` : ""}`;
  });
}

// ── E: read-only direct database checks (optional) ──────────────────────────
export async function stageDatabase(ctx) {
  const { rec } = ctx;
  const titles = [["E1", "Baseline SQL (docs/phase2c-baseline.sql) runs read-only"], ["E2", "RLS enabled on every application table; migration 010/011/012 markers all true"], ["E3", "Table privileges match the authorization model (required present; extras reported)"]];
  if (!ctx.dbQuery) { rec.skipAll("E. Direct database checks", titles, "PHASE2C_DB_URL not set (optional). Equivalent behaviour is proven through the API in stages H–L.", false); return; }
  const q = ctx.dbQuery;
  await rec.check("E1", "E. Direct database checks", titles[0][1], async () => {
    const sql = ctx.baselineSql || "";
    const stmts = sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    expect(stmts.length > 0, "baseline SQL file not found or empty");
    let n = 0;
    for (const s of stmts) { expect(/^select\b/i.test(s), "the baseline file contains a non-SELECT statement; refusing to run it"); await q(s); n++; }
    return `${n} baseline statements executed`;
  }, { mandatory: false });
  await rec.check("E2", "E. Direct database checks", titles[1][1], async () => {
    const rls = await q(`select c.relname as t, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`);
    const off = TABLES.filter((t) => rls.find((r) => r.t === t)?.rls !== true);
    expect(off.length === 0, `RLS is not enabled (or table missing) for: ${off.join(", ")}`);
    const m = (await q(`select
      exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='invoices_select_visible') as m010_invoice_policy,
      exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='app_role' and e.enumlabel='finance') as m011_finance_role,
      exists (select 1 from pg_proc where proname='can_access_finance') as m012_can_access_finance,
      exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='invoices_select_visible' and qual like '%can_access_finance%') as m012_invoice_select,
      exists (select 1 from pg_policies where schemaname='public' and tablename='service_catalog' and policyname='services_insert_admin') as m012_services_admin_only,
      not exists (select 1 from pg_policies where schemaname='public' and tablename='service_catalog' and policyname like '%_staff') as m012_no_staff_service_writes,
      exists (select 1 from pg_trigger where tgname='invoices_status_guard' or tgname like '%status_guard%') as invoice_status_guard`))[0];
    const falseOnes = Object.entries(m).filter(([, v]) => v !== true).map(([k]) => k);
    expect(falseOnes.length === 0, `markers not true: ${falseOnes.join(", ")}`);
    return `RLS on for ${TABLES.length} tables; ${Object.keys(m).length} migration markers true`;
  }, { mandatory: false });
  await rec.check("E3", "E. Direct database checks", titles[2][1], async () => {
    const missing = [], extra = []; const truncateOn = new Set();
    for (const role of Object.keys(PRIVILEGE_MODEL)) {
      for (const t of TABLES) {
        const want = new Set(PRIVILEGE_MODEL[role][t]);
        for (const p of ALL4) {
          const has = (await q(`select has_table_privilege('${role}','public.${t}','${p}') as h`))[0].h === true;
          if (want.has(p) && !has) missing.push(`${role}:${t}:${p}`);
          if (!want.has(p) && has) extra.push(`${role}:${t}:${p}`);
        }
        if (role !== "service_role" && (await q(`select has_table_privilege('${role}','public.${t}','TRUNCATE') as h`))[0].h === true) truncateOn.add(t);
      }
    }
    expect(missing.length === 0, `missing privileges: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ` … (+${missing.length - 12})` : ""}`);
    const notes = [];
    if (extra.length) notes.push(`${extra.length} privileges beyond the model (RLS still applies), e.g. ${extra.slice(0, 4).join(", ")}`);
    if (truncateOn.size) notes.push(`anon/authenticated hold TRUNCATE on ${truncateOn.size} tables (not reachable through the Data API; consider revoking in the bootstrap step)`);
    if (notes.length) return { warn: notes.join("; ") };
    return "required privileges present, none beyond the model";
  }, { mandatory: false });
}

export async function stageDatabaseFunctions(ctx) {
  if (!ctx.dbQuery) return;
  await ctx.rec.check("E4", "E. Direct database checks", "Signed-in users and the service role can EXECUTE the helper functions RLS policies call (is_staff, is_admin, is_finance, can_access_finance, owns_project)", async () => {
    const fns = ["is_staff", "is_admin", "is_finance", "can_access_finance", "owns_project"];
    const found = (await ctx.dbQuery(`select p.proname, p.oid::int as oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${fns.map((f) => `'${f}'`).join(",")})`));
    const missing = [];
    for (const f of found) for (const role of ["authenticated", "service_role"]) {
      const ok = (await ctx.dbQuery(`select has_function_privilege('${role}', ${f.oid}, 'EXECUTE') as h`))[0].h === true;
      if (!ok) missing.push(`${role}:${f.proname}`);
    }
    expect(found.length >= 4, `expected the RLS helper functions, found ${found.map((f) => f.proname).join(", ") || "none"}`);
    expect(missing.length === 0, `missing EXECUTE: ${missing.join(", ")} — RLS would fail with "permission denied for function" for signed-in users`);
    return `${found.length} helper functions executable by authenticated and service_role`;
  }, { mandatory: false });
}

// ── F/G: accounts (write gate) ──────────────────────────────────────────────
export async function stageAccounts(ctx) {
  const { rec } = ctx; const svc = ctx.api.service;
  await rec.check("F0", "F. Test accounts", "The target looks like a test database (few non-test profiles and invoices, no real Paystack payments)", async () => {
    const profiles = list(await svc.get("profiles", { select: "email", limit: 500 }), "profiles");
    const nonTest = profiles.filter((p) => !String(p.email).toLowerCase().endsWith("@example.test")).length;
    expect(nonTest <= 3, `${nonTest} profiles have real-looking emails; DEV should hold only test data plus at most 3 owner accounts. Refusing to write.`);
    const invoices = list(await svc.get("invoices", { select: "id,notes", limit: 1000 }), "invoices");
    const foreign = invoices.filter((i) => !String(i.notes || "").startsWith("PHASE2C")).length;
    expect(foreign <= 100, `${foreign} invoices that are not Phase 2C test rows exist; this does not look like a small test database. Refusing to write.`);
    const pay = list(await svc.get("payments", { select: "paystack_reference,paid_at", method: eq("paystack"), limit: 100 }), "payments");
    const real = pay.filter((p) => p.paid_at && !String(p.paystack_reference || "").startsWith("phase2c"));
    expect(real.length === 0, `${real.length} settled Paystack payments with non-test references exist; this looks like a live database. Refusing to write.`);
    return `${nonTest} non-test profile(s), ${foreign} non-test invoice(s), ${real.length} real Paystack payment(s)`;
  });
  if (rec.results.some((x) => x.id === "F0" && x.status === "FAIL")) { ctx.abort = "does not look like a test database"; return; }
  await rec.check("F1", "F. Test accounts", "Dedicated test accounts exist with the intended roles (admin, finance, staff, clientA, clientB)", async () => {
    const r = await seedTestAccounts({ client: ctx.client, includeFinance: ctx.financeInstalled !== false, file: ctx.accountsFile });
    expect(r.errors.length === 0, r.errors.join("; "));
    ctx.accounts = r.accounts;
    return Object.entries(r.actions).map(([n, a]) => `${n}: ${a}`).join(", ");
  });
  if (rec.results.some((x) => x.id === "F1" && x.status === "FAIL")) { ctx.abort = "test accounts unavailable"; return; }
  ctx.secrets.push(...Object.values(ctx.accounts).map((a) => a.password));
  await rec.check("G1", "G. Credential handling", "Credentials live only in the git-ignored local file; nothing was printed", async () => {
    const ig = ctx.readText?.(".gitignore");
    if (ig === undefined) return { warn: "no .gitignore found next to the scripts; make sure the credentials file is never committed" };
    const covered = ig.split(/\r?\n/).some((l) => l.trim() === ctx.accountsFileName);
    expect(covered, `${ctx.accountsFileName} is not listed in .gitignore`);
    return `${ctx.accountsFileName} is git-ignored; passwords are redacted from all output`;
  });
}

// ── H: authentication and role assignment through the real Auth/PostgREST APIs ─
export async function stageAuth(ctx) {
  const { rec } = ctx; const svc = ctx.api.service;
  ctx.users = {};
  await rec.check("H1", "H. Authentication", "Every test account signs in through Supabase Auth; a wrong password is rejected", async () => {
    for (const [name, a] of Object.entries(ctx.accounts)) {
      const s = await ctx.client.auth.signIn(a.email, a.password);
      expect(s.ok && s.body?.access_token, `${name}: sign-in failed (HTTP ${s.status})`);
      ctx.secrets.push(s.body.access_token);
      ctx.users[name] = { id: a.id, role: a.role, token: s.body.access_token, api: ctx.client.rest({ kind: "user", token: s.body.access_token }) };
    }
    const bad = await ctx.client.auth.signIn(ctx.accounts.clientA.email, "definitely-not-the-password-1A!");
    expect(!bad.ok && bad.status >= 400 && bad.status < 500, `wrong password was not rejected (HTTP ${bad.status})`);
    return `${Object.keys(ctx.users).length} accounts signed in`;
  });
  if (!Object.keys(ctx.users).length) { ctx.abort = "sign-in failed"; return; }
  await rec.check("H2", "H. Authentication", "Each account reads its own profile with its intended role (real session, PostgREST)", async () => {
    for (const [name, u] of Object.entries(ctx.users)) {
      const r = list(await u.api.get("profiles", { select: "id,role", id: eq(u.id) }), `${name} own profile`);
      expect(r.length === 1 && r[0].role === u.role, `${name}: expected role ${u.role}, got ${JSON.stringify(r.map((x) => x.role))}`);
    }
    return "admin/finance/staff/client roles confirmed";
  });
  await rec.check("H3", "H. Authentication", "Nobody can promote themselves; roles never change through the user API", async () => {
    const attempts = [["staff", "admin"], ["staff", "finance"], ["finance", "admin"], ["clientA", "admin"], ["clientA", "finance"], ["clientB", "staff"], ["admin", "finance"]];
    for (const [name, to] of attempts) {
      const u = ctx.users[name];
      const r = await u.api.patch("profiles", { id: eq(u.id) }, { role: to });
      expect(hidden(r), `${name} → ${to}: HTTP ${r.status} returned rows`);
      const now = list(await svc.get("profiles", { select: "role", id: eq(u.id) }), "role re-read");
      expect(now[0]?.role === u.role, `${name}'s role changed to ${now[0]?.role}`);
    }
    return `${attempts.length} escalation attempts rejected, roles unchanged`;
  });
  await rec.check("H4", "H. Authentication", "Sign-up metadata cannot choose a privileged role (handle_new_user forces client)", async () => {
    const email = `phase2c.signup.${ctx.runId}@example.test`;
    const c = await ctx.client.auth.adminCreate({ email, password: `${ctx.runId}Zz1!${ctx.runId}`, email_confirm: true, user_metadata: { role: "admin" }, app_metadata: { role: "admin" } });
    expect(c.ok && c.body?.id, `probe user create failed (HTTP ${c.status})`);
    try {
      const p = list(await svc.get("profiles", { select: "role", id: eq(c.body.id) }), "probe profile");
      expect(p[0]?.role === "client", `probe user got role ${p[0]?.role}`);
    } finally { await ctx.client.auth.adminDelete(c.body.id); }
    return "role forced to client; probe user removed";
  });
}

// ── S: scaffolding created through the roles that own each action ───────────
export async function stageData(ctx) {
  const { rec } = ctx; const svc = ctx.api.service; const U = ctx.users; const d = (ctx.data = {});
  const today = new Date().toISOString().slice(0, 10);
  await rec.check("S1", "S. Test data", "Admin creates projects, milestones, updates, deliverable rows, services (writes are allowed for Admin)", async () => {
    for (const k of ["A", "B"]) {
      const c = U[`client${k}`];
      const p = await U.admin.api.insert("projects", { client_id: c.id, title: tag(ctx, `project ${k}`), status: "active" });
      expect(p.ok && p.body?.[0]?.id, `project ${k}: HTTP ${p.status} ${p.code || ""}`);
      const pid = (d[`p${k}`] = p.body[0].id);
      const m = await U.admin.api.insert("project_milestones", { project_id: pid, title: tag(ctx, `milestone ${k}`) });
      expect(m.ok, `milestone ${k}: HTTP ${m.status} ${m.code || ""}`); d[`m${k}`] = m.body[0].id;
      for (const [key, internal] of [["pub", false], ["int", true]]) {
        const u = await U.admin.api.insert("project_updates", { project_id: pid, author_id: U.admin.id, content: tag(ctx, `${key} update ${k}`), is_internal: internal });
        expect(u.ok, `update ${k}/${key}: HTTP ${u.status} ${u.code || ""}`); d[`u${k}_${key}`] = u.body[0].id;
      }
      for (const [key, vis] of [["vis", true], ["hid", false]]) {
        const f = await U.admin.api.insert("deliverables", { project_id: pid, name: tag(ctx, `${key} deliverable ${k}`), file_url: `phase2c/${ctx.runId}/${k}-${key}.txt`, is_visible_to_client: vis });
        expect(f.ok, `deliverable ${k}/${key}: HTTP ${f.status} ${f.code || ""}`); d[`f${k}_${key}`] = f.body[0].id;
      }
      const b = await svc.insert("bookings", { client_id: c.id, type: "consultation", title: tag(ctx, `booking ${k}`) });
      expect(b.ok, `booking ${k}: HTTP ${b.status} ${b.code || ""}`); d[`b${k}`] = b.body[0].id;
    }
    const sA = await U.admin.api.insert("service_catalog", { name: tag(ctx, "active service"), is_active: true });
    const sI = await U.admin.api.insert("service_catalog", { name: tag(ctx, "inactive service"), is_active: false });
    expect(sA.ok && sI.ok, `admin service insert: HTTP ${sA.status}/${sI.status} ${sA.code || sI.code || ""}`);
    d.svcActive = sA.body[0].id; d.svcInactive = sI.body[0].id;
    const l = await svc.insert("leads", { name: tag(ctx, "lead"), email: "lead@example.test" });
    expect(l.ok, `lead: HTTP ${l.status} ${l.code || ""}`); d.lead = l.body[0].id;
    return "2 projects, milestones, public+internal updates, visible+hidden deliverables, bookings, 2 services, 1 lead";
  });
  if (!d.pA) { ctx.abort = "test data could not be created"; return; }
  await rec.check("S2", "S. Test data", "Finance creates invoices with line items; the database numbers them and computes totals", async () => {
    d.items = { dA: [[2, 50000], [1, 25000]], sA: [[2, 50000]], sB: [[1, 30000]] };
    for (const [key, client] of [["dA", "clientA"], ["sA", "clientA"], ["sB", "clientB"]]) {
      const inv = await U.finance.api.insert("invoices", { client_id: U[client].id, status: "draft", issue_date: today, tax_rate: 0, notes: tag(ctx, key) });
      expect(inv.ok && inv.body?.[0]?.id, `finance invoice ${key}: HTTP ${inv.status} ${inv.code || ""} ${inv.body?.message || ""}`);
      d[key] = inv.body[0].id;
      expect(/^[A-Z]+-\d{4}-\d+$/.test(inv.body[0].invoice_number || ""), `invoice ${key}: number "${inv.body[0].invoice_number}" is not generated by the database`);
      for (const [q, price] of d.items[key]) {
        const li = await U.finance.api.insert("invoice_line_items", { invoice_id: d[key], description: tag(ctx, "line"), quantity: q, unit_price: price });
        expect(li.ok, `line item ${key}: HTTP ${li.status} ${li.code || ""}`);
      }
      const back = list(await svc.get("invoices", { select: "total,subtotal", id: eq(d[key]) }), "invoice re-read");
      const want = d.items[key].reduce((s, [q, p]) => s + q * p, 0);
      expect(num(back[0].total) === want && Number.isFinite(num(back[0].total)), `invoice ${key}: total ${back[0].total}, expected ${want}`);
    }
    return "3 invoices numbered by the database, totals 125000 / 100000 / 30000";
  });
  await rec.check("S3", "S. Test data", "Finance issues invoices and records a payment; status and receipt follow the payment", async () => {
    for (const key of ["sA", "sB"]) {
      const r = await U.finance.api.patch("invoices", { id: eq(d[key]) }, { status: "sent" });
      expect(r.ok && r.body?.[0]?.status === "sent", `issue ${key}: HTTP ${r.status} ${r.code || ""} ${r.body?.message || ""}`);
    }
    const pay = await U.finance.api.insert("payments", { invoice_id: d.sA, amount: 40000, method: "cash", paid_at: new Date().toISOString() });
    expect(pay.ok && pay.body?.[0]?.id, `payment: HTTP ${pay.status} ${pay.code || ""} ${pay.body?.message || ""}`);
    d.payA = pay.body[0].id;
    const inv = list(await svc.get("invoices", { select: "status", id: eq(d.sA) }), "sA");
    expect(inv[0].status === "partially paid", `sA status after 40000/100000 is "${inv[0].status}"`);
    const rc = list(await svc.get("receipts", { select: "id,receipt_number", invoice_id: eq(d.sA) }), "receipts");
    expect(rc.length === 1, `expected 1 receipt for the payment, found ${rc.length}`);
    d.rcA = rc[0].id;
    return "sA sent → partially paid, one receipt created";
  });
  if (!d.rcA) ctx.abort = "finance data flow failed";
}

// ── I: client isolation ─────────────────────────────────────────────────────
// Robust to earlier runs: DEV keeps tagged rows from previous runs, so assertions are "everything visible is mine"
// plus "this run's other-client rows are absent", never exact counts.
export async function stageClients(ctx) {
  const { rec } = ctx; const svc = ctx.api.service; const U = ctx.users; const d = ctx.data;
  const mine = (rows, me, key = "client_id") => rows.every((r) => r[key] === me);
  const read = async (who, table, select) => list(await U[who].api.get(table, { select }), `${who} reads ${table}`);
  const cases = [["clientA", "A", "B"], ["clientB", "B", "A"]];
  for (const [who, me, other] of cases) {
    const my = U[who].id;
    await rec.check(`I-${me}1`, "I. Client isolation", `Client ${me} sees only its own profile, projects, milestones and non-internal updates`, async () => {
      const profiles = await read(who, "profiles", "id");
      expect(profiles.length === 1 && profiles[0].id === my, `sees ${profiles.length} profiles`);
      const projects = await read(who, "projects", "id,client_id");
      expect(mine(projects, my), `sees projects that belong to another client`);
      expect(projects.some((p) => p.id === d[`p${me}`]) && !projects.some((p) => p.id === d[`p${other}`]), "project isolation broken");
      const visible = new Set(projects.map((p) => p.id));
      const ms = await read(who, "project_milestones", "id,project_id");
      expect(ms.every((m) => visible.has(m.project_id)) && ms.some((m) => m.id === d[`m${me}`]) && !ms.some((m) => m.id === d[`m${other}`]), "milestone isolation broken");
      const ups = await read(who, "project_updates", "id,project_id,is_internal");
      expect(ups.every((u) => visible.has(u.project_id)), `sees updates of another client's project`);
      expect(ups.some((u) => u.id === d[`u${me}_pub`]), "own public update not visible");
      expect(!ups.some((u) => u.is_internal === true) && !ups.some((u) => u.id === d[`u${me}_int`]), "INTERNAL update is visible to the client");
      expect(hidden(await U[who].api.get("projects", { id: eq(d[`p${other}`]) })), `direct fetch of ${other}'s project returned data`);
      return "own data only; internal updates hidden";
    });
    await rec.check(`I-${me}2`, "I. Client isolation", `Client ${me} sees only visible deliverables and its own bookings`, async () => {
      const projects = new Set((await read(who, "projects", "id")).map((p) => p.id));
      const dl = await read(who, "deliverables", "id,project_id,is_visible_to_client");
      expect(dl.every((x) => projects.has(x.project_id)), "sees deliverables of another client's project");
      expect(dl.some((x) => x.id === d[`f${me}_vis`]), "visible deliverable not shown");
      expect(!dl.some((x) => x.is_visible_to_client === false) && !dl.some((x) => x.id === d[`f${me}_hid`]), "HIDDEN deliverable is visible to the client");
      const bk = await read(who, "bookings", "id,client_id");
      expect(mine(bk, my) && bk.some((b) => b.id === d[`b${me}`]) && !bk.some((b) => b.id === d[`b${other}`]), "booking isolation broken");
      return "deliverable visibility and bookings isolated";
    });
    await rec.check(`I-${me}3`, "I. Client isolation", `Client ${me} sees only its own issued invoices, line items, payments and receipts — never drafts or another client's`, async () => {
      const inv = await read(who, "invoices", "id,client_id,status");
      expect(mine(inv, my), "sees another client's invoice");
      expect(!inv.some((i) => i.status === "draft"), "DRAFT invoice is visible to the client");
      expect(inv.some((i) => i.id === d[`s${me}`]) && !inv.some((i) => i.id === d[`s${other}`]), "issued-invoice isolation broken");
      if (me === "A") expect(!inv.some((i) => i.id === d.dA), "own draft is visible to the client");
      const ids = new Set(inv.map((i) => i.id));
      const lines = await read(who, "invoice_line_items", "invoice_id");
      expect(lines.every((l) => ids.has(l.invoice_id)), "line items of a hidden invoice are visible");
      const pays = await read(who, "payments", "id,invoice_id"); const rcs = await read(who, "receipts", "id,invoice_id");
      expect(pays.every((p) => ids.has(p.invoice_id)) && rcs.every((r) => ids.has(r.invoice_id)), "payments/receipts of a hidden invoice are visible");
      if (me === "A") expect(pays.some((p) => p.id === d.payA) && rcs.some((r) => r.id === d.rcA), "own payment/receipt not visible");
      else expect(!pays.some((p) => p.id === d.payA) && !rcs.some((r) => r.id === d.rcA), "sees client A's payment/receipt");
      for (const [t, f] of [["invoices", { id: eq(d[`s${other}`]) }], ["invoice_line_items", { invoice_id: eq(d[`s${other}`]) }], ["payments", { invoice_id: eq(d[`s${other}`]) }], ["receipts", { invoice_id: eq(d[`s${other}`]) }]]) {
        expect(hidden(await U[who].api.get(t, f)), `direct read of ${t} for the other client's invoice returned data`);
      }
      return "invoice, line item, payment and receipt isolation holds";
    });
  }
  await rec.check("I4", "I. Client isolation", "Clients cannot create or change invoices, payments, other clients' projects, or delete anything of another client", async () => {
    const a = U.clientA.api;
    const before = list(await svc.get("payments", { select: "id", invoice_id: eq(d.sA) }), "payments").length;
    const probes = [
      ["insert invoice", await a.insert("invoices", { client_id: U.clientA.id, notes: tag(ctx, "PROBE client invoice") })],
      ["insert payment", await a.insert("payments", { invoice_id: d.sA, amount: 1, method: "cash", paid_at: new Date().toISOString() })],
      ["update own invoice status", await a.patch("invoices", { id: eq(d.sA) }, { status: "cancelled" })],
      ["update B's project", await a.patch("projects", { id: eq(d.pB) }, { title: "hacked" })],
      ["delete B's project", await a.delete("projects", { id: eq(d.pB) })],
      ["insert update on B's project", await a.insert("project_updates", { project_id: d.pB, author_id: U.clientA.id, content: "x" })],
    ];
    for (const [label, r] of probes) expect(hidden(r), `${label}: HTTP ${r.status} succeeded`);
    const probeInv = list(await svc.get("invoices", { select: "id", notes: `like.${tag(ctx, "PROBE")}*` }), "probe invoices");
    expect(probeInv.length === 0, "a client-created invoice exists");
    expect(list(await svc.get("payments", { select: "id", invoice_id: eq(d.sA) }), "payments").length === before, "payment count for sA changed");
    expect(list(await svc.get("invoices", { select: "status", id: eq(d.sA) }), "sA")[0].status === "partially paid", "client changed the invoice status");
    const pb = list(await svc.get("projects", { select: "title", id: eq(d.pB) }), "pB");
    expect(pb.length === 1 && pb[0].title === tag(ctx, "project B"), "client changed or deleted another client's project");
    return `${probes.length} write attempts blocked, state unchanged`;
  });
  await rec.check("I5", "I. Client isolation", "Clients cannot read leads, audit logs, document counters or inactive services, and cannot call the number generators", async () => {
    for (const who of ["clientA", "clientB"]) {
      const a = U[who].api;
      for (const t of ["leads", "audit_logs", "document_counters"]) expect(hidden(await a.get(t)), `${who} can read ${t}`);
      const svcs = list(await a.get("service_catalog"), "services");
      expect(svcs.every((s) => s.is_active === true) && !svcs.some((s) => s.id === d.svcInactive), `${who} sees inactive services`);
      for (const fn of ["generate_invoice_number", "generate_receipt_number"]) expect(denied(await a.rpc(fn)), `${who} can call ${fn}`);
    }
    return "restricted tables and RPCs blocked for clients";
  });
  await stagePrivileges(ctx, { final: true });
}

// ── J: finance ──────────────────────────────────────────────────────────────
export async function stageFinance(ctx) {
  const { rec } = ctx; const svc = ctx.api.service; const F = ctx.users.finance.api; const d = ctx.data; const U = ctx.users;
  await rec.check("J1", "J. Finance", "Finance reads Clients (client profiles only) and Projects/milestones, but not admin/staff profiles", async () => {
    const p = list(await F.get("profiles", { select: "id,role" }), "profiles");
    expect(p.some((x) => x.id === U.clientA.id) && p.some((x) => x.id === U.clientB.id), "finance cannot read client profiles");
    const priv = p.filter((x) => x.id !== U.finance.id && x.role !== "client");
    expect(priv.length === 0, `finance can read ${priv.length} admin/staff/finance profiles`);
    const pr = idsOf(await F.get("projects")); const ms = idsOf(await F.get("project_milestones"));
    expect(pr.includes(d.pA) && pr.includes(d.pB), "finance cannot read projects");
    expect(ms.includes(d.mA) && ms.includes(d.mB), "finance cannot read milestones");
    return "clients, projects, milestones readable; staff/admin profiles hidden";
  });
  await rec.check("J2", "J. Finance", "Finance reads Invoices (including drafts), line items, Payments (history) and Receipts", async () => {
    const inv = idsOf(await F.get("invoices"));
    expect([d.dA, d.sA, d.sB].every((i) => inv.includes(i)), "finance cannot read all invoices incl. drafts");
    expect((await F.get("invoice_line_items", { invoice_id: eq(d.dA) })).body?.length === 2, "finance cannot read line items");
    expect(idsOf(await F.get("payments", { invoice_id: eq(d.sA) })).includes(d.payA), "finance cannot read payment history");
    expect(idsOf(await F.get("receipts", { invoice_id: eq(d.sA) })).includes(d.rcA), "finance cannot read receipts");
    return "all finance tables readable";
  });
  await rec.check("J3", "J. Finance", "Reports: totals computed from what Finance can read equal the expected figures", async () => {
    const inv = list(await F.get("invoices", { select: "total,status", notes: `like.${tag(ctx)}*` }), "report invoices");
    const billed = inv.reduce((s, r) => s + num(r.total), 0);
    expect(billed === 125000 + 100000 + 30000, `billed total ${billed}, expected 255000`);
    const pays = list(await F.get("payments", { select: "amount", invoice_id: inList([d.dA, d.sA, d.sB]) }), "report payments");
    const paid = pays.reduce((s, r) => s + num(r.amount), 0);
    expect(paid === 40000, `collected total ${paid}, expected 40000`);
    return "billed 255000, collected 40000 (as expected)";
  });
  await rec.check("J4", "J. Finance", "Finance can edit a draft invoice, add/remove its line items, and issue it", async () => {
    const e = await F.patch("invoices", { id: eq(d.dA) }, { notes: tag(ctx, "dA edited"), due_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) });
    expect(e.ok && e.body?.length === 1, `edit draft: HTTP ${e.status} ${e.code || ""}`);
    const add = await F.insert("invoice_line_items", { invoice_id: d.dA, description: tag(ctx, "extra"), quantity: 1, unit_price: 5000 });
    expect(add.ok, `add line: HTTP ${add.status}`);
    const rm = await F.delete("invoice_line_items", { id: eq(add.body[0].id) });
    expect(rm.ok && rm.body?.length === 1, `remove line: HTTP ${rm.status}`);
    const back = list(await svc.get("invoices", { select: "total", id: eq(d.dA) }), "dA");
    expect(num(back[0].total) === 125000, `draft total after add+remove is ${back[0].total}`);
    return "edit, add line, remove line, totals recomputed";
  });
  await rec.check("J5", "J. Finance", "Finance is NOT Admin or Staff: no internal updates, leads, audit logs; no project/service/role writes; cannot delete invoices", async () => {
    for (const t of ["project_updates", "leads", "audit_logs", "document_counters"]) expect(hidden(await F.get(t)), `finance can read ${t}`);
    const blocked = [
      ["insert project", await F.insert("projects", { client_id: U.clientA.id, title: tag(ctx, "PROBE finance project") })],
      ["update project", await F.patch("projects", { id: eq(d.pA) }, { title: "hacked" })],
      ["insert service", await F.insert("service_catalog", { name: tag(ctx, "PROBE finance service") })],
      ["update service", await F.patch("service_catalog", { id: eq(d.svcActive) }, { name: "hacked" })],
      ["delete service", await F.delete("service_catalog", { id: eq(d.svcActive) })],
      ["change a client's role", await F.patch("profiles", { id: eq(U.clientA.id) }, { role: "finance" })],
      ["change staff's role", await F.patch("profiles", { id: eq(U.staff.id) }, { role: "admin" })],
      ["delete invoice", await F.delete("invoices", { id: eq(d.sB) })],
      ["delete payment", await F.delete("payments", { id: eq(d.payA) })],
    ];
    for (const [label, r] of blocked) expect(hidden(r), `${label}: HTTP ${r.status} succeeded`);
    expect(list(await svc.get("invoices", { select: "id", id: eq(d.sB) }), "sB").length === 1, "finance deleted an invoice");
    expect(list(await svc.get("payments", { select: "id", id: eq(d.payA) }), "payA").length === 1, "a payment was deleted");
    expect(list(await svc.get("profiles", { select: "role", id: eq(U.clientA.id) }), "clientA").at(0)?.role === "client", "client role changed");
    expect(list(await svc.get("profiles", { select: "role", id: eq(U.staff.id) }), "staff").at(0)?.role === "staff", "staff role changed");
    expect(list(await svc.get("service_catalog", { select: "name", id: eq(d.svcActive) }), "svc").at(0)?.name === tag(ctx, "active service"), "service changed");
    return `${blocked.length} forbidden actions blocked, state unchanged`;
  });
  await rec.check("J6", "J. Finance", "Finance cannot read operational-only tables (bookings, project assignments)", async () => {
    const b = await F.get("bookings"); const a = await F.get("project_assignments");
    expect(hidden(b) && hidden(a), "finance can read bookings or project assignments");
    return "bookings and assignments hidden from finance";
  });
}

// ── K: staff ────────────────────────────────────────────────────────────────
export async function stageStaff(ctx) {
  const { rec } = ctx; const svc = ctx.api.service; const S = ctx.users.staff.api; const d = ctx.data; const U = ctx.users;
  await rec.check("K1", "K. Staff", "Staff cannot read invoices, line items, payments or receipts, and financial aggregates are empty", async () => {
    for (const t of ["invoices", "invoice_line_items", "payments", "receipts"]) {
      const r = await S.get(t);
      expect(hidden(r), `staff can read ${t} (${r.body?.length} rows)`);
    }
    const inv = await S.get("invoices", { select: "total" }); const pay = await S.get("payments", { select: "amount" });
    const sum = (r) => (Array.isArray(r.body) ? r.body.reduce((s, x) => s + num(x.total ?? x.amount), 0) : 0);
    expect(sum(inv) === 0 && sum(pay) === 0, "staff can total financial records");
    for (const [t, f] of [["invoices", { id: eq(d.sA) }], ["payments", { id: eq(d.payA) }], ["receipts", { id: eq(d.rcA) }]]) expect(hidden(await S.get(t, f)), `staff reads ${t} by id`);
    return "all four finance tables hidden from staff";
  });
  await rec.check("K2", "K. Staff", "Staff cannot create or change financial records or call the invoice-number generator", async () => {
    const blocked = [
      ["insert invoice", await S.insert("invoices", { client_id: U.clientA.id, notes: tag(ctx, "PROBE staff invoice") })],
      ["update invoice", await S.patch("invoices", { id: eq(d.dA) }, { notes: "hacked" })],
      ["insert payment", await S.insert("payments", { invoice_id: d.sA, amount: 1, method: "cash", paid_at: new Date().toISOString() })],
      ["rpc generate_invoice_number", await S.rpc("generate_invoice_number")],
    ];
    for (const [label, r] of blocked) expect(hidden(r) || denied(r), `${label}: HTTP ${r.status} succeeded`);
    expect(list(await svc.get("invoices", { select: "id", notes: `like.${tag(ctx, "PROBE")}*` }), "probe").length === 0, "a staff-created invoice exists");
    expect(list(await svc.get("payments", { select: "id", invoice_id: eq(d.sA) }), "pays").length === 1, "payments changed");
    return "finance writes blocked for staff";
  });
  await rec.check("K3", "K. Staff", "Staff can read Services (active and inactive) but cannot create, edit, delete or reprice them", async () => {
    const ids = idsOf(await S.get("service_catalog"));
    expect(ids.includes(d.svcActive) && ids.includes(d.svcInactive), "staff cannot read all services");
    const blocked = [
      ["insert", await S.insert("service_catalog", { name: tag(ctx, "PROBE staff service") })],
      ["update name", await S.patch("service_catalog", { id: eq(d.svcActive) }, { name: "hacked" })],
      ["reprice", await S.patch("service_catalog", { id: eq(d.svcActive) }, { price_ugx: 1 })],
      ["delete", await S.delete("service_catalog", { id: eq(d.svcInactive) })],
    ];
    for (const [label, r] of blocked) expect(hidden(r), `staff ${label}: HTTP ${r.status} succeeded`);
    const rows = list(await svc.get("service_catalog", { select: "id,name,price_ugx", id: inList([d.svcActive, d.svcInactive]) }), "services");
    expect(rows.length === 2 && rows.find((r) => r.id === d.svcActive)?.name === tag(ctx, "active service") && rows.find((r) => r.id === d.svcActive)?.price_ugx == null, "the catalogue changed");
    return "read-only Services confirmed";
  });
  await rec.check("K4", "K. Staff", "Staff keep operational access: leads, projects, internal updates; but not audit logs", async () => {
    expect(idsOf(await S.get("leads")).includes(d.lead), "staff cannot read leads");
    expect(idsOf(await S.get("projects")).includes(d.pA), "staff cannot read projects");
    expect(idsOf(await S.get("project_updates")).includes(d.uA_int), "staff cannot read internal updates");
    expect(hidden(await S.get("audit_logs")), "staff can read audit logs");
    expect(hidden(await S.get("document_counters")), "staff can read document counters");
    return "operational reads intact; audit logs hidden";
  });
  await rec.check("K5", "K. Staff", "Admin still sees everything and is the only role that writes Services", async () => {
    const A = U.admin.api;
    for (const t of ["invoices", "payments", "receipts", "leads"]) { const r = await A.get(t, { limit: 1 }); expect(r.ok && r.body.length > 0, `admin cannot read ${t}`); }
    expect((await A.get("audit_logs", { limit: 1 })).ok, "admin cannot read audit_logs");
    const up = await A.patch("service_catalog", { id: eq(d.svcActive) }, { description: tag(ctx, "admin edit") });
    expect(up.ok && up.body?.length === 1, `admin service update: HTTP ${up.status}`);
    return "admin reads and writes as designed";
  });
}

// ── L: invoice lifecycle ────────────────────────────────────────────────────
export async function stageLifecycle(ctx) {
  const { rec } = ctx; const svc = ctx.api.service; const F = ctx.users.finance.api; const A = ctx.users.admin.api; const d = ctx.data;
  const today = new Date().toISOString().slice(0, 10);
  const statusOf = async (id) => list(await svc.get("invoices", { select: "status", id: eq(id) }), "status")[0]?.status;
  async function make(total = 1000, to = "draft") {
    const r = await F.insert("invoices", { client_id: ctx.users.clientA.id, status: "draft", issue_date: today, tax_rate: 0, notes: tag(ctx, "lifecycle") });
    expect(r.ok, `create: HTTP ${r.status} ${r.code || ""}`); const id = r.body[0].id;
    const li = await F.insert("invoice_line_items", { invoice_id: id, description: tag(ctx, "line"), quantity: 1, unit_price: total }); expect(li.ok, `line: HTTP ${li.status}`);
    if (to !== "draft") { const s = await F.patch("invoices", { id: eq(id) }, { status: to }); expect(s.ok, `issue: HTTP ${s.status} ${s.body?.message || ""}`); }
    return id;
  }
  const pay = (id, amount, extra = {}) => F.insert("payments", { invoice_id: id, amount, method: "cash", paid_at: new Date().toISOString(), ...extra });
  const rejected = async (label, r, id, still) => { expect(!r.ok && r.status >= 400 && r.status < 500, `${label}: not rejected (HTTP ${r.status})`); expect((await statusOf(id)) === still, `${label}: status changed to ${await statusOf(id)}`); };

  await rec.check("L1", "L. Invoice lifecycle", "An issued invoice can never return to DRAFT (sent, overdue, cancelled) — Finance, Admin and even the service role are refused", async () => {
    for (const from of ["sent", "overdue", "cancelled"]) {
      const id = await make(1000, "sent");
      if (from !== "sent") expect((await F.patch("invoices", { id: eq(id) }, { status: from })).ok, `to ${from}`);
      await rejected(`finance ${from}→draft`, await F.patch("invoices", { id: eq(id) }, { status: "draft" }), id, from);
      await rejected(`admin ${from}→draft`, await A.patch("invoices", { id: eq(id) }, { status: "draft" }), id, from);
      await rejected(`service ${from}→draft`, await svc.patch("invoices", { id: eq(id) }, { status: "draft" }), id, from);
    }
    return "9 attempts rejected by the database";
  });
  await rec.check("L2", "L. Invoice lifecycle", "PAID and PARTIALLY PAID invoices cannot be CANCELLED (any role, service role included)", async () => {
    const p = await make(1000, "sent"); expect((await pay(p, 400)).ok, "partial payment");
    expect((await statusOf(p)) === "partially paid", `expected partially paid, got ${await statusOf(p)}`);
    await rejected("finance partial→cancelled", await F.patch("invoices", { id: eq(p) }, { status: "cancelled" }), p, "partially paid");
    await rejected("service partial→cancelled", await svc.patch("invoices", { id: eq(p) }, { status: "cancelled" }), p, "partially paid");
    expect((await pay(p, 600)).ok, "final payment"); expect((await statusOf(p)) === "paid", `expected paid, got ${await statusOf(p)}`);
    await rejected("finance paid→cancelled", await F.patch("invoices", { id: eq(p) }, { status: "cancelled" }), p, "paid");
    await rejected("admin paid→cancelled", await A.patch("invoices", { id: eq(p) }, { status: "cancelled" }), p, "paid");
    await rejected("service paid→cancelled", await svc.patch("invoices", { id: eq(p) }, { status: "cancelled" }), p, "paid");
    await rejected("paid→sent", await F.patch("invoices", { id: eq(p) }, { status: "sent" }), p, "paid");
    return "6 attempts rejected; issued record preserved";
  });
  await rec.check("L3", "L. Invoice lifecycle", "Paid / partially paid can be reached only through recorded payments", async () => {
    const id = await make(1000, "sent");
    await rejected("unpaid→paid", await F.patch("invoices", { id: eq(id) }, { status: "paid" }), id, "sent");
    await rejected("unpaid→partially paid", await F.patch("invoices", { id: eq(id) }, { status: "partially paid" }), id, "sent");
    return "manual paid/partial refused";
  });
  await rec.check("L4", "L. Invoice lifecycle", "Valid transitions still work: draft→sent→overdue→sent→cancelled, draft→cancelled, payments settle to paid", async () => {
    const a = await make(1000, "draft");
    for (const s of ["sent", "overdue", "sent", "cancelled"]) { const r = await F.patch("invoices", { id: eq(a) }, { status: s }); expect(r.ok, `${s}: HTTP ${r.status} ${r.body?.message || ""}`); }
    const b = await make(1000, "draft"); expect((await F.patch("invoices", { id: eq(b) }, { status: "cancelled" })).ok, "draft→cancelled");
    const c = await make(100, "sent"); expect((await pay(c, 30)).ok && (await pay(c, 70)).ok, "payments"); expect((await statusOf(c)) === "paid", "sent→paid via payments");
    const e = await make(100, "sent");
    const ps = await svc.insert("payments", { invoice_id: e, amount: 100, method: "paystack", paid_at: new Date().toISOString(), paystack_reference: `phase2c-${ctx.runId}-1` });
    expect(ps.ok, `Paystack-style settlement (no Paystack call): HTTP ${ps.status} ${ps.body?.message || ""}`);
    expect((await statusOf(e)) === "paid", "Paystack-style payment did not settle the invoice");
    return "cancel paths, payment settlement and a Paystack-style server settlement all work";
  });
  await rec.check("L5", "L. Invoice lifecycle", "Every payment produced a receipt with a unique number; payment history is complete", async () => {
    const pays = list(await F.get("payments", { select: "id,invoice_id", limit: 500 }), "payments");
    const rc = list(await F.get("receipts", { select: "id,payment_id,receipt_number", limit: 500 }), "receipts");
    const nums = rc.map((r) => r.receipt_number);
    expect(new Set(nums).size === nums.length, "duplicate receipt numbers");
    expect(nums.every((n) => /^[A-Z]+-\d{4}-\d+$/.test(n)), "receipt number format");
    const haveReceipt = new Set(rc.map((r) => r.payment_id));
    expect(pays.every((p) => haveReceipt.has(p.id)), "a payment has no receipt");
    return `${pays.length} payments, ${rc.length} receipts, numbers unique`;
  });
}

// ── M: storage ──────────────────────────────────────────────────────────────
export async function stageStorage(ctx) {
  const { rec } = ctx; const st = ctx.client.storage; const U = ctx.users;
  const path = `phase2c/${ctx.runId}/probe.txt`;
  for (const bucket of ["deliverables", "finance-docs"]) {
    await rec.check(`M-${bucket}`, "M. Storage", `Bucket "${bucket}" is private: no public URL, no direct read for any role; only server-issued signed URLs work`, async () => {
      const b = await st.bucket(bucket);
      expect(b.ok, `bucket lookup: HTTP ${b.status} — bucket missing (migration 002/003 not applied?)`);
      expect(b.body?.public === false, `bucket is PUBLIC`);
      const up = await st.upload(bucket, path, `phase2c probe ${ctx.runId}`);
      expect(up.ok, `service upload: HTTP ${up.status}`);
      try {
        const pub = await st.publicGet(bucket, path);
        expect(!pub.ok, `public URL returned HTTP ${pub.status}`);
        for (const who of ["admin", "finance", "staff", "clientA", "clientB"]) {
          const r = await st.authedGet(bucket, path, U[who].token);
          expect(!r.ok, `${who} can read the object directly (HTTP ${r.status}); a storage policy exists that the migrations do not define`);
        }
        const s = await st.sign(bucket, path, 60);
        expect(s.ok && typeof s.body?.signedURL === "string", `sign: HTTP ${s.status}`);
        ctx.secrets.push(s.body.signedURL);
        const good = await st.fetchSigned(s.body.signedURL);
        expect(good.ok, `signed URL did not work (HTTP ${good.status})`);
        const tampered = s.body.signedURL.replace(/(token=[^&]{5})([^&])/, (_, a, c) => `${a}${c === "A" ? "B" : "A"}`);
        const bad = await st.fetchSigned(tampered);
        expect(!bad.ok, `a tampered signed URL returned HTTP ${bad.status}`);
      } finally { await st.remove(bucket, path); }
      return "private; direct and public reads refused for every role; signed URL works, tampered URL refused; probe removed";
    });
  }
}
