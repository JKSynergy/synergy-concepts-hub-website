"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAcademyCourse, toggleCourseActive } from "@/lib/actions/academy";
import { Dialog } from "@/components/ux/dialog";
import { useFeedback } from "@/components/ux/feedback";
import { EmptyState, PageHeader, StatusMark, ugx } from "@/components/ux/primitives";
import type { AcademyCourse } from "@/lib/types";

export default function AcademyManager({ courses }: { courses: AcademyCourse[] }) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [editing, setEditing] = useState<AcademyCourse | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const showForm = creating || editing !== null;

  function close() {
    if (loading) return;
    setEditing(null);
    setCreating(false);
    setError("");
  }

  async function action(formData: FormData) {
    setLoading(true);
    setError("");
    const wasEditing = !!editing;
    const res = await saveAcademyCourse(editing?.id ?? null, formData);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(null);
    setCreating(false);
    toast(wasEditing ? "Course updated." : "Course added.");
    router.refresh();
  }

  async function toggle(c: AcademyCourse) {
    const next = !c.is_active;
    const ok = await askConfirm({
      title: next ? "Activate course?" : "Deactivate course?",
      body: next ? `${c.name} becomes available again.` : `${c.name} will no longer be offered. Existing records are kept.`,
      confirmLabel: next ? "Activate" : "Deactivate",
      destructive: !next,
    });
    if (!ok) return;
    setBusy(c.id);
    const res = await toggleCourseActive(c.id, next);
    setBusy(null);
    if (res && "error" in res && res.error) {
      toast(res.error, "error");
      return;
    }
    toast(next ? "Course activated." : "Course deactivated.");
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Academy courses"
        description="Courses offered by the Synergy Academy."
        actions={
          <button
            type="button"
            className="ux-btn ux-btn--primary"
            onClick={() => {
              setCreating(true);
              setEditing(null);
              setError("");
            }}
          >
            Add course
          </button>
        }
      />
      <p className="ux-notice">Academy is managed separately from SCH operations.</p>

      {courses.length === 0 ? (
        <EmptyState title="No courses yet">Add the first course.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Course</th>
                <th>Duration</th>
                <th className="ux-num">Price</th>
                <th style={{ paddingLeft: 32 }}>Intake</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="ux-cell-main">{c.name}</span>
                    {c.description && <span className="ux-cell-sub">{c.description}</span>}
                  </td>
                  <td data-label="Duration" className="ux-muted">{c.duration_weeks ? `${c.duration_weeks} weeks` : "—"}</td>
                  <td className="ux-num" data-label="Price">
                    {c.price_ugx ? ugx(Number(c.price_ugx)) : <span className="ux-muted">Not priced</span>}
                    {c.price_usd != null && <span className="ux-cell-sub">USD {Number(c.price_usd).toLocaleString("en-US")}</span>}
                  </td>
                  <td data-label="Intake" className="ux-muted ux-enq-after-num">{c.intake_dates || "—"}</td>
                  <td data-label="Status">
                    <StatusMark tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Active" : "Inactive"}</StatusMark>
                  </td>
                  <td>
                    <div className="ux-rowactions">
                      <button
                        type="button"
                        className="ux-textbtn"
                        onClick={() => {
                          setEditing(c);
                          setCreating(false);
                          setError("");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`ux-textbtn${c.is_active ? " ux-textbtn--danger" : ""}`}
                        disabled={busy === c.id}
                        onClick={() => toggle(c)}
                      >
                        {c.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Dialog onClose={close} labelledBy="course-title" maxWidth={600}>
          <>
            <h3 id="course-title">{editing ? "Edit course" : "Add course"}</h3>
            <form action={action} style={{ marginTop: 20 }}>
              {error && <div className="ux-notice ux-notice--error">{error}</div>}
              <div className="ux-formgrid">
                <label className="ux-field ux-full">
                  <span>Name *</span>
                  <input name="name" required defaultValue={editing?.name ?? ""} className="ux-input" />
                </label>
                <label className="ux-field ux-full">
                  <span>Description</span>
                  <textarea name="description" rows={2} defaultValue={editing?.description ?? ""} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Duration (weeks)</span>
                  <input name="duration_weeks" type="number" defaultValue={editing?.duration_weeks ?? ""} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Price (UGX)</span>
                  <input name="price_ugx" type="number" defaultValue={editing?.price_ugx ?? ""} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Price (USD, optional)</span>
                  <input name="price_usd" type="number" defaultValue={editing?.price_usd ?? ""} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Intake dates</span>
                  <input name="intake_dates" placeholder="e.g. Jan, May, Sept" defaultValue={editing?.intake_dates ?? ""} className="ux-input" />
                </label>
                <label className="ux-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input name="is_active" type="checkbox" defaultChecked={editing ? editing.is_active : true} />
                  <span>Active</span>
                </label>
              </div>
              <div className="ux-dialog-actions">
                <button type="button" onClick={close} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="ux-btn ux-btn--primary">
                  {loading ? "Saving…" : editing ? "Update course" : "Add course"}
                </button>
              </div>
            </form>
          </>
        </Dialog>
      )}
    </>
  );
}
