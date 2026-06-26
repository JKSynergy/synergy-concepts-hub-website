"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-105"
        style={{ background: "linear-gradient(135deg, #0ea5e9, #38bdf8)", boxShadow: "0 4px 12px rgba(14, 165, 233, 0.3)" }}
      >
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Staff
        </span>
      </button>
    );
  }

  return (
    <div className="glass-card p-6" style={{ minWidth: "320px", maxWidth: "420px" }}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--p-text-strong)" }}>Add Staff</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--p-muted)" }}>
            Invite by email or create a login manually
          </p>
        </div>
        <button
          onClick={close}
          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
          style={{ color: "var(--p-muted)" }}
        >
          Cancel
        </button>
      </div>

      <div className="mb-4 flex rounded-lg p-1" style={{ background: "rgba(255, 255, 255, 0.05)" }}>
        <button
          type="button"
          onClick={() => {
            setMode("invite");
            setMessage(null);
          }}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: mode === "invite" ? "rgba(14, 165, 233, 0.2)" : "transparent",
            color: mode === "invite" ? "#0ea5e9" : "var(--p-muted)",
          }}
        >
          Send Invite
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("manual");
            setMessage(null);
          }}
          className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: mode === "manual" ? "rgba(14, 165, 233, 0.2)" : "transparent",
            color: mode === "manual" ? "#0ea5e9" : "var(--p-muted)",
          }}
        >
          Create Manually
        </button>
      </div>

      {message && !isManualSuccess(message) && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm ${
            message.type === "ok"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {isManualSuccess(message) && (
        <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          <p className="mb-2 font-medium">Staff account created</p>
          <p className="mb-1" style={{ color: "var(--p-muted)" }}>
            Share these credentials with <strong>{message.email}</strong>:
          </p>
          <div className="flex items-center gap-2 rounded-md bg-black/30 px-3 py-2 font-mono text-sm">
            <span className="flex-1">{message.tempPassword}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(message.tempPassword)}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-white/10"
              style={{ color: "#0ea5e9" }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
            Email <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
            className="w-full rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              borderColor: "var(--p-border)",
              color: "var(--p-text)",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#0ea5e9";
              e.target.style.boxShadow = "0 0 0 3px rgba(14, 165, 233, 0.15)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--p-border)";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
            Full Name
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe"
            className="w-full rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              borderColor: "var(--p-border)",
              color: "var(--p-text)",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#0ea5e9";
              e.target.style.boxShadow = "0 0 0 3px rgba(14, 165, 233, 0.15)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--p-border)";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10"
            style={{ color: "var(--p-muted)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            style={{ background: "linear-gradient(135deg, #0ea5e9, #38bdf8)", boxShadow: "0 4px 12px rgba(14, 165, 233, 0.3)" }}
          >
            {loading
              ? mode === "invite"
                ? "Sending..."
                : "Creating..."
              : mode === "invite"
                ? "Send Invite"
                : "Create Staff"}
          </button>
        </div>
      </form>
    </div>
  );
}
