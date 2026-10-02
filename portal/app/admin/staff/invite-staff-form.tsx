"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";

type Mode = "invite" | "manual";

type ManualSuccess = {
  type: "manual";
  email: string;
  tempPassword: string;
};

type Message =
  | { type: "ok" | "err"; text: string }
  | ManualSuccess;

function isManualSuccess(message: Message | null): message is ManualSuccess {
  return !!message && "type" in message && message.type === "manual";
}

export default function AddStaffForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("invite");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"staff" | "finance">("staff");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  function resetForm() {
    setEmail("");
    setFullName("");
    setMessage(null);
  }

  function close() {
    setOpen(false);
    resetForm();
    setMode("invite");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const endpoint = mode === "invite" ? "/api/admin/invite-staff" : "/api/admin/staff";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: fullName,
          role,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      let data: { error?: string; email?: string; tempPassword?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Unexpected server response. Please try again.");
      }

      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? (mode === "invite" ? "Failed to send invite" : "Failed to add staff"),
        });
        return;
      }

      if (mode === "manual" && data.tempPassword) {
        setMessage({
          type: "manual",
          email: data.email || email,
          tempPassword: data.tempPassword,
        });
        setEmail("");
        setFullName("");
        router.refresh();
        return;
      }

      setMessage({ type: "ok", text: `Invite sent to ${email}` });
      setEmail("");
      setFullName("");
      router.refresh();
    } catch (err) {
      const text =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Request timed out. Check that Supabase is running and try again."
          : err instanceof Error
            ? err.message
            : mode === "invite"
              ? "Failed to send invite"
              : "Failed to add staff";
      setMessage({ type: "err", text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ux-btn ux-btn--primary">
        Add team member
      </button>
      {open && (
        <Dialog onClose={() => !loading && close()} labelledBy="add-staff-title" maxWidth={480}>
          <>
            <h3 id="add-staff-title">Add team member</h3>
            <p className="ux-desc">Invite by email, or create a login manually and share a temporary password.</p>

            <div className="ux-tabs" role="tablist" style={{ padding: 0, margin: "16px 0 4px" }}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "invite"}
                className="ux-textbtn"
                style={{ padding: "8px 0", marginRight: 20, color: "var(--ux-ink)", fontWeight: mode === "invite" ? 600 : 400, borderBottom: mode === "invite" ? "2px solid var(--ux-orange)" : "2px solid transparent" }}
                onClick={() => {
                  setMode("invite");
                  setMessage(null);
                }}
              >
                Send invite
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "manual"}
                className="ux-textbtn"
                style={{ padding: "8px 0", color: "var(--ux-ink)", fontWeight: mode === "manual" ? 600 : 400, borderBottom: mode === "manual" ? "2px solid var(--ux-orange)" : "2px solid transparent" }}
                onClick={() => {
                  setMode("manual");
                  setMessage(null);
                }}
              >
                Create manually
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              {message && !isManualSuccess(message) && (
                <div className={`ux-notice ${message.type === "ok" ? "ux-notice--ok" : "ux-notice--error"}`}>{message.text}</div>
              )}

              {isManualSuccess(message) && (
                <div className="ux-notice ux-notice--ok">
                  <b>Team account created.</b> Share these credentials with {message.email} securely.
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontFamily: "ui-monospace, monospace" }}>{message.tempPassword}</span>
                    <button type="button" className="ux-textbtn" onClick={() => navigator.clipboard.writeText(message.tempPassword)}>
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="ux-formgrid">
                  <label className="ux-field ux-full">
                    <span>Email *</span>
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="ux-input" />
                  </label>
                  <label className="ux-field ux-full">
                    <span>Role</span>
                    <select value={role} onChange={(e) => setRole(e.target.value as "staff" | "finance")} className="ux-input ux-select">
                      <option value="staff">Staff — operational work, no finance</option>
                      <option value="finance">Finance — invoices, payments, receipts, reports</option>
                    </select>
                  </label>
                  <label className="ux-field ux-full">
                    <span>Full name</span>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="ux-input" />
                  </label>
                </div>
                <div className="ux-dialog-actions">
                  <button type="button" onClick={close} className="ux-btn ux-btn--secondary">
                    {message ? "Done" : "Cancel"}
                  </button>
                  <button type="submit" disabled={loading} className="ux-btn ux-btn--primary">
                    {loading ? (mode === "invite" ? "Sending…" : "Creating…") : mode === "invite" ? "Send invite" : "Create team member"}
                  </button>
                </div>
              </form>
            </div>
          </>
        </Dialog>
      )}
    </>
  );
}
