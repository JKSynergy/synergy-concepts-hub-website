import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader, Section, EmptyState, StatusMark, INVOICE_TONE, ugx } from "@/components/ux/primitives";
import { BOOKING_TYPE_LABEL, BOOKING_STATUSES, type BookingType } from "@/lib/types";
import { OPEN_STATUSES, isPastDue, methodLabel, todayIso } from "../invoices/fin-utils";
import { canAccessFinance } from "@/lib/security/roles";

function csvEscape(val: string | number | null | undefined) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const STATUS_ORDER = ["draft", "sent", "partially paid", "overdue", "paid", "cancelled"];

function Bar({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="ux-fin-bar">
      <div className="ux-progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${v}%` }} />
      </div>
      <span>{v}%</span>
    </div>
  );
}

export default async function AdminReportsPage() {
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
    redirect("/admin");
  }

  const [{ data: invoices }, { data: payments }, { data: bookings }, { data: clients }] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, status, total, issue_date, due_date, client_id"),
    supabase.from("payments").select("invoice_id, amount, method, paid_at, created_at"),
    supabase.from("bookings").select("title, type, status, created_at, client_id"),
    supabase.from("profiles").select("id, company_name, full_name, email").eq("role", "client"),
  ]);

  const invList = invoices ?? [];
  const payList = payments ?? [];
  const bookList = bookings ?? [];
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.company_name || c.full_name || c.email]));
  const today = todayIso();

  const paidByInvoice = new Map<string, number>();
  for (const p of payList) paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount));

  // Headline figures
  const collected = payList.reduce((s, p) => s + Number(p.amount), 0);
  const openInvoices = invList.filter((i) => OPEN_STATUSES.includes(i.status));
  const balanceOf = (i: (typeof invList)[number]) => Math.max(0, Number(i.total) - (paidByInvoice.get(i.id) ?? 0));
  const outstanding = openInvoices.reduce((s, i) => s + balanceOf(i), 0);
  const pastDueBalance = openInvoices.filter((i) => isPastDue(i.status, i.due_date, today)).reduce((s, i) => s + balanceOf(i), 0);

  // Receivables by client
  const recv = new Map<string, { name: string; count: number; total: number; balance: number; pastDue: number }>();
  for (const i of openInvoices) {
    const cur = recv.get(i.client_id) ?? { name: clientMap.get(i.client_id) ?? "Unknown client", count: 0, total: 0, balance: 0, pastDue: 0 };
    cur.count += 1;
    cur.total += Number(i.total);
    const b = balanceOf(i);
    cur.balance += b;
    if (isPastDue(i.status, i.due_date, today)) cur.pastDue += b;
    recv.set(i.client_id, cur);
  }
  const receivables = [...recv.values()].sort((a, b) => b.balance - a.balance);

  // Invoices by status
  const byStatus = STATUS_ORDER.map((s) => {
    const rows = invList.filter((i) => i.status === s);
    return { status: s, count: rows.length, value: rows.reduce((sum, i) => sum + Number(i.total), 0) };
  }).filter((r) => r.count > 0);
  const totalCount = invList.length;

  // Collected by method and by month
  const byMethod = new Map<string, { count: number; amount: number }>();
  const byMonth = new Map<string, { label: string; count: number; amount: number }>();
  for (const p of payList) {
    const m = byMethod.get(p.method) ?? { count: 0, amount: 0 };
    m.count += 1;
    m.amount += Number(p.amount);
    byMethod.set(p.method, m);
    const d = new Date(p.paid_at ?? p.created_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
    const mo = byMonth.get(key) ?? { label, count: 0, amount: 0 };
    mo.count += 1;
    mo.amount += Number(p.amount);
    byMonth.set(key, mo);
  }
  const methodRows = [...byMethod.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const monthRows = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  // Bookings
  const typeCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const b of bookList) {
    typeCounts.set(b.type, (typeCounts.get(b.type) ?? 0) + 1);
    statusCounts.set(b.status, (statusCounts.get(b.status) ?? 0) + 1);
  }

  // CSV exports
  const invoiceCsv = [
    "Invoice Number,Status,Total,Paid,Issue Date,Due Date,Client",
    ...invList.map(
      (i) =>
        `${csvEscape(i.invoice_number)},${csvEscape(i.status)},${csvEscape(i.total)},${csvEscape(paidByInvoice.get(i.id) ?? 0)},${csvEscape(i.issue_date)},${csvEscape(i.due_date)},${csvEscape(clientMap.get(i.client_id))}`
    ),
  ].join("\n");
  const bookingCsv = [
    "Title,Type,Status,Created At,Client",
    ...bookList.map(
      (b) =>
        `${csvEscape(b.title)},${csvEscape(BOOKING_TYPE_LABEL[b.type as BookingType] ?? b.type)},${csvEscape(b.status)},${csvEscape(new Date(b.created_at).toLocaleDateString("en-GB"))},${csvEscape(clientMap.get(b.client_id))}`
    ),
  ].join("\n");

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader title="Reports" description="Plain summaries computed from the invoices, payments and booking requests recorded in the portal. Amounts are in UGX." />

      <div className="ux-figures">
        <div className="ux-figure">
          <span>Collected</span>
          <b>{ugx(collected)}</b>
          <small className="ux-cell-sub">All recorded payments, {payList.length} in total</small>
        </div>
        <div className="ux-figure">
          <span>Outstanding</span>
          <b>{ugx(outstanding)}</b>
          <small className="ux-cell-sub">Total minus payments on {openInvoices.length} sent, partially paid or overdue invoices</small>
        </div>
        <div className="ux-figure">
          <span>Past due</span>
          <b className={pastDueBalance > 0 ? "ux-late" : undefined}>{ugx(pastDueBalance)}</b>
          <small className="ux-cell-sub">Part of outstanding whose due date has passed</small>
        </div>
      </div>

      <Section title="Receivables by client">
        {receivables.length === 0 ? (
          <EmptyState title="Nothing outstanding">No sent, partially paid or overdue invoices have a balance.</EmptyState>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-fin-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="ux-num">Open invoices</th>
                  <th className="ux-num">Invoiced</th>
                  <th className="ux-num">Balance</th>
                  <th className="ux-num">Past due</th>
                  <th>Share of outstanding</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((r) => (
                  <tr key={r.name}>
                    <td className="ux-cell-main">{r.name}</td>
                    <td className="ux-num" data-label="Open invoices">{r.count}</td>
                    <td className="ux-num" data-label="Invoiced">{ugx(r.total)}</td>
                    <td className="ux-num" data-label="Balance">{ugx(r.balance)}</td>
                    <td className={`ux-num ${r.pastDue > 0 ? "ux-late" : "ux-muted"}`} data-label="Past due">{ugx(r.pastDue)}</td>
                    <td data-label="Share">
                      <Bar pct={outstanding > 0 ? (r.balance / outstanding) * 100 : 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ux-fin-desc">
          Counts invoices with status sent, partially paid or overdue. Balance is the invoice total minus the payments recorded against it. Past due is the
          balance of invoices whose due date has passed. Drafts, paid and cancelled invoices are excluded.
        </p>
      </Section>

      <Section
        title="Invoices by status"
        aside={
          <a className="ux-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(invoiceCsv)}`} download="invoices.csv">
            Export all invoices (CSV)
          </a>
        }
      >
        {byStatus.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-fin-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th className="ux-num">Invoices</th>
                  <th className="ux-num">Total value</th>
                  <th>Share of invoices</th>
                </tr>
              </thead>
              <tbody>
                {byStatus.map((r) => (
                  <tr key={r.status}>
                    <td>
                      <StatusMark tone={INVOICE_TONE[r.status] ?? "neutral"}>{r.status}</StatusMark>
                    </td>
                    <td className="ux-num" data-label="Invoices">{r.count}</td>
                    <td className="ux-num" data-label="Total value">{ugx(r.value)}</td>
                    <td data-label="Share">
                      <Bar pct={totalCount > 0 ? (r.count / totalCount) * 100 : 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ux-fin-desc">
          Every invoice, grouped by its current status. Total value is the sum of invoice totals, whether or not they have been paid. Share is the count
          out of {totalCount} invoice{totalCount === 1 ? "" : "s"}.
        </p>
      </Section>

      <Section title="Collected by method">
        {methodRows.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-fin-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="ux-num">Payments</th>
                  <th className="ux-num">Amount</th>
                  <th>Share of collected</th>
                </tr>
              </thead>
              <tbody>
                {methodRows.map(([m, r]) => (
                  <tr key={m}>
                    <td className="ux-cell-main">{methodLabel(m)}</td>
                    <td className="ux-num" data-label="Payments">{r.count}</td>
                    <td className="ux-num" data-label="Amount">{ugx(r.amount)}</td>
                    <td data-label="Share">
                      <Bar pct={collected > 0 ? (r.amount / collected) * 100 : 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ux-fin-desc">Sums every recorded payment by the method it was received with.</p>
      </Section>

      <Section title="Collected by month">
        {monthRows.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-fin-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="ux-num">Payments</th>
                  <th className="ux-num">Amount</th>
                  <th>Share of collected</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map(([k, r]) => (
                  <tr key={k}>
                    <td className="ux-cell-main">{r.label}</td>
                    <td className="ux-num" data-label="Payments">{r.count}</td>
                    <td className="ux-num" data-label="Amount">{ugx(r.amount)}</td>
                    <td data-label="Share">
                      <Bar pct={collected > 0 ? (r.amount / collected) * 100 : 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ux-fin-desc">Sums recorded payments by the month they were paid (the payment date, UTC), newest month first.</p>
      </Section>

      <Section
        title="Booking requests"
        aside={
          <a className="ux-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(bookingCsv)}`} download="bookings.csv">
            Export all bookings (CSV)
          </a>
        }
      >
        {bookList.length === 0 ? (
          <EmptyState title="No booking requests yet" />
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-fin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="ux-num">Requests</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {[...typeCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n]) => (
                    <tr key={t}>
                      <td className="ux-cell-main">{BOOKING_TYPE_LABEL[t as BookingType] ?? t}</td>
                      <td className="ux-num" data-label="Requests">{n}</td>
                      <td data-label="Share">
                        <Bar pct={(n / bookList.length) * 100} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <table className="ux-table ux-table--stack ux-fin-table" style={{ marginTop: 28 }}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th className="ux-num">Requests</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {[...BOOKING_STATUSES, ...[...statusCounts.keys()].filter((s) => !(BOOKING_STATUSES as readonly string[]).includes(s))]
                  .filter((s) => statusCounts.has(s))
                  .map((s) => (
                    <tr key={s}>
                      <td className="ux-cell-main" style={{ textTransform: "capitalize" }}>{s}</td>
                      <td className="ux-num" data-label="Requests">{statusCounts.get(s)}</td>
                      <td data-label="Share">
                        <Bar pct={((statusCounts.get(s) ?? 0) / bookList.length) * 100} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ux-fin-desc">
          Counts every booking request ({bookList.length}) by the type and by the status it currently has. Website enquiries are not included.
        </p>
      </Section>
    </div>
  );
}
