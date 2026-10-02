// Application-level audit writes for actions the database cannot see on its own
// (who invited a staff member, who archived a client, unmatched Paystack events).
// Row-level financial and role changes are audited by database triggers
// (migration 010) so they are captured even if the API is bypassed.
import type { SupabaseClient } from "@supabase/supabase-js";

const SENSITIVE_KEY = /pass(word)?|secret|token|api[_-]?key|authorization|credential|signature|cookie/i;

/** Remove anything that looks like a credential before it is stored. */
export function sanitizeAuditDetails(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => sanitizeAuditDetails(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : sanitizeAuditDetails(v, depth + 1);
  }
  return out;
}

export type AuditEntry = {
  actorId: string | null;
  actorRole?: string | null;
  action: string;
  table?: string | null;
  recordId?: string | null;
  details?: Record<string, unknown>;
};

/** Writes with the service-role client. Logging problems are reported but never thrown. */
export async function writeAuditLog(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    table_name: entry.table ?? null,
    record_id: entry.recordId ?? null,
    details: sanitizeAuditDetails(entry.details ?? {}),
  });
  if (error) {
    console.error("audit log write failed:", entry.action, error.message);
  }
}
