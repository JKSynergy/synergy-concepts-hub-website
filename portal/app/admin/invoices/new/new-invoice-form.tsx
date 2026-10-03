"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createInvoice, addLineItem } from "@/lib/actions/invoices";
import { useFeedback } from "@/components/ux/feedback";
import { ugx } from "@/components/ux/primitives";
import { fmtDate } from "../fin-utils";

type ClientOption = {
  id: string;
  company_name?: string | null;
  full_name?: string | null;
  email: string;
};

type Item = { description: string; quantity: number; unit_price: number };

export default function NewInvoiceForm({
  clients,
}: {
  clients: ClientOption[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [meta, setMeta] = useState({ client: "", issue: "", due: "", tax: 0 });
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState<number | "">("");

  async function handleCreate(formData: FormData) {
    setError("");
    setCreating(true);
    const res = await createInvoice(formData);
    setCreating(false);
    if (res.error) {
      setError(res.error);
      toast(res.error, "error");
    } else if (res.id) {
      const cid = formData.get("client_id") as string;
      const c = clients.find((x) => x.id === cid);
      setMeta({
        client: c ? c.company_name || c.full_name || c.email : "",
        issue: (formData.get("issue_date") as string) || "",
        due: (formData.get("due_date") as string) || "",
        tax: Number(formData.get("tax_rate") || 0),
      });
      setInvoiceId(res.id);
      toast("Draft invoice created");
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId || !desc.trim()) return;
    setError("");
    setAdding(true);
    const fd = new FormData();
    fd.append("description", desc.trim());
    fd.append("quantity", String(qty || 1));
    fd.append("unit_price", String(price || 0));
    const res = await addLineItem(invoiceId, fd);
    setAdding(false);
    if (res.error) {
      setError(res.error);
      toast(res.error, "error");
    } else {
      setItems((prev) => [...prev, { description: desc.trim(), quantity: Number(qty || 1), unit_price: Number(price || 0) }]);
      setDesc("");
      setQty(1);
      setPrice("");
      toast("Line item added");
    }
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax = subtotal * (meta.tax / 100);

  return (
    <div>
      {error && <div className="ux-notice ux-notice--error">{error}</div>}

      {!invoiceId ? (
        <form action={handleCreate}>
          <section className="ux-fin-formsec">
            <div className="ux-section-head">
              <h2>Client and dates</h2>
            </div>
            <div className="ux-formgrid">
              <label className="ux-field ux-full">
                <span>Client</span>
                <select name="client_id" required className="ux-input ux-select" defaultValue="">
                  <option value="" disabled>
                    Select a client
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name || c.full_name || c.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ux-field">
                <span>Issue date</span>
                <input type="date" name="issue_date" className="ux-input" defaultValue={new Date().toISOString().split("T")[0]} />
              </label>
              <label className="ux-field">
                <span>Due date</span>
                <input type="date" name="due_date" className="ux-input" />
              </label>
              <label className="ux-field">
                <span>Tax rate (%)</span>
                <input type="number" name="tax_rate" className="ux-input" defaultValue={0} min={0} max={100} />
              </label>
            </div>
          </section>

          <section className="ux-fin-formsec">
            <div className="ux-section-head">
              <h2>Scope of work</h2>
            </div>
            <label className="ux-field">
              <span className="sr-only">Scope of work</span>
              <textarea name="scope_of_work" rows={6} className="ux-input" placeholder="What this invoice covers, one item per line (optional)" />
            </label>
          </section>

          <section className="ux-fin-formsec">
            <div className="ux-section-head">
              <h2>Notes</h2>
            </div>
            <label className="ux-field">
              <span className="sr-only">Notes</span>
              <textarea name="notes" rows={3} className="ux-input" placeholder="Payment instructions or a message for the client (optional)" />
            </label>
          </section>

          <div className="ux-fin-submitbar">
            <button type="submit" className="ux-btn ux-btn--primary" disabled={creating}>
              {creating ? "Creating…" : "Create invoice"}
            </button>
            <Link href="/admin/invoices" className="ux-btn ux-btn--secondary">
              Cancel
            </Link>
          </div>
        </form>
      ) : (
        <>
          <div className="ux-notice ux-notice--ok">Draft invoice created. Add its line items below.</div>

          <section className="ux-fin-formsec">
            <div className="ux-section-head">
              <h2>Client and dates</h2>
            </div>
            <dl className="ux-dl">
              <div>
                <dt>Client</dt>
                <dd>{meta.client}</dd>
              </div>
              <div>
                <dt>Issue date</dt>
                <dd>{fmtDate(meta.issue)}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{fmtDate(meta.due)}</dd>
              </div>
              <div>
                <dt>Tax rate</dt>
                <dd>{meta.tax}%</dd>
              </div>
            </dl>
          </section>

          <section className="ux-fin-formsec">
            <div className="ux-section-head">
              <h2>Line items</h2>
            </div>
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
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.description}</td>
                      <td className="ux-num" data-label="Qty">{it.quantity}</td>
                      <td className="ux-num" data-label="Unit price">{ugx(it.unit_price)}</td>
                      <td className="ux-num" data-label="Amount">{ugx(it.quantity * it.unit_price)}</td>
                      <td />
                    </tr>
                  ))}
                  <tr className="ux-fin-addrow">
                    <td data-label="Description">
                      <input form="ni-add" className="ux-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="New line item" aria-label="Description" required />
                    </td>
                    <td className="ux-num" data-label="Qty" style={{ width: 90 }}>
                      <input form="ni-add" className="ux-input" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} min={1} aria-label="Quantity" />
                    </td>
                    <td className="ux-num" data-label="Unit price (UGX)" style={{ width: 170 }}>
                      <input form="ni-add" className="ux-input" type="number" value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))} min={0} aria-label="Unit price in UGX" required />
                    </td>
                    <td className="ux-num" data-label="Amount">
                      {desc.trim() && Number(price) > 0 ? ugx((Number(qty) || 0) * Number(price)) : <span className="ux-muted">—</span>}
                    </td>
                    <td>
                      <div className="ux-rowactions">
                        <button type="submit" form="ni-add" className="ux-textbtn" disabled={adding}>
                          {adding ? "Adding…" : "Add item"}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <form id="ni-add" onSubmit={handleAddItem} />

            <div className="ux-fin-totals">
              <div>
                <span>Subtotal</span>
                <span>{ugx(subtotal)}</span>
              </div>
              {meta.tax > 0 && (
                <div>
                  <span>Tax ({meta.tax}%)</span>
                  <span>{ugx(tax)}</span>
                </div>
              )}
              <div>
                <span>Total</span>
                <span>{ugx(subtotal + tax)}</span>
              </div>
              <small>Sum of the items added so far</small>
            </div>
          </section>

          <div className="ux-fin-submitbar">
            <button type="button" className="ux-btn ux-btn--primary" onClick={() => router.push(`/admin/invoices/${invoiceId}`)}>
              Open invoice
            </button>
            <a href={`/api/invoices/${invoiceId}/pdf`} className="ux-btn ux-btn--secondary">
              Download PDF
            </a>
          </div>
        </>
      )}
    </div>
  );
}
