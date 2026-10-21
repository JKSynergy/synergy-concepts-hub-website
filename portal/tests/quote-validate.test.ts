// lib/quote/validate.ts, escape.ts, notify.ts and the CORS allowlist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateEnquiry, looksAutomated, isEmail, isPhone, MIN_FILL_MS } from "../lib/quote/validate.ts";
import { escapeHtml, safeHeaderText } from "../lib/quote/escape.ts";
import { enquiryEmail } from "../lib/quote/notify.ts";
import { quoteCorsHeaders } from "../lib/cors/quote.ts";

const base = { name: "Ann", email: "ann@example.com", phone: "+256 700 123456", service: "weddings", brief: "Hello", request_id: "3f2b6c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f" };

test("a normal enquiry is accepted, trimmed and lower-cases the request id", () => {
  const r = validateEnquiry({ ...base, name: "  Ann  ", request_id: base.request_id.toUpperCase() });
  assert.equal(r.kind, "ok");
  if (r.kind === "ok") {
    assert.equal(r.data.name, "Ann");
    assert.equal(r.data.requestId, base.request_id);
  }
});

test("legacy payloads (no phone, no request id, 'message' instead of 'brief') still validate", () => {
  const r = validateEnquiry({ name: "Ann", email: "ann@example.com", service: "media", message: "Hi" });
  assert.equal(r.kind, "ok");
  if (r.kind === "ok") assert.equal(r.data.brief, "Hi");
});

test("missing and malformed fields are reported per field", () => {
  const r = validateEnquiry({ name: "", email: "nope", phone: "abc", service: "Weddings!!", brief: "x".repeat(5001), request_id: "1" });
  assert.equal(r.kind, "invalid");
  if (r.kind === "invalid") {
    assert.deepEqual(r.errors.map((e) => e.field).sort(), ["brief", "email", "name", "phone", "request_id", "service"]);
  }
});

test("phone is required only when asked (structured quotations)", () => {
  assert.equal(validateEnquiry({ ...base, phone: "" }).kind, "ok");
  const r = validateEnquiry({ ...base, phone: "" }, { requirePhone: true });
  assert.equal(r.kind, "invalid");
});

test("non-object bodies are invalid", () => {
  for (const b of [null, "x", 3, [base]]) assert.equal(validateEnquiry(b).kind, "invalid");
});

test("honeypot and implausibly fast submissions are treated as automated", () => {
  assert.equal(validateEnquiry({ ...base, website: "http://spam.example" }).kind, "spam");
  assert.equal(validateEnquiry({ ...base, elapsed_ms: 400 }).kind, "spam");
  assert.equal(looksAutomated({ elapsed_ms: "5000" }), true);
  assert.equal(looksAutomated({ website: 1 }), true);
  assert.equal(validateEnquiry({ ...base, website: "", elapsed_ms: MIN_FILL_MS + 1 }).kind, "ok");
  assert.equal(looksAutomated({}), false); // older cached forms send neither field
});

test("email and phone checks", () => {
  assert.equal(isEmail("a@b.co"), true);
  assert.equal(isEmail("a@b"), false);
  assert.equal(isEmail("a b@c.com"), false);
  assert.equal(isEmail("<x>@c.com"), false);
  assert.equal(isPhone("0700 123 456"), true);
  assert.equal(isPhone("+256 (700) 123-456"), true);
  assert.equal(isPhone("12345"), false);
  assert.equal(isPhone("+256 700 123 456 789 000"), false);
});

test("customer text is escaped in the staff email; the subject has no control characters", () => {
  const { subject, html } = enquiryEmail({
    reference: "ENQ-2026-0001",
    name: "<script>alert(1)</script>\r\nBcc: x@y.z",
    email: "a@b.co",
    phone: null,
    service: "weddings",
    message: `<img src=x onerror="steal()">\nline two & more`,
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;steal()&quot;&gt;<br>line two &amp; more"));
  assert.ok(!/[\r\n]/.test(subject));
  assert.equal(escapeHtml(`'"&<>`), "&#39;&quot;&amp;&lt;&gt;");
  assert.equal(safeHeaderText("a\u0000b\nc"), "a b c");
});

test("CORS: approved origins from a comma-separated list; others get the first approved origin", () => {
  const prev = process.env.MARKETING_SITE_ORIGIN;
  process.env.MARKETING_SITE_ORIGIN = "https://synergyconceptshub.com, https://www.synergyconceptshub.com/";
  try {
    assert.equal(quoteCorsHeaders("https://www.synergyconceptshub.com")["Access-Control-Allow-Origin"], "https://www.synergyconceptshub.com");
    assert.equal(quoteCorsHeaders("https://synergyconceptshub.com")["Access-Control-Allow-Origin"], "https://synergyconceptshub.com");
    assert.equal(quoteCorsHeaders("https://evil.example")["Access-Control-Allow-Origin"], "https://synergyconceptshub.com");
    assert.equal(quoteCorsHeaders(null)["Access-Control-Allow-Origin"], "https://synergyconceptshub.com");
    assert.equal(quoteCorsHeaders(null, "GET, OPTIONS")["Access-Control-Allow-Methods"], "GET, OPTIONS");
  } finally {
    process.env.MARKETING_SITE_ORIGIN = prev;
  }
});

test("route: no raw database messages to the browser, escaped email, atomic RPC", () => {
  const src = readFileSync("app/api/quote/route.ts", "utf8");
  assert.ok(!/error\.message\s*}/.test(src), "must not return error.message to the client");
  assert.ok(!/from\("leads"\)\.insert|from\("bookings"\)\.insert/.test(src), "writes go through submit_quote_request()");
  assert.match(src, /rpc\("submit_quote_request"/);
  assert.match(src, /enquiryEmail\(/);
  assert.ok(!/html:\s*`/.test(src), "no hand-built HTML in the route");
});
