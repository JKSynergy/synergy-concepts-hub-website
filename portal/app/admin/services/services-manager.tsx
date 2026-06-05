"use client";

import { useState } from "react";
import { saveService, toggleServiceActive } from "@/lib/actions/bookings";
import type { Service } from "@/lib/types";

export default function ServicesManager({ services }: { services: Service[] }) {
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function action(formData: FormData) {
    setError("");
    const res = await saveService(editing?.id ?? null, formData);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(null);
    setCreating(false);
  }

  const showForm = creating || editing !== null;

  return (
    <div className="space-y-6">
      {!showForm && (
        <button
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          + New Service
        </button>
      )}

      {showForm && (
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {editing ? "Edit Service" : "New Service"}
            </h3>
            <button
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
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
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input
                name="name"
                required
                defaultValue={editing?.name ?? ""}
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
              <label className="block text-sm font-medium text-gray-700">Duration (days)</label>
              <input
                name="duration_days"
                type="number"
                defaultValue={editing?.duration_days ?? ""}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editing ? editing.is_active : true}
                  className="rounded"
                />
                Active
              </label>
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
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Deliverables</label>
              <textarea
                name="deliverables"
                rows={2}
                defaultValue={editing?.deliverables ?? ""}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                {editing ? "Save Changes" : "Create Service"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services.length === 0 ? (
          <div className="col-span-full rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow">
            No services yet. Add your first service above.
          </div>
        ) : (
          services.map((s) => (
            <div key={s.id} className="rounded-xl bg-white p-5 shadow">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-900">{s.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {s.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              {s.description && (
                <p className="mt-1 text-sm text-gray-500">{s.description}</p>
              )}
              <div className="mt-3 text-sm text-gray-700">
                {s.price_ugx != null && (
                  <span className="mr-3">UGX {s.price_ugx.toLocaleString()}</span>
                )}
                {s.price_usd != null && <span>USD {s.price_usd.toLocaleString()}</span>}
              </div>
              {s.duration_days != null && (
                <p className="mt-1 text-xs text-gray-400">{s.duration_days} days</p>
              )}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setEditing(s);
                    setCreating(false);
                  }}
                  className="text-sm font-medium text-sch-blue hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleServiceActive(s.id, !s.is_active)}
                  className="text-sm font-medium text-gray-500 hover:underline"
                >
                  {s.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
