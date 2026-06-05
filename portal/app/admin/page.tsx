import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const isAdmin = profile.role === "admin";

  // For staff: only count projects they are assigned to
  let projectFilter = supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .in("status", ["active", "review"]);

  if (!isAdmin) {
    const { data: assigned } = await supabase
      .from("project_assignments")
      .select("project_id")
      .eq("staff_id", user.id);
    const assignedIds = (assigned ?? []).map((a) => a.project_id);
    if (assignedIds.length > 0) {
      projectFilter = projectFilter.in("id", assignedIds);
    } else {
      projectFilter = projectFilter.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  const [
    { count: activeProjects },
    { count: clients },
    { count: pendingBookings },
    { count: unpaidInvoices },
    { data: recentBookings },
  ] = await Promise.all([
    projectFilter,
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "client"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "confirmed"]),
    isAdmin
      ? supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .in("status", ["draft", "sent", "overdue"])
      : Promise.resolve({ count: 0, data: [], error: null }),
    supabase
      .from("bookings")
      .select("id, title, type, status, scheduled_at, client_id")
      .in("status", ["pending", "confirmed"])
      .order("scheduled_at", { ascending: true })
      .limit(5),
  ]);

  const clientIds = [...new Set((recentBookings ?? []).map((b) => b.client_id))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase
        .from("profiles")
        .select("id, company_name, full_name, email")
        .in("id", clientIds)
    : { data: [] };
  const clientMap = new Map(
    (clientProfiles ?? []).map((c) => [
      c.id,
      c.company_name || c.full_name || c.email,
    ])
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
      <p className="mt-2 text-gray-600">Welcome, {user.email}</p>

      <div className={`mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Link
          href="/admin/projects"
          className="rounded-xl bg-white p-6 shadow transition hover:shadow-md"
        >
          <div className="text-sm font-medium text-gray-500">Active Projects</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {activeProjects ?? 0}
          </div>
        </Link>
        <Link
          href="/admin/clients"
          className="rounded-xl bg-white p-6 shadow transition hover:shadow-md"
        >
          <div className="text-sm font-medium text-gray-500">Clients</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {clients ?? 0}
          </div>
        </Link>
        <Link
          href="/admin/bookings"
          className="rounded-xl bg-white p-6 shadow transition hover:shadow-md"
        >
          <div className="text-sm font-medium text-gray-500">Pending Bookings</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {pendingBookings ?? 0}
          </div>
        </Link>
        {isAdmin && (
          <Link
            href="/admin/invoices"
            className="rounded-xl bg-white p-6 shadow transition hover:shadow-md"
          >
            <div className="text-sm font-medium text-gray-500">Unpaid Invoices</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {unpaidInvoices ?? 0}
            </div>
          </Link>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Upcoming Bookings
        </h2>
        <div className="space-y-3">
          {recentBookings && recentBookings.length > 0 ? (
            recentBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white p-4 shadow"
              >
                <div>
                  <span className="font-medium text-gray-900">{b.title}</span>
                  <p className="mt-1 text-sm text-gray-500">
                    {clientMap.get(b.client_id) ?? "Unknown client"}
                    {b.scheduled_at &&
                      ` \u2022 ${new Date(b.scheduled_at).toLocaleString()}`}
                  </p>
                </div>
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="text-sm font-medium text-sch-blue hover:underline"
                >
                  View
                </Link>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow">
              No upcoming bookings.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
