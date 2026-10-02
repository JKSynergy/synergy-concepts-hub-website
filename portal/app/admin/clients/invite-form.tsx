"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";

export default function InviteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: fullName,
          company_name: companyName,
          phone,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Unexpected server response. Please try again.");
      }

      if (!res.ok) {
        setMessage({ type: "err", text: data.error ?? "Failed to send invite" });
        return;
      }

      setMessage({ type: "ok", text: `Invite sent to ${email}` });
      setEmail("");
      setFullName("");
      setCompanyName("");
      setPhone("");
      router.refresh();
    } catch (err) {
      const text =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Request timed out. Check that Supabase is running and try again."
          : err instanceof Error
            ? err.message
            : "Failed to send invite";
      setMessage({ type: "err", text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ux-btn ux-btn--secondary">
        Invite client
      </button>
      {open && (
    <Dialog onClose={() => setOpen(false)} labelledBy="invite-client-title">
      <>
        <h3 id="invite-client-title">Invite a client</h3>
        <p className="ux-desc">
          Sends an email with an &quot;Accept invitation&quot; link. The client sets their password from that link, then
          signs in here.
        </p>

        {message && (
          <div className={`ux-notice ${message.type === "ok" ? "ux-notice--ok" : "ux-notice--error"}`} style={{ marginTop: 16 }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
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
            <button type="button" onClick={() => setOpen(false)} className="ux-btn ux-btn--secondary">
              {message?.type === "ok" ? "Close" : "Cancel"}
            </button>
            <button type="submit" disabled={loading} className="ux-btn ux-btn--primary">
              {loading ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </>
    </Dialog>
      )}
    </>
  );
}
