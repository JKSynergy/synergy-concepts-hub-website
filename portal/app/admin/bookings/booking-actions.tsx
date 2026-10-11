"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { deleteBooking, setBookingStatus } from "@/lib/actions/bookings";
import { useFeedback } from "@/components/ux/feedback";
import { fmtDateTime } from "./booking-labels";
import type { BookingStatus } from "@/lib/types";

export default function BookingActions({
  bookingId,
  status,
  title,
  requester,
  scheduledAt,
  canDelete = false,
}: {
  bookingId: string;
  status: BookingStatus;
  title?: string;
  requester?: string;
  scheduledAt?: string | null;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [loading, setLoading] = useState(false);

  async function change(next: BookingStatus) {
    if (next === "cancelled") {
      const ok = await askConfirm({
        title: "Cancel this booking request?",
        body: `${title ?? "This request"} will be marked cancelled.`,
        confirmLabel: "Cancel request",
        destructive: true,
      });
      if (!ok) return;
    }
    setLoading(true);
    const res = await setBookingStatus(bookingId, next);
    setLoading(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast(`Booking marked ${next}.`);
    router.refresh();
  }

  async function remove() {
    const ok = await askConfirm({
      title: "Delete this booking request?",
      body: `${title ?? "This request"}${requester ? ` from ${requester}` : ""}${scheduledAt ? `, scheduled ${fmtDateTime(scheduledAt)}` : ", not scheduled"} will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete request",
      destructive: true,
    });
    if (!ok) return;
    setLoading(true);
    const res = await deleteBooking(bookingId);
    setLoading(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Booking request deleted.");
    router.refresh();
  }

  return (
    <div className="ux-rowactions">
      <Link href={`/admin/bookings/${bookingId}`} className="ux-textbtn ux-textbtn--strong">
        Open
      </Link>
      {status === "pending" && (
        <button type="button" disabled={loading} onClick={() => change("confirmed")} className="ux-textbtn">
          Confirm
        </button>
      )}
      {status === "confirmed" && (
        <button type="button" disabled={loading} onClick={() => change("completed")} className="ux-textbtn">
          Complete
        </button>
      )}
      {(status === "pending" || status === "confirmed") && (
        <button type="button" disabled={loading} onClick={() => change("cancelled")} className="ux-textbtn ux-textbtn--danger">
          Cancel
        </button>
      )}
      {canDelete && (
        <button type="button" disabled={loading} onClick={remove} className="ux-textbtn ux-textbtn--danger">
          Delete
        </button>
      )}
    </div>
  );
}
