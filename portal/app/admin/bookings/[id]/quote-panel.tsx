import type { SupabaseClient } from "@supabase/supabase-js";
import { Section, money } from "@/components/ux/primitives";
import { LOGISTICS_LABEL, type Logistics } from "@/lib/quote/structured";
import QuoteReviewForm from "./quote-review-form";

// Structured Capture Films quotation attached to a booking: what the customer
// saw when they submitted (immutable snapshot), and the staff review history.

type Line = {
  id: string; kind: string; label: string; pricing: string; unit: string | null; quantity: number;
  unit_ugx: number; total_ugx: number; unit_usd: number | null; total_usd: number | null; note: string | null;
};
type Special = { id: string; label: string; pricing: string; note: string | null };
type Review = {
  id: string; discount_ugx: number; adjusted_ugx: number; logistics_ugx: number; final_ugx: number;
  final_currency: string; final_ugx_per_usd: number | null; final_amount: number; notes: string | null;
  reviewed_by: string | null; created_at: string;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function QuotePanel({
  supabase,
  bookingId,
  canReview,
}: {
  supabase: SupabaseClient;
  bookingId: string;
  canReview: boolean;
}) {
  const { data: q } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!q) return null;

  const { data: reviewRows } = await supabase
    .from("quote_reviews")
    .select("*")
    .eq("quote_request_id", q.id)
    .order("created_at", { ascending: false });
  const reviews = (reviewRows ?? []) as Review[];
  const reviewerIds = [...new Set(reviews.map((r) => r.reviewed_by).filter(Boolean))] as string[];
  const { data: reviewers } = reviewerIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", reviewerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const who = (id: string | null) => {
    const p = (reviewers ?? []).find((r) => r.id === id);
    return p?.full_name || p?.email || "Administrator";
  };

  const { data: active } = await supabase
    .from("quote_catalogs")
    .select("version, ugx_per_usd")
    .eq("business", q.business)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lines = (q.lines ?? []) as Line[];
  const specials = (q.special_items ?? []) as Special[];
  const d = (q.event_details ?? {}) as Record<string, string | boolean | null>;
  const contact = (q.contact ?? {}) as Record<string, string | null>;
  const usd = q.currency === "USD";
  const amount = (ugxAmt: number, usdAmt: number | null) =>
    usd && usdAmt !== null ? (
      <>
        {money(usdAmt, "USD")} <span className="ux-muted">({money(ugxAmt, "UGX")})</span>
      </>
    ) : (
      money(ugxAmt, "UGX")
    );
  const deliverables = (q.deliverables ?? {}) as Record<string, string[]>;
  const latest = reviews[0];

  return (
    <>
      <Section title={`Quotation request ${q.reference}`}>
        <dl className="ux-dl">
          <Row label="Event">{q.event_label}</Row>
          <Row label="Date">
            {d.date_fixed && d.date ? String(d.date) : <>Not fixed{d.approx_timeframe ? `: ${d.approx_timeframe}` : ""}</>}
          </Row>
          <Row label="Venue">{[d.venue, d.district].filter(Boolean).join(", ")}</Row>
          {d.duration ? <Row label="Duration">{String(d.duration)}</Row> : null}
          <Row label="Logistics">{LOGISTICS_LABEL[q.logistics as Logistics] ?? q.logistics}</Row>
          <Row label="Customer">
            {contact.name} · {contact.email} · {contact.phone}
          </Row>
          <Row label="Currency shown">
            {q.currency}
            {q.ugx_per_usd ? <span className="ux-muted"> · rate {Number(q.ugx_per_usd).toLocaleString("en-US")} UGX per USD</span> : null}
          </Row>
          <Row label="Price list">Version {q.catalog_version}</Row>
          <Row label="Submitted">{fmtWhen(q.created_at)}</Row>
          {d.notes ? (
            <Row label="Notes">
              <span style={{ whiteSpace: "pre-wrap" }}>{String(d.notes)}</span>
            </Row>
          ) : null}
        </dl>

        <div className="ux-tablewrap" style={{ marginTop: 24 }}>
          <table className="ux-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.label}
                    {l.kind === "service" && deliverables[l.id]?.length ? (
                      <div className="ux-muted" style={{ fontSize: 12, marginTop: 4 }}>{deliverables[l.id].join(" · ")}</div>
                    ) : null}
                    {l.note ? <div className="ux-muted" style={{ fontSize: 12, marginTop: 4 }}>{l.note}</div> : null}
                  </td>
                  <td>{l.pricing === "per_unit" ? `${l.quantity} ${l.unit ?? ""}` : "1"}</td>
                  <td>{amount(l.unit_ugx, l.unit_usd)}</td>
                  <td>{amount(l.total_ugx, l.total_usd)}</td>
                </tr>
              ))}
              {specials.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.label}
                    {s.note ? <div className="ux-muted" style={{ fontSize: 12, marginTop: 4 }}>{s.note}</div> : null}
                  </td>
                  <td>1</td>
                  <td colSpan={2} className="ux-muted">
                    {s.pricing === "special_quote" ? "Special quotation" : "Price on request"}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <strong>Customer estimate</strong>
                  <div className="ux-muted" style={{ fontSize: 12 }}>Excludes special-quotation items and any logistics charge.</div>
                </td>
                <td>
                  <strong>{amount(Number(q.estimate_ugx), q.estimate_usd === null ? null : Number(q.estimate_usd))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Quotation review">
        {latest ? (
          <dl className="ux-dl">
            <Row label="Customer estimate">{money(Number(q.estimate_ugx), "UGX")}</Row>
            <Row label="Approved discount">{money(Number(latest.discount_ugx), "UGX")}</Row>
            <Row label="Adjusted quotation">{money(Number(latest.adjusted_ugx), "UGX")}</Row>
            <Row label="Logistics charge">{money(Number(latest.logistics_ugx), "UGX")}</Row>
            <Row label="Final quotation">
              <strong>{money(Number(latest.final_amount), latest.final_currency)}</strong>
              {latest.final_currency === "USD" && latest.final_ugx_per_usd ? (
                <span className="ux-muted"> · {money(Number(latest.final_ugx), "UGX")} at {Number(latest.final_ugx_per_usd).toLocaleString("en-US")} UGX per USD</span>
              ) : null}
            </Row>
            <Row label="Reviewed">{who(latest.reviewed_by)} · {fmtWhen(latest.created_at)}</Row>
            {latest.notes ? (
              <Row label="Review notes">
                <span style={{ whiteSpace: "pre-wrap" }}>{latest.notes}</span>
              </Row>
            ) : null}
          </dl>
        ) : (
          <p className="ux-muted">Not reviewed yet.</p>
        )}
        {reviews.length > 1 ? (
          <details style={{ marginTop: 16 }}>
            <summary>Earlier reviews ({reviews.length - 1})</summary>
            <ul style={{ marginTop: 8 }}>
              {reviews.slice(1).map((r) => (
                <li key={r.id} className="ux-muted" style={{ fontSize: 13, padding: "4px 0" }}>
                  {fmtWhen(r.created_at)} · {who(r.reviewed_by)} · discount {money(Number(r.discount_ugx), "UGX")} · final {money(Number(r.final_amount), r.final_currency)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {canReview ? (
          <QuoteReviewForm
            quoteRequestId={q.id}
            bookingId={bookingId}
            estimateUgx={Number(q.estimate_ugx)}
            defaultRate={q.ugx_per_usd ? Number(q.ugx_per_usd) : active?.ugx_per_usd ? Number(active.ugx_per_usd) : null}
            defaultCurrency={q.currency}
            hasSpecialItems={specials.length > 0}
            logisticsQuote={q.logistics === "upcountry_quote"}
          />
        ) : (
          <p className="ux-muted" style={{ marginTop: 12 }}>Only an administrator can approve discounts and final amounts.</p>
        )}
      </Section>
    </>
  );
}
