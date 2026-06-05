"use client";

import { setBookingStatus } from "@/lib/actions/bookings";

export default function CancelBooking({ bookingId }: { bookingId: string }) {
  return (
    <button
      onClick={() => setBookingStatus(bookingId, "cancelled")}
      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
    >
      Cancel
    </button>
  );
}
