import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import BookingActions from "./booking-actions";
import {
  BOOKING_STATUS_BADGE,
  BOOKING_TYPE_LABEL,
  type BookingStatus,
  type BookingType,
} from "@/lib/types";

export default async function AdminBookingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, title, type, status, scheduled_at, created_at, client_id")
    .order("created_at", { ascending: false });

  const clientIds = [...new Set((bookings ?? []).map((b) => b.client_id))];
  const { data: clients } = clientIds.length
    ? await supabase
        .from("profiles")
        .select("id, company_name, full_name, email")
        .in("id", clientIds)
    : { data: [] };
  const clientMap = new Map(
    (clients ?? []).map((c) => [
      c.id,
      c.company_name || c.full_name || c.email,
    ])
  );

  const upcoming = (bookings ?? []).filter(
    (b) => b.status === "pending" || b.status === "confirmed"
  );
  const past = (bookings ?? []).filter(
    (b) => b.status === "completed" || b.status === "cancelled"
  );

  type BookingRow = {
    id: string;
    title: string;
    type: BookingType;
    status: BookingStatus;
    scheduled_at: string | null;
    created_at: string;
    client_id: string;
  };

  function row(b: BookingRow) {
    return (
      <div
        key={b.id}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 p-4"
      >
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/bookings/${b.id}`}
              className="font-medium text-gray-900 hover:text-sch-blue hover:underline"
            >
              {b.title}
            </Link>
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
          <p className="mt-1 text-sm text-gray-500">
            {clientMap.get(b.client_id) ?? "Unknown client"}
            {b.scheduled_at &&
              ` • ${new Date(b.scheduled_at).toLocaleString()}`}
          </p>
        </div>
        <BookingActions bookingId={b.id} status={b.status as BookingStatus} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <Link
          href="/admin/bookings/calendar"
          className="text-sm font-medium text-sch-blue hover:underline"
        >
          Calendar View
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Upcoming & Pending
        </h2>
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow">
              No upcoming bookings.
            </div>
          ) : (
            <div className="rounded-xl bg-white p-4 shadow">{upcoming.map(row)}</div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          History
        </h2>
        <div className="space-y-3">
          {past.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow">
              No past bookings.
            </div>
          ) : (
            <div className="rounded-xl bg-white p-4 shadow">{past.map(row)}</div>
          )}
        </div>
      </section>
    </div>
  );
}
