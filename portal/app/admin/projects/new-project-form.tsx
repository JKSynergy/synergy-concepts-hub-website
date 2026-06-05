"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/actions/projects";
import { PROJECT_STATUSES } from "@/lib/types";

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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
      >
        + New Project
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">New Project</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Title *</label>
          <input
            name="title"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Client *</label>
          <select
            name="client_id"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          >
            <option value="">Select a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            name="status"
            defaultValue="active"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm capitalize focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Date</label>
          <input
            name="start_date"
            type="date"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Target Date</label>
          <input
            name="target_date"
            type="date"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            name="description"
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
