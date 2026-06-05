"use client";

import { setMilestoneStatus } from "@/lib/actions/projects";
import type { Milestone, MilestoneStatus } from "@/lib/types";

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  revision_requested: "bg-red-100 text-red-700",
};

export default function ClientMilestones({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: Milestone[];
}) {
  async function act(id: string, status: MilestoneStatus) {
    await setMilestoneStatus(id, projectId, status);
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Milestones</h2>
      <div className="space-y-3">
        {milestones.length === 0 ? (
          <p className="text-sm text-gray-500">No milestones yet.</p>
        ) : (
          milestones.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between rounded-lg border border-gray-100 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{m.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[m.status]}`}
                  >
                    {m.status.replace("_", " ")}
                  </span>
                </div>
                {m.description && (
                  <p className="mt-1 text-sm text-gray-500">{m.description}</p>
                )}
              </div>
              {m.status === "submitted" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => act(m.id, "approved")}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => act(m.id, "revision_requested")}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Request Revision
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
