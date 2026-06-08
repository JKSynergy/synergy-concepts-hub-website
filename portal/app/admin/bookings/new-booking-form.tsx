"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBookingForClient } from "@/lib/actions/bookings";
import {
  BOOKING_TYPE_LABEL,
  BOOKING_STATUSES,
  type BookingType,
  type BookingStatus,
  type Service,
  type AcademyCourse,
} from "@/lib/types";

const SELECTABLE_TYPES: BookingType[] = [
  "consultation",
  "service_package",
  "academy_enrollment",
  "custom_request",
];

type ClientOption = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string;
};

export default function NewBookingForm({
  clients,
  services,
  courses,
}: {
  clients: ClientOption[];
  services: Service[];
  courses: AcademyCourse[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BookingType>("consultation");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setLoading(true);
    setError("");
    const res = await createBookingForClient(formData);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
      >
        + Add Booking
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Add Booking for Client
        </h3>
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

      <form action={action} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Client *
          </label>
          <select
            name="client_id"
            required
            defaultValue=""
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          >
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.full_name || c.email}
                {c.company_name || c.full_name ? ` (${c.email})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Type *
            </label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as BookingType)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            >
              {SELECTABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BOOKING_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              name="status"
              defaultValue="confirmed"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm capitalize focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            >
              {BOOKING_STATUSES.map((s: BookingStatus) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {type === "service_package" && services.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Service
            </label>
            <select
              name="service_id"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            >
              <option value="">Select a package</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === "academy_enrollment" && courses.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Course
            </label>
            <select
              name="course_id"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
            >
              <option value="">Select a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.duration_weeks ? ` (${c.duration_weeks} weeks)` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Title *
          </label>
          <input
            name="title"
            required
            placeholder={
              type === "consultation"
                ? "e.g. Brand strategy call"
                : "Short summary"
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Scheduled Date & Time
          </label>
          <input
            name="scheduled_at"
            type="datetime-local"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Details
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Notes about this booking..."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Booking"}
        </button>
      </form>
    </div>
  );
}
