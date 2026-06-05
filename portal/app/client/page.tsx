import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";
import { STATUS_BADGE, BOOKING_STATUS_BADGE, type ProjectStatus, type BookingStatus } from "@/lib/types";

export default async function ClientDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_name")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  const [
    { data: activeProjects },
    { data: upcomingBookings },
    { data: outstandingInvoices },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, progress_percent, target_date")
      .eq("client_id", user.id)
      .in("status", ["active", "review"])
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("bookings")
      .select("id, title, type, status, scheduled_at")
      .eq("client_id", user.id)
      .in("status", ["pending", "confirmed"])
      .order("scheduled_at", { ascending: true })
      .limit(3),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, due_date")
      .eq("client_id", user.id)
      .in("status", ["draft", "sent", "overdue"])
      .order("due_date", { ascending: true })
      .limit(3),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Client Dashboard</h1>
      <p className="mt-2 text-gray-600">
        Welcome, {profile?.company_name ?? user.email}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/client/projects"
          className="rounded-xl bg-white p-6 shadow transition hover:shadow-md"
        >
          <div className="text-sm font-medium text-gray-500">Active Projects</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {activeProjects?.length ?? 0}
          </div>
        </Link>
        <Link
          href="/client/bookings"
          className="rounded-xl bg-white p-6 shadow transition hover:shadow-md"
        >
          <div className="text-sm font-medium text-gray-500">Upcoming Bookings</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {upcomingBookings?.length ?? 0}
          </div>
        </Link>
        <Link
          href="/client/invoices"
          className="rounded-xl bg-white p-6 shadow transition hover:shadow-md"
        >
          <div className="text-sm font-medium text-gray-500">Outstanding Invoices</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {outstandingInvoices?.length ?? 0}
          </div>
        </Link>
      </div>

      {activeProjects && activeProjects.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Active Projects
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeProjects.map((p) => (
              <Link
                key={p.id}
                href={`/client/projects/${p.id}`}
                className="block rounded-xl bg-white p-5 shadow transition hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-gray-900">{p.title}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      STATUS_BADGE[p.status as ProjectStatus]
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="mt-3 max-w-xs">
                  <ProgressBar value={p.progress_percent} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {upcomingBookings && upcomingBookings.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Bookings
          </h2>
          <div className="space-y-3">
            {upcomingBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white p-4 shadow"
              >
                <div>
                  <span className="font-medium text-gray-900">{b.title}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      BOOKING_STATUS_BADGE[b.status as BookingStatus]
                    }`}
                  >
                    {b.status}
                  </span>
                  {b.scheduled_at && (
                    <p className="mt-1 text-sm text-gray-500">
                      {new Date(b.scheduled_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
