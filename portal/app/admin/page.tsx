import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { KPICard } from "@/components/kpi-card";
import { DashboardHero } from "@/components/dashboard-hero";
import { TodayOverview } from "@/components/today-overview";
import { FolderKanban, Users, CalendarDays, Receipt, ArrowUpRight, Clock, CalendarPlus, Inbox } from "lucide-react";

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
    .select("role, full_name")
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

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: activeProjects },
    { count: clients },
    { count: pendingBookings },
    { count: unpaidInvoices },
    { data: recentBookings },
    { count: newClientsThisMonth },
    { data: revenueData },
    { count: recentActivityCount },
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
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "client")
      .gte("created_at", startOfMonth),
    isAdmin
      ? supabase
          .from("invoices")
          .select("total")
          .eq("status", "paid")
          .gte("created_at", startOfMonth)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const revenueThisMonth = (revenueData ?? []).reduce(
    (sum: number, inv: { total?: number }) => sum + (inv.total ?? 0),
    0
  );

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
      <DashboardHero
        name={profile.full_name || user.email || "Admin"}
        role={isAdmin ? "Administrator" : "Staff"}
        stats={{
          activeProjects: activeProjects ?? 0,
          pendingBookings: pendingBookings ?? 0,
          outstandingInvoices: unpaidInvoices ?? 0,
        }}
        isAdmin={isAdmin}
      />

      <TodayOverview
        stats={{
          activeProjects: activeProjects ?? 0,
          newClientsThisMonth: newClientsThisMonth ?? 0,
          pendingBookings: pendingBookings ?? 0,
          revenueThisMonth: revenueThisMonth,
          recentActivityCount: recentActivityCount ?? 0,
        }}
      />

      <div className={`mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <KPICard
          title="Active Projects"
          value={activeProjects ?? 0}
          href="/admin/projects"
          icon={<FolderKanban size={20} strokeWidth={1.8} />}
          trend={{ label: "In progress", dir: "up" }}
          sparkData={[4, 5, 4, 6, 7, 6, 8]}
          sparkColor="#22d3ee"
          sparkId="ad-projects"
          accent="cyan"
        />
        <KPICard
          title="Clients"
          value={clients ?? 0}
          href="/admin/clients"
          icon={<Users size={20} strokeWidth={1.8} />}
          trend={{ label: "Total", dir: "up" }}
          sparkData={[2, 3, 4, 4, 5, 6, 7]}
          sparkColor="#2dd4bf"
          sparkId="ad-clients"
          accent="teal"
        />
        <KPICard
          title="Pending Bookings"
          value={pendingBookings ?? 0}
          href="/admin/bookings"
          icon={<CalendarDays size={20} strokeWidth={1.8} />}
          trend={{ label: "Awaiting", dir: "flat" }}
          sparkData={[3, 2, 4, 3, 5, 4, 5]}
          sparkColor="#fbbf24"
          sparkId="ad-bookings"
          accent="amber"
        />
        {isAdmin && (
          <KPICard
            title="Unpaid Invoices"
            value={unpaidInvoices ?? 0}
            href="/admin/invoices"
            icon={<Receipt size={20} strokeWidth={1.8} />}
            trend={{ label: "Outstanding", dir: unpaidInvoices ? "down" : "flat" }}
            sparkData={[6, 5, 5, 4, 4, 3, 3]}
            sparkColor="#fb7185"
            sparkId="ad-invoices"
            accent="coral"
          />
        )}
      </div>

      <section className="mt-10">
        <h2 className="section-title mb-4">Upcoming Bookings</h2>
        {recentBookings && recentBookings.length > 0 ? (
          <div className="glass-card overflow-hidden">
            {recentBookings.map((b, i) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--p-border)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="kpi-icon" style={{ width: 38, height: 38 }} aria-hidden>
                    <Clock size={17} strokeWidth={1.8} />
                  </span>
                  <div>
                    <span className="font-medium" style={{ color: "var(--p-text-strong)" }}>
                      {b.title}
                    </span>
                    <p className="mt-0.5 text-sm" style={{ color: "var(--p-muted)" }}>
                      {clientMap.get(b.client_id) ?? "Unknown client"}
                      {b.scheduled_at &&
                        ` \u2022 ${new Date(b.scheduled_at).toLocaleString()}`}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="btn-ghost"
                >
                  View <ArrowUpRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ minHeight: "200px" }}>
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: "rgba(251, 191, 36, 0.1)",
                border: "1px solid rgba(251, 191, 36, 0.2)",
                color: "#fbbf24",
              }}
            >
              <Inbox size={24} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
                No upcoming bookings
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--p-muted)" }}>
                New bookings will automatically appear here.
              </p>
            </div>
            <Link
              href="/admin/bookings"
              className="btn-primary mt-1 inline-flex items-center gap-2"
            >
              <CalendarPlus size={15} strokeWidth={2} />
              Create Booking
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
