"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/actions/projects";
import { PROJECT_STATUSES } from "@/lib/types";
import { Dialog } from "@/components/ux/dialog";

interface ClientOption {
  id: string;
  label: string;
}

export default function NewProjectForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setLoading(true);
    setError("");
    const res = await createProject(formData);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    if (res.id) router.push(`/admin/projects/${res.id}`);
  }

  return (
    <>
      <button type="button" className="ux-btn ux-btn--primary" onClick={() => setOpen(true)}>
        New project
      </button>

      {open && (
        <Dialog onClose={() => setOpen(false)} labelledBy="np-title">
          <>
            <h3 id="np-title">New project</h3>
            <p className="ux-desc">Start with the essentials. Milestones, files and staff are added on the project page.</p>

            {error && <div className="ux-notice ux-notice--error" style={{ marginTop: 16 }}>{error}</div>}

            <form action={action} style={{ marginTop: 20 }}>
              <div className="ux-formgrid">
                <label className="ux-field ux-full">
                  <span>Title</span>
                  <input name="title" required className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Client</span>
                  <select name="client_id" required className="ux-input ux-select" defaultValue="">
                    <option value="" disabled>
                      Select a client
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ux-field">
                  <span>Status</span>
                  <select name="status" defaultValue="active" className="ux-input ux-select" style={{ textTransform: "capitalize" }}>
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ux-field">
                  <span>Start date</span>
                  <input name="start_date" type="date" className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Target date</span>
                  <input name="target_date" type="date" className="ux-input" />
                </label>
                <label className="ux-field ux-full">
                  <span>Description (optional)</span>
                  <textarea name="description" rows={3} className="ux-input" />
                </label>
              </div>
              <div className="ux-dialog-actions">
                <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                  {loading ? "Creating…" : "Create project"}
                </button>
              </div>
            </form>
          </>
        </Dialog>
      )}
    </>
  );
}
