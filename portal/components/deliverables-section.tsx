"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDeliverable, getDeliverableDownloadUrl } from "@/lib/actions/projects";
import type { Deliverable } from "@/lib/types";
import { Dialog } from "@/components/ux/dialog";
import { useFeedback } from "@/components/ux/feedback";
import { EmptyState, Section } from "@/components/ux/primitives";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DeliverablesSection({
  projectId,
  deliverables,
  isStaff,
}: {
  projectId: string;
  deliverables: Deliverable[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function action(formData: FormData) {
    setUploading(true);
    setError("");
    const res = await uploadDeliverable(projectId, formData);
    setUploading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    toast("Deliverable uploaded");
    router.refresh();
  }

  async function download(d: Deliverable) {
    if (!d.file_url) return;
    setDownloadingId(d.id);
    const res = await getDeliverableDownloadUrl(d.id);
    setDownloadingId(null);
    if (res.url) {
      // A short-lived signed file URL on the storage provider: genuinely external.
      window.open(res.url, "_blank", "noopener");
    } else {
      toast(res.error ?? "Could not generate a download link", "error");
    }
  }

  return (
    <Section
      title="Deliverables"
      aside={
        isStaff ? (
          <button type="button" className="ux-textbtn" onClick={() => setOpen(true)}>
            Upload deliverable
          </button>
        ) : undefined
      }
    >
      {deliverables.length === 0 ? (
        <EmptyState title="No deliverables yet">{isStaff ? "Uploaded files appear here for the client to download." : "Files from Synergy will appear here."}</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Size</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {deliverables.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="ux-cell-main" style={{ display: "block" }}>{d.name}</span>
                    {isStaff && !d.is_visible_to_client && <span className="ux-cell-sub">Hidden from client</span>}
                  </td>
                  <td data-label="Type" className="ux-muted">{d.file_type || "—"}</td>
                  <td data-label="Size" className="ux-muted">{formatSize(d.file_size_bytes) || "—"}</td>
                  <td>
                    <button type="button" className="ux-textbtn" onClick={() => download(d)} disabled={downloadingId === d.id}>
                      {downloadingId === d.id ? "Preparing…" : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Dialog onClose={() => setOpen(false)} labelledBy="dl-title">
          <h3 id="dl-title">Upload deliverable</h3>
          {error && <div className="ux-notice ux-notice--error" style={{ marginTop: 16 }}>{error}</div>}
          <form action={action} style={{ marginTop: 20 }}>
            <div className="ux-formgrid">
              <label className="ux-field ux-full">
                <span>File</span>
                <input name="file" type="file" required className="ux-input" />
              </label>
              <label className="ux-field ux-full">
                <span>Display name (optional)</span>
                <input name="name" className="ux-input" />
              </label>
              <label className="ux-tl-check ux-full">
                <input type="checkbox" name="is_visible_to_client" defaultChecked />
                Visible to the client
              </label>
            </div>
            <div className="ux-dialog-actions">
              <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="ux-btn ux-btn--primary" disabled={uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Section>
  );
}
