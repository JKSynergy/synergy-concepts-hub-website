import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ClientActions from "../client-actions";
import { PageHeader, Section, StatusMark, EmptyState, PROJECT_TONE, INVOICE_TONE, ugx } from "@/components/ux/primitives";
import { canAccessFinance, isInternal, isOperationalStaff } from "@/lib/security/roles";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isInternal(profile.role)) redirect("/client");
  const canFinance = canAccessFinance(profile.role);
  const canWrite = isOperationalStaff(profile.role); // finance views clients read-only

  const { data: client } = await supabase
    .from("profiles")
    .select("id, email, full_name, company_name, phone, billing_address, tax_id, external_portal_url, created_at, updated_at")
    .eq("id", id)
    .eq("role", "client")
    .single();
  if (!client) notFound();

  const [{ data: projects }, { data: invoices }, { data: bookings }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, progress_percent, target_date, updated_at")
      .eq("client_id", id)
      .order("updated_at", { ascending: false })
      .limit(20),
    canFinance
      ? supabase
          .from("invoices")
          .select("id, invoice_number, status, total, due_date, issue_date")
          .eq("client_id", id)
          .order("issue_date", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as { id: string; invoice_number: string; status: string; total: number; due_date: string | null; issue_date: string }[] }),
    supabase
      .from("bookings")
      .select("id, title, status, scheduled_at")
      .eq("client_id", id)
      .order("scheduled_at", { ascending: false })
      .limit(5),
  ]);

  const invList = invoices ?? [];
  const openInv = invList.filter((i) => ["sent", "partially paid", "overdue"].includes(i.status));
  let outstanding = 0;
  if (openInv.length > 0) {
    const { data: pays } = await supabase
      .from("payments")
      .select("invoice_id, amount")
      .in("invoice_id", openInv.map((i) => i.id));
    const paid = new Map<string, number>();
    for (const p of pays ?? []) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount));
    for (const i of openInv) outstanding += Math.max(0, Number(i.total) - (paid.get(i.id) ?? 0));
  }

  const projList = projects ?? [];
  const active = projList.filter((p) => p.status === "active" || p.status === "review");
  const past = projList.filter((p) => p.status !== "active" && p.status !== "review");
  const displayName = client.company_name || client.full_name || client.email;

  return (
    <div className="ux-page">
      <Link href="/admin/clients" className="ux-back">← Clients</Link>
      <PageHeader
        eyebrow="Client"
        title={displayName}
        description={[client.company_name ? client.full_name : null, client.email, client.phone].filter(Boolean).join(" · ")}
        actions={canWrite ? <ClientActions client={client} /> : undefined}
      />

      <Section title="Overview">
        <dl className="ux-dl">
          <Row label="Contact" value={client.full_name} />
          <Row label="Email" value={client.email} />
          <Row label="Phone" value={client.phone} />
          <Row label="Billing address" value={client.billing_address} />
          <Row label="Tax ID" value={client.tax_id} />
          <Row
            label="Client portal"
            value={
              client.external_portal_url ? (
                <a href={client.external_portal_url} target="_blank" rel="noopener noreferrer">
                  {client.external_portal_url}
                </a>
              ) : null
            }
          />
          <Row label="Client since" value={fmtDate(client.created_at)} />
        </dl>
      </Section>

      <Section title="Active work">
        {active.length === 0 ? (
          <EmptyState title="No active work">Projects in progress or in review appear here.</EmptyState>
        ) : (
          <ProjectTable projects={active} />
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Earlier work">
          <ProjectTable projects={past} />
        </Section>
      )}

      {canFinance && (
        <Section
          title="Commercial"
          aside={<span className="ux-muted" style={{ fontSize: 13 }}>Outstanding {outstanding > 0 ? ugx(outstanding) : "nil"}</span>}
        >
          {invList.length === 0 ? (
            <EmptyState title="No invoices">Invoices raised for this client appear here.</EmptyState>
          ) : (
            <div className="ux-tablewrap">
              <table className="ux-table ux-table--stack">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th className="ux-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invList.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/admin/invoices/${i.id}`} className="ux-cell-main">{i.invoice_number}</Link>
                        <span className="ux-cell-sub">Issued {fmtDate(i.issue_date)}</span>
                      </td>
                      <td data-label="Status"><StatusMark tone={INVOICE_TONE[i.status] ?? "neutral"}>{i.status}</StatusMark></td>
                      <td data-label="Due" className="ux-muted">{i.due_date ? fmtDate(i.due_date) : "—"}</td>
                      <td className="ux-num" data-label="Total">{ugx(Number(i.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section title="Bookings">
        {(bookings ?? []).length === 0 ? (
          <EmptyState title="No bookings" />
        ) : (
          <div>
            {(bookings ?? []).map((b) => (
              <Link key={b.id} href="/admin/bookings" className="ux-row">
                <span className="ux-row-main">
                  {b.title}
                  <small>{b.scheduled_at ? fmtDate(b.scheduled_at) : "Unscheduled"}</small>
                </span>
                <span className="ux-row-end">{b.status}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Systems">
        <p className="ux-muted" style={{ margin: 0 }}>
          Websites, applications and hosting for this client will be managed here once the Systems workspace is built.
        </p>
      </Section>
    </div>
  );
}

function ProjectTable({
  projects,
}: {
  projects: { id: string; title: string; status: string; progress_percent: number | null; target_date: string | null }[];
}) {
  return (
    <div className="ux-tablewrap">
      <table className="ux-table ux-table--stack">
        <thead>
          <tr>
            <th>Project</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/admin/projects/${p.id}`} className="ux-cell-main">{p.title}</Link></td>
              <td data-label="Status"><StatusMark tone={PROJECT_TONE[p.status] ?? "neutral"}>{p.status}</StatusMark></td>
              <td data-label="Progress" className="ux-muted">{p.progress_percent ?? 0}%</td>
              <td data-label="Target" className="ux-muted">{p.target_date ? fmtDate(p.target_date) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || <span className="ux-muted">—</span>}</dd>
    </div>
  );
}
