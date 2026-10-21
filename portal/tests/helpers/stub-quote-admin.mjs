// Service-role stand-in for the quote route tests, backed by a PGlite database
// set with __setDb(). Supports exactly what the quote routes use:
//   rpc(name, { p })  and  from(t).select(cols).eq(c, v).order(c, {ascending}).limit(n).maybeSingle()
let db = null;
let failRpc = false;
export function __setDb(d) { db = d; }
export function __failRpc(v) { failRpc = v; }

async function asService(fn) {
  await db.exec("SET ROLE service_role; SELECT set_config('request.jwt.claim.sub', '', false);");
  try { return await fn(); } finally { await db.exec("RESET ROLE;"); }
}

export function createAdminClient() {
  if (!db) throw new Error("no test db");
  return {
    async rpc(name, args) {
      if (failRpc) return { data: null, error: { message: 'relation "secret_internal" does not exist', code: "42P01" } };
      try {
        const r = await asService(() => db.query(`SELECT public.${name}($1::jsonb) AS r`, [JSON.stringify(args.p)]));
        return { data: r.rows[0].r, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message, code: e.code } };
      }
    },
    from(table) {
      const q = { cols: "*", where: [], order: null, limit: null };
      const b = {
        select(cols) { q.cols = cols; return b; },
        eq(c, v) { q.where.push([c, v]); return b; },
        order(c, o) { q.order = `${c} ${o?.ascending === false ? "DESC" : "ASC"}`; return b; },
        limit(n) { q.limit = n; return b; },
        async maybeSingle() {
          const params = q.where.map(([, v]) => v);
          // PostgREST "col->>key" filters become SQL col->>'key'.
          const col = (c) => c.replace(/->>(\w+)$/, "->>'$1'");
          const sql = `SELECT ${q.cols} FROM public.${table}` +
            (q.where.length ? ` WHERE ${q.where.map(([c], i) => `${col(c)} = $${i + 1}`).join(" AND ")}` : "") +
            (q.order ? ` ORDER BY ${q.order}` : "") + (q.limit ? ` LIMIT ${q.limit}` : "");
          try {
            const r = await asService(() => db.query(sql, params));
            const row = r.rows[0] ?? null;
            if (row && row.ugx_per_usd !== undefined && row.ugx_per_usd !== null) row.ugx_per_usd = String(row.ugx_per_usd);
            return { data: row, error: null };
          } catch (e) {
            return { data: null, error: { message: e.message } };
          }
        },
      };
      return b;
    },
  };
}
