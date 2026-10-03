"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateInvoice } from "@/lib/actions/invoices";
import { useFeedback } from "@/components/ux/feedback";

type ClientOption = {
  id: string;
  company_name?: string | null;
  full_name?: string | null;
  email: string;
};

type InvoiceData = {
  id: string;
  client_id: string;
  issue_date: string;
  due_date: string | null;
  tax_rate: number;
  notes: string | null;
  scope_of_work: string | null;
};

export default function EditInvoiceForm({
  invoice,
  clients,
}: {
  invoice: InvoiceData;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError("");
    setSaving(true);
    const res = await updateInvoice(invoice.id, formData);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      toast(res.error, "error");
    } else {
      toast("Invoice updated");
      router.push(`/admin/invoices/${invoice.id}`);
    }
  }

  return (
    <form action={handleSubmit}>
      {error && <div className="ux-notice ux-notice--error">{error}</div>}

      <section className="ux-fin-formsec">
        <div className="ux-section-head">
          <h2>Client and dates</h2>
        </div>
        <div className="ux-formgrid">
          <label className="ux-field ux-full">
            <span>Client</span>
            <select name="client_id" required defaultValue={invoice.client_id} className="ux-input ux-select">
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name || c.full_name || c.email}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-field">
            <span>Issue date</span>
            <input type="date" name="issue_date" required defaultValue={invoice.issue_date} className="ux-input" />
          </label>
          <label className="ux-field">
            <span>Due date</span>
            <input type="date" name="due_date" defaultValue={invoice.due_date ?? ""} className="ux-input" />
          </label>
          <label className="ux-field">
            <span>Tax rate (%)</span>
            <input type="number" name="tax_rate" defaultValue={invoice.tax_rate} min={0} max={100} className="ux-input" />
          </label>
        </div>
      </section>

      <section className="ux-fin-formsec">
        <div className="ux-section-head">
          <h2>Scope of work</h2>
        </div>
        <label className="ux-field">
          <span className="sr-only">Scope of work</span>
          <textarea name="scope_of_work" rows={6} defaultValue={invoice.scope_of_work ?? ""} className="ux-input" />
        </label>
      </section>

      <section className="ux-fin-formsec">
        <div className="ux-section-head">
          <h2>Notes</h2>
        </div>
        <label className="ux-field">
          <span className="sr-only">Notes</span>
          <textarea name="notes" rows={3} defaultValue={invoice.notes ?? ""} className="ux-input" />
        </label>
      </section>

      <div className="ux-fin-submitbar">
        <button type="submit" className="ux-btn ux-btn--primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/admin/invoices/${invoice.id}`} className="ux-btn ux-btn--secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
