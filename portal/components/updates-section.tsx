"use client";

import { useState } from "react";
import { addUpdate } from "@/lib/actions/projects";
import type { ProjectUpdate } from "@/lib/types";

interface UpdateWithAuthor extends ProjectUpdate {
  author_name?: string;
}

export default function UpdatesSection({
  projectId,
  updates,
  isStaff,
}: {
  projectId: string;
  updates: UpdateWithAuthor[];
  isStaff: boolean;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function action(formData: FormData) {
    setSubmitting(true);
    setError("");
    const res = await addUpdate(projectId, formData);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const form = document.getElementById("update-form") as HTMLFormElement;
    form?.reset();
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Updates Timeline
      </h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form id="update-form" action={action} className="mb-6 space-y-2">
        <textarea
          name="content"
          rows={2}
          required
          placeholder={
            isStaff ? "Post an update for the client..." : "Add a comment..."
          }
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
        />
        <div className="flex items-center justify-between">
          {isStaff ? (
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" name="is_internal" className="rounded" />
              Internal note (hidden from client)
            </label>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
      </form>

      <ol className="relative space-y-4 border-l border-gray-200 pl-6">
        {updates.length === 0 ? (
          <p className="text-sm text-gray-500">No updates yet.</p>
        ) : (
          updates.map((u) => (
            <li key={u.id} className="relative">
              <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-sch-orange" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {u.author_name ?? "Team"}
                </span>
                {u.is_internal && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                    Internal
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(u.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {u.content}
              </p>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
