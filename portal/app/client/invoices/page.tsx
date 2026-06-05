import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>

      <div className="space-y-3">
        {invoices && invoices.length > 0 ? (
          invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-5 shadow"
            >
              <div className="flex-1">
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
                <p className="mt-1 text-sm text-gray-500">
                  Total: UGX {Number(inv.total).toLocaleString()}
                </p>
                {inv.due_date && (
                  <p className="text-xs text-gray-400">
                    Due: {new Date(inv.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/invoices/${inv.id}/pdf`}
                  className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  PDF
                </a>
                <Link
                  href={`/client/invoices/${inv.id}`}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                >
                  View
                </Link>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow">
            No invoices yet.
          </div>
        )}
      </div>
    </div>
  );
}
