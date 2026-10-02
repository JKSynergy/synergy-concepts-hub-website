// The application's lifecycle function and the database trigger must agree on every transition.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { createDb, seed, asUser, asService } from "./helpers/db.mjs";
import { invoiceTransitionError } from "../lib/finance/lifecycle.ts";

let db, ids;
before(async () => { db = await createDb(); ids = await seed(db); });
const STATUSES = ["draft", "sent", "partially paid", "paid", "overdue", "cancelled"];

async function invoiceIn(scenario) {
  // scenario: unpaid statuses reached by admin edits; partial/paid through real payments
  const r = await asUser(db, ids.admin, async () => {
    const i = await db.query(`INSERT INTO public.invoices (client_id) VALUES ('${ids.c1}') RETURNING id`);
    await db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${i.rows[0].id}','x',1,100)`);
    return i.rows[0].id;
  });
  const set = (s) => asUser(db, ids.admin, () => db.exec(`UPDATE public.invoices SET status='${s}' WHERE id='${r}'`));
  if (scenario === "partially paid" || scenario === "paid") {
    await set("sent");
    await asService(db, () => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paid_at) VALUES ('${r}', ${scenario === "paid" ? 100 : 40}, 'cash', now())`));
  } else if (scenario !== "draft") await set(scenario === "cancelled" ? "sent" : scenario);
  if (scenario === "cancelled") await set("cancelled");
  return r;
}

for (const from of STATUSES) {
  test(`parity: every transition out of ${from}`, async () => {
    for (const to of STATUSES) {
      if (to === from) continue;
      const id = await invoiceIn(from);
      const paid = from === "paid" ? 100 : from === "partially paid" ? 40 : 0;
      const appSays = invoiceTransitionError(from, to, paid, 100);
      let dbSays = null;
      try {
        await asUser(db, ids.admin, () => db.exec(`UPDATE public.invoices SET status='${to}' WHERE id='${id}'`));
      } catch (e) { dbSays = e.message; }
      assert.equal(!!appSays, !!dbSays, `${from} -> ${to}: app=${appSays} db=${dbSays}`);
    }
  });
}
