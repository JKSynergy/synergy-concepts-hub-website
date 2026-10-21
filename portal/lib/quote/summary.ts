// Plain-text summary of a priced quotation, written into the lead message and
// the booking description so existing lead/booking screens and search stay useful.
import type { PricedQuote } from "./pricing.ts";
import { LOGISTICS_LABEL, type EventDetails, type Logistics } from "./structured.ts";

export function formatUgx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString("en-US")}`;
}
export function formatUsd(n: number): string {
  return `USD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function lineAmount(ugx: number, usd: number | null, currency: "UGX" | "USD"): string {
  return currency === "USD" && usd !== null ? `${formatUsd(usd)} (${formatUgx(ugx)})` : formatUgx(ugx);
}

export function quoteTitle(q: PricedQuote, serviceLabels: string[]): string {
  return `Quote request: ${q.event_label}, ${serviceLabels.join(" and ")}`.slice(0, 200);
}

export function quoteSummary(q: PricedQuote, d: EventDetails, logistics: Logistics, notes?: string | null): string {
  const out: string[] = [];
  out.push("Business: Synergy Capture Films");
  out.push(`Service: ${q.event_label} quotation`);
  out.push("");
  out.push(`Event: ${q.event_label}`);
  out.push(`Date: ${d.date_fixed && d.date ? d.date : `not fixed${d.approx_timeframe ? ` (${d.approx_timeframe})` : ""}`}`);
  out.push(`Venue: ${d.venue}, ${d.district}`);
  if (d.duration) out.push(`Duration: ${d.duration}`);
  out.push(`Logistics: ${LOGISTICS_LABEL[logistics]}`);
  out.push("");
  for (const l of q.lines) {
    const qty = l.pricing === "per_unit" ? ` × ${l.quantity} ${l.unit ?? ""}`.trimEnd() : "";
    out.push(`- ${l.label}${qty}: ${lineAmount(l.total_ugx, l.total_usd, q.currency)}`);
  }
  for (const s of q.special_items) {
    out.push(`- ${s.label}: ${s.pricing === "special_quote" ? "special quotation" : "price on request"}`);
  }
  out.push(`Estimate: ${lineAmount(q.estimate_ugx, q.estimate_usd, q.currency)}`);
  if (q.currency === "USD" && q.ugx_per_usd) out.push(`Exchange rate: ${q.ugx_per_usd} UGX per USD`);
  const note = notes ?? d.notes;
  if (note) {
    out.push("");
    out.push(`Notes: ${note}`);
  }
  return out.join("\n").slice(0, 5000);
}
