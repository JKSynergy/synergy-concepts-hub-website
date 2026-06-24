import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import {
  INVOICE_STATUS_BADGE,
  type InvoiceStatus,
} from "@/lib/types";
import { setInvoiceStatus, updateInvoice } from "@/lib/actions/invoices";
import { recordPayment } from "@/lib/actions/payments";
import { InvoiceActions } from "@/components/invoice-actions";
import { LineItemsManager } from "@/components/line-items-manager";

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

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
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
      <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow">
        Invoice not found.
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              INVOICE_STATUS_BADGE[invoice.status as InvoiceStatus]
            }`}
          >
            {invoice.status}
          </span>
          <a
            href={`/api/invoices/${id}/pdf`}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
          >
            Download PDF
          </a>
          <InvoiceActions invoiceId={id} redirectTo="/admin/invoices" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow md:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Bill To</h2>
          <p className="mt-1 text-base font-medium text-gray-900">
            {client?.company_name || client?.full_name || client?.email}
          </p>
          <p className="text-sm text-gray-500">{client?.email}</p>
          {client?.billing_address && <p className="text-sm text-gray-500">{client.billing_address}</p>}
          {client?.phone && <p className="text-sm text-gray-500">{client.phone}</p>}

          <LineItemsManager
            invoiceId={id}
            initialItems={lineItems ?? []}
            taxRate={Number(invoice.tax_rate)}
            storedSubtotal={Number(invoice.subtotal)}
            storedTaxAmount={Number(invoice.tax_amount)}
            storedTotal={Number(invoice.total)}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Actions</h2>
            <div className="mt-3 space-y-2">
              <form action={async (fd) => { "use server"; await updateInvoice(id, fd); }}>
                <input type="hidden" name="status" value="sent" />
                <button
                  type="submit"
                  disabled={invoice.status === "sent"}
                  className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Mark as Sent
                </button>
              </form>
              <form action={async (fd) => { "use server"; await updateInvoice(id, fd); }}>
                <input type="hidden" name="status" value="overdue" />
                <button
                  type="submit"
                  disabled={invoice.status !== "sent"}
                  className="w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  Mark Overdue
                </button>
              </form>
              <form action={async (fd) => { "use server"; await updateInvoice(id, fd); }}>
                <input type="hidden" name="status" value="cancelled" />
                <button
                  type="submit"
                  disabled={invoice.status === "cancelled"}
                  className="w-full rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Record Payment</h2>
            <form action={async (fd) => { "use server"; await recordPayment(id, fd); }} className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">Amount (UGX)</label>
                <input name="amount" type="number" min={1} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Method</label>
                <select name="method" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm">
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="paystack">Paystack</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Reference</label>
                <input name="reference" type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm" />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500"
              >
                Record Payment
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Invoice Preview</h2>
          <a
            href={`/api/invoices/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Open in new tab ↗
          </a>
        </div>
        <iframe
          src={`/api/invoices/${id}/pdf`}
          className="w-full border-0"
          style={{ height: "900px" }}
          title="Invoice Preview"
        />
      </div>

      {(payments ?? []).length > 0 && (
        <div className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payments</h2>
          <div className="overflow-x-auto">
            <table className="mt-3 min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Method</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments!.map((p) => {
                  const receipt = receiptMap.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 capitalize">{p.method.replace("_", " ")}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{p.reference ?? p.paystack_reference ?? "—"}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                        UGX {Number(p.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {receipt && (
                          <a
                            href={`/api/receipts/${receipt.id}/pdf`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Receipt
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
