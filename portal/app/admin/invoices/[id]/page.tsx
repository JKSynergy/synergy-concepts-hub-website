import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader, Section, StatusMark, EmptyState, INVOICE_TONE, ugx } from "@/components/ux/primitives";
import { InvoiceActions } from "@/components/invoice-actions";
import { LineItemsManager } from "@/components/line-items-manager";
import { RecordPaymentButton, StatusActions } from "./invoice-controls";
import { fmtDate, isPastDue, methodLabel, todayIso, OPEN_STATUSES } from "../fin-utils";
import { canAccessFinance, isAdmin as isAdminRole } from "@/lib/security/roles";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (!invoice) {
    return (
      <div className="ux-page">
        <Link href="/admin/invoices" className="ux-back">← Invoices</Link>
        <EmptyState title="Invoice not found">It may have been deleted. Go back to the invoice list.</EmptyState>
      </div>
    );
  }

  const { data: lineItems } = await admin
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", id)
    .order("created_at", { ascending: true });

  const { data: payments } = await admin
    .from("payments")
    .select("*")
    .eq("invoice_id", id)
    .order("created_at", { ascending: false });

  const { data: receipts } = await admin
    .from("receipts")
    .select("*")
    .eq("invoice_id", id);

  const { data: client } = await admin
    .from("profiles")
    .select("id, full_name, company_name, email, billing_address, phone")
    .eq("id", invoice.client_id)
    .single();

  const receiptMap = new Map((receipts ?? []).map((r) => [r.payment_id, r]));
  const payList = payments ?? [];
  const total = Number(invoice.total) || 0;
  const paid = payList.reduce((s, p) => s + Number(p.amount), 0);
  const cancelled = invoice.status === "cancelled";
  const balance = cancelled ? null : Math.max(0, total - paid);
  const pastDue = isPastDue(invoice.status, invoice.due_date, todayIso());
  const clientName = client?.company_name || client?.full_name || client?.email || "Unknown client";
  const isOpen = OPEN_STATUSES.includes(invoice.status);

  return (
    <div className="ux-page">
      <Link href="/admin/invoices" className="ux-back">← Invoices</Link>
      <PageHeader
        eyebrow="Invoice"
        title={invoice.invoice_number}
        description={
          <>
            <StatusMark tone={INVOICE_TONE[invoice.status] ?? "neutral"}>{invoice.status}</StatusMark>
            {" · "}
            {client ? <Link href={`/admin/clients/${client.id}`}>{clientName}</Link> : clientName}
            {" · Issued "}
            {fmtDate(invoice.issue_date)}
          </>
        }
        actions={
          <>
            <a href={`/api/invoices/${id}/pdf`} className="ux-btn ux-btn--secondary">
              Download PDF
            </a>
            {!cancelled && <RecordPaymentButton invoiceId={id} suggested={isOpen ? balance : null} />}
          </>
        }
      />

      <div className="ux-fin-actionbar" style={{ marginBottom: 8 }}>
        <StatusActions invoiceId={id} status={invoice.status} hasPayments={payList.some((p) => p.paid_at)} />
        <InvoiceActions
          invoiceId={id}
          redirectTo="/admin/invoices"
          canDelete={isAdminRole(profile.role) && invoice.status === "draft" && payList.length === 0}
        />
      </div>

      <Section title="Summary">
        <div className="ux-figures">
          <div className="ux-figure">
            <span>Total</span>
            <b>{ugx(total)}</b>
            <small className="ux-cell-sub">
              {Number(invoice.tax_rate) > 0 ? `Includes ${Number(invoice.tax_rate)}% tax` : "No tax"}
            </small>
          </div>
          <div className="ux-figure">
            <span>Paid</span>
            <b>{ugx(paid)}</b>
            <small className="ux-cell-sub">
              {payList.length} recorded payment{payList.length === 1 ? "" : "s"}
            </small>
          </div>
          <div className="ux-figure">
            <span>Balance</span>
            <b>{balance === null ? "—" : ugx(balance)}</b>
            <small className="ux-cell-sub">
              {cancelled
                ? "Invoice cancelled"
                : invoice.status === "paid" && balance! > 0
                  ? "Marked paid, but recorded payments are less than the total"
                  : "Total minus recorded payments"}
            </small>
          </div>
          <div className="ux-figure">
            <span>Due date</span>
            <b className={pastDue ? "ux-late" : undefined}>{fmtDate(invoice.due_date)}</b>
            {pastDue && invoice.due_date && <small className="ux-cell-sub ux-late">Past due and unpaid</small>}
          </div>
        </div>
      </Section>

      <Section title="Bill to">
        <dl className="ux-dl">
          <div>
            <dt>Client</dt>
            <dd>{client ? <Link href={`/admin/clients/${client.id}`}>{clientName}</Link> : clientName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{client?.email || "—"}</dd>
          </div>
          <div>
            <dt>Billing address</dt>
            <dd>{client?.billing_address || "—"}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{client?.phone || "—"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Line items">
        <LineItemsManager
          invoiceId={id}
          initialItems={lineItems ?? []}
          taxRate={Number(invoice.tax_rate)}
          storedSubtotal={Number(invoice.subtotal)}
          storedTaxAmount={Number(invoice.tax_amount)}
          storedTotal={Number(invoice.total)}
        />
      </Section>

      <Section title="Payments">
        {payList.length === 0 ? (
          <EmptyState title="No payments recorded">Payments recorded against this invoice appear here.</EmptyState>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-fin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="ux-num">Amount</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payList.map((p) => {
                  const receipt = receiptMap.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td>{fmtDate(p.paid_at)}</td>
                      <td data-label="Method">{methodLabel(p.method)}</td>
                      <td data-label="Reference" className="ux-muted">{p.reference ?? p.paystack_reference ?? "—"}</td>
                      <td className="ux-num" data-label="Amount">{ugx(Number(p.amount))}</td>
                      <td data-label="Receipt">
                        {receipt ? (
                          <a href={`/api/receipts/${receipt.id}/pdf`} className="ux-link">
                            Download receipt
                          </a>
                        ) : (
                          <span className="ux-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Scope of work">
        {invoice.scope_of_work ? (
          <p className="ux-fin-note" style={{ margin: 0 }}>{invoice.scope_of_work}</p>
        ) : (
          <p className="ux-muted" style={{ margin: 0 }}>No scope of work on this invoice.</p>
        )}
      </Section>

      <Section title="Notes">
        {invoice.notes ? (
          <p className="ux-fin-note" style={{ margin: 0 }}>{invoice.notes}</p>
        ) : (
          <p className="ux-muted" style={{ margin: 0 }}>No notes on this invoice.</p>
        )}
      </Section>
    </div>
  );
}
