"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setMilestoneStatus } from "@/lib/actions/projects";
import { useFeedback } from "@/components/ux/feedback";
import { EmptyState, Section, StatusMark, type Tone } from "@/components/ux/primitives";
import type { Milestone, MilestoneStatus } from "@/lib/types";

const TONE: Record<MilestoneStatus, Tone> = {
  pending: "neutral",
  in_progress: "info",
  submitted: "warning",
  approved: "success",
  revision_requested: "danger",
};

const LABEL: Record<MilestoneStatus, string> = {
  pending: "not started",
  in_progress: "in progress",
  submitted: "awaiting your approval",
  approved: "approved",
  revision_requested: "revision requested",
};

export default function ClientMilestones({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: Milestone[];
}) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(m: Milestone, status: MilestoneStatus) {
    const approve = status === "approved";
    const ok = await askConfirm({
      title: approve ? `Approve "${m.title}"?` : `Request a revision of "${m.title}"?`,
      body: approve
        ? "This tells the team you are happy with this milestone."
        : "This sends the milestone back to the team for changes.",
      confirmLabel: approve ? "Approve" : "Request revision",
      destructive: !approve,
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      const res = await setMilestoneStatus(m.id, projectId, status);
      if (res?.error) {
        toast(res.error, "error");
      } else {
        toast(approve ? "Milestone approved." : "Revision requested.");
        router.refresh();
      }
    } catch {
      toast("Could not update the milestone. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Milestones">
      {milestones.length === 0 ? (
        <EmptyState title="No milestones yet">The team will add milestones as the project is planned.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td data-label="Milestone">
                    <span className="ux-cell-main">{m.title}</span>
                    {m.description && <span className="ux-cell-sub">{m.description}</span>}
                  </td>
                  <td data-label="Status">
                    <StatusMark tone={TONE[m.status]}>{LABEL[m.status] ?? m.status}</StatusMark>
                  </td>
                  <td data-label="Actions">
                    {m.status === "submitted" && (
                      <div className="ux-rowactions">
                        <button type="button" className="ux-textbtn" disabled={busy === m.id} onClick={() => act(m, "approved")}>
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ux-textbtn ux-textbtn--danger"
                          disabled={busy === m.id}
                          onClick={() => act(m, "revision_requested")}
                        >
                          Request revision
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
