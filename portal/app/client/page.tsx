import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { EmptyState, PageHeader, PROJECT_TONE, Section, StatusMark, ugx } from "@/components/ux/primitives";
import { BOOKING_TYPE_LABEL, type BookingType } from "@/lib/types";
import { isAdmin, isFinance, landingFor } from "@/lib/security/roles";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function ClientDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_name, full_name")
    .eq("id", user.id)
    .single();

  if (isAdmin(profile?.role) || isFinance(profile?.role)) redirect(landingFor(profile?.role));

  const [{ data: projects }, { data: bookings }, { data: invoices }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, progress_percent, target_date")
      .eq("client_id", user.id)
      .in("status", ["active", "review"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("bookings")
      .select("id, title, type, status, scheduled_at")
      .eq("client_id", user.id)
      .in("status", ["pending", "confirmed"])
      .order("scheduled_at", { ascending: true })
      .limit(10),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, due_date")
      .eq("client_id", user.id)
      .in("status", ["sent", "partially paid", "overdue"])
      .order("due_date", { ascending: true })
      .limit(10),
  ]);

  // Milestones the client has been asked to approve, across all their projects
  const { data: ownProjects } = await supabase.from("projects").select("id, title").eq("client_id", user.id);
  const titleById = new Map((ownProjects ?? []).map((p) => [p.id, p.title as string]));
  const ownIds = (ownProjects ?? []).map((p) => p.id);
  const { data: awaiting } = ownIds.length
    ? await supabase
        .from("project_milestones")
        .select("id, title, project_id")
        .in("project_id", ownIds)
        .eq("status", "submitted")
    : { data: [] as { id: string; title: string; project_id: string }[] };

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (inv: { status: string; due_date: string | null }) =>
    inv.status === "overdue" || (!!inv.due_date && inv.due_date < today);
  const pendingBookings = (bookings ?? []).filter((b) => b.status === "pending");

  const attentionCount = (awaiting?.length ?? 0) + (invoices?.length ?? 0) + pendingBookings.length;
  const name = profile?.full_name || profile?.company_name;

  return (
    <div className="ux-page">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome${name ? `, ${name}` : ""}`}
        description="Your projects, bookings and invoices at a glance."
      />

      <Section title="Needs your attention">
        {attentionCount === 0 ? (
          <EmptyState title="Nothing needs your attention">You are all caught up.</EmptyState>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>What to do</th>
                  <th className="ux-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(awaiting ?? []).map((m) => (
                  <tr key={m.id}>
                    <td data-label="Item">
                      <Link href={`/client/projects/${m.project_id}`} className="ux-cell-main">
                        {m.title}
                      </Link>
                      <span className="ux-cell-sub">{titleById.get(m.project_id) ?? "Project"}</span>
                    </td>
                    <td data-label="What to do">
                      <StatusMark tone="warning">Milestone awaiting your approval</StatusMark>
                    </td>
                    <td className="ux-num" data-label="Amount">—</td>
                  </tr>
                ))}
                {(invoices ?? []).map((inv) => (
                  <tr key={inv.id}>
                    <td data-label="Item">
                      <Link href={`/client/invoices/${inv.id}`} className="ux-cell-main">
                        Invoice {inv.invoice_number ?? ""}
                      </Link>
                      {inv.due_date && <span className="ux-cell-sub">Due {fmtDate(inv.due_date)}</span>}
                    </td>
                    <td data-label="What to do">
                      <StatusMark tone={isOverdue(inv) ? "danger" : "info"}>
                        {isOverdue(inv) ? "Overdue, please pay" : "Awaiting payment"}
                      </StatusMark>
                    </td>
                    <td className="ux-num" data-label="Amount">{ugx(Number(inv.total))}</td>
                  </tr>
                ))}
                {pendingBookings.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Item">
                      <Link href="/client/bookings" className="ux-cell-main">
                        {b.title}
                      </Link>
                      <span className="ux-cell-sub">{BOOKING_TYPE_LABEL[b.type as BookingType] ?? b.type}</span>
                    </td>
                    <td data-label="What to do">
                      <StatusMark tone="warning">Booking request pending</StatusMark>
                    </td>
                    <td className="ux-num" data-label="Amount">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Your projects" aside={<Link href="/client/projects" className="ux-textbtn">All projects</Link>}>
        {projects && projects.length > 0 ? (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Target date</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Project">
                      <Link href={`/client/projects/${p.id}`} className="ux-cell-main">{p.title}</Link>
                    </td>
                    <td data-label="Status">
                      <StatusMark tone={PROJECT_TONE[p.status] ?? "neutral"}>{p.status}</StatusMark>
                    </td>
                    <td data-label="Progress">
                      <div className="ux-progress-cell">
                        <div className="ux-progress" role="progressbar" aria-valuenow={p.progress_percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                          <i style={{ width: `${p.progress_percent ?? 0}%` }} />
                        </div>
                        <span>{p.progress_percent ?? 0}%</span>
                      </div>
                    </td>
                    <td data-label="Target date">{p.target_date ? fmtDate(p.target_date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No active projects">Projects we are working on together will appear here.</EmptyState>
        )}
      </Section>

      <Section title="Upcoming" aside={<Link href="/client/bookings" className="ux-textbtn">Bookings</Link>}>
        {(bookings ?? []).length === 0 && !(invoices ?? []).some((i) => i.due_date) ? (
          <EmptyState title="Nothing scheduled">Booked sessions and invoice due dates will show here.</EmptyState>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack">
              <thead>
                <tr>
                  <th>What</th>
                  <th>When</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(bookings ?? []).map((b) => (
                  <tr key={b.id}>
                    <td data-label="What">
                      <Link href="/client/bookings" className="ux-cell-main">{b.title}</Link>
                    </td>
                    <td data-label="When">{b.scheduled_at ? fmtDateTime(b.scheduled_at) : "Date to be confirmed"}</td>
                    <td data-label="Status">
                      <StatusMark tone={b.status === "confirmed" ? "success" : "warning"}>{b.status}</StatusMark>
                    </td>
                  </tr>
                ))}
                {(invoices ?? [])
                  .filter((i) => i.due_date)
                  .map((inv) => (
                    <tr key={inv.id}>
                      <td data-label="What">
                        <Link href={`/client/invoices/${inv.id}`} className="ux-cell-main">
                          Invoice {inv.invoice_number} due
                        </Link>
                      </td>
                      <td data-label="When">{fmtDate(inv.due_date as string)}</td>
                      <td data-label="Status">
                        <StatusMark tone={isOverdue(inv) ? "danger" : "info"}>{isOverdue(inv) ? "overdue" : "due"}</StatusMark>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
