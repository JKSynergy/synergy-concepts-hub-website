// Minimal PostgREST-style shim backed by the PGlite harness DB.
// Implements exactly the query surface used by provider-operations.ts:
// .from(t).select(cols+embeds).eq().in().order().limit().single()/.maybeSingle()
// and .rpc(name, params) translated to SQL with named-argument calls.

let _db = null;
export function __setDb(db) { _db = db; }

let _rpcOverride = null;
export function __setRpcOverride(fn) { _rpcOverride = fn; }

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const EMBED_FK = {
  "provider_operation_proposals.provider_operation_executions":
    { kind: "children", childFk: "proposal_id" },
  "provider_operation_proposals.provider_discovered_resources":
    { kind: "parent", parentFk: "discovered_resource_id" },
  "provider_accounts.providers":
    { kind: "parent", parentFk: "provider_id" },
};

async function loadEmbed(table, row, embed) {
  const fk = EMBED_FK[`${table}.${embed.name}`];
  if (fk?.kind === "children") {
    const { rows } = await _db.query(
      `SELECT ${embed.cols.join(",")} FROM public.${embed.name} WHERE ${fk.childFk}=${q(row.id)}`);
    return rows;
  }
  if (fk?.kind === "parent") {
    const pid = row[fk.parentFk];
    if (!pid) return null;
    const { rows } = await _db.query(
      `SELECT ${embed.cols.join(",")} FROM public.${embed.name} WHERE id=${q(pid)}`);
    return rows[0] ?? null;
  }
  return null;
}

function splitSelect(sel) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

async function runQuery(st, single) {
  const parts = st.sel === "*" ? [] : splitSelect(st.sel).map((s) => s.trim());
  const cols = [], embeds = [];
  for (const p of parts) {
    const m = p.match(/^(\w+)\(([^)]*)\)$/);
    if (m) embeds.push({ name: m[1], cols: m[2].split(",").map((s) => s.trim()) });
    else if (p) cols.push(p);
  }
  let sql = `SELECT ${cols.length ? cols.join(", ") : "*"} FROM public.${st.table}`;
  const wh = [];
  for (const [c, v] of st.eqs) wh.push(`${c} = ${q(v)}`);
  for (const [c, vs] of st.ins) wh.push(`${c} IN (${vs.map(q).join(",")})`);
  if (wh.length) sql += " WHERE " + wh.join(" AND ");
  if (st.order) sql += ` ORDER BY ${st.order[0]} ${st.order[1] ? "ASC" : "DESC"}`;
  if (st.lim) sql += ` LIMIT ${st.lim}`;

  const { rows } = await _db.query(sql);
  for (const row of rows) {
    for (const e of embeds) row[e.name] = await loadEmbed(st.table, row, e);
  }
  return { data: single ? (rows[0] ?? null) : rows, error: null };
}

export function __from(table) {
  const st = { table, sel: "*", eqs: [], ins: [], order: null, lim: null };
  const b = {
    select(s) { st.sel = s ?? "*"; return b; },
    eq(c, v) { st.eqs.push([c, v]); return b; },
    in(c, vs) { st.ins.push([c, vs]); return b; },
    order(c, o) { st.order = [c, o?.ascending !== false]; return b; },
    limit(n) { st.lim = n; return b; },
    single() { return runQuery(st, true); },
    maybeSingle() { return runQuery(st, true); },
    then(res, rej) { return runQuery(st, false).then(res, rej); },
  };
  return b;
}

export async function __rpc(name, params = {}) {
  if (_rpcOverride) {
    const out = await _rpcOverride(name, params);
    if (out !== undefined) return out;
  }
  const args = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} => ${q(v)}`)
    .join(", ");
  const { rows } = await _db.query(`SELECT public.${name}(${args}) AS r`);
  return { data: rows[0]?.r ?? null, error: null };
}
