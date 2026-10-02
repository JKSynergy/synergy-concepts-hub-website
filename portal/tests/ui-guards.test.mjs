// Source-level guards for the portal UX reset: one tab, native dialogs gone,
// no fake dashboard data, Academy out of the primary navigation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}
const files = [...walk("app"), ...walk("components")];
const read = (f) => readFileSync(f, "utf8");

// External destinations that legitimately open outside the app.
const EXTERNAL_TAB_ALLOWLIST = new Set([
  "app/admin/clients/[id]/page.tsx", // client's own external portal URL
  "app/client/profile/page.tsx", // client's own external portal URL
  "components/deliverables-section.tsx", // signed file-download URL
]);

test("internal routes never open in a new tab", () => {
  const offenders = files.filter((f) => /target=["']_blank["']|window\.open\(/.test(read(f)) && !EXTERNAL_TAB_ALLOWLIST.has(f.replaceAll("\\", "/")));
  assert.deepEqual(offenders, []);
});

test("no raw alert() or confirm() in the app", () => {
  const offenders = files.filter((f) => /(^|[^.\w])(alert|confirm)\(/m.test(read(f)) && !f.includes("feedback.tsx"));
  assert.deepEqual(offenders, []);
});

test("no full-page route transition animation", () => {
  const offenders = files.filter((f) => /AnimatePresence|framer-motion/.test(read(f)));
  assert.deepEqual(offenders, []);
});

test("admin navigation: Academy is not a primary item, operations group is labelled", () => {
  const shell = read("components/ux/admin-shell.tsx");
  assert.ok(!/href: "\/admin\/academy"/.test(shell));
  assert.ok(/label: "Operations"/.test(shell));
});

test("dashboard and login carry no invented metrics", () => {
  for (const f of ["app/admin/page.tsx", "app/login/page.tsx"]) {
    const s = read(f);
    assert.ok(!/99\.9|uptime|sparkline|Math\.random/i.test(s), `${f} contains a fake metric`);
  }
});

test("shared Dialog is the only modal implementation", () => {
  const allowed = new Set(["components/ux/dialog.tsx"]);
  const offenders = files.filter((f) => !allowed.has(f.replaceAll("\\", "/")) && /aria-modal|role=["'](alert)?dialog["']|ux-overlay|fixed inset-0/.test(read(f)));
  assert.deepEqual(offenders, []);
  // every component that opens a modal imports the shared Dialog or the feedback provider
  const usesDialog = files.filter((f) => /<Dialog[\s>]/.test(read(f)));
  for (const f of usesDialog) assert.ok(/from ["']@\/components\/ux\/dialog["']/.test(read(f)), `${f} renders <Dialog> without the shared import`);
});

test("authorization: no scattered role literals in access checks (use lib/security/roles.ts)", () => {
  const offenders = files.filter((f) => !f.endsWith("lib/security/roles.ts") && /role\)?\s*(===|!==)\s*["'](admin|staff|finance|client)["']/.test(read(f)));
  assert.deepEqual(offenders, []);
});

test("authorization: finance, admin-only and services rules are wired to the helpers", () => {
  const inv = read("lib/actions/invoices.ts");
  assert.ok(/canAccessFinance/.test(inv) && /isAdminRole\(role\)/.test(inv), "invoice actions: finance may operate, delete is admin-only");
  assert.ok(/invoiceTransitionError/.test(inv), "setInvoiceStatus validates the lifecycle");
  assert.ok(/canAccessFinance/.test(read("lib/actions/payments.ts")));
  assert.ok(/canManageServices/.test(read("lib/actions/bookings.ts")), "service writes are admin-only");
  assert.ok(/adminRouteRedirect/.test(read("lib/supabase/middleware.ts")), "middleware uses the shared route policy");
  for (const f of ["app/api/admin/staff/route.ts", "app/api/admin/invite-staff/route.ts"]) {
    const s = read(f);
    assert.ok(/isTeamRole/.test(s) && /isAdminRole/.test(s), `${f}: admin-only, role restricted to staff/finance`);
  }
});
