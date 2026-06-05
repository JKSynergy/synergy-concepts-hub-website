"use client";

import { useState } from "react";
import {
  uploadDeliverable,
  getDeliverableDownloadUrl,
} from "@/lib/actions/projects";
import type { Deliverable } from "@/lib/types";

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
    const form = document.getElementById("deliverable-form") as HTMLFormElement;
    form?.reset();
  }

  async function download(d: Deliverable) {
    if (!d.file_url) return;
    setDownloadingId(d.id);
    const res = await getDeliverableDownloadUrl(d.file_url);
    setDownloadingId(null);
    if (res.url) {
      window.open(res.url, "_blank");
    } else {
      setError(res.error ?? "Could not generate download link");
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Deliverables</h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isStaff && (
        <form
          id="deliverable-form"
          action={action}
          className="mb-6 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-2"
        >
          <input
            name="name"
            placeholder="Display name (optional)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="file"
            type="file"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              name="is_visible_to_client"
              defaultChecked
              className="rounded"
            />
            Visible to client
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="justify-self-start rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 sm:col-span-2"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {deliverables.length === 0 ? (
          <p className="text-sm text-gray-500">No deliverables yet.</p>
        ) : (
          deliverables.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {d.name}
                  </span>
                  {isStaff && !d.is_visible_to_client && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {d.file_type} {formatSize(d.file_size_bytes)}
                </p>
              </div>
              <button
                onClick={() => download(d)}
                disabled={downloadingId === d.id}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {downloadingId === d.id ? "..." : "Download"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
