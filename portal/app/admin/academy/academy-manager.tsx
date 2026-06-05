"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAcademyCourse, toggleCourseActive } from "@/lib/actions/academy";
import type { AcademyCourse } from "@/lib/types";

export default function AcademyManager({ courses }: { courses: AcademyCourse[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AcademyCourse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setLoading(true);
    setError("");
    const res = await saveAcademyCourse(editing?.id ?? null, formData);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <form action={action} className="rounded-xl bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          {editing ? "Edit Course" : "Add Course"}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <input
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              name="description"
              rows={2}
              defaultValue={editing?.description ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Duration (weeks)</label>
            <input
              name="duration_weeks"
              type="number"
              defaultValue={editing?.duration_weeks ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Price (UGX)</label>
            <input
              name="price_ugx"
              type="number"
              defaultValue={editing?.price_ugx ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Price (USD)</label>
            <input
              name="price_usd"
              type="number"
              defaultValue={editing?.price_usd ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Intake Dates</label>
            <input
              name="intake_dates"
              placeholder="e.g. Jan, May, Sept"
              defaultValue={editing?.intake_dates ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={editing ? editing.is_active : true}
              className="h-4 w-4 rounded border-gray-300 text-sch-orange focus:ring-sch-orange"
            />
            <label className="text-sm text-gray-700">Active</label>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Saving..." : editing ? "Update Course" : "Add Course"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {courses.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-5 shadow"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{c.name}</span>
                {c.is_active ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    Inactive
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {c.duration_weeks ? `${c.duration_weeks} weeks` : ""}
                {c.price_ugx ? ` • UGX ${c.price_ugx.toLocaleString()}` : ""}
                {c.intake_dates ? ` • Intake: ${c.intake_dates}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(c)}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  await toggleCourseActive(c.id, !c.is_active);
                  router.refresh();
                }}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {c.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
