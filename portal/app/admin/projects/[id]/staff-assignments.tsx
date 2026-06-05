"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignStaff, removeStaffAssignment } from "@/lib/actions/projects";

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string;
}

interface Assignment {
  id: string;
  staff_id: string;
  profiles: { id: string; full_name: string | null; email: string } | null;
}

export default function StaffAssignments({
  projectId,
  staff,
  assignments,
}: {
  projectId: string;
  staff: StaffMember[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function add(formData: FormData) {
    setLoading(true);
    setError("");
    const res = await assignStaff(projectId, formData);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function remove(assignmentId: string) {
    const res = await removeStaffAssignment(assignmentId);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">Assigned Staff</h3>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        {assignments.length === 0 && (
          <p className="text-sm text-gray-500">No staff assigned yet.</p>
        )}
        {assignments.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
          >
            <span className="text-sm text-gray-700">
              {a.profiles?.full_name || a.profiles?.email || "Unknown"}
            </span>
            <button
              onClick={() => remove(a.id)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <form action={add} className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700">Add staff</label>
          <select
            name="staff_id"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          >
            <option value="">Select staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-sch-blue px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
