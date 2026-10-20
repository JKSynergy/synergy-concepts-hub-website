import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader, ugx } from "@/components/ux/primitives";
import InvoicesTable, { type InvoiceRow } from "./invoices-table";
import { OPEN_STATUSES, isPastDue, todayIso } from "./fin-utils";
import { canAccessFinance, isAdmin as isAdminRole } from "@/lib/security/roles";
import { loadAgreements, chargePeriods } from "@/lib/billing/agreement-data";
import { addDays, periodLabel, todayEAT } from "@/lib/billing/periods";
import { DueList, type DueRow } from "@/components/billing/due-list";
import "@/components/billing/billing.css";

export default async function AdminInvoicesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !canAccessFinance(profile.role)) {
    redirect("/client");
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, currency, due_date, issue_date, client_id")
    .order("created_at", { ascending: false });

  const invList = invoices ?? [];
  const clientIds = [...new Set(invList.map((inv) => inv.client_id))];
  const [{ data: clients }, { data: payments }] = await Promise.all([
    clientIds.length
      ? supabase.from("profiles").select("id, company_name, full_name, email").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; company_name: string | null; full_name: string | null; email: string }[] }),
    invList.length
      ? supabase.from("payments").select("invoice_id, amount").in("invoice_id", invList.map((i) => i.id))
      : Promise.resolve({ data: [] as { invoice_id: string; amount: number }[] }),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.company_name || c.full_name || c.email]));
  const paid = new Map<string, number>();
  const payCount = new Map<string, number>();
  for (const p of payments ?? []) {
    paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount));
    payCount.set(p.invoice_id, (payCount.get(p.invoice_id) ?? 0) + 1);
  }

  const today = todayIso();
  const rows: InvoiceRow[] = invList.map((inv) => {
    const total = Number(inv.total) || 0;
    const paidSoFar = paid.get(inv.id) ?? 0;
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      currency: inv.currency ?? "UGX",
      status: inv.status,
      total,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      client_name: clientMap.get(inv.client_id) ?? "Unknown client",
      balance: OPEN_STATUSES.includes(inv.status) ? Math.max(0, total - paidSoFar) : null,
      pastDue: isPastDue(inv.status, inv.due_date, today),
      hasPayments: (payCount.get(inv.id) ?? 0) > 0,
    };
  });

  // Agreement periods ready to bill (and those coming up in the next 7 days).
  const { agreements, charges, runs } = await loadAgreements(supabase, { finance: true });
  const eat = todayEAT();
  const soonUntil = addDays(eat, 7);
  const dueRows: DueRow[] = [];
  for (const c of charges.filter((x) => x.active)) {
    const a = agreements.find((x) => x.id === c.agreement_id);
    if (!a || !["active", "reactivation_pending"].includes(a.status)) continue;
    for (const p of chargePeriods(a, c, runs, eat)) {
      if (p.state === "invoiced" || (p.state === "upcoming" && p.invoiceDate > soonUntil)) continue;
      dueRows.push({
        agreementId: a.id,
        agreementName: a.name,
        chargeId: c.id,
        clientName: a.clientName,
        periodStart: p.start,
        periodLabel: periodLabel(p),
        amount: c.amount,
        currency: c.currency,
        invoiceDate: p.invoiceDate,
        state: p.state === "due" ? "due" : "upcoming",
      });
    }
  }
  dueRows.sort((x, y) => x.invoiceDate.localeCompare(y.invoiceDate));

  const outstanding = rows.reduce((s, r) => s + (r.balance ?? 0), 0);
  const overdueRows = rows.filter((r) => r.pastDue);
  const overdueBalance = overdueRows.reduce((s, r) => s + (r.balance ?? 0), 0);
  const openCount = rows.filter((r) => r.balance !== null).length;

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Invoices"
        description="Raise, send and follow up invoices. Monthly agreement invoices appear under Due to invoice when their period is ready."
        actions={
          <Link href="/admin/invoices/new" className="ux-btn ux-btn--primary">
            New invoice
          </Link>
        }
      />

      <DueList rows={dueRows} />

      {rows.length > 0 && (
        <div className="ux-figures" style={{ marginBottom: 28 }}>
          <div className="ux-figure">
            <span>Outstanding</span>
            <b>{ugx(outstanding)}</b>
            <small className="ux-cell-sub">Total minus payments, {openCount} sent, partially paid or overdue</small>
          </div>
          <div className="ux-figure">
            <span>Past due</span>
            <b className={overdueBalance > 0 ? "ux-late" : undefined}>{ugx(overdueBalance)}</b>
            <small className="ux-cell-sub">{overdueRows.length} invoice{overdueRows.length === 1 ? "" : "s"} past due date and unpaid</small>
          </div>
        </div>
      )}

      <InvoicesTable rows={rows} canDeleteDrafts={isAdminRole(profile.role)} />
    </div>
  );
}
