import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import manifest from "../app/manifest.ts";
import nextConfig from "../next.config.ts";
import { resolvePostLoginRedirect, landingFor } from "../lib/security/roles.ts";

const here = dirname(fileURLToPath(import.meta.url));
const portalRoot = join(here, "..");

test("PWA manifest: valid JSON, standalone display, SCH Portal naming, branding colors, and compatible start_url/scope", () => {
  const raw = manifest();
  const serialized = JSON.stringify(raw);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.name, "Synergy Concepts Hub Portal");
  assert.equal(parsed.short_name, "SCH Portal");
  assert.equal(parsed.display, "standalone");
  assert.deepEqual(parsed.display_override, ["standalone", "browser"]);
  assert.equal(parsed.start_url, "/login");
  assert.equal(parsed.scope, "/");
  assert.equal(parsed.id, "/");
  assert.ok(parsed.start_url.startsWith(parsed.scope), "start_url must be within scope");
  assert.equal(parsed.background_color, "#0B0F19");
  assert.equal(parsed.theme_color, "#0B0F19");
});

test("PWA manifest: all referenced icon assets exist in public/ and are valid PNGs with matching dimensions", () => {
  const parsed = manifest();
  assert.ok(Array.isArray(parsed.icons) && parsed.icons.length >= 3, "manifest must declare icons");

  const has192Any = parsed.icons.some((i) => i.sizes === "192x192" && i.purpose === "any");
  const has512Any = parsed.icons.some((i) => i.sizes === "512x512" && i.purpose === "any");
  const hasMaskable = parsed.icons.some((i) => i.purpose === "maskable" && (i.sizes === "192x192" || i.sizes === "512x512"));
  assert.ok(has192Any, "192x192 'any' icon required");
  assert.ok(has512Any, "512x512 'any' icon required");
  assert.ok(hasMaskable, "maskable icon required");

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const icon of parsed.icons) {
    assert.equal(icon.type, "image/png");
    assert.ok(icon.src.startsWith("/"), `icon src must be root-relative: ${icon.src}`);
    const filePath = join(portalRoot, "public", icon.src.replace(/^\//, ""));
    assert.ok(existsSync(filePath), `missing icon asset: ${filePath}`);

    const buf = readFileSync(filePath);
    assert.ok(buf.subarray(0, 8).equals(pngSignature), `${icon.src} is not a valid PNG`);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(`${width}x${height}`, icon.sizes, `${icon.src} dimensions do not match declared sizes`);
  }
});

test("PWA metadata and single canonical manifest/registration setup", () => {
  // No competing static manifest files in portal/public
  assert.equal(existsSync(join(portalRoot, "public", "manifest.json")), false);
  assert.equal(existsSync(join(portalRoot, "public", "manifest.webmanifest")), false);
  assert.equal(existsSync(join(portalRoot, "app", "manifest.json")), false);

  const layoutSrc = readFileSync(join(portalRoot, "app", "layout.tsx"), "utf8");
  assert.ok(layoutSrc.includes('manifest: "/manifest.webmanifest"'), "root layout metadata links /manifest.webmanifest");
  assert.ok(layoutSrc.includes('themeColor: "#0B0F19"'), "root layout viewport sets #0B0F19 themeColor");
  assert.ok(layoutSrc.includes("<PwaRegister />"), "root layout mounts PwaRegister once");
  assert.ok(existsSync(join(portalRoot, "app", "icon.svg")), "existing SVG favicon is preserved");
  assert.ok(existsSync(join(portalRoot, "public", "images", "sch-logo-180.png")), "apple touch icon exists");
});

test("PWA headers and middleware matcher allow clean manifest and service worker delivery", async () => {
  const middlewareSrc = readFileSync(join(portalRoot, "middleware.ts"), "utf8");
  assert.ok(middlewareSrc.includes("manifest\\\\.webmanifest"), "middleware matcher excludes manifest.webmanifest");
  assert.ok(middlewareSrc.includes("sw\\\\.js"), "middleware matcher excludes sw.js");

  const headerRules = await nextConfig.headers();
  const swRule = headerRules.find((r) => r.source === "/sw.js");
  assert.ok(swRule, "next.config.ts defines headers for /sw.js");
  assert.ok(
    swRule.headers.some((h) => h.key === "Cache-Control" && h.value.includes("must-revalidate")),
    "/sw.js must revalidate on every check"
  );
  assert.ok(
    swRule.headers.some((h) => h.key === "Service-Worker-Allowed" && h.value === "/"),
    "/sw.js sets Service-Worker-Allowed: /"
  );

  const manifestRule = headerRules.find((r) => r.source === "/manifest.webmanifest");
  assert.ok(manifestRule, "next.config.ts defines headers for /manifest.webmanifest");
});

test("PWA routing, login destination preservation, and logout flow remain intact", () => {
  const homePageSrc = readFileSync(join(portalRoot, "app", "page.tsx"), "utf8");
  assert.ok(homePageSrc.includes('redirect("/login")'), "launch entry route / redirects to /login");

  const loginPageSrc = readFileSync(join(portalRoot, "app", "login", "page.tsx"), "utf8");
  assert.ok(loginPageSrc.includes("ux-login-brand"), "branded dark navy left panel is preserved");
  assert.ok(loginPageSrc.includes("ux-login-form"), "white authentication form panel is preserved");
  assert.ok(loginPageSrc.includes("resolvePostLoginRedirect"), "login form preserves safe intended destination");

  const supabaseMwSrc = readFileSync(join(portalRoot, "lib", "supabase", "middleware.ts"), "utf8");
  assert.ok(supabaseMwSrc.includes('loginUrl.searchParams.set("next"'), "middleware records intended deep link on unauthenticated redirect");
  assert.ok(supabaseMwSrc.includes("resolvePostLoginRedirect"), "middleware resolves post-login target safely");

  const appShellSrc = readFileSync(join(portalRoot, "components", "ux", "app-shell.tsx"), "utf8");
  assert.ok(appShellSrc.includes("auth.signOut()"), "signOut invalidates Supabase session");
  assert.ok(appShellSrc.includes('router.push("/login")'), "signOut redirects to /login");

  assert.equal(resolvePostLoginRedirect("admin", "/admin/operations/action-center"), "/admin/operations/action-center");
  assert.equal(resolvePostLoginRedirect("client", "/client/bookings"), "/client/bookings");
  assert.equal(resolvePostLoginRedirect("client", "/admin/operations"), landingFor("client"));
});

function createSwHarness({ fetchImpl } = {}) {
  const listeners = new Map();
  const stores = new Map();
  let skipWaitingCalled = 0;
  let claimCalled = 0;

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return {
        async add(url) {
          map.set(url, { status: 200, url });
        },
        async match(req) {
          const key = typeof req === "string" ? req : req.url;
          return map.get(key) ?? undefined;
        },
        async put(req, res) {
          const key = typeof req === "string" ? req : req.url;
          map.set(key, res);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };

  class MockResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.type = init.type ?? "basic";
      const map = new Map();
      for (const [k, v] of Object.entries(init.headers ?? {})) {
        map.set(k.toLowerCase(), v);
      }
      this.headers = {
        get: (k) => map.get(String(k).toLowerCase()) ?? null,
        has: (k) => map.has(String(k).toLowerCase()),
      };
    }
    clone() {
      return this;
    }
  }

  const selfObj = {
    location: { origin: "https://portal.synergyconceptshub.com" },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    skipWaiting() {
      skipWaitingCalled++;
      return Promise.resolve();
    },
    clients: {
      claim() {
        claimCalled++;
        return Promise.resolve();
      },
    },
  };

  const context = vm.createContext({
    self: selfObj,
    caches,
    URL,
    Promise,
    Set,
    Response: MockResponse,
    fetch: fetchImpl ?? (async (req) => new MockResponse("ok", { status: 200, type: "basic" })),
  });

  const swCode = readFileSync(join(portalRoot, "public", "sw.js"), "utf8");
  vm.runInContext(swCode, context);

  return {
    listeners,
    stores,
    MockResponse,
    get skipWaitingCalled() {
      return skipWaitingCalled;
    },
    get claimCalled() {
      return claimCalled;
    },
    setFetch(fn) {
      context.fetch = fn;
    },
  };
}

test("Service worker: install precaches brand assets and activates cleanly while purging stale portal caches", async () => {
  const h = createSwHarness();
  await h.stores.set("sch-portal-static-v0", new Map([["old", true]]));
  await h.stores.set("unrelated-cache", new Map([["keep", true]]));

  let installPromise;
  h.listeners.get("install")({
    waitUntil(p) {
      installPromise = p;
    },
  });
  await installPromise;
  assert.equal(h.skipWaitingCalled, 1);
  assert.ok(h.stores.has("sch-portal-static-v1"));

  let activatePromise;
  h.listeners.get("activate")({
    waitUntil(p) {
      activatePromise = p;
    },
  });
  await activatePromise;
  assert.equal(h.claimCalled, 1);
  assert.equal(h.stores.has("sch-portal-static-v0"), false, "stale sch-portal-* cache must be deleted on activate");
  assert.equal(h.stores.has("unrelated-cache"), true);
});

test("Service worker: never intercepts or caches authenticated HTML, API routes, RSC payloads, mutations, or cross-origin requests", async () => {
  let networkCalls = 0;
  const h = createSwHarness({
    fetchImpl: async () => {
      networkCalls++;
      return new h.MockResponse("<html>sensitive dashboard</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    },
  });

  const invokeFetch = (req) => {
    let responded = null;
    h.listeners.get("fetch")({
      request: req,
      respondWith(p) {
        responded = p;
      },
    });
    return responded;
  };

  // 1. Non-GET mutation / upload / auth requests are not intercepted
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = invokeFetch({
      method,
      url: "https://portal.synergyconceptshub.com/api/admin/clients",
      mode: "cors",
      headers: new Map(),
    });
    assert.equal(res, null, `${method} request must not be intercepted`);
  }

  // 2. Cross-origin requests (Supabase Auth/REST, Paystack) are not intercepted
  for (const url of [
    "https://project.supabase.co/auth/v1/token",
    "https://project.supabase.co/rest/v1/invoices",
    "https://api.paystack.co/transaction/initialize",
  ]) {
    const res = invokeFetch({ method: "GET", url, mode: "cors", headers: new Map() });
    assert.equal(res, null, `cross-origin request ${url} must not be intercepted`);
  }

  // 3. RSC payloads and Server Actions are never intercepted or cached
  assert.equal(
    invokeFetch({
      method: "GET",
      url: "https://portal.synergyconceptshub.com/admin/invoices?_rsc=1a2b3",
      mode: "cors",
      headers: new Map([["RSC", "1"]]),
    }),
    null
  );
  assert.equal(
    invokeFetch({
      method: "GET",
      url: "https://portal.synergyconceptshub.com/admin/projects",
      mode: "cors",
      headers: new Map([["Next-Action", "abc"]]),
    }),
    null
  );

  // 4. Sensitive API/auth/admin/client sub-requests are never intercepted
  for (const path of [
    "/api/invoices/123/pdf",
    "/api/receipts/456/pdf",
    "/api/admin/clients",
    "/auth/callback?code=xyz",
    "/admin/finances",
    "/client/invoices",
  ]) {
    const res = invokeFetch({
      method: "GET",
      url: `https://portal.synergyconceptshub.com${path}`,
      mode: "cors",
      headers: new Map(),
    });
    assert.equal(res, null, `sensitive sub-request ${path} must bypass SW cache`);
  }

  // 5. Navigation requests (HTML pages) go to network and are NEVER stored in cache
  for (const navPath of ["/login", "/admin", "/admin/invoices/123", "/client", "/client/projects/456"]) {
    const p = invokeFetch({
      method: "GET",
      url: `https://portal.synergyconceptshub.com${navPath}`,
      mode: "navigate",
      headers: new Map(),
    });
    assert.ok(p, `navigation to ${navPath} is handled with network + offline fallback`);
    const response = await p;
    assert.equal(response.status, 200);
    const cache = await h.stores.get("sch-portal-static-v1");
    assert.equal(cache?.has(`https://portal.synergyconceptshub.com${navPath}`) ?? false, false, `HTML navigation ${navPath} must never be cached`);
  }
  assert.equal(networkCalls, 5);
});

test("Service worker: caches immutable /_next/static/* assets safely and handles offline navigation honestly", async () => {
  let staticNetworkHits = 0;
  const h = createSwHarness({
    fetchImpl: async (req) => {
      staticNetworkHits++;
      return new h.MockResponse("console.log('chunk')", {
        status: 200,
        type: "basic",
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      });
    },
  });

  const invokeFetch = (req) => {
    let responded = null;
    h.listeners.get("fetch")({
      request: req,
      respondWith(p) {
        responded = p;
      },
    });
    return responded;
  };

  const chunkUrl = "https://portal.synergyconceptshub.com/_next/static/chunks/main-12345.js";
  const r1 = await invokeFetch({ method: "GET", url: chunkUrl, mode: "no-cors", headers: new Map() });
  assert.equal(r1.status, 200);
  assert.equal(staticNetworkHits, 1);

  // Second request for the same hashed chunk is served from STATIC_CACHE
  const r2 = await invokeFetch({ method: "GET", url: chunkUrl, mode: "no-cors", headers: new Map() });
  assert.equal(r2.status, 200);
  assert.equal(staticNetworkHits, 1);

  // Private or Set-Cookie responses are never cached even under /_next/static/
  h.setFetch(async () => new h.MockResponse("secret", { status: 200, headers: { "Set-Cookie": "s=1" } }));
  const noCacheUrl = "https://portal.synergyconceptshub.com/_next/static/chunks/private-chunk.js";
  await invokeFetch({ method: "GET", url: noCacheUrl, mode: "no-cors", headers: new Map() });
  assert.equal(h.stores.get("sch-portal-static-v1").has(noCacheUrl), false);

  // Offline navigation returns honest 503 HTML response with Cache-Control: no-store
  h.setFetch(async () => {
    throw new Error("network down");
  });
  const offlineNav = await invokeFetch({
    method: "GET",
    url: "https://portal.synergyconceptshub.com/admin",
    mode: "navigate",
    headers: new Map(),
  });
  assert.equal(offlineNav.status, 503);
  assert.equal(offlineNav.headers.get("cache-control"), "no-store");
  assert.ok(offlineNav.body.includes("Connection unavailable"));
});
