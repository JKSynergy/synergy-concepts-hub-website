import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { InvoiceActions } from "@/components/invoice-actions";
import {
  INVOICE_STATUS_BADGE,
  type InvoiceStatus,
} from "@/lib/types";

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

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, due_date, issue_date, client_id")
    .order("created_at", { ascending: false });

  const clientIds = [...new Set((invoices ?? []).map((inv) => inv.client_id))];
  const { data: clients } = clientIds.length
    ? await supabase
        .from("profiles")
        .select("id, company_name, full_name, email")
        .in("id", clientIds)
    : { data: [] };

  const clientMap = new Map(
    (clients ?? []).map((c) => [
      c.id,
      c.company_name || c.full_name || c.email,
    ])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <Link
          href="/admin/invoices/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Create Invoice
        </Link>
      </div>

      <div className="space-y-3">
        {invoices && invoices.length > 0 ? (
          invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-5 shadow hover:bg-gray-50"
            >
              <Link
                href={`/admin/invoices/${inv.id}`}
                className="flex flex-1 flex-wrap items-center gap-4 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {inv.invoice_number ?? "—"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      INVOICE_STATUS_BADGE[inv.status as InvoiceStatus]
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-500">
                    {clientMap.get(inv.client_id) ?? "Unknown client"}
                  </span>
                  {inv.due_date && (
                    <span className="text-xs text-gray-400">
                      Due: {new Date(inv.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </Link>

              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-gray-900">
                  UGX {Number(inv.total).toLocaleString()}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(inv.issue_date).toLocaleDateString()}
                </span>
                <InvoiceActions invoiceId={inv.id} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow">
            No invoices yet.{" "}
            <Link href="/admin/invoices/new" className="text-blue-600 hover:underline">
              Create your first invoice
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
