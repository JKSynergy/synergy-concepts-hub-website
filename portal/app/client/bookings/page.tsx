import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewBookingForm from "./new-booking-form";
import CancelBooking from "./cancel-booking";
import { EmptyState, PageHeader, StatusMark, type Tone } from "@/components/ux/primitives";
import { BOOKING_TYPE_LABEL, type BookingType, type Service, type AcademyCourse } from "@/lib/types";

const TONE: Record<string, Tone> = { pending: "warning", confirmed: "success", completed: "neutral", cancelled: "neutral" };

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function ClientBookingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: bookings }, { data: services }, { data: courses }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, title, type, status, scheduled_at, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("service_catalog").select("*").eq("is_active", true).order("name"),
    supabase.from("academy_courses").select("*").eq("is_active", true).order("name"),
  ]);

  const form = <NewBookingForm services={(services ?? []) as Service[]} courses={(courses ?? []) as AcademyCourse[]} />;

  return (
    <div className="ux-page">
      <PageHeader title="Bookings" description="Request a consultation or a service, and track your requests." actions={form} />

      {bookings && bookings.length > 0 ? (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Request</th>
                <th>Type</th>
                <th>Preferred / scheduled</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td data-label="Request">
                    <span className="ux-cell-main">{b.title}</span>
                    <span className="ux-cell-sub">Requested {new Date(b.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </td>
                  <td data-label="Type">{BOOKING_TYPE_LABEL[b.type as BookingType] ?? b.type}</td>
                  <td data-label="Preferred / scheduled">{b.scheduled_at ? fmt(b.scheduled_at) : "—"}</td>
                  <td data-label="Status">
                    <StatusMark tone={TONE[b.status] ?? "neutral"}>{b.status}</StatusMark>
                  </td>
                  <td data-label="Action">
                    {(b.status === "pending" || b.status === "confirmed") && <CancelBooking bookingId={b.id} title={b.title} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No booking requests yet" action={form}>
          Send your first request and we will get back to you.
        </EmptyState>
      )}
    </div>
  );
}
