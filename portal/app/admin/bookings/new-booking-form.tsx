"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBookingForClient } from "@/lib/actions/bookings";
import { Dialog } from "@/components/ux/dialog";
import { useFeedback } from "@/components/ux/feedback";
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
  const { toast } = useFeedback();
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
    setType("consultation");
    toast("Booking request created.");
    router.refresh();
  }

  const close = () => {
    if (loading) return;
    setOpen(false);
    setError("");
    setType("consultation");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ux-btn ux-btn--primary">
        New booking request
      </button>
      {open && (
        <Dialog onClose={close} labelledBy="new-booking-title" maxWidth={600}>
          <>
            <h3 id="new-booking-title">New booking request</h3>
            <p className="ux-desc">Record a booking on behalf of a client.</p>

            <form action={action} style={{ marginTop: 20 }}>
              {error && <div className="ux-notice ux-notice--error">{error}</div>}
              <div className="ux-formgrid">
                <label className="ux-field ux-full">
                  <span>Client *</span>
                  <select name="client_id" required defaultValue="" className="ux-input ux-select">
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
                </label>

                <label className="ux-field">
                  <span>Type *</span>
                  <select
                    name="type"
                    value={type}
                    onChange={(e) => setType(e.target.value as BookingType)}
                    className="ux-input ux-select"
                  >
                    {SELECTABLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {BOOKING_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="ux-field">
                  <span>Status</span>
                  <select
                    name="status"
                    defaultValue="confirmed"
                    className="ux-input ux-select"
                  >
                    {BOOKING_STATUSES.map((s: BookingStatus) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>

                {type === "service_package" && services.length > 0 && (
                  <label className="ux-field ux-full">
                    <span>Service</span>
                    <select name="service_id" className="ux-input ux-select">
                      <option value="">Select a package</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {type === "academy_enrollment" && courses.length > 0 && (
                  <label className="ux-field ux-full">
                    <span>Course</span>
                    <select name="course_id" className="ux-input ux-select">
                      <option value="">Select a course</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.duration_weeks ? ` (${c.duration_weeks} weeks)` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="ux-field ux-full">
                  <span>Title *</span>
                  <input
                    name="title"
                    required
                    className="ux-input"
                    placeholder={type === "consultation" ? "e.g. Brand strategy call" : "Short summary"}
                  />
                </label>

                <label className="ux-field ux-full">
                  <span>Scheduled date and time</span>
                  <input name="scheduled_at" type="datetime-local" className="ux-input" />
                </label>

                <label className="ux-field ux-full">
                  <span>Details</span>
                  <textarea name="description" rows={3} className="ux-input" placeholder="Notes about this booking" />
                </label>
              </div>
              <div className="ux-dialog-actions">
                <button type="button" onClick={close} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="ux-btn ux-btn--primary">
                  {loading ? "Creating…" : "Create booking request"}
                </button>
              </div>
            </form>
          </>
        </Dialog>
      )}
    </>
  );
}
