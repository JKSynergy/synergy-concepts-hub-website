import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import {
  INVOICE_STATUS_BADGE,
  type InvoiceStatus,
} from "@/lib/types";

export default async function ClientInvoicesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, due_date, issue_date")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <header className="mb-8">
        <p className="section-title">Billing</p>
        <h1 className="page-title mt-1">Invoices</h1>
        <p className="page-subtitle">View and download your invoices and receipts.</p>
      </header>

      {invoices && invoices.length > 0 ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Status</th>
                <th>Total</th>
                <th>Due Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <span className="font-semibold" style={{ color: "var(--p-text-strong)" }}>
                      {inv.invoice_number ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${INVOICE_STATUS_BADGE[inv.status as InvoiceStatus]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td>UGX {Number(inv.total).toLocaleString()}</td>
                  <td style={{ color: "var(--p-muted)" }}>
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <a href={`/api/invoices/${inv.id}/pdf`} className="btn-ghost">
                        PDF
                      </a>
                      <Link href={`/client/invoices/${inv.id}`} className="btn-primary">
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card p-10 text-center text-sm" style={{ color: "var(--p-muted)" }}>
          No invoices yet.
        </div>
      )}
    </div>
  );
}
