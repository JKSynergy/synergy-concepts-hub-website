import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const loginPage = readFileSync(join(here, "..", "app", "login", "page.tsx"), "utf8");
const callbackRoute = readFileSync(join(here, "..", "app", "auth", "callback", "route.ts"), "utf8");

describe("login page links and OAuth", () => {
  it('"Back to website" uses NEXT_PUBLIC_WEBSITE_URL with safe fallback and does not open a new tab', () => {
    const match = loginPage.match(/<a[\s\S]*?>\s*Back to website\s*<\/a>/);
    assert.ok(match, "Back to website link not found");
    const tag = match[0];
    assert.ok(tag.includes("process.env.NEXT_PUBLIC_WEBSITE_URL") || tag.includes("NEXT_PUBLIC_WEBSITE_URL"),
      "Back to website link should use NEXT_PUBLIC_WEBSITE_URL");
    assert.ok(!tag.includes('target="_blank"'), "Back to website should not open in a new tab");
  });

  it('"Continue with Google" uses the current origin for the OAuth callback', () => {
    assert.ok(loginPage.includes("signInWithOAuth"), "Google sign-in handler missing");
    assert.ok(loginPage.includes("provider: \"google\""), "Google provider missing");
    assert.ok(loginPage.includes("window.location.origin"), "Google OAuth redirectTo should be based on window.location.origin");
    assert.ok(loginPage.includes("/auth/callback"), "Google OAuth redirectTo must include /auth/callback");
  });

  it("auth callback uses the request origin for redirects", () => {
    assert.ok(callbackRoute.includes("const { searchParams, origin } = new URL(request.url)"),
      "Callback route must derive origin from request.url");
    assert.ok(callbackRoute.includes("${origin}/login"), "Callback must redirect to origin-based login path");
  });
});
