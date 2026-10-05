"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EditClientDialog, { type ClientFormData } from "./edit-client-dialog";
import { Dialog } from "@/components/ux/dialog";

export default function ClientActions({ client }: { client: ClientFormData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPermanent, setConfirmPermanent] = useState(false);
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
        setError(data.error ?? "Failed to archive client");
        setConfirmDelete(false);
        return;
      }

      router.refresh();
      if (window.location.pathname !== "/admin/clients") {
        router.push("/admin/clients");
      }
    } catch {
      setError("Could not archive client. Please try again.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePermanentDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/clients/${client.id}?permanent=1`, {
        method: "DELETE",
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to delete client");
        setConfirmPermanent(false);
        return;
      }

      router.refresh();
      if (window.location.pathname !== "/admin/clients") {
        router.push("/admin/clients");
      }
    } catch {
      setError("Could not delete client. Please try again.");
      setConfirmPermanent(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="ux-rowactions">
        <Link href={`/admin/clients/${client.id}`} className="ux-textbtn ux-textbtn--strong">
          Open
        </Link>
        <button type="button" onClick={() => setEditing(true)} className="ux-textbtn">
          Edit
        </button>
        <button type="button" onClick={handleResendInvite} disabled={resending} className="ux-textbtn">
          {resending ? "Sending…" : "Resend invite"}
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)} className="ux-textbtn ux-textbtn--danger">
          Archive
        </button>
        <button type="button" onClick={() => setConfirmPermanent(true)} className="ux-textbtn ux-textbtn--danger">
          Delete
        </button>
      </div>

      {error && <p className="ux-notice ux-notice--error" style={{ marginTop: 8, marginBottom: 0 }}>{error}</p>}
      {success && <p className="ux-notice ux-notice--ok" style={{ marginTop: 8, marginBottom: 0 }}>{success}</p>}

      {editing && <EditClientDialog client={client} onClose={() => setEditing(false)} />}

      {confirmDelete && (
        <Dialog alert maxWidth={440} labelledBy="archive-client-title" dismissible={!deleting} onClose={() => !deleting && setConfirmDelete(false)}>
          <>
            <h3 id="archive-client-title">Archive client?</h3>
            <p className="ux-desc">
              This blocks sign-in for <strong>{client.company_name || client.full_name || client.email}</strong>. Their
              projects, invoices and payment records are kept.
            </p>
            <div className="ux-dialog-actions">
              <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} className="ux-btn ux-btn--secondary">
                Cancel
              </button>
              <button type="button" disabled={deleting} onClick={handleDelete} className="ux-btn ux-btn--danger">
                {deleting ? "Archiving…" : "Archive"}
              </button>
            </div>
          </>
        </Dialog>
      )}

      {confirmPermanent && (
        <Dialog alert maxWidth={440} labelledBy="delete-client-title" dismissible={!deleting} onClose={() => !deleting && setConfirmPermanent(false)}>
          <>
            <h3 id="delete-client-title">Permanently delete client?</h3>
            <p className="ux-desc">
              This permanently removes <strong>{client.company_name || client.full_name || client.email}</strong> and
              their sign-in access. This cannot be undone.
            </p>
            <p className="ux-desc">
              Deletion only succeeds when the client has no projects or invoices — otherwise archive the client
              instead.
            </p>
            <div className="ux-dialog-actions">
              <button type="button" disabled={deleting} onClick={() => setConfirmPermanent(false)} className="ux-btn ux-btn--secondary">
                Cancel
              </button>
              <button type="button" disabled={deleting} onClick={handlePermanentDelete} className="ux-btn ux-btn--danger">
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </>
        </Dialog>
      )}
    </>
  );
}
