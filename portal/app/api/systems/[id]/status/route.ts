import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/security/access";
import { hashStatusToken, constantTimeCompareHashes } from "@/lib/system-status/tokens";

/**
 * Managed-application status endpoint.
 *
 * Response contract (what integrating apps may rely on):
 *   200 { status: "live" | "suspended" }  — authoritative answer
 *   404 { error: "Not found" }            — unknown system or bad token (no enumeration)
 *   429 { error: "Too many requests" }    — too many FAILED auth attempts; not a status
 *   503 { error: "Status unavailable" }   — portal could not determine status; not a status
 *
 * Only a 200 is a status. Apps must treat 429/503/network errors as "unknown"
 * and keep their last known status — never as "suspended".
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

// Brute-force guard: counts only failed token attempts, per client IP + system.
// Valid-token checks are never throttled, so a healthy app can't be locked out.
const FAIL_WINDOW_MS = 60_000;
const MAX_FAILURES_PER_WINDOW = 20;
const failedAttempts = new Map<string, number[]>();

function recentFailures(key: string): number[] {
  const now = Date.now();
  const recent = (failedAttempts.get(key) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (recent.length) failedAttempts.set(key, recent);
  else failedAttempts.delete(key);
  return recent;
}

function recordFailure(key: string) {
  const recent = recentFailures(key);
  recent.push(Date.now());
  failedAttempts.set(key, recent);
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function sanitizeSystemId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.split(".")[0];
  return isUuid(id) ? id : null;
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  const token = parts[1]?.trim();
  return token || null;
}

function json(body: unknown, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const systemId = sanitizeSystemId(rawId);

  if (!systemId) {
    return json({ error: "Not found" }, 404);
  }

  const failKey = `${clientIp(req)}:${systemId}`;
  if (recentFailures(failKey).length >= MAX_FAILURES_PER_WINDOW) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }

  const token = extractBearerToken(req.headers.get("authorization"));

  let system: { id: string; status: string; status_token_hash: string | null } | null = null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("systems")
      .select("id, status, status_token_hash")
      .eq("id", systemId)
      .maybeSingle();

    if (error) {
      // A database failure is NOT "not found" — report it as unavailable so
      // apps keep their last known status instead of failing closed.
      console.error("[system-status] lookup failed", { systemId, code: error.code });
      return json({ error: "Status unavailable" }, 503, { "Retry-After": "30" });
    }
    system = data;
  } catch (err) {
    console.error("[system-status] lookup threw", { systemId, err: String(err) });
    return json({ error: "Status unavailable" }, 503, { "Retry-After": "30" });
  }

  if (!system || !system.status_token_hash) {
    // Same response for unknown system and missing token: no enumeration.
    recordFailure(failKey);
    return json({ error: "Not found" }, 404);
  }

  const providedHash = hashStatusToken(token ?? "");
  if (!constantTimeCompareHashes(system.status_token_hash, providedHash)) {
    recordFailure(failKey);
    return json({ error: "Not found" }, 404);
  }

  const status = system.status === "suspended" ? "suspended" : "live";
  return json({ status }, 200);
}
