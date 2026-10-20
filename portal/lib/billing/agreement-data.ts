// Loads agreements with their charges, breakdowns and billed periods, and
// works out which periods are invoiced, due or upcoming. Shared by the
// Agreements pages and the Invoices "Due" list. Prices are only read when the
// caller may see them (RLS enforces the same).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BreakdownRow } from "@/components/billing/breakdown-editor";
import { periodsThrough, type BillingPeriod } from "./periods";
import { parseTargets, type ResponseTarget } from "./response-targets";

export type AgreementRow = {
  id: string;
  name: string;
  client_id: string;
  clientName: string;
  clientEmail: string | null;
  system_id: string | null;
  systemName: string | null;
  status: string;
  standing: string | null;
  service_type: string;
  start_date: string;
  end_date: string | null;
  renewal_date: string | null;
  billing_cycle: string;
  invoice_timing: string;
  payment_due_days: number;
  default_grace_days: number;
  notice_days: number;
  contract_reference: string | null;
  scope_included: string | null;
  scope_excluded: string | null;
  response_targets: ResponseTarget[];
  sent_at: string | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  accepted_by_title: string | null;
  signed_document_name: string | null;
  has_signed_document: boolean;
  operational_notes: string | null;
  package_id: string | null;
  terminated_at: string | null;
  created_at: string;
};

export type ChargeRow = {
  id: string;
  agreement_id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  billing_cycle: string;
  start_date: string;
  end_date: string | null;
  active: boolean;
  package_id: string | null;
  items: BreakdownRow[];
};

export type RunRow = {
  recurring_charge_id: string;
  period_start: string;
  period_end: string;
  invoice_id: string;
  invoice: { number: string; status: string; total: number; currency: string; due_date: string | null } | null;
};

export type PeriodState = BillingPeriod & {
  chargeId: string;
  state: "invoiced" | "due" | "upcoming";
  run: RunRow | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function loadAgreements(
  supabase: SupabaseClient,
  opts: { finance: boolean; id?: string },
): Promise<{ agreements: AgreementRow[]; charges: ChargeRow[]; runs: RunRow[] }> {
  let q = supabase
    .from("service_agreements")
    .select(`
      id, name, client_id, system_id, status, service_type, start_date, end_date, renewal_date, billing_cycle,
      invoice_timing, payment_due_days, default_grace_days, notice_days, contract_reference, scope_included,
      scope_excluded, response_targets, sent_at, accepted_at, accepted_by_name, accepted_by_title,
      signed_document_name, signed_document_path, operational_notes, package_id, terminated_at, created_at,
      client:profiles!client_id(company_name, full_name, email),
      system:systems(name)
    `)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (opts.id) q = q.eq("id", opts.id);
  const { data: rows } = await q;

  const ids = (rows ?? []).map((r) => r.id as string);
  const standing: Record<string, string> = {};
  if (ids.length) {
    const { data: st } = await supabase.from("staff_service_agreements_view").select("id, billing_standing").in("id", ids);
    for (const s of st ?? []) standing[s.id] = s.billing_standing;
  }

  const agreements: AgreementRow[] = (rows ?? []).map((r) => {
    const c = one(r.client as unknown as { company_name: string | null; full_name: string | null; email: string } | null);
    return {
      id: r.id,
      name: r.name,
      client_id: r.client_id,
      clientName: c?.company_name || c?.full_name || c?.email || "Client",
      clientEmail: c?.email ?? null,
      system_id: r.system_id,
      systemName: one(r.system as unknown as { name: string } | null)?.name ?? null,
      status: r.status,
      standing: standing[r.id] ?? null,
      service_type: r.service_type,
      start_date: r.start_date,
      end_date: r.end_date,
      renewal_date: r.renewal_date,
      billing_cycle: r.billing_cycle,
      invoice_timing: r.invoice_timing ?? "in_arrears",
      payment_due_days: Number(r.payment_due_days ?? 14),
      default_grace_days: Number(r.default_grace_days ?? 7),
      notice_days: Number(r.notice_days ?? 3),
      contract_reference: r.contract_reference,
      scope_included: r.scope_included,
      scope_excluded: r.scope_excluded,
      response_targets: parseTargets(r.response_targets),
      sent_at: r.sent_at,
      accepted_at: r.accepted_at,
      accepted_by_name: r.accepted_by_name,
      accepted_by_title: r.accepted_by_title,
      signed_document_name: r.signed_document_name,
      has_signed_document: !!r.signed_document_path,
      operational_notes: r.operational_notes,
      package_id: r.package_id,
      terminated_at: r.terminated_at,
      created_at: r.created_at,
    };
  });

  if (!opts.finance || !ids.length) return { agreements, charges: [], runs: [] };

  const { data: ch } = await supabase
    .from("recurring_charges")
    .select(`
      id, agreement_id, name, description, amount, currency, billing_cycle, start_date, end_date, active, package_id,
      items:recurring_charge_items(section, description, detail, quantity, unit, unit_price, position)
    `)
    .in("agreement_id", ids)
    .order("created_at");
  const charges: ChargeRow[] = (ch ?? []).map((c) => ({
    id: c.id,
    agreement_id: c.agreement_id,
    name: c.name,
    description: c.description,
    amount: Number(c.amount),
    currency: c.currency,
    billing_cycle: c.billing_cycle,
    start_date: c.start_date,
    end_date: c.end_date,
    active: c.active,
    package_id: c.package_id,
    items: [...((c.items as { position: number; quantity: number; unit_price: number }[] | null) ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ ...(i as unknown as BreakdownRow), quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
  }));

  const chargeIds = charges.map((c) => c.id);
  let runs: RunRow[] = [];
  if (chargeIds.length) {
    const { data: rr } = await supabase
      .from("recurring_charge_runs")
      .select("recurring_charge_id, period_start, period_end, invoice_id, invoice:invoices(invoice_number, status, total, currency, due_date)")
      .in("recurring_charge_id", chargeIds)
      .neq("status", "voided");
    runs = (rr ?? []).map((r) => {
      const inv = one(r.invoice as unknown as { invoice_number: string; status: string; total: number; currency: string; due_date: string | null } | null);
      return {
        recurring_charge_id: r.recurring_charge_id,
        period_start: r.period_start,
        period_end: r.period_end,
        invoice_id: r.invoice_id,
        invoice: inv
          ? { number: inv.invoice_number, status: inv.status, total: Number(inv.total), currency: inv.currency, due_date: inv.due_date }
          : null,
      };
    });
  }
  return { agreements, charges, runs };
}

/** Every period of a charge up to the next upcoming one, with its state. */
export function chargePeriods(
  agreement: Pick<AgreementRow, "status" | "invoice_timing">,
  charge: ChargeRow,
  runs: RunRow[],
  today: string,
): PeriodState[] {
  const billable = ["active", "reactivation_pending"].includes(agreement.status) && charge.active;
  return periodsThrough(charge, agreement.invoice_timing, today).map((p) => {
    const run = runs.find((r) => r.recurring_charge_id === charge.id && r.period_start === p.start) ?? null;
    const state: PeriodState["state"] = run ? "invoiced" : billable && p.invoiceDate <= today ? "due" : "upcoming";
    return { ...p, chargeId: charge.id, state, run };
  });
}

export type DueItem = { agreement: AgreementRow; charge: ChargeRow; period: PeriodState };

export function duePeriods(agreements: AgreementRow[], charges: ChargeRow[], runs: RunRow[], today: string): DueItem[] {
  const out: DueItem[] = [];
  for (const charge of charges) {
    const agreement = agreements.find((a) => a.id === charge.agreement_id);
    if (!agreement) continue;
    for (const period of chargePeriods(agreement, charge, runs, today)) {
      if (period.state === "due") out.push({ agreement, charge, period });
    }
  }
  return out.sort((a, b) => a.period.invoiceDate.localeCompare(b.period.invoiceDate));
}

/** Monthly-equivalent value of a charge (for summaries). */
export function monthlyValue(c: Pick<ChargeRow, "amount" | "billing_cycle">): number {
  const k = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }[c.billing_cycle as "monthly"] ?? 1;
  return c.amount / k;
}

export const CYCLE_LABEL: Record<string, string> = {
  monthly: "month",
  quarterly: "quarter",
  semi_annual: "6 months",
  annual: "year",
  custom: "period",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Proposal sent",
  accepted: "Accepted",
  active: "Active",
  suspended: "Suspended",
  reactivation_pending: "Reactivating",
  ended: "Ended",
  terminated: "Terminated",
};

export const STATUS_TONE: Record<string, string> = {
  draft: "",
  sent: "is-info",
  accepted: "is-info",
  active: "is-ok",
  suspended: "is-bad",
  reactivation_pending: "is-warn",
  ended: "",
  terminated: "is-bad",
};

export const STANDING_LABEL: Record<string, { label: string; tone: string }> = {
  CURRENT: { label: "Paid up", tone: "is-ok" },
  DUE: { label: "Invoice open", tone: "" },
  OVERDUE_GRACE: { label: "Overdue · grace", tone: "is-warn" },
  NOTICE: { label: "Overdue · notice", tone: "is-bad" },
  SUSPENSION_ELIGIBLE: { label: "Suspension eligible", tone: "is-bad" },
  SUSPENDED: { label: "Suspended", tone: "is-bad" },
};
