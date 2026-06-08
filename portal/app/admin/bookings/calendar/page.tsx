import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import CalendarView from "./calendar-view";
import {
  BOOKING_STATUS_BADGE,
  BOOKING_TYPE_LABEL,
  type BookingStatus,
  type BookingType,
} from "@/lib/types";

export default async function AdminBookingCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
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

  const { month, year } = await searchParams;
  const now = new Date();
  const viewMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
  const viewYear = year ? parseInt(year, 10) : now.getFullYear();

  const start = new Date(viewYear, viewMonth - 1, 1);
  const end = new Date(viewYear, viewMonth, 0, 23, 59, 59);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, title, type, status, scheduled_at, client_id")
    .gte("scheduled_at", start.toISOString())
    .lte("scheduled_at", end.toISOString())
    .order("scheduled_at", { ascending: true });

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

  const events = (bookings ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    type: b.type as BookingType,
    status: b.status as BookingStatus,
    scheduled_at: b.scheduled_at!,
    client_name: clientMap.get(b.client_id) ?? "Unknown",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Booking Calendar</h1>
        <Link
          href="/admin/bookings"
          className="text-sm font-medium text-sch-blue hover:underline"
        >
          List View
        </Link>
      </div>

      <CalendarView
        year={viewYear}
        month={viewMonth}
        events={events}
        statusBadge={BOOKING_STATUS_BADGE}
        typeLabel={BOOKING_TYPE_LABEL}
      />
    </div>
  );
}
