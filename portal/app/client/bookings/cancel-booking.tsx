"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBookingStatus } from "@/lib/actions/bookings";
import { useFeedback } from "@/components/ux/feedback";

export default function CancelBooking({ bookingId, title }: { bookingId: string; title?: string }) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    const ok = await askConfirm({
      title: title ? `Cancel "${title}"?` : "Cancel this booking?",
      body: "The request will be marked as cancelled. You can send a new request at any time.",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await setBookingStatus(bookingId, "cancelled");
    setBusy(false);
    if (res?.error) {
      toast(res.error, "error");
      return;
    }
    toast("Booking cancelled.");
    router.refresh();
  }

  return (
    <button type="button" className="ux-textbtn ux-textbtn--danger" disabled={busy} onClick={cancel}>
      Cancel
    </button>
  );
}
