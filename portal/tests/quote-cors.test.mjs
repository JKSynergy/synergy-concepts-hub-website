import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const ORIGIN = "https://www.synergyconceptshub.com";

describe("/api/quote CORS helper", () => {
  let quoteCorsHeaders;
  let prevOrigin;

  before(async () => {
    prevOrigin = process.env.MARKETING_SITE_ORIGIN;
    process.env.MARKETING_SITE_ORIGIN = ORIGIN;
    const mod = await import("../lib/cors/quote.ts");
    quoteCorsHeaders = mod.quoteCorsHeaders;
  });

  after(() => {
    process.env.MARKETING_SITE_ORIGIN = prevOrigin;
  });

  it("returns the configured marketing-site origin", () => {
    const headers = quoteCorsHeaders(ORIGIN);
    assert.equal(headers["Access-Control-Allow-Origin"], ORIGIN);
    assert.equal(headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
    assert.equal(headers["Access-Control-Allow-Headers"], "Content-Type");
    assert.equal(headers["Access-Control-Max-Age"], "86400");
    assert.equal(headers["Vary"], "Origin");
  });

  it("uses the configured origin even when the request origin differs", () => {
    const headers = quoteCorsHeaders("https://example.com");
    assert.equal(headers["Access-Control-Allow-Origin"], ORIGIN);
  });

  it("does not use wildcard when an allowed origin is configured", () => {
    const headers = quoteCorsHeaders(null);
    assert.notEqual(headers["Access-Control-Allow-Origin"], "*");
    assert.equal(headers["Access-Control-Allow-Origin"], ORIGIN);
  });

  it("falls back to the request origin when no origin is configured", async () => {
    process.env.MARKETING_SITE_ORIGIN = "";
    const mod = await import("../lib/cors/quote.ts");
    const headers = mod.quoteCorsHeaders(ORIGIN);
    assert.equal(headers["Access-Control-Allow-Origin"], ORIGIN);
    process.env.MARKETING_SITE_ORIGIN = ORIGIN;
  });
});
