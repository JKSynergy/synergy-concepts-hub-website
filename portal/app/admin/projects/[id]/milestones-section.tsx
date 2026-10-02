"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMilestone, setMilestoneStatus, recalcProjectProgress } from "@/lib/actions/projects";
import { MILESTONE_STATUSES, type Milestone, type MilestoneStatus } from "@/lib/types";
import { Dialog } from "@/components/ux/dialog";
import { useFeedback } from "@/components/ux/feedback";
import { EmptyState, Section, StatusMark, type Tone } from "@/components/ux/primitives";

const TONE: Record<MilestoneStatus, Tone> = {
  pending: "neutral",
  in_progress: "info",
  submitted: "warning",
  approved: "success",
  revision_requested: "danger",
};
const label = (s: string) => s.replace("_", " ");
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function MilestonesSection({ projectId, milestones, readOnly = false }: { projectId: string; milestones: Milestone[]; readOnly?: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function syncProgress() {
    setSyncing(true);
    const res = await recalcProjectProgress(projectId);
    setSyncing(false);
    if (res?.error) toast(res.error, "error");
    else {
      toast("Progress updated from milestones");
      router.refresh();
    }
  }

  async function addAction(formData: FormData) {
    setError("");
    const res = await addMilestone(projectId, formData);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    toast("Milestone added");
    router.refresh();
  }

  async function changeStatus(id: string, status: MilestoneStatus) {
    const res = await setMilestoneStatus(id, projectId, status);
    if (res?.error) toast(res.error, "error");
    else {
      toast(`Milestone marked ${label(status)}`);
      router.refresh();
    }
  }

  return (
    <Section
      title="Milestones"
      aside={
        readOnly ? undefined : (
        <span className="ux-rowactions">
          <button type="button" className="ux-textbtn" onClick={syncProgress} disabled={syncing}>
            {syncing ? "Updating…" : "Update progress"}
          </button>
          <button type="button" className="ux-textbtn" onClick={() => setOpen(true)}>
            Add milestone
          </button>
        </span>
        )
      }
    >
      {milestones.length === 0 ? (
        <EmptyState title="No milestones yet">Break the project into milestones to track delivery.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Weight</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => {
                const late = m.due_date && m.due_date < today && m.status !== "approved";
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="ux-cell-main" style={{ display: "block" }}>{m.title}</span>
                      {m.description && <span className="ux-cell-sub">{m.description}</span>}
                    </td>
                    <td data-label="Weight" className="ux-muted">{m.weight_percent > 0 ? `${m.weight_percent}%` : "—"}</td>
                    <td data-label="Due" className={late ? "ux-late" : "ux-muted"}>
                      {m.due_date ? fmt(m.due_date) : "—"}
                      {late && <span className="ux-cell-sub ux-late">Past due</span>}
                    </td>
                    <td data-label="Status">
                      <StatusMark tone={TONE[m.status]}>{label(m.status)}</StatusMark>
                      {!readOnly && (
                      <select
                        aria-label={`Change status of ${m.title}`}
                        value={m.status}
                        onChange={(e) => changeStatus(m.id, e.target.value as MilestoneStatus)}
                        className="ux-input ux-select ux-inline-select"
                      >
                        {MILESTONE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Dialog onClose={() => setOpen(false)} labelledBy="ms-title">
          <h3 id="ms-title">Add milestone</h3>
          {error && <div className="ux-notice ux-notice--error" style={{ marginTop: 16 }}>{error}</div>}
          <form action={addAction} style={{ marginTop: 20 }}>
            <div className="ux-formgrid">
              <label className="ux-field ux-full">
                <span>Title</span>
                <input name="title" required className="ux-input" />
              </label>
              <label className="ux-field">
                <span>Weight (%)</span>
                <input name="weight_percent" type="number" min={0} max={100} className="ux-input" />
              </label>
              <label className="ux-field">
                <span>Due date</span>
                <input name="due_date" type="date" className="ux-input" />
              </label>
              <label className="ux-field ux-full">
                <span>Description (optional)</span>
                <textarea name="description" rows={2} className="ux-input" />
              </label>
            </div>
            <div className="ux-dialog-actions">
              <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="ux-btn ux-btn--primary">
                Add milestone
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Section>
  );
}
