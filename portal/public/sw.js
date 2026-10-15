// SCH Portal Service Worker
// Safe caching policy for a multi-role authenticated portal:
// - Caches ONLY versioned static build assets (/_next/static/*) and public brand icons/logos.
// - NEVER caches HTML pages, RSC payloads, Server Actions, /api/* routes, /auth/* routes,
//   authenticated data, or cross-origin requests (e.g., Supabase, Paystack, Google OAuth).
// - Navigation requests always go to the network so auth redirects, session cookies,
//   and role-based access controls remain authoritative and fresh.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `sch-portal-static-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/icon.svg",
  "/images/sch-logo-180.png",
  "/images/sch-logo-192.png",
  "/images/sch-logo-512.png",
  "/images/sch-logo-maskable-192.png",
  "/images/sch-logo-maskable-512.png",
  "/images/Website%20Logo%202.png",
];

const PUBLIC_BRAND_ASSET_PATHS = new Set([
  "/icon.svg",
  "/images/sch-logo-180.png",
  "/images/sch-logo-192.png",
  "/images/sch-logo-512.png",
  "/images/sch-logo-maskable-192.png",
  "/images/sch-logo-maskable-512.png",
  "/images/Website%20Logo%202.png",
  "/images/Website Logo 2.png",
  "/images/logo-with-black.png",
]);

const SENSITIVE_PATH_PREFIXES = [
  "/api",
  "/auth",
  "/admin",
  "/client",
  "/login",
  "/forgot-password",
];

function isSensitivePath(pathname) {
  return SENSITIVE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

function isNextImmutableStatic(pathname) {
  return pathname.startsWith("/_next/static/");
}

function isPublicBrandAsset(pathname) {
  return PUBLIC_BRAND_ASSET_PATHS.has(pathname);
}

function isRscOrServerActionRequest(request, url) {
  if (url.searchParams.has("_rsc")) return true;
  const headers = request.headers;
  if (!headers || typeof headers.get !== "function") return false;
  const rsc = headers.get("RSC") || headers.get("rsc");
  const nextAction = headers.get("Next-Action") || headers.get("next-action");
  const prefetch = headers.get("Next-Router-Prefetch") || headers.get("next-router-prefetch");
  return rsc === "1" || Boolean(nextAction) || Boolean(prefetch);
}

function isCacheableStaticResponse(response) {
  if (!response || response.status !== 200 || response.type !== "basic") {
    return false;
  }
  const cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) {
    return false;
  }
  if (response.headers.has("Set-Cookie")) {
    return false;
  }
  return true;
}

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0B0F19" />
  <title>Offline — SCH Portal</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0B0F19;
      color: #FFFFFF;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 24px;
      box-sizing: border-box;
    }
    main {
      max-width: 420px;
      width: 100%;
      border-top: 2px solid #ED8C22;
      padding-top: 20px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0 0 20px;
      font-size: 14px;
      line-height: 1.55;
      color: rgba(255, 255, 255, 0.72);
    }
    button {
      background: #ED8C22;
      color: #0B0F19;
      border: 0;
      padding: 10px 18px;
      font: 600 13.5px Inter, system-ui, sans-serif;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main>
    <h1>Connection unavailable</h1>
    <p>Synergy Concepts Hub Portal requires an active internet connection to verify your session and load live records.</p>
    <button type="button" onclick="window.location.reload()">Try again</button>
  </main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName.startsWith("sch-portal-")) {
              return caches.delete(cacheName);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept mutations, uploads, or non-GET requests.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept non-HTTP(S) or cross-origin requests (Supabase, Paystack, OAuth, etc.).
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;

  // Never cache or intercept RSC data requests or Server Actions.
  if (isRscOrServerActionRequest(request, url)) return;

  // Navigation requests always go directly to the network so SSR, middleware,
  // authentication cookies, and role redirects are never served from cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          })
      )
    );
    return;
  }

  // Never intercept or cache API, auth, or protected route sub-requests.
  if (isSensitivePath(url.pathname)) return;

  // Manifest: network-first so updates are picked up immediately, fallback to cache.
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(handleNetworkFirstStatic(request));
    return;
  }

  // Versioned Next.js build assets: cache-first.
  if (isNextImmutableStatic(url.pathname)) {
    event.respondWith(handleCacheFirstStatic(request));
    return;
  }

  // Official public brand icons/logos: stale-while-revalidate.
  if (isPublicBrandAsset(url.pathname)) {
    event.respondWith(handleStaleWhileRevalidateStatic(request));
    return;
  }
});

async function handleCacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableStaticResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleStaleWhileRevalidateStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (isCacheableStaticResponse(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;
  return fetch(request);
}

async function handleNetworkFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheableStaticResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
