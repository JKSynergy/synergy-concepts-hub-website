// Phase A: business workspaces + shared services navigation (lib/navigation/workspaces.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NAV_GROUPS, navFor, isItemActive, activeGroupFor } from "../lib/navigation/workspaces.ts";
import { adminRouteRedirect, ROLES, type Role } from "../lib/security/roles.ts";

const hrefs = (role: Role) => navFor(role).flatMap((g) => g.items.map((i) => i.href));
const groups = (role: Role) => navFor(role).map((g) => g.label);

test("four business workspaces, then the four shared areas, in order", () => {
  assert.deepEqual(
    NAV_GROUPS.map((g) => `${g.kind}:${g.label}`),
    [
      "workspace:Concepts Hub", "workspace:Capture Films", "workspace:Creative Hub", "workspace:Multimedia Academy",
      "shared:Customers and contacts", "shared:Finance", "shared:Action Center", "shared:Administration",
    ]
  );
});

test("every linked route exists as a page (no placeholders, no broken links)", () => {
  for (const g of NAV_GROUPS) for (const i of g.items) {
    const file = `app${i.href}/page.tsx`;
    assert.ok(existsSync(file), `${i.label} links to ${i.href}, but ${file} does not exist`);
  }
});

test("no role is shown a link that the middleware would redirect it away from", () => {
  for (const role of ROLES) {
    for (const href of hrefs(role)) {
      assert.equal(adminRouteRedirect(role, href), null, `${role} is shown ${href} but would be redirected`);
    }
  }
});

test("admin sees every workspace and shared area, including Academy and Team", () => {
  assert.deepEqual(groups("admin"), [
    "Concepts Hub", "Capture Films", "Creative Hub", "Multimedia Academy",
    "Customers and contacts", "Finance", "Action Center", "Administration",
  ]);
  for (const h of ["/admin/academy", "/admin/staff", "/admin/invoices", "/admin/services/capture-films"]) {
    assert.ok(hrefs("admin").includes(h), h);
  }
});

test("staff: no finance, Academy or Team links; Capture Films price list visible (read-only page)", () => {
  const h = hrefs("staff");
  for (const blocked of ["/admin/invoices", "/admin/academy", "/admin/staff"]) assert.ok(!h.includes(blocked), blocked);
  assert.ok(h.includes("/admin/services/capture-films"));
  assert.ok(!groups("staff").includes("Multimedia Academy"));
});

test("finance keeps exactly its previous reach (plus the Action Center it could already open)", () => {
  assert.deepEqual(hrefs("finance").sort(), [
    "/admin/agreements", "/admin/clients", "/admin/invoices", "/admin/operations",
    "/admin/operations/action-center", "/admin/projects", "/admin/support",
  ]);
  assert.ok(!groups("finance").includes("Capture Films"));
  assert.ok(!groups("finance").includes("Creative Hub"));
});

test("clients and unknown roles get no admin navigation", () => {
  assert.deepEqual(navFor("client"), []);
  assert.deepEqual(navFor(null), []);
});

test("Creative Hub is a note, never a link", () => {
  const g = navFor("admin").find((x) => x.label === "Creative Hub")!;
  assert.equal(g.items.length, 0);
  assert.match(g.note ?? "", /No Creative Hub screens yet/);
});

test("exactly one item is current for each page, and the right workspace is named", () => {
  const cases: [string, string, string][] = [
    ["/admin", "Dashboard", "Concepts Hub"],
    ["/admin/bookings/123", "Enquiries", "Concepts Hub"],
    ["/admin/services/capture-films", "Price list", "Capture Films"],
    ["/admin/services", "Services", "Administration"],
    ["/admin/academy", "Courses", "Multimedia Academy"],
    ["/admin/operations/action-center", "Action Center", "Action Center"],
    ["/admin/operations/tasks", "Operations", "Administration"],
    ["/admin/finances/packages", "Invoices and payments", "Finance"],
    ["/admin/clients/abc", "Clients", "Customers and contacts"],
  ];
  for (const [path, label, group] of cases) {
    const current = NAV_GROUPS.flatMap((g) => g.items).filter((i) => isItemActive(i, path));
    assert.deepEqual(current.map((i) => i.label), [label], path);
    assert.equal(activeGroupFor(path)?.label, group, path);
  }
});

test("shell keeps same-tab links, a labelled nav per group and the keyboard drawer", () => {
  const shell = readFileSync("components/ux/app-shell.tsx", "utf8");
  assert.ok(!/target=/.test(shell), "navigation must open in the same tab");
  assert.match(shell, /<nav className="ux-nav" aria-label=\{g\.ariaLabel\}>/);
  assert.match(shell, /e\.key === "Escape"/);
  assert.match(shell, /aria-current=\{active\(i\) \? "page" : undefined\}/);
  const admin = readFileSync("components/ux/admin-shell.tsx", "utf8");
  assert.match(admin, /navFor\(role\)/);
});
