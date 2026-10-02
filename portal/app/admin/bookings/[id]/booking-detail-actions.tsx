"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setBookingStatus,
  rescheduleBooking,
  convertBookingToProject,
} from "@/lib/actions/bookings";
import { Dialog } from "@/components/ux/dialog";
import { useFeedback } from "@/components/ux/feedback";
import type { BookingStatus } from "@/lib/types";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const { toast, confirm: askConfirm } = useFeedback();
  const [showReschedule, setShowReschedule] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function changeStatus(next: BookingStatus) {
    const copy: Record<string, { title: string; body: string; label: string; destructive?: boolean }> = {
      confirmed: { title: "Confirm this booking?", body: "The request will be marked confirmed.", label: "Confirm" },
      completed: { title: "Mark as completed?", body: "The booking will be closed as completed.", label: "Mark completed" },
      cancelled: {
        title: "Cancel this booking request?",
        body: "It will be marked cancelled and no further actions will be available.",
        label: "Cancel request",
        destructive: true,
      },
    };
    const c = copy[next];
    if (c) {
      const ok = await askConfirm({ title: c.title, body: c.body, confirmLabel: c.label, destructive: c.destructive });
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

  async function handleReschedule(formData: FormData) {
    setLoading(true);
    setError("");
    const raw = formData.get("scheduled_at") as string;
    const res = await rescheduleBooking(bookingId, new Date(raw).toISOString());
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowReschedule(false);
    toast("Booking rescheduled.");
    router.refresh();
  }

  async function handleConvert() {
    const ok = await askConfirm({
      title: "Convert to project?",
      body: "A project is created for this client from this booking request.",
      confirmLabel: "Create project",
    });
    if (!ok) return;
    setLoading(true);
    const res = await convertBookingToProject(bookingId);
    setLoading(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Project created.");
    if (res.id) {
      router.push(`/admin/projects/${res.id}`);
    } else {
      router.refresh();
    }
  }

  if (status === "completed" || status === "cancelled") {
    return (
      <p className="ux-muted" style={{ margin: 0 }}>
        This booking is {status}. No further actions are available.
        {hasProject && " A linked project already exists."}
      </p>
    );
  }

  return (
    <>
      <div className="ux-actions" style={{ justifyContent: "flex-start" }}>
        {status === "pending" && (
          <button type="button" onClick={() => changeStatus("confirmed")} disabled={loading} className="ux-btn ux-btn--primary">
            Confirm
          </button>
        )}
        {status === "confirmed" && (
          <button type="button" onClick={() => changeStatus("completed")} disabled={loading} className="ux-btn ux-btn--primary">
            Complete
          </button>
        )}
        {!hasProject && (
          <button type="button" onClick={handleConvert} disabled={loading} className="ux-btn ux-btn--secondary">
            Convert to project
          </button>
        )}
        <button type="button" onClick={() => { setError(""); setShowReschedule(true); }} disabled={loading} className="ux-btn ux-btn--secondary">
          Reschedule
        </button>
        <button type="button" onClick={() => changeStatus("cancelled")} disabled={loading} className="ux-btn ux-btn--danger">
          Cancel request
        </button>
      </div>
      {hasProject && (
        <p className="ux-muted" style={{ margin: "12px 0 0", fontSize: 13 }}>A linked project already exists.</p>
      )}

      {showReschedule && (
        <Dialog onClose={() => !loading && setShowReschedule(false)} labelledBy="resched-title" maxWidth={440}>
          <>
            <h3 id="resched-title">Reschedule booking</h3>
            <form action={handleReschedule} style={{ marginTop: 16 }}>
              {error && <div className="ux-notice ux-notice--error">{error}</div>}
              <label className="ux-field">
                <span>New date and time</span>
                <input name="scheduled_at" type="datetime-local" required defaultValue={toLocalInput(scheduledAt)} className="ux-input" />
              </label>
              <div className="ux-dialog-actions">
                <button type="button" onClick={() => setShowReschedule(false)} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="ux-btn ux-btn--primary">
                  {loading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </>
        </Dialog>
      )}
    </>
  );
}
