import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { ProgressBar } from "@/components/progress-bar";
import { KPICard } from "@/components/kpi-card";
import { TodayOverview } from "@/components/today-overview";
import { FolderKanban, CalendarDays, Receipt, ArrowUpRight, Clock } from "lucide-react";
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
      <header>
        <p className="section-title">Overview</p>
        <h1 className="page-title mt-1">
          Welcome back{profile?.company_name ? `, ${profile.company_name}` : ""}
        </h1>
        <p className="page-subtitle">
          Here&apos;s what&apos;s happening across your projects, bookings and invoices.
        </p>
      </header>

      <TodayOverview
        stats={{
          activeProjects: activeProjects?.length ?? 0,
          newClientsThisMonth: 0,
          pendingBookings: upcomingBookings?.length ?? 0,
          revenueThisMonth: outstandingInvoices?.reduce((sum, inv) => sum + (inv.total ?? 0), 0) ?? 0,
          recentActivityCount: (activeProjects?.length ?? 0) + (upcomingBookings?.length ?? 0),
        }}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Active Projects"
          value={activeProjects?.length ?? 0}
          href="/client/projects"
          icon={<FolderKanban size={20} strokeWidth={1.8} />}
          trend={{ label: "Live", dir: "up" }}
          sparkData={[3, 4, 3, 5, 4, 6, 5]}
          sparkColor="#22d3ee"
          sparkId="cp-projects"
          accent="cyan"
        />
        <KPICard
          title="Upcoming Bookings"
          value={upcomingBookings?.length ?? 0}
          href="/client/bookings"
          icon={<CalendarDays size={20} strokeWidth={1.8} />}
          trend={{ label: "Scheduled", dir: "flat" }}
          sparkData={[1, 2, 2, 3, 2, 3, 4]}
          sparkColor="#fbbf24"
          sparkId="cp-bookings"
          accent="amber"
        />
        <KPICard
          title="Outstanding Invoices"
          value={outstandingInvoices?.length ?? 0}
          href="/client/invoices"
          icon={<Receipt size={20} strokeWidth={1.8} />}
          trend={{ label: "Due", dir: outstandingInvoices?.length ? "down" : "flat" }}
          sparkData={[5, 4, 4, 3, 3, 2, 2]}
          sparkColor="#fb7185"
          sparkId="cp-invoices"
          accent="coral"
        />
      </div>

      {activeProjects && activeProjects.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Active Projects</h2>
            <Link
              href="/client/projects"
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "var(--p-cyan)" }}
            >
              View all <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeProjects.map((p) => (
              <Link
                key={p.id}
                href={`/client/projects/${p.id}`}
                className="glass-card block p-5 transition-transform hover:-translate-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold" style={{ color: "var(--p-text-strong)" }}>
                    {p.title}
                  </h3>
                  <span className={`badge ${STATUS_BADGE[p.status as ProjectStatus]}`}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-4">
                  <ProgressBar value={p.progress_percent} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {upcomingBookings && upcomingBookings.length > 0 && (
        <section className="mt-10">
          <h2 className="section-title mb-4">Upcoming Bookings</h2>
          <div className="glass-card divide-y" style={{ borderColor: "var(--p-border)" }}>
            {upcomingBookings.map((b, i) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                style={{ borderColor: "var(--p-border)", borderTopWidth: i === 0 ? 0 : 1 }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="kpi-icon"
                    style={{ width: 38, height: 38 }}
                    aria-hidden
                  >
                    <Clock size={17} strokeWidth={1.8} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: "var(--p-text-strong)" }}>
                        {b.title}
                      </span>
                      <span className={`badge ${BOOKING_STATUS_BADGE[b.status as BookingStatus]}`}>
                        {b.status}
                      </span>
                    </div>
                    {b.scheduled_at && (
                      <p className="mt-0.5 text-sm" style={{ color: "var(--p-muted)" }}>
                        {new Date(b.scheduled_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
