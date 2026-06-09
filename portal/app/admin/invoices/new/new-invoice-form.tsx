"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvoice, addLineItem } from "@/lib/actions/invoices";

type ClientOption = {
  id: string;
  company_name?: string | null;
  full_name?: string | null;
  email: string;
};

export default function NewInvoiceForm({
  clients,
}: {
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [items, setItems] = useState<
    { description: string; quantity: number; unit_price: number }[]
  >([]);
  const [error, setError] = useState("");

  async function handleCreate(formData: FormData) {
    setError("");
    const res = await createInvoice(formData);
    if (res.error) {
      setError(res.error);
    } else if (res.id) {
      setInvoiceId(res.id);
    }
  }

  async function handleAddItem(formData: FormData) {
    if (!invoiceId) return;
    setError("");
    const res = await addLineItem(invoiceId, formData);
    if (res.error) {
      setError(res.error);
    } else {
      const desc = (formData.get("description") as string) || "";
      const qty = Number(formData.get("quantity") || 1);
      const price = Number(formData.get("unit_price") || 0);
      setItems((prev) => [...prev, { description: desc, quantity: qty, unit_price: price }]);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Create Invoice</h1>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!invoiceId ? (
        <form action={handleCreate} className="space-y-4 rounded-xl bg-white p-6 shadow">
          <div>
            <label className="block text-sm font-medium text-gray-700">Client</label>
            <select
              name="client_id"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name || c.full_name || c.email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Issue Date</label>
              <input
                type="date"
                name="issue_date"
                defaultValue={new Date().toISOString().split("T")[0]}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Due Date</label>
              <input
                type="date"
                name="due_date"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tax Rate (%)</label>
              <input
                type="number"
                name="tax_rate"
                defaultValue={0}
                min={0}
                max={100}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea name="notes" rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create Invoice
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
            {items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="mt-4 min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Unit Price</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-sm text-gray-900">{it.description}</td>
                        <td className="px-4 py-2 text-right text-sm text-gray-500">{it.quantity}</td>
                        <td className="px-4 py-2 text-right text-sm text-gray-500">
                          UGX {it.unit_price.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-gray-900">
                          UGX {(it.quantity * it.unit_price).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form action={handleAddItem} className="mt-4 flex flex-wrap gap-3">
              <input
                name="description"
                placeholder="Description"
                required
                className="flex-1 rounded-md border-gray-300 shadow-sm px-3 py-2"
              />
              <input
                name="quantity"
                type="number"
                defaultValue={1}
                min={1}
                className="w-20 rounded-md border-gray-300 shadow-sm px-3 py-2"
              />
              <input
                name="unit_price"
                type="number"
                placeholder="Unit price"
                min={0}
                required
                className="w-32 rounded-md border-gray-300 shadow-sm px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Add Item
              </button>
            </form>
          </div>

          <div className="flex gap-3">
            <a
              href={`/api/invoices/${invoiceId}/pdf`}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Download PDF
            </a>
            <button
              onClick={() => router.push(`/admin/invoices/${invoiceId}`)}
              className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
            >
              Open Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
