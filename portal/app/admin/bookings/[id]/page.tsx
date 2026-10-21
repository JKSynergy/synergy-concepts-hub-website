import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import BookingDetailActions from "./booking-detail-actions";
import { PageHeader, Section, StatusMark } from "@/components/ux/primitives";
import { BOOKING_TONE, bookingTypeText, fmtDateTime } from "../booking-labels";
import type { BookingStatus } from "@/lib/types";
import { canReviewQuotes, isOperationalStaff } from "@/lib/security/roles";
import QuotePanel from "./quote-panel";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function AdminBookingDetailPage({
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

  if (!profile || !isOperationalStaff(profile.role)) {
    redirect("/client");
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("*, service_catalog(name)")
    .eq("id", id)
    .single();

  if (!booking) notFound();

  const { data: client } = booking.client_id
    ? await supabase
        .from("profiles")
        .select("id, email, full_name, company_name, phone")
        .eq("id", booking.client_id)
        .single()
    : { data: null };

  // Fix: the previous guard read a non-existent `bookings.booking_id` column, so
  // the linked project was never found and "Convert to project" could repeat.
  const { data: relatedProject } = await supabase
    .from("projects")
    .select("id, title, status")
    .eq("booking_id", id)
    .maybeSingle();

  const clientLabel =
    client?.company_name || client?.full_name || client?.email || "Unknown requester";

  // Internal keys are not shown as rows; a structured quotation has its own section below.
  const HIDDEN_META = new Set(["request_id", "quote_request_id"]);
  const meta = Object.entries((booking.metadata as Record<string, unknown>) ?? {}).filter(([k]) => !HIDDEN_META.has(k));
  const status = booking.status as BookingStatus;

  return (
    <div className="ux-page">
      <Link href="/admin/bookings" className="ux-back">
        ← Booking requests
      </Link>
      <PageHeader
        eyebrow={bookingTypeText(booking.type)}
        title={booking.title}
        description={
          <StatusMark tone={BOOKING_TONE[status] ?? "neutral"}>{status}</StatusMark>
        }
      />

      <Section title="Overview">
        <dl className="ux-dl">
          <Row label="Type">{bookingTypeText(booking.type)}</Row>
          <Row label="Status">
            <StatusMark tone={BOOKING_TONE[status] ?? "neutral"}>{status}</StatusMark>
          </Row>
          {(() => {
            const sc = booking.service_catalog as { name?: string } | { name?: string }[] | null;
            const name = Array.isArray(sc) ? sc[0]?.name : sc?.name;
            return name ? <Row label="Service">{name}</Row> : null;
          })()}
          <Row label="Details">
            {booking.description ? (
              <span style={{ whiteSpace: "pre-wrap" }}>{booking.description}</span>
            ) : (
              <span className="ux-muted">No details provided</span>
            )}
          </Row>
          <Row label="Requested">{fmtDateTime(booking.created_at)}</Row>
          {meta.map(([key, value]) => (
            <Row key={key} label={key.replace(/_/g, " ")}>
              {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </Row>
          ))}
          {relatedProject && (
            <Row label="Linked project">
              <Link href={`/admin/projects/${relatedProject.id}`}>{relatedProject.title}</Link>{" "}
              <span className="ux-muted">({relatedProject.status})</span>
            </Row>
          )}
        </dl>
      </Section>

      <QuotePanel supabase={supabase} bookingId={id} canReview={canReviewQuotes(profile.role)} />

      <Section title="Requester">
        <dl className="ux-dl">
          <Row label="Client">
            {client ? <Link href={`/admin/clients/${client.id}`}>{clientLabel}</Link> : clientLabel}
          </Row>
          {client?.full_name && client.company_name && <Row label="Contact">{client.full_name}</Row>}
          {client?.email && <Row label="Email">{client.email}</Row>}
          {client?.phone && <Row label="Phone">{client.phone}</Row>}
        </dl>
      </Section>

      <Section title="Schedule">
        <dl className="ux-dl">
          <Row label="Scheduled for">
            {booking.scheduled_at ? fmtDateTime(booking.scheduled_at) : <span className="ux-muted">Not scheduled yet</span>}
          </Row>
        </dl>
      </Section>

      <Section title="Actions">
        <BookingDetailActions
          bookingId={id}
          status={status}
          scheduledAt={booking.scheduled_at}
          hasProject={!!relatedProject}
        />
      </Section>
    </div>
  );
}
