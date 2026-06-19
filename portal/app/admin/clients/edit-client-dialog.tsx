"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div className="glass-card relative z-10 w-full max-w-lg p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "var(--p-text-strong)" }}>
              Edit Client
            </h3>
            <p className="mt-1 text-xs" style={{ color: "var(--p-muted)" }}>
              Update contact and billing details
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
            style={{ color: "var(--p-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email *" required>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input w-full"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full Name">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="glass-input w-full"
              />
            </Field>
            <Field label="Company">
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="glass-input w-full"
              />
            </Field>
          </div>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="glass-input w-full"
            />
          </Field>
          <Field label="Billing Address">
            <textarea
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              rows={2}
              className="glass-input w-full resize-none"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tax ID">
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="glass-input w-full"
              />
            </Field>
            <Field label="External Portal URL">
              <input
                type="url"
                value={externalPortalUrl}
                onChange={(e) => setExternalPortalUrl(e.target.value)}
                placeholder="https://"
                className="glass-input w-full"
              />
            </Field>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10"
              style={{ color: "var(--p-muted)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
                boxShadow: "0 4px 12px rgba(14, 165, 233, 0.3)",
              }}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--p-muted)" }}>
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      {children}
    </div>
  );
}
