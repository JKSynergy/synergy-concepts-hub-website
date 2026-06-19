"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Pencil, Trash2, Send } from "lucide-react";
import EditClientDialog, { type ClientFormData } from "./edit-client-dialog";

export default function ClientActions({ client }: { client: ClientFormData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleResendInvite() {
    setResending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/clients/${client.id}/resend-invite`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to resend invite");
        return;
      }

      setSuccess(data.message ?? `Email sent to ${client.email}`);
      router.refresh();
    } catch {
      setError("Could not resend invite. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to delete client");
        setConfirmDelete(false);
        return;
      }

      router.refresh();
      if (window.location.pathname !== "/admin/clients") {
        router.push("/admin/clients");
      }
    } catch {
      setError("Could not delete client. Please try again.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Link
          href={`/admin/clients/${client.id}`}
          className="rounded-lg p-2 transition-colors hover:bg-white/10"
          style={{ color: "#0ea5e9" }}
          title="View client"
        >
          <Eye size={16} />
        </Link>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg p-2 transition-colors hover:bg-white/10"
          style={{ color: "var(--p-text)" }}
          title="Edit client"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={handleResendInvite}
          disabled={resending}
          className="rounded-lg p-2 transition-colors hover:bg-white/10 disabled:opacity-50"
          style={{ color: "#38bdf8" }}
          title="Resend invite email"
        >
          <Send size={16} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded-lg p-2 transition-colors hover:bg-red-500/10"
          style={{ color: "#ef4444" }}
          title="Delete client"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {error && (
        <p className="mt-1 text-right text-xs text-red-400">{error}</p>
      )}

      {success && (
        <p className="mt-1 text-right text-xs text-green-400">{success}</p>
      )}

      {editing && (
        <EditClientDialog client={client} onClose={() => setEditing(false)} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setConfirmDelete(false)}
            aria-label="Close dialog"
          />
          <div className="glass-card relative z-10 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold" style={{ color: "var(--p-text-strong)" }}>
              Delete client?
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--p-muted)" }}>
              This will permanently remove{" "}
              <strong style={{ color: "var(--p-text)" }}>
                {client.company_name || client.full_name || client.email}
              </strong>{" "}
              and their login access. Related projects and invoices will also be
              deleted.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 disabled:opacity-50"
                style={{ color: "var(--p-muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
