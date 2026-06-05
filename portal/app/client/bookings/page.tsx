import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewBookingForm from "./new-booking-form";
import CancelBooking from "./cancel-booking";
import {
  BOOKING_STATUS_BADGE,
  BOOKING_TYPE_LABEL,
  type BookingStatus,
  type BookingType,
  type Service,
  type AcademyCourse,
} from "@/lib/types";

export default async function ClientBookingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: bookings }, { data: services }, { data: courses }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id, title, type, status, scheduled_at, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("service_catalog")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("academy_courses")
        .select("*")
        .eq("is_active", true)
        .order("name"),
    ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>

      <NewBookingForm
        services={(services ?? []) as Service[]}
        courses={(courses ?? []) as AcademyCourse[]}
      />

      <div className="space-y-3">
        {bookings && bookings.length > 0 ? (
          bookings.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-5 shadow"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{b.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      BOOKING_STATUS_BADGE[b.status as BookingStatus]
                    }`}
                  >
                    {b.status}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {BOOKING_TYPE_LABEL[b.type as BookingType]}
                  </span>
                </div>
                {b.scheduled_at && (
                  <p className="mt-1 text-sm text-gray-500">
                    {new Date(b.scheduled_at).toLocaleString()}
                  </p>
                )}
              </div>
              {(b.status === "pending" || b.status === "confirmed") && (
                <CancelBooking bookingId={b.id} />
              )}
            </div>
          ))
        ) : (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow">
            No bookings yet. Create your first request above.
          </div>
        )}
      </div>
    </div>
  );
}
