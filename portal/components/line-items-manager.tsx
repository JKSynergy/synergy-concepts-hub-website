"use client";

import { money } from "@/components/ux/primitives";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addLineItem, deleteLineItem } from "@/lib/actions/invoices";
import { useFeedback } from "@/components/ux/feedback";


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
  storedSubtotal = 0,
  storedTaxAmount = 0,
  storedTotal = 0,
  currency = "UGX",
}: {
  invoiceId: string;
  initialItems: LineItem[];
  taxRate: number;
  storedSubtotal?: number;
  storedTaxAmount?: number;
  storedTotal?: number;
  currency?: string;
}) {
  const router = useRouter();
  const fmt = (n: number) => money(n, currency);
  const { toast, confirm: askConfirm } = useFeedback();
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const existingSubtotal = initialItems.length > 0
    ? initialItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : storedSubtotal;
  const previewQty = Number(qty) || 0;
  const previewPrice = Number(unitPrice) || 0;
  const previewAmount = desc.trim() ? previewQty * previewPrice : 0;
  const previewSubtotal = existingSubtotal + previewAmount;
  const displayTaxRate = Number(taxRate) || 0;
  const taxAmount = initialItems.length > 0 || previewAmount > 0
    ? previewSubtotal * (displayTaxRate / 100)
    : storedTaxAmount;
  const total = initialItems.length > 0 || previewAmount > 0
    ? previewSubtotal + taxAmount
    : storedTotal;

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
      toast(res.error, "error");
    } else {
      setDesc("");
      setQty(1);
      setUnitPrice("");
      toast("Line item added");
      router.refresh();
    }
  }

  async function handleDelete(item: LineItem) {
    const ok = await askConfirm({
      title: "Remove this line item?",
      body: item.description,
      confirmLabel: "Remove item",
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteLineItem(item.id, invoiceId);
    if (res?.error) {
      toast(res.error, "error");
      return;
    }
    toast("Line item removed");
    router.refresh();
  }

  const formId = `li-add-${invoiceId}`;

  return (
    <>
      {actionError && <div className="ux-notice ux-notice--error">{actionError}</div>}
      <div className="ux-tablewrap">
        <table className="ux-table ux-table--stack ux-fin-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="ux-num">Qty</th>
              <th className="ux-num">Unit price</th>
              <th className="ux-num">Amount</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {initialItems.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td className="ux-num" data-label="Qty">{Number(item.quantity).toLocaleString()}</td>
                <td className="ux-num" data-label="Unit price">{fmt(Number(item.unit_price))}</td>
                <td className="ux-num" data-label="Amount">{fmt(Number(item.amount) || 0)}</td>
                <td>
                  <div className="ux-rowactions">
                    <button type="button" onClick={() => handleDelete(item)} className="ux-textbtn ux-textbtn--danger">
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {initialItems.length === 0 && (
              <tr>
                <td colSpan={5} className="ux-muted">
                  No line items yet. Add the first one in the row below.
                </td>
              </tr>
            )}
            <tr className="ux-fin-addrow">
              <td data-label="Description">
                <input
                  form={formId}
                  className="ux-input"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="New line item"
                  aria-label="Description"
                  required
                />
              </td>
              <td className="ux-num" data-label="Qty" style={{ width: 90 }}>
                <input
                  form={formId}
                  className="ux-input"
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  aria-label="Quantity"
                  min={1}
                  required
                />
              </td>
              <td className="ux-num" data-label="Unit price (UGX)" style={{ width: 170 }}>
                <input
                  form={formId}
                  className="ux-input"
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-label="Unit price in UGX"
                  min={0}
                  step={1}
                  required
                />
              </td>
              <td className="ux-num" data-label="Amount">
                {previewAmount > 0 ? fmt(previewAmount) : <span className="ux-muted">—</span>}
              </td>
              <td>
                <div className="ux-rowactions">
                  <button type="submit" form={formId} className="ux-textbtn" disabled={loading}>
                    {loading ? "Adding…" : "Add item"}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form id={formId} onSubmit={handleAdd} />

      <div className="ux-fin-totals">
        <div>
          <span>Subtotal</span>
          <span>{fmt(previewSubtotal)}</span>
        </div>
        {displayTaxRate > 0 && (
          <div>
            <span>Tax ({displayTaxRate}%)</span>
            <span>{fmt(taxAmount)}</span>
          </div>
        )}
        <div>
          <span>Total</span>
          <span>{fmt(total)}</span>
        </div>
        {previewAmount > 0 && <small>Includes the row being typed, not yet added</small>}
      </div>
    </>
  );
}
