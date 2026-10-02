"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProject } from "@/lib/actions/projects";
import { PROJECT_STATUSES, type Project } from "@/lib/types";
import { StatusMark, PROJECT_TONE } from "@/components/ux/primitives";
import { useFeedback } from "@/components/ux/feedback";
import { Dialog } from "@/components/ux/dialog";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Project summary + edit dialog. Same updateProject action as before. */
export default function EditProject({ project, clientLabel, clientHref, readOnly = false }: { project: Project; clientLabel: string; clientHref: string; readOnly?: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setLoading(true);
    setError("");
    const res = await updateProject(project.id, formData);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(false);
    toast("Project saved");
    router.refresh();
  }

  return (
    <>
      <header className="ux-head">
        <div>
          <span className="ux-eyebrow">Project</span>
          <h1 className="ux-title">{project.title}</h1>
          {project.description && <p className="ux-desc">{project.description}</p>}
        </div>
        {!readOnly && (
          <div className="ux-actions">
            <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setEditing(true)}>
              Edit project
            </button>
          </div>
        )}
      </header>

      <dl className="ux-figures" style={{ marginBottom: 8 }}>
        <div className="ux-figure">
          <span>Client</span>
          <a href={clientHref} style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{clientLabel}</a>
        </div>
        <div className="ux-figure">
          <span>Status</span>
          <StatusMark tone={PROJECT_TONE[project.status] ?? "neutral"}>{project.status}</StatusMark>
        </div>
        <div className="ux-figure">
          <span>Progress</span>
          <div className="ux-progress-cell" style={{ minWidth: 140 }}>
            <div className="ux-progress" role="progressbar" aria-valuenow={project.progress_percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${project.progress_percent ?? 0}%` }} />
            </div>
            <span>{project.progress_percent ?? 0}%</span>
          </div>
        </div>
        <div className="ux-figure">
          <span>Target date</span>
          {project.target_date ? fmtDate(project.target_date) : "Not set"}
        </div>
      </dl>

      {editing && (
        <Dialog onClose={() => setEditing(false)} labelledBy="ep-title">
          <>
            <h3 id="ep-title">Edit project</h3>
            {error && <div className="ux-notice ux-notice--error" style={{ marginTop: 16 }}>{error}</div>}
            <form action={action} style={{ marginTop: 20 }}>
              <div className="ux-formgrid">
                <label className="ux-field ux-full">
                  <span>Title</span>
                  <input name="title" defaultValue={project.title} required className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Status</span>
                  <select name="status" defaultValue={project.status} className="ux-input ux-select" style={{ textTransform: "capitalize" }}>
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ux-field">
                  <span>Progress (%)</span>
                  <input name="progress_percent" type="number" min={0} max={100} defaultValue={project.progress_percent} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Target date</span>
                  <input name="target_date" type="date" defaultValue={project.target_date ?? ""} className="ux-input" />
                </label>
                <label className="ux-field ux-full">
                  <span>Description</span>
                  <textarea name="description" rows={3} defaultValue={project.description ?? ""} className="ux-input" />
                </label>
              </div>
              <div className="ux-dialog-actions">
                <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                  {loading ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </>
        </Dialog>
      )}
    </>
  );
}
