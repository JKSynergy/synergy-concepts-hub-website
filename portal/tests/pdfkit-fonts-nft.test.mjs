import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const nft = join(
  here,
  "..",
  ".next",
  "server",
  "app",
  "api",
  "invoices",
  "[id]",
  "pdf",
  "route.js.nft.json"
);

test("pdf route output trace includes pdfkit standard fonts", () => {
  if (!existsSync(nft)) {
    return test.skip("No build output to inspect; run next build first.");
  }
  const contents = readFileSync(nft, "utf8");
  assert.ok(contents.includes("Helvetica.cjs"),
    "Expected Helvetica standard font to be traced for the invoice PDF route");
  assert.ok(contents.includes("HelveticaBold.cjs"),
    "Expected HelveticaBold standard font to be traced for the invoice PDF route");
});
