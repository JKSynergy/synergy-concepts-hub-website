import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, Section } from "@/components/ux/primitives";
import { isOperationalStaff, isAdmin as isAdminRole } from "@/lib/security/roles";

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Nairobi" }).format(new Date())
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Nairobi",
});
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const excerpt = (s: string, n = 90) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

type Attention = { label: string; href: string; parts: string[] };
type Activity = { key: string; at: string; title: string; sub: string; href: string };
type Upcoming = { key: string; at: string; title: string; sub: string; href: string; when: string };

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!profile || !isOperationalStaff(profile.role)) redirect("/client");
  const isAdmin = isAdminRole(profile.role);

  // Staff only see the work they are assigned to.
  let assignedIds: string[] | null = null;
  if (!isAdmin) {
    const { data: assigned } = await supabase.from("project_assignments").select("project_id").eq("staff_id", user.id);
    assignedIds = (assigned ?? []).map((a) => a.project_id);
  }
  const NONE = "00000000-0000-0000-0000-000000000000";
  const scope: string[] | null = assignedIds ? (assignedIds.length ? assignedIds : [NONE]) : null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in14 = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const [
    reviewProjects,
    revisionMilestones,
    pendingBookings,
    newLeads,
    openInvoices,
    draftInvoices,
    updates,
    recentBookings,
    upcomingBookings,
    dueInvoices,
    targetProjects,
  ] = await Promise.all([
    (() => {
      const q = supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "review");
      return scope ? q.in("id", scope) : q;
    })(),
    (() => {
      const q = supabase
        .from("project_milestones")
        .select("id", { count: "exact", head: true })
        .eq("status", "revision_requested");
      return scope ? q.in("project_id", scope) : q;
    })(),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    isAdmin
      ? supabase.from("invoices").select("id, status, due_date").in("status", ["sent", "partially paid", "overdue"])
      : Promise.resolve({ data: [] as { id: string; status: string; due_date: string | null }[] }),
    isAdmin
      ? supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "draft")
      : Promise.resolve({ count: 0 }),
    (() => {
      const q = supabase
        .from("project_updates")
        .select("id, content, created_at, project_id, author_id")
        .order("created_at", { ascending: false })
        .limit(6);
      return scope ? q.in("project_id", scope) : q;
    })(),
    supabase.from("bookings").select("id, title, created_at, client_id").order("created_at", { ascending: false }).limit(4),
    supabase
      .from("bookings")
      .select("id, title, scheduled_at, client_id")
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(5),
    isAdmin
      ? supabase
          .from("invoices")
          .select("id, invoice_number, due_date, client_id")
          .in("status", ["sent", "partially paid"])
          .gte("due_date", today)
          .lte("due_date", in14)
          .order("due_date", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] as { id: string; invoice_number: string; due_date: string; client_id: string }[] }),
    (() => {
      const q = supabase
        .from("projects")
        .select("id, title, target_date, client_id")
        .in("status", ["active", "review"])
        .gte("target_date", today)
        .lte("target_date", in30)
        .order("target_date", { ascending: true })
        .limit(5);
      return scope ? q.in("id", scope) : q;
    })(),
  ]);

  // Names for everything we are about to show.
  const projectIds = [...new Set((updates.data ?? []).map((u) => u.project_id))];
  const personIds = [
    ...new Set([
      ...(updates.data ?? []).map((u) => u.author_id),
      ...(recentBookings.data ?? []).map((b) => b.client_id),
      ...(upcomingBookings.data ?? []).map((b) => b.client_id),
      ...(dueInvoices.data ?? []).map((i) => i.client_id),
      ...(targetProjects.data ?? []).map((p) => p.client_id),
    ]),
  ].filter(Boolean) as string[];
  const [{ data: projectRows }, { data: people }] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id, title").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    personIds.length
      ? supabase.from("profiles").select("id, full_name, company_name, email").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; company_name: string | null; email: string }[] }),
  ]);
  const projectTitle = new Map((projectRows ?? []).map((p) => [p.id, p.title]));
  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.company_name || p.full_name || p.email] as [string, string])
  );
  const who = (id: string | null) => (id ? personName.get(id) ?? "Unknown" : "No client yet");

  // ── Attention: only rows that need action ──
  const attention: Attention[] = [];
  const revisions = revisionMilestones.count ?? 0;
  const inReview = reviewProjects.count ?? 0;
  if (revisions + inReview > 0) {
    const parts: string[] = [];
    if (revisions) parts.push(`${plural(revisions, "milestone")} with changes requested`);
    if (inReview) parts.push(`${plural(inReview, "project")} in review`);
    attention.push({ label: "Projects", href: "/admin/projects", parts });
  }
  const pending = pendingBookings.count ?? 0;
  const leads = newLeads.count ?? 0;
  if (pending + leads > 0) {
    const parts: string[] = [];
    if (pending) parts.push(`${pending} pending ${pending === 1 ? "booking" : "bookings"}`);
    if (leads) parts.push(`${plural(leads, "new quote request")}`);
    attention.push({ label: "Enquiries", href: pending ? "/admin/bookings" : "/admin/leads", parts });
  }
  if (isAdmin) {
    const overdue = (openInvoices.data ?? []).filter(
      (i) => i.status === "overdue" || (i.due_date && i.due_date < today)
    ).length;
    const drafts = draftInvoices.count ?? 0;
    if (overdue + drafts > 0) {
      const parts: string[] = [];
      if (overdue) parts.push(`${overdue} overdue`);
      if (drafts) parts.push(`${plural(drafts, "draft")} not yet sent`);
      attention.push({ label: "Invoices", href: "/admin/invoices", parts });
    }
  }

  // ── Recent work: real records only ──
  const recent: Activity[] = [
    ...(updates.data ?? []).map((u) => ({
      key: `u${u.id}`,
      at: u.created_at,
      title: `Update on ${projectTitle.get(u.project_id) ?? "a project"}`,
      sub: `${excerpt(u.content)} (${who(u.author_id)})`,
      href: `/admin/projects/${u.project_id}`,
    })),
    ...(recentBookings.data ?? []).map((b) => ({
      key: `b${b.id}`,
      at: b.created_at,
      title: `New booking: ${b.title}`,
      sub: who(b.client_id),
      href: `/admin/bookings/${b.id}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  // ── Upcoming ──
  const upcoming: Upcoming[] = [
    ...(upcomingBookings.data ?? []).map((b) => ({
      key: `b${b.id}`,
      at: b.scheduled_at as string,
      title: b.title,
      sub: `Booking, ${who(b.client_id)}`,
      href: `/admin/bookings/${b.id}`,
      when: dateTimeFmt.format(new Date(b.scheduled_at as string)),
    })),
    ...(dueInvoices.data ?? []).map((i) => ({
      key: `i${i.id}`,
      at: i.due_date,
      title: `Invoice ${i.invoice_number} due`,
      sub: who(i.client_id),
      href: `/admin/invoices/${i.id}`,
      when: dateFmt.format(new Date(i.due_date)),
    })),
    ...(targetProjects.data ?? []).map((p) => ({
      key: `p${p.id}`,
      at: p.target_date as string,
      title: `${p.title} target date`,
      sub: `Project, ${who(p.client_id)}`,
      href: `/admin/projects/${p.id}`,
      when: dateFmt.format(new Date(p.target_date as string)),
    })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 8);

  const firstName = (profile.full_name || "").trim().split(/\s+/)[0];

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title={`${greeting()}${firstName ? ", " + firstName : ""}.`}
        description={attention.length ? "Here is what needs attention today." : "Nothing needs attention right now."}
      />

      <Section title="Attention">
        {attention.length ? (
          attention.map((a) => (
            <Link key={a.label} href={a.href} className="ux-row">
              <span className="ux-row-label">{a.label}</span>
              <span className="ux-row-main">{a.parts.join(" · ")}</span>
              <span className="ux-row-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))
        ) : (
          <EmptyState title="All clear.">No changes requested, pending enquiries or overdue invoices.</EmptyState>
        )}
      </Section>

      <div className="ux-cols">
        <Section title="Recent work">
          {recent.length ? (
            recent.map((r) => (
              <Link key={r.key} href={r.href} className="ux-item">
                <span>
                  <b>{r.title}</b>
                  <small>{r.sub}</small>
                </span>
                <time dateTime={r.at}>{dateFmt.format(new Date(r.at))}</time>
              </Link>
            ))
          ) : (
            <EmptyState title="No activity yet.">Project updates and new bookings will appear here.</EmptyState>
          )}
        </Section>

        <Section title="Upcoming">
          {upcoming.length ? (
            upcoming.map((u) => (
              <Link key={u.key} href={u.href} className="ux-item">
                <span>
                  <b>{u.title}</b>
                  <small>{u.sub}</small>
                </span>
                <span className="ux-when">{u.when}</span>
              </Link>
            ))
          ) : (
            <EmptyState title="Nothing scheduled.">
              Bookings, invoice due dates and project target dates will appear here.
            </EmptyState>
          )}
        </Section>
      </div>
    </div>
  );
}
