// Shared plumbing for the Phase 2C verification: a small Supabase HTTP client, check recorder and report writer.
// Nothing here reads files from the environment (.env*) and nothing prints keys, tokens or passwords.
import { isOpaqueKey } from "./phase2c-guard.mjs";

const TIMEOUT_MS = 30_000;

/**
 * HTTP client for the three Supabase surfaces the checks use (Auth, PostgREST, Storage).
 * Every call returns { status, ok, body, code } and never throws on an HTTP error.
 */
export function createClient({ url, anonKey, serviceKey, fetchImpl = globalThis.fetch }) {
  async function call(method, path, { key, token, body, headers = {}, raw = false } = {}) {
    const h = { apikey: key, ...headers };
    const bearer = token ?? (isOpaqueKey(key) ? undefined : key); // new-style keys go in apikey only
    if (bearer) h.Authorization = `Bearer ${bearer}`;
    let payload;
    if (body !== undefined && body !== null) {
      if (raw) payload = body;
      else { payload = JSON.stringify(body); h["Content-Type"] = h["Content-Type"] || "application/json"; }
    }
    let res;
    try {
      res = await fetchImpl(`${url}${path}`, { method, headers: h, body: payload, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      return { status: 0, ok: false, body: null, code: "NETWORK", error: e?.cause?.code || e?.name || "fetch failed" };
    }
    const text = await res.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return { status: res.status, ok: res.ok, body: parsed, code: parsed && typeof parsed === "object" ? (parsed.code ?? parsed.error_code ?? parsed.error) : undefined };
  }

  const qs = (params) => {
    const s = Object.entries(params || {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return s ? `?${s}` : "";
  };

  /** PostgREST calls made as one actor: { kind: "service" } | { kind: "anon" } | { kind: "user", token } */
  function rest(actor) {
    const key = actor.kind === "service" ? serviceKey : anonKey;
    const token = actor.kind === "user" ? actor.token : undefined;
    const r = (method, table, params, body, prefer) =>
      call(method, `/rest/v1/${table}${qs(params)}`, { key, token, body, headers: prefer ? { Prefer: prefer } : {} });
    return {
      get: (table, params = {}) => r("GET", table, { select: "*", ...params }),
      insert: (table, row) => r("POST", table, {}, row, "return=representation"),
      patch: (table, filter, row) => r("PATCH", table, filter, row, "return=representation"),
      delete: (table, filter) => r("DELETE", table, filter, undefined, "return=representation"),
      rpc: (fn, args = {}) => call("POST", `/rest/v1/rpc/${fn}`, { key, token, body: args }),
      openapi: () => call("GET", "/rest/v1/", { key, token, headers: { Accept: "application/openapi+json" } }),
    };
  }

  const auth = {
    signIn: (email, password) => call("POST", "/auth/v1/token?grant_type=password", { key: anonKey, body: { email, password } }),
    settings: () => call("GET", "/auth/v1/settings", { key: anonKey }),
    adminCreate: (u) => call("POST", "/auth/v1/admin/users", { key: serviceKey, body: u }),
    adminList: (page = 1, perPage = 200) => call("GET", `/auth/v1/admin/users${qs({ page, per_page: perPage })}`, { key: serviceKey }),
    adminUpdate: (id, u) => call("PUT", `/auth/v1/admin/users/${id}`, { key: serviceKey, body: u }),
    adminDelete: (id) => call("DELETE", `/auth/v1/admin/users/${id}`, { key: serviceKey }),
  };

  const storage = {
    bucket: (id) => call("GET", `/storage/v1/bucket/${id}`, { key: serviceKey }),
    upload: (bucket, path, text) => call("POST", `/storage/v1/object/${bucket}/${path}`, { key: serviceKey, body: text, raw: true, headers: { "Content-Type": "text/plain", "x-upsert": "true" } }),
    remove: (bucket, path) => call("DELETE", `/storage/v1/object/${bucket}/${path}`, { key: serviceKey }),
    sign: (bucket, path, expiresIn = 60) => call("POST", `/storage/v1/object/sign/${bucket}/${path}`, { key: serviceKey, body: { expiresIn } }),
    fetchSigned: (signedPath) => call("GET", `/storage/v1${signedPath}`, { key: anonKey }),
    publicGet: (bucket, path) => call("GET", `/storage/v1/object/public/${bucket}/${path}`, { key: anonKey }),
    authedGet: (bucket, path, token) => call("GET", `/storage/v1/object/authenticated/${bucket}/${path}`, { key: anonKey, token }),
  };

  return { call, rest, auth, storage };
}

/** Errors thrown inside a check body. */
export class CheckFailure extends Error { constructor(m) { super(m); this.name = "CheckFailure"; } }
export class NotTested extends Error { constructor(m) { super(m); this.name = "NotTested"; } }
export const expect = (cond, message) => { if (!cond) throw new CheckFailure(message); };
export const skip = (reason) => { throw new NotTested(reason); };

/** Collects results. A check is PASS, FAIL, WARN (works, but differs from the tested model) or NOT_TESTED. */
export class Recorder {
  constructor(redact = (s) => s) { this.results = []; this.redact = redact; }
  add(id, group, title, status, detail = "", mandatory = true) {
    this.results.push({ id, group, title, status, detail: this.redact(String(detail)).slice(0, 600), mandatory });
  }
  async check(id, group, title, fn, { mandatory = true } = {}) {
    try {
      const detail = await fn();
      if (detail && typeof detail === "object" && detail.warn) this.add(id, group, title, "WARN", detail.warn, mandatory);
      else this.add(id, group, title, "PASS", typeof detail === "string" ? detail : "", mandatory);
    } catch (e) {
      if (e instanceof NotTested) this.add(id, group, title, "NOT_TESTED", e.message, mandatory);
      else if (e instanceof CheckFailure) this.add(id, group, title, "FAIL", e.message, mandatory);
      else this.add(id, group, title, "FAIL", `unexpected error: ${e?.message || e}`, mandatory);
    }
  }
  skipAll(group, titles, reason, mandatory = true) { for (const [id, title] of titles) this.add(id, group, title, "NOT_TESTED", reason, mandatory); }
  count(status) { return this.results.filter((r) => r.status === status).length; }
}

/** Overall verdict: FAIL beats INCOMPLETE beats PASS_WITH_GAPS beats PASS. */
export function overallStatus(results) {
  if (results.some((r) => r.status === "FAIL")) return "FAIL";
  if (results.some((r) => r.status === "NOT_TESTED" && r.mandatory)) return "INCOMPLETE";
  if (results.some((r) => r.status === "NOT_TESTED" || r.status === "WARN")) return "PASS_WITH_GAPS";
  return "PASS";
}

export function renderMarkdown(report) {
  const icon = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN", NOT_TESTED: "NOT TESTED" };
  const lines = [];
  lines.push(`# Phase 2C verification report`, "");
  lines.push(`- **Overall:** ${report.overall}`);
  lines.push(`- **Project:** ${report.target.ref} (DEV/staging, confirmed by operator and allowlist)`);
  lines.push(`- **Run:** ${report.runId} · started ${report.startedAt} · finished ${report.finishedAt}`);
  lines.push(`- **Counts:** ${report.counts.PASS} pass · ${report.counts.FAIL} fail · ${report.counts.WARN} warn · ${report.counts.NOT_TESTED} not tested`);
  lines.push(`- **Writes to DEV:** ${report.gates.writesConfirmed ? "confirmed (test accounts and tagged test rows were created)" : "NOT confirmed (read-only run)"}`);
  lines.push(`- **Direct database checks (PHASE2C_DB_URL):** ${report.gates.dbChecks ? "run" : "not run"}`);
  lines.push(`- **Production:** not touched (the tooling refuses any project not on the DEV allowlist).`, "");
  if (report.overall !== "PASS") {
    const bad = report.results.filter((r) => r.status === "FAIL");
    if (bad.length) { lines.push("## Failures", ""); for (const r of bad) lines.push(`- **${r.id}** ${r.title} — ${r.detail}`); lines.push(""); }
  }
  const groups = [...new Set(report.results.map((r) => r.group))];
  for (const g of groups) {
    lines.push(`## ${g}`, "", "| ID | Result | Check | Detail |", "|---|---|---|---|");
    for (const r of report.results.filter((x) => x.group === g)) lines.push(`| ${r.id} | ${icon[r.status]} | ${r.title.replaceAll("|", "\\|")} | ${r.detail.replaceAll("|", "\\|").replaceAll("\n", " ")} |`);
    lines.push("");
  }
  if (report.notes?.length) { lines.push("## Notes", ""); for (const n of report.notes) lines.push(`- ${n}`); lines.push(""); }
  lines.push("## Not covered by this command (real browser verification)", "");
  for (const n of report.remaining) lines.push(`- ${n}`);
  lines.push("");
  return lines.join("\n");
}
