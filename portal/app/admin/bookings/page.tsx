import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import NewBookingForm from "./new-booking-form";
import BookingsTable, { type BookingRow } from "./bookings-table";
import { PageHeader } from "@/components/ux/primitives";
import type { Service, AcademyCourse } from "@/lib/types";
import { isAdmin, isOperationalStaff } from "@/lib/security/roles";

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

  if (!profile || !isOperationalStaff(profile.role)) {
    redirect("/client");
  }

  const [{ data: bookings }, { data: services }, { data: courses }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id, title, type, status, scheduled_at, created_at, client_id, metadata")
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

  const { data: allClients } = await supabase
    .from("profiles")
    .select("id, full_name, company_name, email")
    .eq("role", "client")
    .order("company_name", { ascending: true });

  const clientIds = [
    ...new Set((bookings ?? []).map((b) => b.client_id).filter(Boolean)),
  ];
  const { data: clients } = clientIds.length
    ? await supabase
        .from("profiles")
        .select("id, company_name, full_name, email")
        .in("id", clientIds)
    : { data: [] };
  const clientMap = new Map(
    (clients ?? []).map((c) => [
      c.id,
      { name: (c.company_name || c.full_name || c.email) as string, email: c.email as string },
    ])
  );

  const rows: BookingRow[] = (bookings ?? []).map((b) => {
    const meta = (b.metadata ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof meta[k] === "string" && meta[k] ? (meta[k] as string) : null);
    const c = b.client_id ? clientMap.get(b.client_id) : undefined;
    return {
      id: b.id,
      title: b.title,
      type: b.type,
      status: b.status,
      scheduled_at: b.scheduled_at,
      created_at: b.created_at,
      requester: c?.name ?? str("name") ?? str("full_name") ?? str("email") ?? "Unknown requester",
      requester_email: c?.email ?? str("email"),
      linked: !!c,
    };
  });

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Booking requests"
        description="Consultations, service packages, academy enrolments and custom requests from clients, and bookings you add on their behalf."
        actions={
          <>
            <Link href="/admin/bookings/calendar" className="ux-btn ux-btn--secondary">
              Calendar view
            </Link>
            <NewBookingForm
              clients={allClients ?? []}
              services={(services ?? []) as Service[]}
              courses={(courses ?? []) as AcademyCourse[]}
            />
          </>
        }
      />
      <BookingsTable rows={rows} canDelete={isAdmin(profile.role)} />
    </div>
  );
}
