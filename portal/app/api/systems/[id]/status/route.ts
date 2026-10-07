import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/security/access";
import { hashStatusToken, constantTimeCompareHashes } from "@/lib/system-status/tokens";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const requestTimestamps = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const window = requestTimestamps.get(key) ?? [];
  const recent = window.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  requestTimestamps.set(key, recent);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true;
  recent.push(now);
  return false;
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const systemId = sanitizeSystemId(rawId);

  if (!systemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isRateLimited(systemId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const authHeader = _req.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  const supabase = createAdminClient();

  // Load only the status and token hash. Constant-time comparison is done below
  // so timing does not leak whether the system exists or the token is valid.
  const { data: system } = await supabase
    .from("systems")
    .select("id, status, status_token_hash")
    .eq("id", systemId)
    .maybeSingle();

  if (!system || !system.status_token_hash) {
    // Same response for unknown system and missing token: no enumeration.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const providedHash = hashStatusToken(token ?? "");
  if (!constantTimeCompareHashes(system.status_token_hash, providedHash)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = system.status === "suspended" ? "suspended" : "live";

  return NextResponse.json({ status });
}
