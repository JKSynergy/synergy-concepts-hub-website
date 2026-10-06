/**
 * Phase 3G-1 — read-only provider HTTP transport.
 *
 * Enforcement rules:
 *  - Only GET requests are allowed, EXCEPT an explicit GraphQL read to an
 *    adapter-declared endpoint whose query body contains no `mutation`.
 *  - Every call goes through an allowlist of (host, path-prefix, method)
 *    declared by the calling adapter — adapters cannot hit arbitrary URLs.
 *  - Responses are never thrown raw: errors are normalized into a
 *    ConnectionErrorCategory plus a short secret-free message. Credentials are
 *    never included in errors or logs.
 */

import type { ConnectionErrorCategory, ProviderOperationResultCategory } from "./types.ts";

export interface EndpointRule {
  host: string;
  pathPrefix: string;
  methods: readonly ("GET" | "POST")[];
  /**
   * Optional trailing-path constraint (e.g. "/pause"). When set, the request
   * path must START with pathPrefix AND END with pathSuffix — so a rule cannot
   * be widened to arbitrary sub-paths of a resource collection.
   */
  pathSuffix?: string;
}

export class ProviderHttpError extends Error {
  category: ConnectionErrorCategory;
  constructor(category: ConnectionErrorCategory, message: string) {
    super(message);
    this.category = category;
  }
}

const TIMEOUT_MS = 15_000;

function assertAllowed(url: URL, method: string, rules: EndpointRule[]): void {
  const match = rules.some(
    (r) =>
      url.host === r.host &&
      url.pathname.startsWith(r.pathPrefix) &&
      (r.pathSuffix === undefined || url.pathname.endsWith(r.pathSuffix)) &&
      (r.methods as readonly string[]).includes(method)
  );
  if (!match) {
    throw new ProviderHttpError(
      "malformed_response",
      `Request blocked by read-only allowlist: ${method} ${url.host}${url.pathname}`
    );
  }
}

function assertReadQuery(body: unknown): void {
  if (typeof body !== "string") {
    throw new ProviderHttpError("malformed_response", "GraphQL body must be a query string");
  }
  if (/\bmutation\b/i.test(body)) {
    throw new ProviderHttpError("malformed_response", "Mutation operations are not permitted");
  }
}

export function normalizeStatus(status: number): ConnectionErrorCategory {
  if (status === 401) return "auth_failed";
  if (status === 403) return "permission_denied";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "malformed_response";
}

/**
 * Perform a read-only provider request.
 *
 * @param rules   Adapter-declared endpoint allowlist.
 * @param url     Full URL (must match an allowlist rule).
 * @param token   Bearer token — used only in the Authorization header.
 * @param graphql Optional GraphQL read query; when set the request is a POST
 *                carrying { query } and the body is asserted mutation-free.
 */
export async function providerRead(
  rules: EndpointRule[],
  url: string,
  token: string,
  graphql?: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const u = new URL(url);
  const method = graphql ? "POST" : "GET";
  assertAllowed(u, method, rules);
  if (graphql) assertReadQuery(graphql);

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: graphql
        ? JSON.stringify({ query: graphql, ...(variables ? { variables } : {}) })
        : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ProviderHttpError("network_error", "Provider endpoint unreachable");
  }

  if (!res.ok) {
    throw new ProviderHttpError(normalizeStatus(res.status), `Provider returned HTTP ${res.status}`);
  }

  try {
    return await res.json();
  } catch {
    throw new ProviderHttpError("malformed_response", "Provider returned non-JSON response");
  }
}

/**
 * Same as `providerRead`, but returns the HTTP status with the parsed body so
 * adapters can log or inspect it safely. Used by the Railway adapter for
 * temporary GraphQL diagnostics.
 */
export async function providerReadWithStatus(
  rules: EndpointRule[],
  url: string,
  token: string,
  graphql?: string,
  variables?: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const u = new URL(url);
  const method = graphql ? "POST" : "GET";
  assertAllowed(u, method, rules);
  if (graphql) assertReadQuery(graphql);

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: graphql
        ? JSON.stringify({ query: graphql, ...(variables ? { variables } : {}) })
        : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ProviderHttpError("network_error", "Provider endpoint unreachable");
  }

  if (!res.ok) {
    throw new ProviderHttpError(normalizeStatus(res.status), `Provider returned HTTP ${res.status}`);
  }

  try {
    return { status: res.status, body: await res.json() };
  } catch {
    throw new ProviderHttpError("malformed_response", "Provider returned non-JSON response");
  }
}

// ============================================================================
// Phase 3G-3 — typed mutation transport
// ============================================================================
// providerMutate performs an explicitly-declared provider operation call.
// Same allowlist enforcement as providerRead — adapters cannot hit arbitrary
// endpoints. Returns a NORMALIZED result category: HTTP 2xx acknowledges the
// request only; callers must verify actual provider state separately. A
// timeout/abort maps to `execution_unknown` (the request may have landed), a
// refused connection maps to `network_error` (the request never landed).
export interface ProviderMutationResponse {
  category: ProviderOperationResultCategory;
  /** Raw body is parsed but callers must extract only normalized fields. */
  body?: unknown;
  message?: string;
}

export async function providerMutate(
  rules: EndpointRule[],
  url: string,
  token: string,
  options: { method?: "POST" | "GET"; idempotencyKey?: string } = {}
): Promise<ProviderMutationResponse> {
  const u = new URL(url);
  const method = options.method ?? "POST";
  assertAllowed(u, method, rules);

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { category: "execution_unknown", message: "Provider request timed out — outcome unknown" };
    }
    return { category: "network_error", message: "Provider endpoint unreachable" };
  }

  if (res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined; // empty/2xx no-body responses are normal for lifecycle ops
    }
    return { category: res.status === 202 ? "accepted" : "success", body };
  }

  // Read the body for "already in desired state" hints; never surface it raw.
  let errText = "";
  try {
    errText = await res.text();
  } catch { /* ignore */ }
  const alreadyDesired = /already (paused|suspended|inactive|active|running|resumed|restored)/i.test(errText);

  if (res.status === 401) return { category: "auth_failed", message: "Provider authentication failed" };
  if (res.status === 403) return { category: "permission_denied", message: "Credential lacks permission" };
  if (res.status === 404) return { category: "not_found", message: "Provider resource not found" };
  if (res.status === 409) {
    return { category: alreadyDesired ? "already_in_desired_state" : "conflict", message: "Provider rejected the state change" };
  }
  if (res.status === 429) return { category: "rate_limited", message: "Provider rate limit reached" };
  if (res.status >= 500) return { category: "unavailable", message: "Provider service unavailable" };
  return {
    category: alreadyDesired ? "already_in_desired_state" : "invalid_request",
    message: "Provider rejected the request",
  };
}
