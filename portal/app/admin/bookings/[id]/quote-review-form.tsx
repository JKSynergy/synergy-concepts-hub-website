"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addQuoteReview } from "@/lib/actions/quotes";
import { useFeedback } from "@/components/ux/feedback";

// Admin review of a quotation request. Each save adds a review; the
// customer's original estimate is never changed.

const toInt = (s: string) => {
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const fmt = (n: number) => n.toLocaleString("en-US");

export default function QuoteReviewForm({
  quoteRequestId,
  bookingId,
  estimateUgx,
  defaultRate,
  defaultCurrency,
  hasSpecialItems,
  logisticsQuote,
}: {
  quoteRequestId: string;
  bookingId: string;
  estimateUgx: number;
  defaultRate: number | null;
  defaultCurrency: string;
  hasSpecialItems: boolean;
  logisticsQuote: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [discount, setDiscount] = useState("0");
  const [adjusted, setAdjusted] = useState(String(estimateUgx));
  const [adjustedTouched, setAdjustedTouched] = useState(false);
  const [logistics, setLogistics] = useState("0");
  const [currency, setCurrency] = useState(defaultCurrency === "USD" ? "USD" : "UGX");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const discountN = toInt(discount);
  const adjustedN = toInt(adjusted);
  const finalUgx = adjustedN + toInt(logistics);
  const rateN = Number(rate);
  const finalUsd = currency === "USD" && rateN > 0 ? Math.round((finalUgx * 100) / rateN) / 100 : null;

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    const res = await addQuoteReview(quoteRequestId, bookingId, formData);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    toast("Quotation review saved.");
    router.refresh();
  }

  return (
    <form action={submit} style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add a review</h3>
      {error ? <p className="ux-notice ux-notice--error" role="alert">{error}</p> : null}
      {hasSpecialItems || logisticsQuote ? (
        <p className="ux-notice">
          {hasSpecialItems ? "This request includes special-quotation items: include their agreed price in the adjusted quotation. " : ""}
          {logisticsQuote ? "The customer asked for a separate logistics quotation." : ""}
        </p>
      ) : null}
      <div className="ux-formgrid">
        <label className="ux-field">
          <span>Approved discount (UGX)</span>
          <input
            className="ux-input" name="discount_ugx" inputMode="numeric" value={discount}
            onChange={(e) => {
              setDiscount(e.target.value);
              if (!adjustedTouched) setAdjusted(String(Math.max(0, estimateUgx - toInt(e.target.value))));
            }}
          />
        </label>
        <label className="ux-field">
          <span>Adjusted quotation (UGX)</span>
          <input
            className="ux-input" name="adjusted_ugx" inputMode="numeric" value={adjusted}
            onChange={(e) => { setAdjusted(e.target.value); setAdjustedTouched(true); }}
          />
        </label>
        <label className="ux-field">
          <span>Logistics charge (UGX)</span>
          <input className="ux-input" name="logistics_ugx" inputMode="numeric" value={logistics} onChange={(e) => setLogistics(e.target.value)} />
        </label>
        <label className="ux-field">
          <span>Final currency</span>
          <select className="ux-input" name="final_currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="UGX">UGX</option>
            <option value="USD">USD</option>
          </select>
        </label>
        {currency === "USD" ? (
          <label className="ux-field">
            <span>Rate (UGX per 1 USD)</span>
            <input className="ux-input" name="ugx_per_usd" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
        ) : null}
        <label className="ux-field ux-full">
          <span>Notes (internal)</span>
          <textarea className="ux-input" name="notes" rows={3} maxLength={2000} />
        </label>
      </div>
      <p className="ux-muted" style={{ marginTop: 12, fontSize: 13 }}>
        Customer estimate UGX {fmt(estimateUgx)} · discount UGX {fmt(discountN)} · final{" "}
        <strong>{finalUsd !== null ? `USD ${finalUsd.toFixed(2)} (UGX ${fmt(finalUgx)})` : `UGX ${fmt(finalUgx)}`}</strong>
        {discountN > estimateUgx ? <span style={{ color: "var(--ux-danger)" }}> · discount is larger than the estimate</span> : null}
      </p>
      <div className="ux-actions" style={{ marginTop: 16 }}>
        <button type="submit" className="ux-btn ux-btn--primary" disabled={saving}>
          {saving ? "Saving…" : "Save review"}
        </button>
      </div>
    </form>
  );
}
