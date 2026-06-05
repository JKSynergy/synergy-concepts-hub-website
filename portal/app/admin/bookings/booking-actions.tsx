"use client";

import { setBookingStatus } from "@/lib/actions/bookings";
import type { BookingStatus } from "@/lib/types";

export default function BookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: BookingStatus;
}) {
  async function change(next: BookingStatus) {
    await setBookingStatus(bookingId, next);
  }

  if (status === "completed" || status === "cancelled") {
    return null;
  }

  return (
    <div className="flex gap-2">
      {status === "pending" && (
        <button
          onClick={() => change("confirmed")}
          className="rounded-md bg-sch-blue px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Confirm
        </button>
      )}
      {status === "confirmed" && (
        <button
          onClick={() => change("completed")}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
        >
          Complete
        </button>
      )}
      <button
        onClick={() => change("cancelled")}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Cancel
      </button>
    </div>
  );
}
