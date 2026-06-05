"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setBookingStatus,
  rescheduleBooking,
  convertBookingToProject,
} from "@/lib/actions/bookings";
import type { BookingStatus } from "@/lib/types";

export default function BookingDetailActions({
  bookingId,
  status,
  scheduledAt,
  hasProject,
}: {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string | null;
  hasProject: boolean;
}) {
  const router = useRouter();
  const [showReschedule, setShowReschedule] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function changeStatus(next: BookingStatus) {
    setLoading(true);
    setMsg("");
    const res = await setBookingStatus(bookingId, next);
    setLoading(false);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    router.refresh();
  }

  async function handleReschedule(formData: FormData) {
    setLoading(true);
    setMsg("");
    const raw = formData.get("scheduled_at") as string;
    const res = await rescheduleBooking(bookingId, new Date(raw).toISOString());
    setLoading(false);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    setShowReschedule(false);
    router.refresh();
  }

  async function handleConvert() {
    setLoading(true);
    setMsg("");
    const res = await convertBookingToProject(bookingId);
    setLoading(false);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    if (res.id) {
      router.push(`/admin/projects/${res.id}`);
    }
  }

  if (status === "completed" || status === "cancelled") {
    return (
      <div className="text-sm text-gray-500">
        This booking is {status}.
        {hasProject && (
          <span className="ml-1">A linked project already exists.</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <>
            <button
              onClick={() => changeStatus("confirmed")}
              disabled={loading}
              className="rounded-md bg-sch-blue px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirm
            </button>
            {!hasProject && (
              <button
                onClick={handleConvert}
                disabled={loading}
                className="rounded-md bg-sch-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Convert to Project
              </button>
            )}
          </>
        )}
        {status === "confirmed" && (
          <>
            <button
              onClick={() => changeStatus("completed")}
              disabled={loading}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Complete
            </button>
            {!hasProject && (
              <button
                onClick={handleConvert}
                disabled={loading}
                className="rounded-md bg-sch-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Convert to Project
              </button>
            )}
          </>
        )}
        <button
          onClick={() => setShowReschedule((s) => !s)}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Reschedule
        </button>
        <button
          onClick={() => changeStatus("cancelled")}
          disabled={loading}
          className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {showReschedule && (
        <form
          action={handleReschedule}
          className="flex items-center gap-2 rounded-md bg-gray-50 p-3"
        >
          <input
            name="scheduled_at"
            type="datetime-local"
            required
            defaultValue={
              scheduledAt
                ? new Date(scheduledAt).toISOString().slice(0, 16)
                : ""
            }
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-sch-blue px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setShowReschedule(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
        </form>
      )}

      {msg && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {msg}
        </div>
      )}
    </div>
  );
}
