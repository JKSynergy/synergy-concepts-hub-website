import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { EmptyState, PageHeader, StatusMark, money } from "@/components/ux/primitives";
import { BOOKING_TONE, fmtDateTime } from "@/app/admin/bookings/booking-labels";
import { canReviewQuotes, isOperationalStaff } from "@/lib/security/roles";
import {
  applyInboxFilter,
  buildInboxRows,
  parseInboxFilter,
  type InboxBooking,
  type InboxRequest,
  type InboxReview,
} from "@/lib/quote/inbox";

export const metadata = { title: "Capture Films quotations" };

// Quotation inbox for Synergy Capture Films. Read-only list over the existing
// records; opening a row goes to the booking page, where the quotation and the
// (admin-only) review form already live. Access: middleware keeps finance out of
// /admin/services; this page requires admin or staff; RLS on quote_requests and
// quote_reviews (is_staff()) returns nothing to anyone else.
export default async function CaptureFilmsQuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isOperationalStaff(profile.role)) redirect("/client");

  const filter = parseInboxFilter((await searchParams).show);

  const { data: requests, error } = await supabase
    .from("quote_requests")
    .select("id, reference, booking_id, event_label, event_details, currency, estimate_ugx, estimate_usd, contact, created_at")
    .eq("business", "capture_films")
    .order("created_at", { ascending: false })
    .limit(200);

  const reqs = (requests ?? []) as InboxRequest[];
  const ids = reqs.map((r) => r.id);
  const bookingIds = reqs.map((r) => r.booking_id).filter((v): v is string => !!v);

  const [{ data: bookings }, { data: reviews }] = await Promise.all([
    bookingIds.length
      ? supabase.from("bookings").select("id, status").in("id", bookingIds)
      : Promise.resolve({ data: [] as InboxBooking[] }),
    ids.length
      ? supabase.from("quote_reviews").select("quote_request_id, final_amount, final_currency, created_at").in("quote_request_id", ids)
      : Promise.resolve({ data: [] as InboxReview[] }),
  ]);

  const all = buildInboxRows(reqs, (bookings ?? []) as InboxBooking[], (reviews ?? []) as InboxReview[]);
  const rows = applyInboxFilter(all, filter);
  const unreviewed = all.filter((r) => r.reviewed === null).length;
  const canReview = canReviewQuotes(profile.role);

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        eyebrow="Synergy Capture Films"
        title="Quotation requests"
        description="Quotations sent from the website quotation builder. The customer estimate is what they saw when they submitted; open a request to see the full quotation and its review history."
      />

      <div className="ux-toolbar">
        <div role="group" aria-label="Show" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/admin/services/capture-films/quotations"
            aria-current={filter === "all" ? "page" : undefined}
            className={`ux-btn ux-btn--sm ${filter === "all" ? "ux-btn--primary" : "ux-btn--outline"}`}
          >
            All ({all.length})
          </Link>
          <Link
            href="/admin/services/capture-films/quotations?show=unreviewed"
            aria-current={filter === "unreviewed" ? "page" : undefined}
            className={`ux-btn ux-btn--sm ${filter === "unreviewed" ? "ux-btn--primary" : "ux-btn--outline"}`}
          >
            Not reviewed ({unreviewed})
          </Link>
        </div>
      </div>

      {error ? (
        <p className="ux-notice ux-notice--error">Quotation requests could not be loaded. Try again shortly.</p>
      ) : rows.length === 0 ? (
        <EmptyState title={filter === "unreviewed" ? "Every quotation has been reviewed" : "No quotation requests yet"}>
          {filter === "unreviewed" ? null : "Requests sent from the website quotation builder appear here."}
        </EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Event</th>
                <th>Event date</th>
                <th>Customer estimate</th>
                <th>Status</th>
                <th>Review</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Reference">
                    <b>{r.reference}</b>
                    <div className="ux-muted">{fmtDateTime(r.submittedAt)}</div>
                  </td>
                  <td data-label="Customer">
                    {r.contactName}
                    {r.contactEmail ? <div className="ux-muted">{r.contactEmail}</div> : null}
                    {r.contactPhone ? <div className="ux-muted">{r.contactPhone}</div> : null}
                  </td>
                  <td data-label="Event">{r.event}</td>
                  <td data-label="Event date">{r.eventDate}</td>
                  <td data-label="Customer estimate">
                    {r.currency === "USD" && r.estimateUsd !== null ? (
                      <>
                        {money(r.estimateUsd, "USD")} <span className="ux-muted">({money(r.estimateUgx, "UGX")})</span>
                      </>
                    ) : (
                      money(r.estimateUgx, "UGX")
                    )}
                  </td>
                  <td data-label="Status">
                    {r.status ? (
                      <StatusMark tone={BOOKING_TONE[r.status] ?? "neutral"}>{r.status}</StatusMark>
                    ) : (
                      <span className="ux-muted">Booking removed</span>
                    )}
                  </td>
                  <td data-label="Review">
                    {r.reviewed ? (
                      <>
                        Final {money(r.reviewed.amount, r.reviewed.currency)}
                        <div className="ux-muted">{fmtDateTime(r.reviewed.at)}</div>
                      </>
                    ) : (
                      <span className="ux-muted">Not reviewed</span>
                    )}
                  </td>
                  <td data-label="Action">
                    {r.bookingHref ? (
                      <Link href={r.bookingHref}>{canReview && !r.reviewed ? "Review" : "Open"}</Link>
                    ) : (
                      <span className="ux-muted">No booking to open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
