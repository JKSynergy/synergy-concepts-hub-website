"use client";

import { useState } from "react";
import { addMilestone, setMilestoneStatus, recalcProjectProgress } from "@/lib/actions/projects";
import {
  MILESTONE_STATUSES,
  type Milestone,
  type MilestoneStatus,
} from "@/lib/types";

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  revision_requested: "bg-red-100 text-red-700",
};

export default function MilestonesSection({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: Milestone[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  async function syncProgress() {
    setSyncing(true);
    await recalcProjectProgress(projectId);
    setSyncing(false);
  }

  async function addAction(formData: FormData) {
    setError("");
    const res = await addMilestone(projectId, formData);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
  }

  async function changeStatus(id: string, status: MilestoneStatus) {
    await setMilestoneStatus(id, projectId, status);
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Milestones</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={syncProgress}
            disabled={syncing}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "↺ Sync Progress"}
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-sm font-medium text-sch-blue hover:underline"
          >
            {open ? "Close" : "+ Add"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {open && (
        <form
          action={addAction}
          className="mb-6 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-2"
        >
          <input
            name="title"
            placeholder="Milestone title"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            name="weight_percent"
            type="number"
            min={0}
            max={100}
            placeholder="Weight %"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="due_date"
            type="date"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            placeholder="Description (optional)"
            rows={2}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            className="justify-self-start rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 sm:col-span-2"
          >
            Add Milestone
          </button>
        </form>
      )}

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
                  {m.weight_percent > 0 && (
                    <span className="text-xs text-gray-400">
                      {m.weight_percent}%
                    </span>
                  )}
                </div>
                {m.description && (
                  <p className="mt-1 text-sm text-gray-500">{m.description}</p>
                )}
                {m.due_date && (
                  <p className="mt-1 text-xs text-gray-400">
                    Due {new Date(m.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <select
                value={m.status}
                onChange={(e) =>
                  changeStatus(m.id, e.target.value as MilestoneStatus)
                }
                className="rounded-md border border-gray-300 px-2 py-1 text-xs capitalize"
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
