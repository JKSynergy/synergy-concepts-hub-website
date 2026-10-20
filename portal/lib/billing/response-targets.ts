// Support response targets (agreement.response_targets) and how a request
// measured against them. Targets are in business hours: Monday–Friday,
// 08:00–17:00 East Africa Time (UTC+3, no daylight saving).

export type ResponseTarget = {
  priority: "critical" | "high" | "normal" | "change" | string;
  example?: string | null;
  target: string;
  hours: number | null;
};

const OPEN_H = 8;
const CLOSE_H = 17;
const EAT_MS = 3 * 3600_000;

/** Business hours elapsed between two instants (fractional). */
export function businessHoursBetween(fromIso: string, toIso: string): number {
  let from = new Date(fromIso).getTime() + EAT_MS; // shift to EAT, then treat as UTC
  const to = new Date(toIso).getTime() + EAT_MS;
  if (!(to > from)) return 0;
  let ms = 0;
  // Walk day by day (bounded: ~10 years).
  for (let guard = 0; from < to && guard < 4000; guard++) {
    const d = new Date(from);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const open = dayStart + OPEN_H * 3600_000;
      const close = dayStart + CLOSE_H * 3600_000;
      const a = Math.max(from, open);
      const b = Math.min(to, close);
      if (b > a) ms += b - a;
    }
    from = dayStart + 24 * 3600_000;
  }
  return ms / 3600_000;
}

export function targetFor(targets: ResponseTarget[] | null | undefined, priority: string): ResponseTarget | null {
  return (targets ?? []).find((t) => t.priority === priority) ?? null;
}

export type TargetOutcome = { target: ResponseTarget; met: boolean | null; hours: number | null };

/**
 * met: true/false once responded; null while open within target or when the
 * priority has no time target. An unanswered request past its target is false.
 */
export function measure(
  targets: ResponseTarget[] | null | undefined,
  r: { priority: string; requested_at: string; first_response_at?: string | null },
  now: Date = new Date(),
): TargetOutcome | null {
  const t = targetFor(targets, r.priority);
  if (!t) return null;
  if (t.hours == null) return { target: t, met: null, hours: null };
  if (r.first_response_at) {
    const h = businessHoursBetween(r.requested_at, r.first_response_at);
    return { target: t, met: h <= t.hours + 1e-9, hours: h };
  }
  const h = businessHoursBetween(r.requested_at, now.toISOString());
  return { target: t, met: h > t.hours ? false : null, hours: null };
}

export const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  change: "Change request",
};

export function parseTargets(v: unknown): ResponseTarget[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      priority: String(e.priority ?? ""),
      example: typeof e.example === "string" ? e.example : null,
      target: String(e.target ?? ""),
      hours: typeof e.hours === "number" ? e.hours : null,
    }))
    .filter((t) => ["critical", "high", "normal", "change"].includes(t.priority) && t.target);
}

export function splitList(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[•\-–*]\s*/, "").trim())
    .filter(Boolean);
}

/** Response targets as the database expects them (migration 038); null when none. */
export function cleanTargets(raw: unknown): ResponseTarget[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ResponseTarget[] = [];
  for (const r of raw.slice(0, 8)) {
    const row = (r ?? {}) as Record<string, unknown>;
    const priority = ["critical", "high", "normal", "change"].includes(String(row.priority)) ? String(row.priority) : null;
    const target = typeof row.target === "string" ? row.target.trim().slice(0, 120) : "";
    if (!priority || !target) continue;
    const example = typeof row.example === "string" && row.example.trim() ? row.example.trim().slice(0, 200) : null;
    const h = row.hours === null || row.hours === "" || row.hours === undefined ? null : Number(row.hours);
    out.push({
      priority,
      example,
      target,
      hours: h !== null && Number.isFinite(h) && h > 0 && h <= 400 ? Math.round(h * 100) / 100 : null,
    });
  }
  return out.length ? out : null;
}
