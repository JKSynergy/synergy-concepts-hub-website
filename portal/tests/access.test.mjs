import test from "node:test";
import assert from "node:assert/strict";
import {
  canViewInvoiceDocument, deliverableStoragePath, safeFileName, isUuid, isPortalRole,
} from "../lib/security/access.ts";
import { sanitizeAuditDetails } from "../lib/audit.ts";
import { generateTempPassword } from "../lib/security/temp-password.ts";

const PID = "10000000-0000-0000-0000-000000000001";

test("invoice PDF: ownership and draft rules", () => {
  const own = { client_id: "u1", status: "sent" };
  assert.equal(canViewInvoiceDocument({ role: "client", userId: "u1", invoice: own }), true);
  assert.equal(canViewInvoiceDocument({ role: "client", userId: "u2", invoice: own }), false);
  assert.equal(canViewInvoiceDocument({ role: "client", userId: "u1", invoice: { ...own, status: "draft" } }), false);
  assert.equal(canViewInvoiceDocument({ role: "client", userId: "u1", invoice: null }), false);
  assert.equal(canViewInvoiceDocument({ role: null, userId: "u1", invoice: own }), false);
  // finance data: admin and finance only; ordinary staff no longer (migration 012)
  assert.equal(canViewInvoiceDocument({ role: "staff", userId: "s", invoice: own }), false);
  assert.equal(canViewInvoiceDocument({ role: "admin", userId: "a", invoice: own }), true);
  assert.equal(canViewInvoiceDocument({ role: "finance", userId: "f", invoice: own }), true);
  assert.equal(canViewInvoiceDocument({ role: "finance", userId: "f", invoice: { ...own, status: "draft" } }), true);
});
test("deliverable path: only the record's own project folder is accepted", () => {
  assert.equal(deliverableStoragePath({ project_id: PID, file_url: `${PID}/a.pdf` }), `${PID}/a.pdf`);
  for (const bad of [
    "other-project/a.pdf", "../etc/passwd", `${PID}/../x.pdf`, `/${PID}/a.pdf`, `${PID}\\a.pdf`,
    "20000000-0000-0000-0000-000000000002/a.pdf", "", null,
  ]) assert.equal(deliverableStoragePath({ project_id: PID, file_url: bad }), null, String(bad));
  assert.equal(deliverableStoragePath({ project_id: "not-a-uuid", file_url: "not-a-uuid/a" }), null);
});
test("file names are reduced to a safe key", () => {
  assert.equal(safeFileName("../../evil/x y.pdf"), "x_y.pdf");
  assert.equal(safeFileName("..hidden"), "hidden");
  assert.equal(safeFileName(""), "file");
  assert.ok(safeFileName("a".repeat(500)).length <= 120);
});
test("uuid and role guards", () => {
  assert.equal(isUuid(PID), true); assert.equal(isUuid("1; drop table"), false); assert.equal(isUuid(undefined), false);
  assert.equal(isPortalRole("admin"), true); assert.equal(isPortalRole("superuser"), false);
});
test("audit details never carry secrets", () => {
  const out = sanitizeAuditDetails({ email: "a@b.c", password: "x", nested: { api_key: "k", Authorization: "Bearer z", ok: 1 }, list: [{ token: "t" }] });
  const s = JSON.stringify(out);
  for (const leak of ['"x"', '"k"', "Bearer", '"t"']) assert.equal(s.includes(leak), false, leak);
  assert.equal(out.email, "a@b.c"); assert.equal(out.nested.ok, 1);
});
test("temporary passwords are long, varied and not repeated", () => {
  const a = generateTempPassword(), b = generateTempPassword();
  assert.ok(a.length >= 12); assert.notEqual(a, b);
  assert.match(a, /[a-z]/); assert.match(a, /[A-Z]/); assert.match(a, /[0-9]/);
});
