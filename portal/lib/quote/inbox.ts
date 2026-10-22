// Capture Films quotation inbox: one row per submitted quotation request.
//
// Source of truth: public.quote_requests where business = 'capture_films'
// (the only reliable business identifier; a lead's service_interest "media"
// is NOT used, because it also covers Creative Hub enquiries). Booking status
// and the latest staff review are joined in for display only. Nothing here
// writes; review stays on the booking page (QuotePanel / add_quote_review).

export type InboxRequest = {
  id: string;
  reference: string;
  booking_id: string | null;
  event_label: string;
  event_details: Record<string, unknown> | null;
  currency: string;
  estimate_ugx: number;
  estimate_usd: number | string | null;
  contact: Record<string, unknown> | null;
  created_at: string;
};
export type InboxBooking = { id: string; status: string };
export type InboxReview = {
  quote_request_id: string;
  final_amount: number | string;
  final_currency: string;
  created_at: string;
};

export type InboxRow = {
  id: string;
  reference: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  event: string;
  eventDate: string;
  currency: string;
  estimateUgx: number;
  estimateUsd: number | null;
  status: string | null;
  reviewed: { amount: number; currency: string; at: string } | null;
  bookingHref: string | null;
  submittedAt: string;
};

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function eventDateText(d: Record<string, unknown> | null): string {
  if (!d) return "Not given";
  if (d.date_fixed && s(d.date)) return s(d.date)!;
  const approx = s(d.approx_timeframe);
  return approx ? `Not fixed: ${approx}` : "Not fixed";
}

export function buildInboxRows(
  requests: InboxRequest[],
  bookings: InboxBooking[],
  reviews: InboxReview[]
): InboxRow[] {
  const status = new Map(bookings.map((b) => [b.id, b.status]));
  const latest = new Map<string, InboxReview>();
  for (const r of reviews) {
    const cur = latest.get(r.quote_request_id);
    if (!cur || r.created_at > cur.created_at) latest.set(r.quote_request_id, r);
  }
  return requests.map((q) => {
    const c = q.contact ?? {};
    const rv = latest.get(q.id);
    const bookingExists = q.booking_id !== null && status.has(q.booking_id);
    return {
      id: q.id,
      reference: q.reference,
      contactName: s(c.name) ?? s(c.email) ?? "Unknown",
      contactEmail: s(c.email),
      contactPhone: s(c.phone),
      event: q.event_label,
      eventDate: eventDateText(q.event_details),
      currency: q.currency,
      estimateUgx: Number(q.estimate_ugx),
      estimateUsd: q.estimate_usd === null ? null : Number(q.estimate_usd),
      status: bookingExists ? status.get(q.booking_id!)! : null,
      reviewed: rv ? { amount: Number(rv.final_amount), currency: rv.final_currency, at: rv.created_at } : null,
      bookingHref: bookingExists ? `/admin/bookings/${q.booking_id}` : null,
      submittedAt: q.created_at,
    };
  });
}

export type InboxFilter = "all" | "unreviewed";
export const parseInboxFilter = (v: unknown): InboxFilter => (v === "unreviewed" ? "unreviewed" : "all");
export const applyInboxFilter = (rows: InboxRow[], f: InboxFilter) =>
  f === "unreviewed" ? rows.filter((r) => r.reviewed === null) : rows;
