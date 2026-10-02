import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { EmptyState, INVOICE_TONE, PageHeader, StatusMark, ugx } from "@/components/ux/primitives";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

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
    <div className="ux-page">
      <PageHeader title="Invoices" description="View, pay and download your invoices and receipts." />

      {invoices && invoices.length > 0 ? (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th className="ux-num">Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td data-label="Invoice">
                    <Link href={`/client/invoices/${inv.id}`} className="ux-cell-main">
                      {inv.invoice_number ?? "—"}
                    </Link>
                  </td>
                  <td data-label="Issued">{inv.issue_date ? fmt(inv.issue_date) : "—"}</td>
                  <td data-label="Due">{inv.due_date ? fmt(inv.due_date) : "—"}</td>
                  <td data-label="Status">
                    <StatusMark tone={INVOICE_TONE[inv.status] ?? "neutral"}>{inv.status}</StatusMark>
                  </td>
                  <td className="ux-num" data-label="Total">{ugx(Number(inv.total))}</td>
                  <td data-label="Action">
                    <div className="ux-rowactions">
                      <Link href={`/client/invoices/${inv.id}`} className="ux-textbtn">View</Link>
                      <a href={`/api/invoices/${inv.id}/pdf`} className="ux-textbtn">PDF</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No invoices yet">Invoices we send you will appear here.</EmptyState>
      )}
    </div>
  );
}
