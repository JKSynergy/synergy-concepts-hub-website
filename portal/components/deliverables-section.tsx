"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepareDeliverableUpload, registerDeliverable, getDeliverableDownloadUrl, setDeliverableVisibility } from "@/lib/actions/projects";
import { createClient } from "@/lib/supabase/client";
import { DELIVERABLE_MAX_BYTES } from "@/lib/deliverables";
import type { Deliverable } from "@/lib/types";
import { Dialog } from "@/components/ux/dialog";
import { useFeedback } from "@/components/ux/feedback";
import { EmptyState, Section, StatusMark } from "@/components/ux/primitives";

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
  canPublish,
}: {
  projectId: string;
  deliverables: Deliverable[];
  isStaff: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [visibilityId, setVisibilityId] = useState<string | null>(null);

  async function action(formData: FormData) {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      setError("A file is required");
      return;
    }
    if (file.size > DELIVERABLE_MAX_BYTES) {
      setError("Files must be 50 MB or smaller");
      return;
    }
    setUploading(true);
    setError("");
    const name = ((formData.get("name") as string) || file.name).trim();
    const isVisible = formData.get("is_visible_to_client") === "on";
    try {
      const prep = await prepareDeliverableUpload(projectId, { name: file.name, size: file.size, type: file.type });
      if (prep.error || !prep.path || !prep.token || !prep.intent || !prep.contentType) {
        setError(prep.error ?? "Could not prepare upload");
        return;
      }
      // The file itself goes straight to Supabase Storage — no app-server hop,
      // no request-size limit.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("deliverables")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: prep.contentType });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const res = await registerDeliverable(projectId, { intent: prep.intent, name, isVisible });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      toast("Deliverable uploaded");
      router.refresh();
    } catch {
      setError("The upload could not be completed. Please try again.");
    } finally {
      setUploading(false);
    }
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

  async function changeVisibility(d: Deliverable) {
    const publish = !d.is_visible_to_client;
    const ok = await askConfirm({
      title: publish ? "Publish this deliverable?" : "Hide this deliverable from the client?",
      body: publish
        ? `${d.name} will become visible and downloadable by the owning client.`
        : `${d.name} will no longer be visible to the client or eligible for new signed download links. Previously issued links may remain valid for up to five minutes.`,
      confirmLabel: publish ? "Publish" : "Hide from client",
      destructive: !publish,
    });
    if (!ok) return;

    setVisibilityId(d.id);
    const res = await setDeliverableVisibility(projectId, d.id, publish);
    setVisibilityId(null);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast(publish ? "Deliverable published" : "Deliverable hidden from client");
    router.refresh();
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
                    {isStaff && (
                      <span className="ux-cell-sub">
                        <StatusMark tone={d.is_visible_to_client ? "success" : "neutral"}>
                          {d.is_visible_to_client ? "Visible to client" : "Hidden from client"}
                        </StatusMark>
                      </span>
                    )}
                  </td>
                  <td data-label="Type" className="ux-muted">{d.file_type || "—"}</td>
                  <td data-label="Size" className="ux-muted">{formatSize(d.file_size_bytes) || "—"}</td>
                  <td>
                    <span className="ux-rowactions">
                      {canPublish && (
                        <button
                          type="button"
                          className={`ux-textbtn${d.is_visible_to_client ? " ux-textbtn--danger" : ""}`}
                          onClick={() => changeVisibility(d)}
                          disabled={visibilityId === d.id || downloadingId === d.id}
                          data-action={d.is_visible_to_client ? "unpublish-deliverable" : "publish-deliverable"}
                        >
                          {visibilityId === d.id ? "Saving…" : d.is_visible_to_client ? "Unpublish" : "Publish"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="ux-textbtn"
                        onClick={() => download(d)}
                        disabled={downloadingId === d.id || visibilityId === d.id}
                      >
                        {downloadingId === d.id ? "Preparing…" : "Download"}
                      </button>
                    </span>
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
                <input
                  name="file"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.jpg,.jpeg,.png,.gif,.webp,.tif,.tiff,.psd,.ai,.eps,.indd,.mp4,.mov,.webm,.mp3,.wav,.m4a,.zip,.7z,.rar"
                  required
                  className="ux-input"
                />
                <small>PDFs, office files, images, design source files, media, or archives up to 50 MB.</small>
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
