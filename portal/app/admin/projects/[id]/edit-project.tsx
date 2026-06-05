"use client";

import { useState } from "react";
import { updateProject } from "@/lib/actions/projects";
import { PROJECT_STATUSES, type Project } from "@/lib/types";
import { ProgressBar } from "@/components/progress-bar";

export default function EditProject({ project }: { project: Project }) {
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
  }

  if (!editing) {
    return (
      <div className="rounded-xl bg-white p-6 shadow">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium capitalize text-amber-700">
              {project.status}
            </span>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-sch-blue hover:underline"
          >
            Edit
          </button>
        </div>
        {project.description && (
          <p className="mt-3 text-sm text-gray-600">{project.description}</p>
        )}
        <div className="mt-4 max-w-md">
          <ProgressBar value={project.progress_percent} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            name="title"
            defaultValue={project.title}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            name="status"
            defaultValue={project.status}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm capitalize focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Progress %
          </label>
          <input
            name="progress_percent"
            type="number"
            min={0}
            max={100}
            defaultValue={project.progress_percent}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Target Date
          </label>
          <input
            name="target_date"
            type="date"
            defaultValue={project.target_date ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            defaultValue={project.description ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
