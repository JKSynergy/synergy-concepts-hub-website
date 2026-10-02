/**
 * POST /api/internal/provider-monitoring/run
 *
 * Protected scheduler entrypoint (Vercel Cron or an external scheduler).
 * Authentication: `Authorization: Bearer <CRON_SECRET>` (or
 * MONITORING_SCHEDULER_SECRET). Fails closed when no secret is configured.
 *
 * The endpoint accepts NO account/provider identifiers from the request —
 * it only runs schedules the admin has enabled and that are due. Each
 * schedule executes through the same single-flight monitoring service as
 * manual Run Now.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDueMonitoringSchedules } from "@/lib/monitoring/service";

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? process.env.MONITORING_SCHEDULER_SECRET;
  if (!expected) return false; // fail closed: no configured secret → nothing runs
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && token === expected;
}

async function handler(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runDueMonitoringSchedules(admin);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Scheduler sweep failed" }, { status: 500 });
  }

  const summary = {
    ok: true,
    executed: result.results.length,
    completed: result.results.filter((r) => r.outcome === "completed").length,
    failed: result.results.filter((r) => r.outcome === "failed").length,
    skipped: result.results.filter((r) => r.outcome === "skipped").length,
  };
  return NextResponse.json(summary);
}

// GET: Vercel Cron invokes the configured path with a GET request.
// POST: external schedulers / manual verification.
export { handler as GET, handler as POST };
