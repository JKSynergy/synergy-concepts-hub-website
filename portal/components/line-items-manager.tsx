"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addLineItem, deleteLineItem } from "@/lib/actions/invoices";

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export function LineItemsManager({
  invoiceId,
  initialItems,
  taxRate,
}: {
  invoiceId: string;
  initialItems: LineItem[];
  taxRate: number;
}) {
  const router = useRouter();
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const existingSubtotal = initialItems.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );
  const previewQty = Number(qty) || 0;
  const previewPrice = Number(unitPrice) || 0;
  const previewAmount = desc.trim() ? previewQty * previewPrice : 0;
  const previewSubtotal = existingSubtotal + previewAmount;
  const displayTaxRate = Number(taxRate) || 0;
  const taxAmount = previewSubtotal * (displayTaxRate / 100);
  const total = previewSubtotal + taxAmount;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim()) return;
    setLoading(true);
    setActionError("");
    const fd = new FormData();
    fd.append("description", desc.trim());
    fd.append("quantity", String(previewQty));
    fd.append("unit_price", String(previewPrice));
    const res = await addLineItem(invoiceId, fd);
    setLoading(false);
    if (res.error) {
      setActionError(res.error);
    } else {
      setDesc("");
      setQty(1);
      setUnitPrice("");
      router.refresh();
    }
  }

  async function handleDelete(itemId: string) {
    await deleteLineItem(itemId, invoiceId);
    router.refresh();
  }

  return (
    <>
      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Line Items
        </h2>
        <div className="overflow-x-auto">
          <table className="mt-3 min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Description
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Qty
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Unit Price
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Amount
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {initialItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {item.description}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-500">
                    {Number(item.quantity).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-500">
                    UGX {Number(item.unit_price).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                    UGX {Number(item.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {initialItems.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-4 text-center text-sm text-gray-400"
                  >
                    No line items yet. Use the form below to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Add Line Item
        </h3>
        {actionError && (
          <p className="mb-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">
            {actionError}
          </p>
        )}
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_80px_160px_auto]"
        >
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none"
          />
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            placeholder="Qty"
            min={1}
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none"
          />
          <input
            type="number"
            value={unitPrice}
            onChange={(e) =>
              setUnitPrice(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="Unit Price (UGX)"
            min={0}
            step={1}
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Adding…" : "Add"}
          </button>
        </form>

        {desc.trim() && previewPrice > 0 && (
          <div className="mt-2 flex items-center gap-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <span className="flex-1 truncate font-medium text-gray-700">
              {desc}
            </span>
            <span>
              {previewQty} × UGX {previewPrice.toLocaleString()}
            </span>
            <span className="font-semibold text-gray-900">
              = UGX {previewAmount.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-xs space-y-2 text-right sm:w-64">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>UGX {previewSubtotal.toLocaleString()}</span>
          </div>
          {displayTaxRate > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax ({displayTaxRate}%)</span>
              <span>UGX {taxAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
            <span>Total</span>
            <span>UGX {total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </>
  );
}
