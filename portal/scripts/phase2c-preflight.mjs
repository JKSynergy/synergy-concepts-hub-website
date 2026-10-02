// Read-only preflight: confirms the DEV target is reachable through PostgREST and the 16 application tables are readable.
// Usage (PowerShell): load your DEV env vars, then  npm run phase2c:preflight
// On failure it prints the HTTP status plus PostgREST's error code (for example 42501 = missing table privilege).
import { guard, makeRedactor } from "./phase2c-guard.mjs";
import { createClient } from "./phase2c-lib.mjs";
const t = guard();
const redact = makeRedactor(() => [t.anonKey, t.serviceKey, t.dbUrl]);
const client = createClient({ url: t.url, anonKey: t.anonKey, serviceKey: t.serviceKey });
const svc = client.rest({ kind: "service" });
const tables = ["profiles", "service_catalog", "bookings", "leads", "projects", "project_assignments", "project_milestones", "project_updates",
  "deliverables", "invoices", "invoice_line_items", "payments", "receipts", "audit_logs", "document_counters", "academy_courses"];
let bad = 0;
for (const name of tables) {
  const r = await svc.get(name, { limit: 0 });
  console.log(redact(`${r.ok ? "OK  " : "FAIL"} ${name} (${r.status}${r.ok ? "" : ` ${r.code ?? ""} ${typeof r.body?.message === "string" ? r.body.message.slice(0, 80) : ""}`.trimEnd()})`));
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
