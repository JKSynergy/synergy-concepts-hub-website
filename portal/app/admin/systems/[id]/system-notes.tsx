"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import { updateSystemOperationalNotes } from "@/lib/actions/systems";

export default function SystemNotes({ systemId, systemName, notes, canEdit }: {
  systemId: string;
  systemName: string;
  notes: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await updateSystemOperationalNotes(systemId, value);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Operational notes</h2>
        {canEdit && <button type="button" className="ux-btn ux-btn--small" onClick={() => setOpen(true)}>Edit notes</button>}
      </div>
      <p className={notes ? undefined : "ux-muted"} style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
        {notes || "No operational notes recorded."}
      </p>
      {open && (
        <Dialog labelledBy="system-notes-title" onClose={() => setOpen(false)} maxWidth={560}>
          <form onSubmit={save} style={{ display: "grid", gap: "1rem" }}>
            <h2 id="system-notes-title" style={{ margin: 0 }}>Notes — {systemName}</h2>
            {error && <p className="ux-alert ux-alert-error" role="alert">{error}</p>}
            <textarea className="ux-input" rows={8} value={value} onChange={(event) => setValue(event.target.value)} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" className="ux-btn" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="ux-btn ux-btn--primary" disabled={busy}>{busy ? "Saving…" : "Save notes"}</button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
