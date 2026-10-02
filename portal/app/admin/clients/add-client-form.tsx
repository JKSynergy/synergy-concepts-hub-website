"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";

export default function AddClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  function reset() {
    setEmail("");
    setFullName("");
    setCompanyName("");
    setPhone("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName,
        company_name: companyName,
        phone,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to add client");
      return;
    }

    setCreated({ email: data.email, tempPassword: data.tempPassword });
    reset();
    router.refresh();
  }

  const close = () => {
    setOpen(false);
    setCreated(null);
    reset();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ux-btn ux-btn--primary">
        Add client
      </button>
      {open && (
    <Dialog onClose={close} labelledBy="add-client-title">
      <>
        <h3 id="add-client-title">Add a client</h3>
        <p className="ux-desc">Creates the account now with a temporary password you share securely.</p>

        {created ? (
          <div style={{ marginTop: 20 }}>
            <div className="ux-notice ux-notice--ok">
              <b>Client account created.</b> Share these temporary credentials securely. The client should change the
              password after first sign-in.
            </div>
            <dl className="ux-dl">
              <div>
                <dt>Email</dt>
                <dd>{created.email}</dd>
              </div>
              <div>
                <dt>Temporary password</dt>
                <dd style={{ fontFamily: "ui-monospace, monospace" }}>{created.tempPassword}</dd>
              </div>
            </dl>
            <div className="ux-dialog-actions">
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(`Email: ${created.email}\nTemporary password: ${created.tempPassword}`)
                }
                className="ux-btn ux-btn--secondary"
              >
                Copy credentials
              </button>
              <button type="button" onClick={() => setCreated(null)} className="ux-btn ux-btn--secondary">
                Add another
              </button>
              <button type="button" onClick={close} className="ux-btn ux-btn--primary">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
            {error && <div className="ux-notice ux-notice--error">{error}</div>}
            <div className="ux-formgrid">
              <label className="ux-field ux-full">
                <span>Email</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="ux-input" />
              </label>
              <label className="ux-field">
                <span>Full name</span>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="ux-input" />
              </label>
              <label className="ux-field">
                <span>Company</span>
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="ux-input" />
              </label>
              <label className="ux-field ux-full">
                <span>Phone</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="ux-input" />
              </label>
            </div>
            <div className="ux-dialog-actions">
              <button type="button" onClick={close} className="ux-btn ux-btn--secondary">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="ux-btn ux-btn--primary">
                {loading ? "Creating…" : "Create client"}
              </button>
            </div>
          </form>
        )}
      </>
    </Dialog>
      )}
    </>
  );
}
