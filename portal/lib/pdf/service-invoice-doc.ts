// Builds the itemised service invoice (service-invoice-template.tsx) from
// stored records. Pure: no database access, so it is unit-tested directly.
//
// Every figure printed in the "service record" is counted from real records
// (support requests, incidents, backup events) for the invoice's period.
// A figure with no underlying records is left out rather than estimated.

import type { DocPaymentMethod, DocSignature } from "./invoice-doc";
import type { ServiceGroup, ServiceInvoice, ServiceMetric, SupportEntry } from "./service-invoice-template";
import { measure, parseTargets, splitList } from "../billing/response-targets";

export type SvcInvoiceRecord = {
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  currency: string | null;
  subtotal: number | string;
  tax_rate: number | string | null;
  tax_amount: number | string;
  total: number | string;
  service_period_start?: string | null;
  service_period_end?: string | null;
  notes?: string | null;
};

export type SvcLineRecord = {
  section?: string | null;
  description: string;
  detail?: string | null;
  quantity: number | string;
  unit?: string | null;
  unit_price: number | string;
  amount: number | string;
  period_start?: string | null;
  period_end?: string | null;
  position?: number | null;
  created_at?: string;
};

export type SvcRequestRecord = {
  reference: string;
  summary: string;
  work_done?: string | null;
  priority: string;
  billing: string;
  status: string;
  requested_at: string;
  first_response_at?: string | null;
  resolved_at?: string | null;
  quote_agreed_at?: string | null;
  channel?: string | null;
};

export type SvcIncidentRecord = { severity: string; opened_at: string };
export type SvcBackupRecord = { status: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const parts = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return { y, m, day };
};

/** "31 Oct 2026" */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const { y, m, day } = parts(d);
  return `${String(day).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** "01 Oct – 31 Oct 2026", or a single day. */
export function fmtRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return "";
  if (!start || !end || start.slice(0, 10) === end.slice(0, 10)) return fmtDate(start ?? end);
  const a = parts(start);
  const b = parts(end);
  const left = `${String(a.day).padStart(2, "0")} ${MONTHS[a.m - 1]}${a.y !== b.y ? ` ${a.y}` : ""}`;
  return `${left} – ${fmtDate(end)}`;
}

/** "October 2026" for a whole calendar month, else the range. */
export function fmtPeriod(start?: string | null, end?: string | null): string {
  if (!start || !end) return fmtRange(start, end);
  const a = parts(start);
  const b = parts(end);
  const lastDay = new Date(Date.UTC(b.y, b.m, 0)).getUTCDate();
  if (a.y === b.y && a.m === b.m && a.day === 1 && b.day === lastDay) return `${MONTHS_LONG[a.m - 1]} ${a.y}`;
  return fmtRange(start, end);
}

/** "1h 05m" */
export function fmtDuration(fromIso: string, toIso: string): string {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${String(mins % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const PRIORITY: Record<string, SupportEntry["priority"]> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  change: "Change",
};
const STATUS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  invoiced: "Resolved",
  cancelled: "Cancelled",
};
const CYCLE: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Every 6 months",
  annual: "Annual",
  custom: "Custom",
};

function dayInEAT(iso: string): string {
  // Kampala is UTC+3 all year.
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

function dayTimeInEAT(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `${dayInEAT(iso)} ${hm}`;
}

const CHANNEL: Record<string, string> = {
  phone: "phone",
  whatsapp: "WhatsApp",
  email: "email",
  portal: "portal",
  on_site: "on-site visit",
  other: "other",
};

export function buildServiceInvoice(input: {
  invoice: SvcInvoiceRecord;
  lines: SvcLineRecord[];
  client: { name: string; lines: string[] };
  agreement?: {
    name: string;
    contract_reference?: string | null;
    billing_cycle?: string | null;
    response_targets?: unknown;
    scope_excluded?: string | null;
  } | null;
  /** Requests billed on this invoice, or covered requests in the period. */
  requests?: SvcRequestRecord[];
  /** Only for agreement invoices (service record). */
  incidents?: SvcIncidentRecord[] | null;
  backups?: SvcBackupRecord[] | null;
  paymentMethods: DocPaymentMethod[];
  signature?: DocSignature | null;
}): ServiceInvoice {
  const { invoice: inv, agreement } = input;
  const currency = inv.currency || "UGX";

  const sorted = [...input.lines].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
  );

  // Consecutive lines with the same section form a group. Discount lines
  // (negative amounts) are printed with the totals, not as a group.
  const fallbackGroup = agreement?.name ?? "Services";
  const groups: ServiceGroup[] = [];
  const adjustments: { label: string; amount: number }[] = [];
  for (const l of sorted) {
    if (Number(l.amount) < 0) {
      adjustments.push({ label: l.description, amount: Number(l.amount) });
      continue;
    }
    const name = l.section?.trim() || fallbackGroup;
    let g = groups[groups.length - 1];
    if (!g || g.name !== name) {
      g = { name, lines: [] };
      groups.push(g);
    }
    g.lines.push({
      description: l.description,
      detail: l.detail ?? undefined,
      quantity: Number(l.quantity),
      unit: l.unit ?? "",
      unitPrice: Number(l.unit_price),
      amount: Number(l.amount),
      period: fmtRange(l.period_start, l.period_end),
    });
  }

  const periodStart = inv.service_period_start ?? sorted.find((l) => l.period_start)?.period_start ?? null;
  const periodEnd = inv.service_period_end ?? sorted.find((l) => l.period_end)?.period_end ?? null;
  const servicePeriod = periodStart ? fmtPeriod(periodStart, periodEnd) : fmtDate(inv.issue_date);

  const requests = (input.requests ?? []).filter((r) => r.status !== "cancelled");

  // ── Service record: only for agreement invoices, only real counts, and only
  // once the period has ended (an invoice issued in advance has nothing to report).
  let metrics: ServiceMetric[] | undefined;
  const periodOver = !periodEnd || inv.issue_date >= periodEnd;
  if (agreement && periodOver) {
    metrics = [];
    const byPri = (p: string) => requests.filter((r) => r.priority === p).length;
    const split = ["critical", "high", "normal", "change"]
      .map((p) => [p, byPri(p)] as const)
      .filter(([, n]) => n > 0)
      .map(([p, n]) => `${n} ${p}`)
      .join(" · ");
    metrics.push({ label: "Support requests", value: String(requests.length), note: split || "none this period" });

    const responded = requests
      .filter((r) => r.first_response_at)
      .map((r) => new Date(r.first_response_at!).getTime() - new Date(r.requested_at).getTime())
      .sort((a, b) => a - b);
    if (responded.length) {
      const median = responded[Math.floor(responded.length / 2)];
      metrics.push({
        label: "Median first response",
        value: fmtDuration(new Date(0).toISOString(), new Date(median).toISOString()),
        note: `${responded.length} request${responded.length === 1 ? "" : "s"}`,
      });
    }
    const resolved = requests.filter((r) => r.resolved_at).length;
    if (requests.length) metrics.push({ label: "Resolved", value: `${resolved} / ${requests.length}` });

    // Agreed response targets (business hours): only requests that have been
    // responded to and whose priority carries a time target are counted.
    const targets = parseTargets(agreement.response_targets);
    if (targets.length) {
      const judged = requests
        .filter((r) => r.first_response_at)
        .map((r) => measure(targets, r))
        .filter((o): o is NonNullable<typeof o> => !!o && o.met !== null);
      if (judged.length) {
        metrics.push({
          label: "Response targets met",
          value: `${judged.filter((o) => o.met).length} / ${judged.length}`,
          note: "business hours, Mon–Fri",
        });
      }
    }

    if (input.incidents) {
      const critical = input.incidents.filter((i) => i.severity === "critical").length;
      metrics.push({
        label: "Incidents",
        value: String(input.incidents.length),
        note: input.incidents.length ? `${critical} critical` : "none recorded",
      });
    }
    if (input.backups) {
      const done = input.backups.filter((b) => b.status === "successful" || b.status === "verified").length;
      const counted = input.backups.filter((b) => ["successful", "verified", "failed", "missed"].includes(b.status)).length;
      if (counted) {
        const verified = input.backups.filter((b) => b.status === "verified").length;
        metrics.push({
          label: "Backups completed",
          value: `${done} / ${counted}`,
          note: verified ? `${verified} verified` : undefined,
        });
      }
    }
  }

  // ── Job report: a per-job invoice (one request, no agreement) ──
  let jobTitle: string | undefined;
  if (!agreement && requests.length === 1) {
    const r = requests[0];
    jobTitle = `Job Report · ${r.reference}`;
    metrics = [
      { label: "Reported", value: dayTimeInEAT(r.requested_at), note: r.channel ? `by ${CHANNEL[r.channel] ?? r.channel}` : undefined },
    ];
    if (r.quote_agreed_at) metrics.push({ label: "Quote agreed", value: dayTimeInEAT(r.quote_agreed_at) });
    if (r.first_response_at) {
      metrics.push({
        label: "First response",
        value: fmtDuration(r.requested_at, r.first_response_at),
        note: dayTimeInEAT(r.first_response_at),
      });
    }
    if (r.resolved_at) {
      metrics.push({
        label: "Completed",
        value: dayTimeInEAT(r.resolved_at),
        note: `${fmtDuration(r.requested_at, r.resolved_at)} after report`,
      });
    }
  }

  const support: SupportEntry[] = (agreement && !periodOver ? [] : requests)
    .slice()
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at))
    .map((r) => ({
      date: dayInEAT(r.requested_at),
      ref: r.reference,
      priority: PRIORITY[r.priority] ?? "Normal",
      summary: r.summary,
      detail: r.work_done ? (r.work_done.length > 220 ? `${r.work_done.slice(0, 217)}…` : r.work_done) : undefined,
      response: r.first_response_at ? fmtDuration(r.requested_at, r.first_response_at) : "—",
      status: STATUS[r.status] ?? r.status,
    }));

  const perRequest = !agreement && requests.length > 0;
  const dueText = inv.due_date ? `Payment is due by ${fmtDate(inv.due_date)}.` : "Payment is due on receipt.";

  return {
    number: inv.invoice_number,
    status: (["draft", "sent", "paid", "partially paid", "overdue", "cancelled"].includes(inv.status)
      ? inv.status
      : "draft") as ServiceInvoice["status"],
    issueDate: fmtDate(inv.issue_date),
    dueDate: fmtDate(inv.due_date),
    servicePeriod,
    currency,
    kindLabel: agreement ? "MANAGED SERVICES · ITEMISED" : perRequest ? "SUPPORT & MAINTENANCE" : "SERVICES · ITEMISED",
    agreement: agreement
      ? {
          name: agreement.name,
          reference: agreement.contract_reference ?? null,
          billing: agreement.billing_cycle ? CYCLE[agreement.billing_cycle] ?? agreement.billing_cycle : null,
        }
      : perRequest
        ? requests.length === 1
          ? { name: "One-off maintenance", reference: requests[0].reference, referenceLabel: "Job", billing: "Per job, as quoted" }
          : { name: "One-off maintenance", billing: "Per job, as quoted" }
        : null,
    client: input.client,
    groups,
    taxRate: Number(inv.tax_rate) || 0,
    adjustments: adjustments.length ? adjustments : undefined,
    // The database subtotal is net of discounts; print the gross above them.
    totals: {
      subtotal: Number(inv.subtotal) - adjustments.reduce((a, x) => a + x.amount, 0),
      tax: Number(inv.tax_amount),
      total: Number(inv.total),
    },
    metrics: metrics && metrics.length ? metrics : undefined,
    metricsTitle: jobTitle,
    metricsTag: jobTitle ? null : undefined,
    metricsNote: jobTitle
      ? "Times are East Africa Time, from Synergy's support record for this job. Work was carried out at the quoted price agreed before invoicing."
      : metrics
        ? "Counted from Synergy's support, incident and backup records for this period. Shown for transparency; covered by the fee above."
        : undefined,
    support: support.length ? support : undefined,
    notCovered: agreement
      ? splitList(agreement.scope_excluded).length
        ? splitList(agreement.scope_excluded)
        : ["New features, integrations, new reports and other work outside the agreement are quoted separately before work begins."]
      : undefined,
    paymentTerms: [
      dueText,
      "Please quote the invoice number as the payment reference and email proof of payment to info@synergyconceptshub.com.",
    ],
    paymentMethods: input.paymentMethods,
    signature: input.signature ?? null,
  };
}
