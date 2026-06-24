"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateInvoice } from "@/lib/actions/invoices";

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
};

export default function EditInvoiceForm({
  invoice,
  clients,
}: {
  invoice: InvoiceData;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    setError("");
    const res = await updateInvoice(invoice.id, formData);
    if (res.error) {
      setError(res.error);
    } else {
      router.push(`/admin/invoices/${invoice.id}`);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Client</label>
        <select
          name="client_id"
          required
          defaultValue={invoice.client_id}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Issue Date</label>
          <input
            type="date"
            name="issue_date"
            required
            defaultValue={invoice.issue_date}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Due Date</label>
          <input
            type="date"
            name="due_date"
            defaultValue={invoice.due_date ?? ""}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Tax Rate (%)</label>
        <input
          type="number"
          name="tax_rate"
          defaultValue={invoice.tax_rate}
          min={0}
          max={100}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={invoice.notes ?? ""}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push(`/admin/invoices/${invoice.id}`)}
          className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
}
