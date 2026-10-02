import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import CalendarView from "./calendar-view";
import { PageHeader } from "@/components/ux/primitives";
import type { BookingStatus, BookingType } from "@/lib/types";
import { isOperationalStaff } from "@/lib/security/roles";

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

  if (!profile || !isOperationalStaff(profile.role)) {
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
    .select("id, title, type, status, scheduled_at, client_id, metadata")
    .gte("scheduled_at", start.toISOString())
    .lte("scheduled_at", end.toISOString())
    .order("scheduled_at", { ascending: true });

  const clientIds = [...new Set((bookings ?? []).map((b) => b.client_id).filter(Boolean))];
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
    client_name:
      (b.client_id ? clientMap.get(b.client_id) : undefined) ??
      (typeof (b.metadata as Record<string, unknown> | null)?.name === "string"
        ? ((b.metadata as Record<string, unknown>).name as string)
        : "Unknown requester"),
  }));

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Booking calendar"
        description="Scheduled booking requests by month. Requests without a date do not appear here."
        actions={
          <Link href="/admin/bookings" className="ux-btn ux-btn--secondary">
            List view
          </Link>
        }
      />
      <CalendarView year={viewYear} month={viewMonth} events={events} />
    </div>
  );
}
