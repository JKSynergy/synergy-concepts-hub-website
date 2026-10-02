"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";

export type ClientFormData = {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  billing_address: string | null;
  tax_id: string | null;
  external_portal_url: string | null;
};

export default function EditClientDialog({
  client,
  onClose,
}: {
  client: ClientFormData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(client.email);
  const [fullName, setFullName] = useState(client.full_name ?? "");
  const [companyName, setCompanyName] = useState(client.company_name ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [billingAddress, setBillingAddress] = useState(client.billing_address ?? "");
  const [taxId, setTaxId] = useState(client.tax_id ?? "");
  const [externalPortalUrl, setExternalPortalUrl] = useState(
    client.external_portal_url ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: fullName,
          company_name: companyName,
          phone,
          billing_address: billingAddress,
          tax_id: taxId,
          external_portal_url: externalPortalUrl,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update client");
        return;
      }

      onClose();
      router.refresh();
    } catch {
      setError("Could not save changes. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog onClose={onClose} labelledBy="edit-client-title">
      <>
        <h3 id="edit-client-title">Edit client</h3>
        <p className="ux-desc">{client.company_name || client.full_name || client.email}</p>

        {error && <div className="ux-notice ux-notice--error" style={{ marginTop: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          <div className="ux-formgrid">
            <Field label="Email" full>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="ux-input" />
            </Field>
            <Field label="Full name">
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="ux-input" />
            </Field>
            <Field label="Company">
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="ux-input" />
            </Field>
            <Field label="Phone" full>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="ux-input" />
            </Field>
            <Field label="Billing address" full>
              <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={2} className="ux-input" />
            </Field>
            <Field label="Tax ID">
              <input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} className="ux-input" />
            </Field>
            <Field label="External portal URL">
              <input type="url" value={externalPortalUrl} onChange={(e) => setExternalPortalUrl(e.target.value)} placeholder="https://" className="ux-input" />
            </Field>
          </div>
          <div className="ux-dialog-actions">
            <button type="button" onClick={onClose} className="ux-btn ux-btn--secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="ux-btn ux-btn--primary">
              {loading ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </>
    </Dialog>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`ux-field ${full ? "ux-full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
