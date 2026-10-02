// A local stand-in for the hosted Supabase HTTP surface (Auth, PostgREST, Storage), backed by REAL Postgres
// (PGlite) with the project's migrations 001–012. It exists so the Phase 2C verification workflow can be run
// end to end in tests. It is NOT Supabase: only the subset of behaviour the workflow uses is emulated, and the
// real hosted run remains the source of truth for transport, Auth, grants and Storage.
//
// Table grants mirror the hosted DEV project (no automatic grants) plus the proposed bootstrap SQL in
// docs/proposed-013-table-privileges.sql, so the suite also proves that SQL is sufficient.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { createDb } from "./db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const DEV_REF = "outuocpsotiozkpyksex";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const makeJwt = (payload) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.${randomBytes(16).toString("base64url")}`;
export const proposedGrantsSql = () => readFileSync(join(here, "..", "..", "docs", "proposed-013-table-privileges.sql"), "utf8");

const IDENT = /^[a-z_][a-z0-9_]*$/;
const json = (status, obj) => new Response(obj === undefined ? "" : JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/**
 * @param {{grants?: "recommended"|"harness-all"|"none", afterSetupSql?: string, ref?: string}} opts
 */
export async function createFakeSupabase({ grants = "recommended", afterSetupSql, ref = DEV_REF } = {}) {
  const db = await createDb(); // migrations 001–012, harness grants
  if (grants !== "harness-all") {
    await db.exec(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
                   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;`);
    if (grants === "recommended") await db.exec(proposedGrantsSql());
  }
  if (afterSetupSql) await db.exec(afterSetupSql);

  const anonKey = makeJwt({ role: "anon", ref, iss: "supabase" });
  const serviceKey = makeJwt({ role: "service_role", ref, iss: "supabase" });
  const users = new Map();   // email -> { id, password }
  const tokens = new Map();  // access token -> user id
  const objects = new Map(); // "bucket/path" -> text
  const signed = new Map();  // token -> "bucket/path"
  const calls = { total: 0, writes: 0 };

  let chain = Promise.resolve();
  const serial = (fn) => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };

  const tableNames = async () => (await db.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).rows.map((r) => r.table_name);

  async function asRole(p, fn) {
    await db.exec("BEGIN");
    try {
      await db.exec(`SET LOCAL ROLE ${p.role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [p.sub || ""]);
      const r = await fn();
      await db.exec("COMMIT");
      return r;
    } catch (e) { await db.exec("ROLLBACK"); throw e; }
  }
  const pgError = (e, p) => {
    const code = e.code || "XX000";
    const status = code === "42501" ? (p.role === "anon" ? 401 : 403) : code === "23505" || code === "23503" ? 409 : code === "42883" ? 404 : 400;
    return json(status, { code, message: String(e.message).replace(/^.*?:\s*/, (m) => m), details: null, hint: null });
  };

  function principal(h) {
    const apikey = h.apikey;
    if (apikey !== anonKey && apikey !== serviceKey) return { error: json(401, { message: "Invalid API key" }) };
    const bearer = (h.authorization || "").replace(/^Bearer\s+/i, "");
    if (!bearer || bearer === anonKey) return { role: "anon" };
    if (bearer === serviceKey) return { role: "service_role" };
    if (tokens.has(bearer)) return { role: "authenticated", sub: tokens.get(bearer) };
    return { error: json(401, { message: "JWT expired or invalid" }) };
  }

  function filters(params, args) {
    const where = [];
    for (const [k, v] of params) {
      if (["select", "limit", "order", "offset", "columns", "on_conflict"].includes(k)) continue;
      if (!IDENT.test(k)) throw Object.assign(new Error("bad column"), { code: "PGRST100" });
      const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/.exec(v);
      if (!m) throw Object.assign(new Error(`bad filter ${k}`), { code: "PGRST100" });
      const [, neg, op, val] = m;
      let cond;
      if (op === "is") cond = `${k} IS ${val === "null" ? "NULL" : val === "true" ? "TRUE" : "FALSE"}`;
      else if (op === "in") {
        const items = val.replace(/^\(|\)$/g, "").split(",").filter(Boolean);
        cond = `${k} IN (${items.map((it) => { args.push(it); return `$${args.length}`; }).join(",")})`;
      } else if (op === "like" || op === "ilike") { args.push(val.replaceAll("*", "%")); cond = `${k}::text ${op.toUpperCase()} $${args.length}`; }
      else { args.push(val); cond = `${k} ${{ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} $${args.length}`; }
      where.push(neg ? `NOT (${cond})` : cond);
    }
    return where.length ? ` WHERE ${where.join(" AND ")}` : "";
  }
  const selectList = (s) => {
    if (!s || s === "*") return "*";
    const cols = s.split(",");
    if (!cols.every((c) => IDENT.test(c))) throw Object.assign(new Error("unsupported select"), { code: "PGRST100" });
    return cols.join(",");
  };
  const serialize = (v) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

  async function rest(method, path, params, h, bodyText, p) {
    const name = path.replace(/^\/rest\/v1\/?/, "");
    if (name === "") {
      if (p.role !== "service_role") return json(401, { message: "OpenAPI is restricted" });
      const cols = (await db.query(`select c.table_name t, c.column_name col, c.udt_name udt, c.data_type dt from information_schema.columns c join information_schema.tables tb on tb.table_name=c.table_name and tb.table_schema=c.table_schema where c.table_schema='public' and tb.table_type='BASE TABLE'`)).rows;
      const enums = (await db.query(`select t.typname, e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid order by e.enumsortorder`)).rows;
      const definitions = {};
      for (const c of cols) {
        const d = (definitions[c.t] ||= { properties: {} });
        const labels = enums.filter((e) => e.typname === c.udt).map((e) => e.enumlabel);
        d.properties[c.col] = { format: c.udt, type: "string", ...(labels.length ? { enum: labels } : {}) };
      }
      return json(200, { swagger: "2.0", definitions });
    }
    if (name.startsWith("rpc/")) {
      const fn = name.slice(4);
      if (!IDENT.test(fn)) return json(404, { code: "PGRST202", message: "no such function" });
      const body = bodyText ? JSON.parse(bodyText) : {};
      const keys = Object.keys(body);
      if (!keys.every((k) => IDENT.test(k))) return json(400, { code: "PGRST100", message: "bad args" });
      try {
        const rows = await asRole(p, async () => (await db.query(`SELECT public.${fn}(${keys.map((k, i) => `${k} := $${i + 1}`).join(",")}) AS r`, keys.map((k) => serialize(body[k])))).rows);
        return json(200, rows[0]?.r ?? null);
      } catch (e) { return e.code === "42883" ? json(404, { code: "PGRST202", message: "function not found" }) : pgError(e, p); }
    }
    if (!IDENT.test(name) || !(await tableNames()).includes(name)) return json(404, { code: "PGRST205", message: `Could not find the table 'public.${name}' in the schema cache` });
    const prefer = h.prefer || "";
    const wantRows = /return=representation/.test(prefer);
    try {
      const args = [];
      if (method === "GET") {
        const where = filters(params, args);
        const lim = params.get("limit"); const ord = params.get("order");
        const order = ord && /^[a-z_]+\.(asc|desc)$/.test(ord) ? ` ORDER BY ${ord.replace(".", " ")}` : "";
        const rows = await asRole(p, async () => (await db.query(`SELECT ${selectList(params.get("select"))} FROM public.${name}${where}${order}${lim !== null ? ` LIMIT ${parseInt(lim, 10)}` : ""}`, args)).rows);
        return json(200, rows);
      }
      calls.writes++;
      if (method === "POST") {
        const body = JSON.parse(bodyText || "{}");
        const list = Array.isArray(body) ? body : [body];
        const cols = Object.keys(list[0] || {});
        if (!cols.every((c) => IDENT.test(c))) return json(400, { code: "PGRST100", message: "bad column" });
        const vals = list.flatMap((r) => cols.map((c) => serialize(r[c] ?? null)));
        const tuples = list.map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(",")})`).join(",");
        const sql = cols.length ? `INSERT INTO public.${name} (${cols.join(",")}) VALUES ${tuples}` : `INSERT INTO public.${name} DEFAULT VALUES`;
        const rows = await asRole(p, async () => (await db.query(`${sql}${wantRows ? " RETURNING *" : ""}`, vals)).rows);
        return wantRows ? json(201, rows) : new Response("", { status: 201 });
      }
      if (method === "PATCH" || method === "DELETE") {
        const where = filters(params, args);
        if (!where) return json(400, { code: "21000", message: `${method} requires a WHERE clause` });
        let sql;
        if (method === "PATCH") {
          const body = JSON.parse(bodyText || "{}"); const cols = Object.keys(body);
          if (!cols.length || !cols.every((c) => IDENT.test(c))) return json(400, { code: "PGRST100", message: "bad body" });
          const sets = cols.map((c) => { args.push(serialize(body[c])); return `${c} = $${args.length}`; });
          sql = `UPDATE public.${name} SET ${sets.join(",")}${where} RETURNING *`;
        } else sql = `DELETE FROM public.${name}${where} RETURNING *`;
        // WHERE placeholders were numbered before SET placeholders; renumbering is unnecessary because both share `args` order.
        const rows = await asRole(p, async () => (await db.query(sql, args)).rows);
        return wantRows ? json(200, rows) : new Response("", { status: 200 });
      }
      return json(405, { message: "method not allowed" });
    } catch (e) { return pgError(e, p); }
  }

  async function auth(method, path, params, h, bodyText, p) {
    const body = bodyText ? JSON.parse(bodyText) : {};
    if (path === "/auth/v1/settings") return json(200, { external: {}, disable_signup: false });
    if (path === "/auth/v1/token" && params.get("grant_type") === "password") {
      const u = users.get(String(body.email || "").toLowerCase());
      if (!u || u.password !== body.password) return json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      const t = makeJwt({ sub: u.id, role: "authenticated", ref }); tokens.set(t, u.id);
      return json(200, { access_token: t, token_type: "bearer", user: { id: u.id, email: body.email } });
    }
    if (!path.startsWith("/auth/v1/admin/users")) return json(404, { message: "not found" });
    if (p.role !== "service_role") return json(403, { message: "User not allowed" });
    const idMatch = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(path);
    if (method === "GET") return json(200, { users: [...users.entries()].map(([email, u]) => ({ id: u.id, email })) });
    if (method === "POST") {
      const email = String(body.email || "").toLowerCase();
      if (users.has(email)) return json(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
      const id = randomUUID();
      await serial(() => db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES ($1,$2,$3,$4)`, [id, email, JSON.stringify(body.user_metadata || {}), JSON.stringify(body.app_metadata || {})]));
      users.set(email, { id, password: body.password });
      return json(200, { id, email });
    }
    if (method === "PUT" && idMatch) {
      const hit = [...users.values()].find((u) => u.id === idMatch[1]); if (!hit) return json(404, { msg: "not found" });
      if (body.password) hit.password = body.password; return json(200, { id: hit.id });
    }
    if (method === "DELETE" && idMatch) {
      await serial(() => db.query(`DELETE FROM auth.users WHERE id=$1`, [idMatch[1]]));
      for (const [e, u] of users) if (u.id === idMatch[1]) users.delete(e);
      return json(200, {});
    }
    return json(404, { message: "not found" });
  }

  async function storage(method, path, params, h, bodyText, p) {
    const rest = path.replace(/^\/storage\/v1/, "");
    let m;
    if ((m = /^\/bucket\/([^/]+)$/.exec(rest))) {
      if (p.role !== "service_role") return json(403, { message: "not allowed" });
      const r = (await db.query(`select id, name, public from storage.buckets where id=$1`, [m[1]])).rows[0];
      return r ? json(200, r) : json(404, { message: "Bucket not found" });
    }
    if ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(rest))) {
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      if (method === "POST") {
        if (p.role !== "service_role") return json(403, { message: "not allowed" });
        if (!objects.has(key)) return json(400, { message: "Object not found" });
        const t = randomBytes(12).toString("hex"); signed.set(t, key);
        return json(200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=${t}` });
      }
      return signed.get(params.get("token")) === key && objects.has(key) ? new Response(objects.get(key), { status: 200 }) : json(400, { message: "invalid signature" });
    }
    if ((m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(rest))) return json(400, { statusCode: "404", error: "Bucket not found" });
    if ((m = /^\/object\/authenticated\/([^/]+)\/(.+)$/.exec(rest))) {
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      return p.role === "service_role" && objects.has(key) ? new Response(objects.get(key)) : json(400, { statusCode: "404", error: "not_found" });
    }
    if ((m = /^\/object\/([^/]+)\/(.+)$/.exec(rest))) {
      if (p.role !== "service_role") return json(403, { message: "not allowed" });
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      if (method === "POST") { objects.set(key, bodyText); return json(200, { Key: key }); }
      if (method === "DELETE") { objects.delete(key); return json(200, {}); }
    }
    return json(404, { message: "not found" });
  }

  const fetchImpl = async (input, init = {}) => {
    calls.total++;
    const u = new URL(String(input));
    if (u.hostname !== `${ref}.supabase.co`) throw new TypeError("fetch failed (unexpected host in test)");
    const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const p = principal(h);
    if (p.error) return p.error;
    const body = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";
    const method = (init.method || "GET").toUpperCase();
    if (u.pathname.startsWith("/rest/v1")) return serial(() => rest(method, u.pathname, u.searchParams, h, body, p));
    if (u.pathname.startsWith("/auth/v1")) return auth(method, u.pathname, u.searchParams, h, body, p);
    if (u.pathname.startsWith("/storage/v1")) return storage(method, u.pathname, u.searchParams, h, body, p);
    return json(404, { message: "not found" });
  };

  return {
    fetch: fetchImpl, db, calls, users, ref,
    env: { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, PHASE2C_DEV_PROJECT_REF: ref },
    keys: { anonKey, serviceKey },
    /** Read-only-style direct SQL as the database owner (stands in for a PHASE2C_DB_URL connection). */
    dbQuery: (sql) => serial(async () => (await db.query(sql)).rows),
  };
}
