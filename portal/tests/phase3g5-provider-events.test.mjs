// Phase 3G-5: Provider Events & Webhooks — tests.
// Validates: webhook config + Vault-backed secrets, auth-type derivation,
// dedupe/replay protection, authoritative resource matching, event-derived
// Action Center signals (deduped), event-triggered monitoring runs, audit,
// RLS/RBAC, delete protection, secret hygiene — and that no provider mutation
// can result from event ingestion.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, asService, rejects, q } from "./helpers/db.mjs";

const IDS = {
  pSupabase: "eeee0000-0000-0000-0000-000000000001",
  pRailway: "eeee0000-0000-0000-0000-000000000002",
  pVercel: "eeee0000-0000-0000-0000-000000000003",
  pCloudflare: "eeee0000-0000-0000-0000-000000000004",
  acctSupabase: "eeee0000-0000-0000-0000-000000000011",
  acctRailway: "eeee0000-0000-0000-0000-000000000012",
  acctVercel: "eeee0000-0000-0000-0000-000000000013",
  acctOther: "eeee0000-0000-0000-0000-000000000014",
  sysA: "eeee0000-0000-0000-0000-000000000021",
  runD: "eeee0000-0000-0000-0000-000000000031",
  discLinked: "eeee0000-0000-0000-0000-000000000041",
  discOtherAccount: "eeee0000-0000-0000-0000-000000000042",
};

const ADMIN = "00000000-0000-0000-0000-000000000001";
const STAFF = "00000000-0000-0000-0000-000000000002";
const FINANCE = "00000000-0000-0000-0000-000000000003";
const CLIENT_A = "00000000-0000-0000-0000-000000000004";

// Minimal Vault stand-in (PGlite has no supabase_vault extension).
const VAULT_STANDIN = `
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret text, name text, description text
);
CREATE FUNCTION vault.create_secret(text, text, text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO vault.secrets (secret, name, description) VALUES ($1,$2,$3) RETURNING id
$$;
CREATE VIEW vault.decrypted_secrets AS
  SELECT id, secret AS decrypted_secret FROM vault.secrets;
`;

async function setup(db) {
  await db.exec(VAULT_STANDIN);
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@synergy.ug'), ('${STAFF}', 'staff@synergy.ug'),
      ('${FINANCE}', 'finance@synergy.ug'), ('${CLIENT_A}', 'clienta@company.com')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'admin@synergy.ug', 'admin'), ('${STAFF}', 'staff@synergy.ug', 'staff'),
      ('${FINANCE}', 'finance@synergy.ug', 'finance'), ('${CLIENT_A}', 'clienta@company.com', 'client')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.providers (id, name, slug, adapter_key) VALUES
      ('${IDS.pSupabase}', 'Supabase', 'supabase', 'supabase'),
      ('${IDS.pRailway}', 'Railway', 'railway', 'railway'),
      ('${IDS.pVercel}', 'Vercel', 'vercel', 'vercel'),
      ('${IDS.pCloudflare}', 'Cloudflare', 'cloudflare', 'cloudflare')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES
      ('${IDS.acctSupabase}', '${IDS.pSupabase}', 'SCH Supabase', 'sch_managed', 'connected', 'vault:test'),
      ('${IDS.acctRailway}', '${IDS.pRailway}', 'Railway Prod', 'sch_managed', 'connected', 'vault:test'),
      ('${IDS.acctVercel}', '${IDS.pVercel}', 'Vercel Prod', 'sch_managed', 'connected', 'vault:test'),
      ('${IDS.acctOther}', '${IDS.pSupabase}', 'Other Supabase', 'sch_managed', 'connected', 'vault:test')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysA}', '${CLIENT_A}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${IDS.runD}', '${IDS.acctSupabase}', 'completed', now(), now())
    ON CONFLICT DO NOTHING;
  `);
}

async function saveCfg(db, accountId, secret = null) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.save_webhook_config('${accountId}', ${q(secret)}, '${ADMIN}') AS r`
    )).rows[0].r);
}

async function recordEvent(db, accountId, over = {}) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.record_provider_event(
         ${over.cfg ? `'${over.cfg}'` : "NULL"},
         '${accountId}', ${q(over.eventId ?? null)}, ${q(over.type ?? "v1.project.paused")},
         ${q(over.norm ?? "resource_unavailable")}, ${over.occurred ?? "NULL"},
         ${q(over.hash ?? "ab" + "cd".repeat(31))},
         ${q(JSON.stringify(over.summary ?? { summary: "Supabase v1.project.paused" }))}::jsonb,
         ${over.extIds ? `'{${over.extIds.join(",")}}'::text[]` : "'{}'::text[]"}
       ) AS r`
    )).rows[0].r);
}

// ---------------------------------------------------------------------------

test("3G5-1 tables exist with RLS enabled", async () => {
  const db = await createDb();
  const { rows } = await db.query(`
    SELECT relname, relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND relname IN ('provider_webhook_configs','provider_events')`);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.relrowsecurity, true, `${r.relname} RLS`);
});

test("3G5-2 webhook config: auth type derived per provider, secret → Vault, hash stored", async () => {
  const db = await createDb();
  await setup(db);
  const r = await saveCfg(db, IDS.acctSupabase);
  assert.equal(r.auth_type, "bearer_token");
  assert.ok(r.secret.length >= 16);
  const { rows } = await asService(db, () =>
    db.query(`SELECT auth_type, vault_ref, credential_hash, enabled FROM public.provider_webhook_configs`));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].auth_type, "bearer_token");
  assert.match(rows[0].vault_ref, /^vault:/);
  assert.match(rows[0].credential_hash, /^[0-9a-f]{64}$/);
  assert.equal(rows[0].enabled, false, "config starts disabled until verified");
  // The secret itself is in vault, and reveal works only for service role.
  const { rows: rev } = await asService(db, () =>
    db.query(`SELECT public.reveal_webhook_secret('${r.config_id}') AS s`));
  assert.equal(rev[0].s, r.secret);
  // Railway → url_token; Cloudflare → header_secret; Vercel requires explicit secret.
  assert.equal((await saveCfg(db, IDS.acctRailway)).auth_type, "url_token");
  await rejects(saveCfg(db, IDS.acctVercel), "vercel secret required");
  const v = await saveCfg(db, IDS.acctVercel, "vercel-whsec-0123456789abcdef");
  assert.equal(v.auth_type, "vercel_hmac_sha1");
});

test("3G5-3 token-class lookup works only for enabled configs", async () => {
  const db = await createDb();
  await setup(db);
  const r = await saveCfg(db, IDS.acctSupabase);
  const hashExpr = `encode(sha256('${r.secret}'::bytea), 'hex')`;
  let { rows } = await asService(db, () =>
    db.query(`SELECT * FROM public.lookup_webhook_config_by_hash(${hashExpr})`));
  assert.equal(rows.length, 0, "disabled config is not reachable");
  await asService(db, () =>
    db.query(`SELECT public.set_webhook_config_enabled('${IDS.acctSupabase}', true, '${ADMIN}')`));
  ({ rows } = await asService(db, () =>
    db.query(`SELECT * FROM public.lookup_webhook_config_by_hash(${hashExpr})`)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider_account_id, IDS.acctSupabase);
  assert.equal(rows[0].adapter_key, "supabase");
});

test("3G5-4 dedupe: provider event id and fingerprint keys both collapse retries", async () => {
  const db = await createDb();
  await setup(db);
  // With provider event id.
  const a = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-123" });
  assert.equal(a.outcome, "recorded");
  const b = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-123" });
  assert.equal(b.outcome, "duplicate");
  assert.equal(b.event_id, a.event_id);
  let { rows } = await asService(db, () =>
    db.query(`SELECT status, duplicate_count FROM public.provider_events`));
  assert.equal(rows.length, 1, "one evidence row only");
  assert.equal(rows[0].duplicate_count, 1);

  // Without event id → fingerprint of payload hash.
  const c = await recordEvent(db, IDS.acctSupabase, { hash: "ff".repeat(32) });
  const d = await recordEvent(db, IDS.acctSupabase, { hash: "ff".repeat(32) });
  assert.equal(c.outcome, "recorded");
  assert.equal(d.outcome, "duplicate");
  assert.equal(d.event_id, c.event_id);

  // Different event ids, identical payload → distinct evidence rows.
  const e1 = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-A", hash: "11".repeat(32) });
  const e2 = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-B", hash: "11".repeat(32) });
  assert.equal(e1.outcome, "recorded");
  assert.equal(e2.outcome, "recorded");
  assert.notEqual(e1.event_id, e2.event_id);
});

test("3G5-5 matching: external id → discovered resource → linked SCH resource", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
    VALUES ('${IDS.discLinked}', '${IDS.acctSupabase}', 'prj-abc', 'project', 'Prod DB', 'ACTIVE_HEALTHY', '${IDS.runD}', false);
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
    VALUES ('${IDS.discOtherAccount}', '${IDS.acctOther}', 'prj-abc', 'project', 'Other acct', 'ACTIVE_HEALTHY', '${IDS.runD}', false);
  `));
  await asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${IDS.discLinked}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));

  const r = await recordEvent(db, IDS.acctSupabase, {
    eventId: "evt-match", extIds: ["prj-abc"], norm: "resource_updated", type: "v1.project.updated",
  });
  assert.equal(r.matched_discovered_resource_id, IDS.discLinked);
  assert.ok(r.matched_resource_id, "linked SCH resource resolved");
  // Same external id on a DIFFERENT account must not leak across accounts.
  const other = await recordEvent(db, IDS.acctOther, {
    eventId: "evt-other", extIds: ["prj-abc"], norm: "resource_updated", type: "v1.project.updated",
  });
  assert.equal(other.matched_discovered_resource_id, IDS.discOtherAccount);
  assert.notEqual(other.matched_discovered_resource_id, IDS.discLinked);
  // Unknown external id → unmatched, never guessed.
  const un = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-un", extIds: ["nope"] });
  assert.equal(un.matched_discovered_resource_id ?? null, null);
  assert.equal(un.matched_resource_id ?? null, null);
});

test("3G5-6 signal policy: deployment_failed → warning; unmatched state event → info; deduped", async () => {
  const db = await createDb();
  await setup(db);
  // deployment_failed → warning signal.
  const e1 = await recordEvent(db, IDS.acctSupabase, {
    eventId: "dep-1", norm: "deployment_failed", type: "DEPLOY_FAILED",
  });
  const s1 = await asService(db, async () =>
    (await db.query(`SELECT public.signal_provider_event('${e1.event_id}') AS r`)).rows[0].r);
  assert.equal(s1.signaled, true);
  let { rows: items } = await asService(db, () =>
    db.query(`SELECT severity, source, event_type, dedupe_key FROM public.action_items`));
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, "warning");
  assert.equal(items[0].source, "provider_event");
  assert.equal(items[0].event_type, "provider_event");

  // A second deployment_failed event refreshes the same signal (dedupe).
  const e2 = await recordEvent(db, IDS.acctSupabase, {
    eventId: "dep-2", norm: "deployment_failed", type: "DEPLOY_FAILED",
  });
  const s2 = await asService(db, async () =>
    (await db.query(`SELECT public.signal_provider_event('${e2.event_id}') AS r`)).rows[0].r);
  assert.equal(s2.signaled, true);
  ({ rows: items } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.action_items`)));
  assert.equal(items[0].n, 1, "repeated condition does not storm the Action Center");
  const { rows: ev } = await asService(db, () =>
    db.query(`SELECT action_item_id FROM public.provider_events WHERE id = '${e2.event_id}'`));
  assert.equal(ev[0].action_item_id, s2.action_item_id);

  // Matched state events rely on reconciliation — no direct signal.
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
    VALUES ('${IDS.discLinked}', '${IDS.acctSupabase}', 'prj-abc', 'project', 'Prod DB', 'ACTIVE_HEALTHY', '${IDS.runD}', false)`));
  const e3 = await recordEvent(db, IDS.acctSupabase, {
    eventId: "st-1", norm: "resource_updated", type: "v1.project.updated", extIds: ["prj-abc"],
  });
  const s3 = await asService(db, async () =>
    (await db.query(`SELECT public.signal_provider_event('${e3.event_id}') AS r`)).rows[0].r);
  assert.equal(s3.signaled, false, "matched state event is reconciler evidence, not a signal");

  // Unmatched state event → informational review signal.
  const e4 = await recordEvent(db, IDS.acctSupabase, {
    eventId: "st-2", norm: "resource_created", type: "v1.project.created", extIds: ["new-proj"],
  });
  const s4 = await asService(db, async () =>
    (await db.query(`SELECT public.signal_provider_event('${e4.event_id}') AS r`)).rows[0].r);
  assert.equal(s4.signaled, true);
});

test("3G5-7 event-triggered monitoring run accepted + linked via finalize", async () => {
  const db = await createDb();
  await setup(db);
  const e = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-trig" });
  // 'event' is now a legal monitoring trigger — the shared pipeline accepts it.
  const run = await asService(db, async () =>
    (await db.query(
      `SELECT public.begin_monitoring_run('${IDS.acctSupabase}', 'event', NULL, '${ADMIN}') AS r`
    )).rows[0].r);
  assert.equal(run.outcome, "begin");
  await asService(db, () =>
    db.query(`SELECT public.finalize_provider_event(
      '${e.event_id}', 'processed', '${run.run_id}', NULL, NULL)`));
  const { rows } = await asService(db, () =>
    db.query(`SELECT status, monitoring_run_id FROM public.provider_events WHERE id = '${e.event_id}'`));
  assert.equal(rows[0].status, "processed");
  assert.equal(rows[0].monitoring_run_id, run.run_id);
});

test("3G5-8 event lifecycle is audited", async () => {
  const db = await createDb();
  await setup(db);
  const cfg = await saveCfg(db, IDS.acctSupabase);
  const e = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-audit", cfg: cfg.config_id });
  await asService(db, () =>
    db.query(`SELECT public.finalize_provider_event('${e.event_id}', 'processed', NULL, NULL, NULL)`));
  const { rows } = await asService(db, () =>
    db.query(`SELECT action FROM public.audit_logs WHERE action LIKE 'provider_%' ORDER BY created_at`));
  const actions = rows.map((r) => r.action);
  assert.ok(actions.includes("provider_webhook.config_created"));
  assert.ok(actions.includes("provider_event.received"));
  assert.ok(actions.includes("provider_event.processed"));
  // Auth failures are auditable even without an attributable config.
  await asService(db, () =>
    db.query(`SELECT public.record_webhook_auth_failure('supabase', 'invalid_credential')`));
  const { rows: fail } = await asService(db, () =>
    db.query(`SELECT details FROM public.audit_logs WHERE action = 'provider_event.auth_failed'`));
  assert.equal(fail.length, 1);
  assert.equal(fail[0].details.reason, "invalid_credential");
});

test("3G5-9 secret-shaped text rejected; no secret material in event/config rows", async () => {
  const db = await createDb();
  await setup(db);
  await rejects(
    recordEvent(db, IDS.acctSupabase, { type: "leaked: sk_live_" + "a1b2c3d4e5f6a7b8c9d0" }),
    "secret in event_type");
  const cfg = await saveCfg(db, IDS.acctSupabase);
  const { rows } = await asService(db, () =>
    db.query(`SELECT * FROM public.provider_webhook_configs`));
  const row = JSON.stringify(rows[0]);
  assert.ok(!row.includes(cfg.secret), "plaintext secret never appears in config row");
});

test("3G5-10 evidence is append-only; config cannot be deleted", async () => {
  const db = await createDb();
  await setup(db);
  await saveCfg(db, IDS.acctSupabase);
  const e = await recordEvent(db, IDS.acctSupabase, { eventId: "evt-nd" });
  await rejects(
    asService(db, () => db.query(`DELETE FROM public.provider_events WHERE id = '${e.event_id}'`)),
    "delete event evidence");
  await rejects(
    asService(db, () => db.query(`DELETE FROM public.provider_webhook_configs`)),
    "delete webhook config");
});

test("3G5-11 RBAC: roles read correctly; client sees nothing; writes service-only", async () => {
  const db = await createDb();
  await setup(db);
  await saveCfg(db, IDS.acctSupabase);
  await recordEvent(db, IDS.acctSupabase, { eventId: "evt-rbac" });

  for (const [who, id] of [["admin", ADMIN], ["finance", FINANCE], ["staff", STAFF]]) {
    const { rows } = await asUser(db, id, () =>
      db.query(`SELECT id FROM public.provider_events`));
    assert.equal(rows.length, 1, `${who} reads event evidence`);
  }
  const { rows: cfgA } = await asUser(db, ADMIN, () =>
    db.query(`SELECT id FROM public.provider_webhook_configs`));
  assert.equal(cfgA.length, 1);
  const { rows: cfgF } = await asUser(db, FINANCE, () =>
    db.query(`SELECT id FROM public.provider_webhook_configs`));
  assert.equal(cfgF.length, 1, "finance reads config status (no secret columns exist anyway)");
  const { rows: cfgS } = await asUser(db, STAFF, () =>
    db.query(`SELECT id FROM public.provider_webhook_configs`));
  assert.equal(cfgS.length, 0, "staff cannot see webhook security configuration");

  const { rows: cli } = await asUser(db, CLIENT_A, () =>
    db.query(`SELECT id FROM public.provider_events`));
  assert.equal(cli.length, 0, "client sees no provider events");

  // Authenticated users cannot write evidence or call ingestion RPCs.
  await rejects(
    asUser(db, ADMIN, () => db.query(
      `INSERT INTO public.provider_events (provider_account_id, provider_id, event_type, normalized_type, dedupe_key, payload_hash)
       VALUES ('${IDS.acctSupabase}', '${IDS.pSupabase}', 'x', 'unknown', 'k', '${"00".repeat(32)}')`)),
    "admin cannot insert events directly");
  await rejects(
    asUser(db, ADMIN, () => db.query(
      `SELECT public.record_provider_event(NULL, '${IDS.acctSupabase}', NULL, 'x', 'unknown', NULL, '${"00".repeat(32)}', NULL, '{}')`)),
    "admin cannot call record_provider_event");
  await rejects(
    asUser(db, STAFF, () => db.query(
      `SELECT public.save_webhook_config('${IDS.acctSupabase}', NULL, '${STAFF}')`)),
    "staff cannot save webhook config");
  await rejects(
    asUser(db, STAFF, () => db.query(
      `SELECT public.reveal_webhook_secret('00000000-0000-0000-0000-000000000099')`)),
    "staff cannot reveal secrets");
});

test("3G5-12 ingestion never touches provider operations or SCH resource state", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
    VALUES ('${IDS.discLinked}', '${IDS.acctSupabase}', 'prj-abc', 'project', 'Prod DB', 'ACTIVE_HEALTHY', '${IDS.runD}', false)`));
  await asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${IDS.discLinked}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
  const { rows: before } = await asService(db, () =>
    db.query(`SELECT name, status FROM public.resources WHERE client_id = '${CLIENT_A}'`));

  const e = await recordEvent(db, IDS.acctSupabase, {
    eventId: "evt-nomut", norm: "resource_deleted", extIds: ["prj-abc"],
  });
  await asService(db, () =>
    db.query(`SELECT public.signal_provider_event('${e.event_id}')`));
  await asService(db, () =>
    db.query(`SELECT public.finalize_provider_event('${e.event_id}', 'processed', NULL, NULL, NULL)`));

  const { rows: after } = await asService(db, () =>
    db.query(`SELECT name, status FROM public.resources WHERE client_id = '${CLIENT_A}'`));
  assert.deepEqual(after, before, "SCH resource state untouched by events");
  const { rows: ops } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.provider_operation_proposals`));
  assert.equal(ops[0].n, 0, "zero provider operation proposals from event ingestion");
});

test("3G5-13 out-of-order events: both recorded; state authority stays with reconciliation", async () => {
  const db = await createDb();
  await setup(db);
  // 'recovered' arriving before 'unavailable' — both are evidence; neither
  // writes resource state. Timestamps are stored for ordering analysis.
  const recovered = await recordEvent(db, IDS.acctSupabase, {
    eventId: "evt-2", norm: "resource_recovered", type: "v1.project.restored",
    occurred: "now() - interval '5 minutes'",
  });
  const unavailable = await recordEvent(db, IDS.acctSupabase, {
    eventId: "evt-1", norm: "resource_unavailable", type: "v1.project.paused",
    occurred: "now() - interval '10 minutes'",
  });
  const { rows } = await asService(db, () =>
    db.query(`SELECT normalized_type, occurred_at FROM public.provider_events ORDER BY occurred_at`));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].normalized_type, "resource_unavailable", "earlier event correctly timestamped");
  assert.equal(rows[1].normalized_type, "resource_recovered");
  assert.ok(recovered.outcome === "recorded" && unavailable.outcome === "recorded");
});

test("3G5-14 unknown event types are recorded safely as 'unknown'", async () => {
  const db = await createDb();
  await setup(db);
  const e = await recordEvent(db, IDS.acctSupabase, {
    eventId: "evt-unk", type: "v1.something.new", norm: "unknown",
  });
  const s = await asService(db, async () =>
    (await db.query(`SELECT public.signal_provider_event('${e.event_id}') AS r`)).rows[0].r);
  assert.equal(s.signaled, false, "unknown events never create signals");
  const { rows } = await asService(db, () =>
    db.query(`SELECT normalized_type FROM public.provider_events WHERE id = '${e.event_id}'`));
  assert.equal(rows[0].normalized_type, "unknown");
});
