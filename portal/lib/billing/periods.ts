// Billing periods of a recurring charge — the same arithmetic as the database
// function agreement_charge_period() (migration 038), so the portal lists
// exactly the periods the database will accept.
//
// Period n = [start + n·k months, start + (n+1)·k months − 1 day], cut at the
// charge's end date. Months are always added to the start date itself, with
// the day clamped to the month's length (Jan 31 → Feb 28 → Mar 31).

export type Cycle = "monthly" | "quarterly" | "semi_annual" | "annual" | "custom" | string;
export type InvoiceTiming = "in_advance" | "in_arrears" | string;

export type BillingPeriod = {
  start: string; // YYYY-MM-DD
  end: string;
  /** The day the period becomes invoiceable. */
  invoiceDate: string;
};

export const CYCLE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return { y, m, d };
};
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addMonths(date: string, n: number): string {
  const { y, m, d } = parse(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysIn(ny, nm)));
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parse(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Today in Kampala (UTC+3), as YYYY-MM-DD. */
export function todayEAT(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function periodAt(
  charge: { start_date: string; end_date?: string | null; billing_cycle: Cycle },
  n: number,
  timing: InvoiceTiming,
): BillingPeriod | null {
  const k = CYCLE_MONTHS[charge.billing_cycle];
  if (!k || n < 0) return null;
  const start = addMonths(charge.start_date, n * k);
  if (charge.end_date && start > charge.end_date) return null;
  let end = addDays(addMonths(charge.start_date, (n + 1) * k), -1);
  if (charge.end_date && charge.end_date < end) end = charge.end_date;
  return { start, end, invoiceDate: timing === "in_advance" ? start : end };
}

/**
 * Periods from the start up to and including the first one whose invoice date
 * is after `today` (the "next" period). Capped so a bad start date cannot loop.
 */
export function periodsThrough(
  charge: { start_date: string; end_date?: string | null; billing_cycle: Cycle },
  timing: InvoiceTiming,
  today: string,
  max = 240,
): BillingPeriod[] {
  const out: BillingPeriod[] = [];
  for (let n = 0; n < max; n++) {
    const p = periodAt(charge, n, timing);
    if (!p) break;
    out.push(p);
    if (p.invoiceDate > today) break;
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 2026" for a calendar month, else "01 Oct – 31 Dec 2026". */
export function periodLabel(p: { start: string; end: string }): string {
  const a = parse(p.start);
  const b = parse(p.end);
  if (a.d === 1 && a.y === b.y && a.m === b.m && b.d === daysIn(b.y, b.m)) return `${MONTHS_LONG[a.m - 1]} ${a.y}`;
  const left = `${pad(a.d)} ${MONTHS[a.m - 1]}${a.y !== b.y ? ` ${a.y}` : ""}`;
  return `${left} – ${pad(b.d)} ${MONTHS[b.m - 1]} ${b.y}`;
}

export function fmtDay(date: string | null | undefined): string {
  if (!date) return "—";
  const { y, m, d } = parse(date);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}
