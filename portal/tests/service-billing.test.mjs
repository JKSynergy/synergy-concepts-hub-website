// Itemised service billing (migration 037): packages, recurring charge
// breakdowns, support requests and invoicing them. PGlite harness.
import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser } from "./helpers/db.mjs";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const STAFF = "00000000-0000-0000-0000-0000000000a2";
const FIN = "00000000-0000-0000-0000-0000000000a3";
const ELGON = "00000000-0000-0000-0000-0000000000c1";
const SOLVERS = "00000000-0000-0000-0000-0000000000c2";
const SYS_E = "11111111-0000-0000-0000-000000000001";
const SYS_S = "11111111-0000-0000-0000-000000000002";

async function setup() {
  const db = await createDb();
  for (const [id, email, role] of [
    [ADMIN, "admin@sch.test", "admin"],
    [STAFF, "staff@sch.test", "staff"],
    [FIN, "fin@sch.test", "finance"],
    [ELGON, "elgon@client.test", "client"],
    [SOLVERS, "solvers@client.test", "client"],
  ]) {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}');
      INSERT INTO public.profiles (id, email, role) VALUES ('${id}', '${email}', '${role}')
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;`);
  }
  await db.exec(`
    INSERT INTO public.systems (id, client_id, name, system_type, status) VALUES
      ('${SYS_E}', '${ELGON}', 'Elgon Operations', 'web_platform', 'live'),
      ('${SYS_S}', '${SOLVERS}', 'Solvers Site', 'web_platform', 'live');
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
      VALUES ('22222222-0000-0000-0000-000000000001', '${ELGON}', '${SYS_E}', 'Managed System Care',
              'managed_service', 'active', '2026-10-01');
    INSERT INTO public.recurring_charges (id, agreement_id, name, amount, currency, start_date)
      VALUES ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
              'Managed System Care', 1000000, 'UGX', '2026-10-01');`);
  return db;
}

const items = (rows) => JSON.stringify(rows).replace(/'/g, "''");

test("packages: finance builds a breakdown; staff and clients cannot see prices", async () => {
  const db = await setup();
  const pkg = await asUser(db, FIN, async () => {
    const id = (await db.query(`INSERT INTO public.service_packages (name, kind, currency)
      VALUES ('Hosting Starter', 'recurring', 'USD') RETURNING id`)).rows[0].id;
    const total = (await db.query(`SELECT public.replace_service_package_items('${id}', '${items([
      { section: "Hosting", description: "Application hosting", quantity: 1, unit: "month", unit_price: 18 },
      { section: "Hosting", description: "Database & daily backups", quantity: 1, unit: "month", unit_price: 8 },
      { description: "Uptime monitoring", quantity: 1, unit: "month", unit_price: 4 },
    ])}'::jsonb) AS t`)).rows[0].t;
    assert.equal(Number(total), 30);
    return id;
  });

  const ordered = (await db.query(`SELECT description, position FROM public.service_package_items
    WHERE package_id = '${pkg}' ORDER BY position`)).rows;
  assert.deepEqual(ordered.map((r) => r.position), [0, 1, 2]);

  for (const who of [STAFF, ELGON]) {
    const seen = await asUser(db, who, () => db.query(`SELECT count(*)::int n FROM public.service_package_items`));
    assert.equal(seen.rows[0].n, 0);
    await assert.rejects(
      asUser(db, who, () => db.query(`SELECT public.replace_service_package_items('${pkg}', '[{"description":"x y","unit_price":1}]'::jsonb)`)),
      /Admin or Finance access required/,
    );
  }
});

test("recurring breakdown must add up to the standard charge", async () => {
  const db = await setup();
  const charge = "33333333-0000-0000-0000-000000000001";

  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.replace_recurring_charge_items('${charge}', '${items([
      { section: "Maintenance", description: "Health checks", quantity: 4, unit: "checks", unit_price: 50000 },
      { section: "Hosting", description: "Database hosting", quantity: 1, unit: "month", unit_price: 80000 },
    ])}'::jsonb)`)),
    /Breakdown totals 280000.00 but the charge is UGX 1000000.00/,
  );
  // Nothing was half-written.
  assert.equal((await db.query(`SELECT count(*)::int n FROM public.recurring_charge_items`)).rows[0].n, 0);

  const total = await asUser(db, FIN, () => db.query(`SELECT public.replace_recurring_charge_items('${charge}', '${items([
    { section: "Maintenance", description: "Health checks", quantity: 4, unit: "checks", unit_price: 50000 },
    { section: "Maintenance", description: "Support", quantity: 1, unit: "month", unit_price: 550000 },
    { section: "Hosting", description: "Hosting & database", quantity: 1, unit: "month", unit_price: 250000 },
  ])}'::jsonb) AS t`));
  assert.equal(Number(total.rows[0].t), 1000000);

  // A USD package cannot be attached to a UGX charge.
  const usd = await asUser(db, FIN, async () =>
    (await db.query(`INSERT INTO public.service_packages (name, currency) VALUES ('USD pack', 'USD') RETURNING id`)).rows[0].id);
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.replace_recurring_charge_items('${charge}', '[]'::jsonb, '${usd}')`)),
    /Package currency must match/,
  );

  // Empty breakdown clears it (invoice falls back to one line).
  await asUser(db, FIN, () => db.query(`SELECT public.replace_recurring_charge_items('${charge}', '[]'::jsonb)`));
  assert.equal((await db.query(`SELECT count(*)::int n FROM public.recurring_charge_items`)).rows[0].n, 0);
});

test("support requests: reference, same-client guard, staff can log but not price", async () => {
  const db = await setup();
  const req = await asUser(db, STAFF, async () =>
    (await db.query(`INSERT INTO public.support_requests (client_id, system_id, summary, priority, channel, requested_at)
      VALUES ('${SOLVERS}', '${SYS_S}', 'Contact form not sending', 'high', 'whatsapp', '2026-10-06 09:00+03')
      RETURNING id, reference, recorded_by`)).rows[0]);
  assert.match(req.reference, /^SR-2026-\d{4}$/);
  assert.equal(req.recorded_by, STAFF);

  await assert.rejects(
    asUser(db, STAFF, () => db.query(`INSERT INTO public.support_requests (client_id, system_id, summary)
      VALUES ('${SOLVERS}', '${SYS_E}', 'Wrong system')`)),
    /system must belong to the client/,
  );
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`UPDATE public.support_requests SET reference = 'SR-X' WHERE id = '${req.id}'`)),
    /reference cannot change/,
  );
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`INSERT INTO public.support_request_items (support_request_id, description, unit_price)
      VALUES ('${req.id}', 'Labour', 10)`)),
    /row-level security/,
  );
  // Resolved needs a time.
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`UPDATE public.support_requests SET status = 'resolved' WHERE id = '${req.id}'`)),
    /chk_support_resolved_has_time/,
  );
  // Clients see nothing.
  const seen = await asUser(db, SOLVERS, () => db.query(`SELECT count(*)::int n FROM public.support_requests`));
  assert.equal(seen.rows[0].n, 0);
});

test("invoicing quoted jobs: quote must be agreed; one draft service invoice, sections per job, then frozen", async () => {
  const db = await setup();
  const mk = (summary, at, billing = "chargeable") =>
    asUser(db, STAFF, async () =>
      (await db.query(`INSERT INTO public.support_requests (client_id, system_id, summary, billing, requested_at)
        VALUES ('${SOLVERS}', '${SYS_S}', '${summary}', '${billing}', '${at}') RETURNING id, reference`)).rows[0]);
  const a = await mk("Contact form not sending", "2026-10-06 09:00+03");
  const b = await mk("SSL renewal failed", "2026-10-20 10:00+03");
  const c = await mk("Question about hosting", "2026-10-21 10:00+03", "no_charge");

  // Not resolved yet.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${a.id}']::uuid[], 'USD')`)),
    /is not a resolved, chargeable request/,
  );
  await db.exec(`UPDATE public.support_requests SET status = 'resolved', resolved_at = requested_at + interval '3 hours'`);
  // No quote yet.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${a.id}']::uuid[], 'USD')`)),
    /has no quote yet/,
  );
  // Agreement needs a quote first.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`UPDATE public.support_requests SET quote_agreed_at = now() WHERE id = '${a.id}'`)),
    /chargeable request with a quote/,
  );
  await asUser(db, FIN, async () => {
    await db.query(`SELECT public.replace_support_request_items('${a.id}', '${items([
      { description: "Call-out & diagnosis", quantity: 1, unit: "visit", unit_price: 15 },
      { description: "Technical work", quantity: 1.5, unit: "hours", unit_price: 12.5 },
    ])}'::jsonb)`);
    await db.query(`SELECT public.replace_support_request_items('${b.id}', '${items([
      { description: "Technical work", quantity: 1, unit: "hours", unit_price: 12.5 },
    ])}'::jsonb)`);
  });
  // Quoted but not agreed: cannot be invoiced.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${a.id}']::uuid[], 'USD')`)),
    /has not agreed the quote/,
  );
  // Operational staff cannot record a pricing agreement.
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`UPDATE public.support_requests SET quote_agreed_at = now() WHERE id = '${a.id}'`)),
    /Only Admin or Finance can record quote agreement/,
  );
  // Agreement before the request existed is rejected.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`UPDATE public.support_requests SET quote_agreed_at = '2026-10-01' WHERE id = '${a.id}'`)),
    /chk_support_quote_order/,
  );
  await asUser(db, FIN, () => db.query(`UPDATE public.support_requests SET quote_agreed_at = requested_at + interval '20 minutes'
    WHERE id IN ('${a.id}', '${b.id}')`));
  // Changing the quote withdraws the agreement; agree again.
  await asUser(db, FIN, () => db.query(`SELECT public.replace_support_request_items('${b.id}', '${items([
    { description: "Technical work", quantity: 1, unit: "hours", unit_price: 12.5 },
  ])}'::jsonb)`));
  assert.equal((await db.query(`SELECT quote_agreed_at FROM public.support_requests WHERE id = '${b.id}'`)).rows[0].quote_agreed_at, null);
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${b.id}']::uuid[], 'USD')`)),
    /has not agreed the quote/,
  );
  await asUser(db, FIN, () => db.query(`UPDATE public.support_requests SET quote_agreed_at = requested_at + interval '1 hour' WHERE id = '${b.id}'`));

  // no_charge requests cannot be invoiced.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${a.id}','${c.id}']::uuid[], 'USD')`)),
    /is not a resolved, chargeable request/,
  );
  // Staff cannot invoice.
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${a.id}']::uuid[], 'USD')`)),
    /Admin or Finance access required/,
  );

  const inv = await asUser(db, FIN, async () =>
    (await db.query(`SELECT public.invoice_support_requests(ARRAY['${a.id}','${b.id}']::uuid[], 'USD') AS id`)).rows[0].id);

  const head = (await db.query(`SELECT status, currency, document_style, total, service_period_start::text s, service_period_end::text e
    FROM public.invoices WHERE id = '${inv}'`)).rows[0];
  assert.equal(head.status, "draft");
  assert.equal(head.currency, "USD");
  assert.equal(head.document_style, "service");
  assert.equal(Number(head.total), 15 + 18.75 + 12.5); // database-computed totals, cents kept
  assert.equal(head.s, "2026-10-06");
  assert.equal(head.e, "2026-10-20");

  const lines = (await db.query(`SELECT section, description, amount, position FROM public.invoice_line_items
    WHERE invoice_id = '${inv}' ORDER BY position`)).rows;
  assert.equal(lines.length, 3);
  assert.ok(lines[0].section.startsWith(`${a.reference} · Contact form`));
  assert.ok(lines[2].section.startsWith(b.reference));

  const st = (await db.query(`SELECT status, invoice_id FROM public.support_requests WHERE id = '${a.id}'`)).rows[0];
  assert.equal(st.status, "invoiced");
  assert.equal(st.invoice_id, inv);

  // Frozen: charges and status cannot change; cannot be invoiced twice.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.replace_support_request_items('${a.id}', '[]'::jsonb)`)),
    /invoiced support request cannot change/,
  );
  await assert.rejects(
    asUser(db, FIN, () => db.query(`UPDATE public.support_requests SET status = 'resolved' WHERE id = '${a.id}'`)),
    /invoiced support request cannot be changed/,
  );
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${a.id}']::uuid[], 'USD')`)),
    /is not a resolved, chargeable request/,
  );

  // Deleting the draft invoice makes the work billable again.
  await asUser(db, ADMIN, () => db.query(`DELETE FROM public.invoices WHERE id = '${inv}'`));
  const back = (await db.query(`SELECT status, invoice_id FROM public.support_requests WHERE id = '${a.id}'`)).rows[0];
  assert.equal(back.status, "resolved");
  assert.equal(back.invoice_id, null);
});

test("requests from two clients cannot share an invoice", async () => {
  const db = await setup();
  const ids = [];
  for (const [client, sys] of [[ELGON, SYS_E], [SOLVERS, SYS_S]]) {
    const id = (await db.query(`INSERT INTO public.support_requests (client_id, system_id, summary, status, requested_at, resolved_at)
      VALUES ('${client}', '${sys}', 'Some issue', 'resolved', '2026-10-01', '2026-10-02') RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO public.support_request_items (support_request_id, description, unit_price) VALUES ('${id}', 'Work', 10)`);
    ids.push(id);
  }
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.invoice_support_requests(ARRAY['${ids[0]}','${ids[1]}']::uuid[], 'UGX')`)),
    /same client/,
  );
});

test("invoice_service_record: covered work of the period, visible to the client only once issued", async () => {
  const db = await setup();
  const AGR = "22222222-0000-0000-0000-000000000001";
  // Covered requests: two in October (EAT), one on 1 Nov 00:30 EAT (= 31 Oct 21:30 UTC, must be excluded).
  await db.exec(`
    INSERT INTO public.support_requests (client_id, system_id, service_agreement_id, summary, billing, priority, status,
                                         requested_at, first_response_at, resolved_at, work_done) VALUES
      ('${ELGON}', '${SYS_E}', '${AGR}', 'Depot user locked out', 'covered', 'normal', 'resolved',
       '2026-10-06 09:00+03', '2026-10-06 09:48+03', '2026-10-06 10:10+03', 'Access restored.'),
      ('${ELGON}', '${SYS_E}', '${AGR}', 'Transfer not in depot stock', 'covered', 'high', 'resolved',
       '2026-10-14 11:00+03', '2026-10-14 12:05+03', '2026-10-14 15:00+03', 'Corrected sync defect.'),
      ('${ELGON}', '${SYS_E}', '${AGR}', 'Next-month request', 'covered', 'normal', 'open',
       '2026-11-01 00:30+03', NULL, NULL, NULL),
      ('${ELGON}', '${SYS_E}', NULL, 'Chargeable extra', 'chargeable', 'normal', 'open',
       '2026-10-20 10:00+03', NULL, NULL, NULL);
    INSERT INTO public.incidents (client_id, system_id, service_agreement_id, title, description, severity, reported_by, opened_at)
      VALUES ('${ELGON}', '${SYS_E}', '${AGR}', 'Slow reports', 'Month-end reports slow', 'medium', '${ADMIN}', '2026-10-27 10:00+03');
  `);
  const inv = (await db.query(`INSERT INTO public.invoices (client_id, agreement_id, recurring_charge_id, currency, status,
      document_style, service_period_start, service_period_end)
    VALUES ('${ELGON}', '${AGR}', '33333333-0000-0000-0000-000000000001', 'UGX', 'draft', 'service', '2026-10-01', '2026-10-31')
    RETURNING id`)).rows[0].id;

  const rec = (await asUser(db, FIN, () => db.query(`SELECT public.invoice_service_record('${inv}') AS r`))).rows[0].r;
  assert.equal(rec.agreement.name, "Managed System Care");
  assert.deepEqual(rec.requests.map((r) => r.summary), ["Depot user locked out", "Transfer not in depot stock"]);
  assert.equal(rec.incidents.length, 1);
  assert.deepEqual(rec.backups, []);

  // Client: nothing while draft, the record once issued; another client never.
  const asClient = (who) => asUser(db, who, () => db.query(`SELECT public.invoice_service_record('${inv}') AS r`));
  assert.equal((await asClient(ELGON)).rows[0].r, null);
  await db.exec(`UPDATE public.invoices SET status = 'sent' WHERE id = '${inv}'`);
  assert.equal((await asClient(ELGON)).rows[0].r.requests.length, 2);
  assert.equal((await asClient(SOLVERS)).rows[0].r, null);
  assert.equal((await asUser(db, STAFF, () => db.query(`SELECT public.invoice_service_record('${inv}') AS r`))).rows[0].r, null);
});
