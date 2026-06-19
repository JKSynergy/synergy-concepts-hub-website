import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import ClientActions from "../client-actions";
import { STATUS_BADGE, type ProjectStatus } from "@/lib/types";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const { data: client } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, company_name, phone, billing_address, tax_id, external_portal_url, created_at, updated_at"
    )
    .eq("id", id)
    .eq("role", "client")
    .single();

  if (!client) notFound();

  const [
    { data: projects },
    { count: projectsCount },
    { count: bookingsCount },
    { count: invoicesCount },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, progress_percent, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id),
  ]);

  const displayName =
    client.company_name || client.full_name || client.email;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/clients"
        className="inline-flex text-sm transition-colors hover:opacity-80"
        style={{ color: "#0ea5e9" }}
      >
        &larr; Back to Clients
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--p-text-strong)" }}>
            {displayName}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--p-muted)" }}>
            {client.full_name && client.company_name && (
              <span>{client.full_name} &bull; </span>
            )}
            {client.email}
            {client.phone && ` \u2022 ${client.phone}`}
          </p>
        </div>
        <ClientActions client={client} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Projects" value={projectsCount ?? 0} />
        <StatCard label="Bookings" value={bookingsCount ?? 0} />
        <StatCard label="Invoices" value={invoicesCount ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
            Contact Details
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <DetailRow label="Email" value={client.email} />
            <DetailRow label="Full Name" value={client.full_name} />
            <DetailRow label="Company" value={client.company_name} />
            <DetailRow label="Phone" value={client.phone} />
            <DetailRow label="Billing Address" value={client.billing_address} />
            <DetailRow label="Tax ID" value={client.tax_id} />
            <DetailRow
              label="External Portal"
              value={
                client.external_portal_url ? (
                  <a
                    href={client.external_portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sch-blue hover:underline"
                  >
                    {client.external_portal_url}
                  </a>
                ) : null
              }
            />
            <DetailRow
              label="Member Since"
              value={new Date(client.created_at).toLocaleDateString()}
            />
          </dl>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
            Recent Projects
          </h2>
          {projects && projects.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/projects/${p.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                  >
                    <span className="text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
                      {p.title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        STATUS_BADGE[p.status as ProjectStatus]
                      }`}
                    >
                      {p.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm" style={{ color: "var(--p-muted)" }}>
              No projects yet for this client.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold" style={{ color: "var(--p-text-strong)" }}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--p-muted)" }}>
        {label}
      </dt>
      <dd style={{ color: "var(--p-text)" }}>
        {value || "—"}
      </dd>
    </div>
  );
}
