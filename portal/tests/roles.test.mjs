// Application-layer role policy (lib/security/roles.ts) and invoice lifecycle rules (lib/finance/lifecycle.ts).
import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../lib/security/roles.ts";
import { invoiceTransitionError, availableInvoiceActions } from "../lib/finance/lifecycle.ts";

test("role predicates: finance is not admin and not operational staff", () => {
  assert.equal(R.canAccessFinance("admin"), true);
  assert.equal(R.canAccessFinance("finance"), true);
  assert.equal(R.canAccessFinance("staff"), false);
  assert.equal(R.canAccessFinance("client"), false);
  assert.equal(R.canAccessFinance(null), false);
  assert.equal(R.isAdmin("finance"), false);
  assert.equal(R.isOperationalStaff("finance"), false);
  assert.equal(R.isOperationalStaff("staff"), true);
  assert.equal(R.isInternal("finance"), true);
  assert.equal(R.isInternal("client"), false);
  assert.equal(R.canManageTeam("finance"), false);
  assert.equal(R.canManageServices("staff"), false);
  assert.equal(R.canManageServices("finance"), false);
  assert.equal(R.canManageServices("admin"), true);
  assert.equal(R.isRole("finance"), true);
  assert.equal(R.isRole("owner"), false);
});

test("only staff and finance can be assigned through the team forms (never admin or client)", () => {
  assert.equal(R.isTeamRole("staff"), true);
  assert.equal(R.isTeamRole("finance"), true);
  assert.equal(R.isTeamRole("admin"), false);
  assert.equal(R.isTeamRole("client"), false);
  assert.equal(R.isTeamRole(undefined), false);
});

test("landing page by role", () => {
  assert.equal(R.landingFor("admin"), "/admin");
  assert.equal(R.landingFor("staff"), "/admin");
  assert.equal(R.landingFor("finance"), "/admin/invoices");
  assert.equal(R.landingFor("client"), "/client");
  assert.equal(R.landingFor(null), "/client");
});

test("route policy: clients are sent to /client from every /admin path", () => {
  for (const p of ["/admin", "/admin/invoices", "/admin/staff", "/admin/clients"]) assert.equal(R.adminRouteRedirect("client", p), "/client");
  assert.equal(R.adminRouteRedirect(null, "/admin"), "/client");
});

test("route policy: admin reaches everything", () => {
  for (const p of ["/admin", "/admin/invoices/1", "/admin/staff", "/admin/academy", "/admin/services", "/admin/reports"]) assert.equal(R.adminRouteRedirect("admin", p), null);
});

test("route policy: staff cannot reach finance, reports, academy or team; can reach operational pages", () => {
  for (const p of ["/admin/invoices", "/admin/invoices/new", "/admin/invoices/x/edit", "/admin/finances", "/admin/reports", "/admin/academy", "/admin/staff"]) {
    assert.equal(R.adminRouteRedirect("staff", p), "/admin", p);
  }
  for (const p of ["/admin", "/admin/clients", "/admin/projects/1", "/admin/leads", "/admin/bookings/calendar", "/admin/services", "/admin/systems", "/admin/operations"]) {
    assert.equal(R.adminRouteRedirect("staff", p), null, p);
  }
  assert.equal(R.adminRouteRedirect("staff", "/admin/invoicesx"), null); // prefix match is by path segment
});

test("route policy: finance reaches finance, clients, projects and operations (read-only); nothing administrative", () => {
  assert.equal(R.adminRouteRedirect("finance", "/admin"), "/admin/invoices");
  for (const p of ["/admin/invoices", "/admin/invoices/new", "/admin/invoices/x/edit", "/admin/finances", "/admin/reports", "/admin/clients", "/admin/clients/1", "/admin/projects", "/admin/projects/1", "/admin/operations", "/admin/operations/tasks", "/admin/operations/incidents"]) {
    assert.equal(R.adminRouteRedirect("finance", p), null, p);
  }
  for (const p of ["/admin/staff", "/admin/academy", "/admin/services", "/admin/leads", "/admin/bookings", "/admin/bookings/calendar", "/admin/systems"]) {
    assert.equal(R.adminRouteRedirect("finance", p), "/admin/invoices", p);
  }
});

test("post-login redirect: preserves allowed internal deep links and blocks unauthorized or external URLs", () => {
  assert.equal(R.resolvePostLoginRedirect("admin", "/admin/projects/123?tab=files"), "/admin/projects/123?tab=files");
  assert.equal(R.resolvePostLoginRedirect("admin", "/admin/staff"), "/admin/staff");
  assert.equal(R.resolvePostLoginRedirect("admin", "/client/projects"), "/admin");

  assert.equal(R.resolvePostLoginRedirect("staff", "/admin/projects/123"), "/admin/projects/123");
  assert.equal(R.resolvePostLoginRedirect("staff", "/admin/invoices"), "/admin");
  assert.equal(R.resolvePostLoginRedirect("staff", "/admin/staff"), "/admin");
  assert.equal(R.resolvePostLoginRedirect("staff", "/client"), "/admin");

  assert.equal(R.resolvePostLoginRedirect("finance", "/admin/finances/provider-costs"), "/admin/finances/provider-costs");
  assert.equal(R.resolvePostLoginRedirect("finance", "/admin/staff"), "/admin/invoices");
  assert.equal(R.resolvePostLoginRedirect("finance", "/admin"), "/admin/invoices");

  assert.equal(R.resolvePostLoginRedirect("client", "/client/invoices/abc-123"), "/client/invoices/abc-123");
  assert.equal(R.resolvePostLoginRedirect("client", "/admin/projects"), "/client");

  for (const bad of [null, undefined, "", "https://evil.example/admin", "//evil.example/admin", "/\\evil.example", "/login", "/auth/callback"]) {
    assert.equal(R.resolvePostLoginRedirect("admin", bad), "/admin", String(bad));
    assert.equal(R.resolvePostLoginRedirect("client", bad), "/client", String(bad));
  }
});

// ── Lifecycle (server-action layer); parity with the database is in lifecycle-parity.test.mjs ──
test("lifecycle: SENT -> DRAFT is refused with a readable message", () => {
  for (const from of ["sent", "overdue", "cancelled", "partially paid", "paid"]) assert.match(invoiceTransitionError(from, "draft", 0, 100), /cannot return to draft/);
  assert.equal(invoiceTransitionError("draft", "draft", 0, 100), null);
});
test("lifecycle: PAID and PARTIALLY PAID cannot be cancelled", () => {
  assert.match(invoiceTransitionError("paid", "cancelled", 100, 100), /cannot be cancelled/);
  assert.match(invoiceTransitionError("partially paid", "cancelled", 40, 100), /cannot be cancelled/);
  assert.match(invoiceTransitionError("sent", "cancelled", 40, 100), /cannot be cancelled/); // has payments
});
test("lifecycle: valid transitions are allowed", () => {
  assert.equal(invoiceTransitionError("draft", "sent", 0, 100), null);
  assert.equal(invoiceTransitionError("sent", "overdue", 0, 100), null);
  assert.equal(invoiceTransitionError("overdue", "sent", 0, 100), null);
  assert.equal(invoiceTransitionError("sent", "cancelled", 0, 100), null);
  assert.equal(invoiceTransitionError("draft", "cancelled", 0, 100), null);
  assert.equal(invoiceTransitionError("sent", "partially paid", 40, 100), null);
  assert.equal(invoiceTransitionError("partially paid", "paid", 100, 100), null);
});
test("lifecycle: paid / partially paid only through payments", () => {
  assert.ok(invoiceTransitionError("sent", "paid", 0, 100));
  assert.ok(invoiceTransitionError("sent", "paid", 50, 100));
  assert.ok(invoiceTransitionError("sent", "partially paid", 0, 100));
  assert.ok(invoiceTransitionError("sent", "partially paid", 100, 100));
});
test("lifecycle: UI actions are hidden/disabled when the transition is impossible", () => {
  assert.deepEqual(availableInvoiceActions("draft"), { markSent: true, markOverdue: false, cancel: true });
  assert.deepEqual(availableInvoiceActions("sent"), { markSent: false, markOverdue: true, cancel: true });
  assert.deepEqual(availableInvoiceActions("paid", true), { markSent: false, markOverdue: false, cancel: false });
  assert.deepEqual(availableInvoiceActions("partially paid", true), { markSent: false, markOverdue: false, cancel: false });
  assert.equal(availableInvoiceActions("cancelled").cancel, false);
});
