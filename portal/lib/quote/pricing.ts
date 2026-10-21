// Server-side pricing for Synergy Capture Films quotation requests.
// The browser sends only selections; every amount is computed here from the
// catalogue. The result is stored as an immutable snapshot (quote_requests).
import { type Catalog, type PriceState, toUsd, validRate } from "./catalog.ts";

export type Selection = {
  event: string;
  services: string[];
  extras: { id: string; quantity?: number }[];
  currency: "UGX" | "USD";
};

export type QuoteLine = {
  id: string;
  kind: "service" | "extra";
  label: string;
  pricing: "fixed" | "per_unit";
  unit: string | null;
  quantity: number;
  unit_ugx: number;
  total_ugx: number;
  unit_usd: number | null;
  total_usd: number | null;
  note: string | null;
};

export type SpecialItem = { id: string; label: string; pricing: "special_quote" | "on_request"; note: string | null };

export type PricedQuote = {
  event: string;
  event_label: string;
  services: string[];
  deliverables: Record<string, string[]>;
  currency: "UGX" | "USD";
  ugx_per_usd: number | null;
  lines: QuoteLine[];
  special_items: SpecialItem[];
  estimate_ugx: number;
  estimate_usd: number | null;
};

export type PricingError = { field: string; message: string };

/** Extras offered for an event, in catalogue order (what the builder shows). */
export function extrasFor(catalog: Catalog, event: string) {
  return catalog.extras.filter((x) => x.pricing[event] !== undefined);
}

export function priceQuote(
  catalog: Catalog,
  sel: Selection,
  ugxPerUsd: number | null
): { ok: true; quote: PricedQuote } | { ok: false; errors: PricingError[] } {
  const errors: PricingError[] = [];
  const event = catalog.events.find((e) => e.id === sel.event);
  if (!event) return { ok: false, errors: [{ field: "event", message: "Please choose an event type." }] };

  if (sel.currency !== "UGX" && sel.currency !== "USD") errors.push({ field: "currency", message: "Unsupported currency." });
  const rate = validRate(ugxPerUsd) ? ugxPerUsd : null;
  if (sel.currency === "USD" && rate === null) {
    errors.push({ field: "currency", message: "USD prices are not available at the moment. Please choose UGX." });
  }
  const usd = (ugx: number) => (sel.currency === "USD" && rate !== null ? toUsd(ugx, rate) : null);

  const services = Array.isArray(sel.services) ? sel.services : [];
  if (!services.length) errors.push({ field: "services", message: "Please choose photography, videography or both." });
  if (new Set(services).size !== services.length) errors.push({ field: "services", message: "Each service can be chosen once." });

  const lines: QuoteLine[] = [];
  const deliverables: Record<string, string[]> = {};
  for (const sid of services) {
    const svc = catalog.services.find((s) => s.id === sid);
    const amount = svc?.prices[event.id];
    if (!svc || typeof amount !== "number") {
      errors.push({ field: "services", message: "That service is not available for this event." });
      continue;
    }
    deliverables[sid] = svc.deliverables[event.id] ?? [];
    lines.push({
      id: sid, kind: "service", label: svc.label, pricing: "fixed", unit: null, quantity: 1,
      unit_ugx: amount, total_ugx: amount, unit_usd: usd(amount), total_usd: usd(amount), note: null,
    });
  }

  const special_items: SpecialItem[] = [];
  const extras = Array.isArray(sel.extras) ? sel.extras : [];
  const seen = new Set<string>();
  for (const pick of extras) {
    const x = catalog.extras.find((e) => e.id === pick?.id);
    const st: PriceState | undefined = x?.pricing[event.id];
    if (!x || !st) {
      errors.push({ field: "extras", message: "One of the extras is not available for this event." });
      continue;
    }
    if (seen.has(x.id)) {
      errors.push({ field: "extras", message: `${x.label} was chosen twice.` });
      continue;
    }
    seen.add(x.id);
    if (x.requires?.some((r) => !services.includes(r))) {
      errors.push({ field: "extras", message: `${x.label} needs ${x.requires.join(" and ")}.` });
      continue;
    }
    const q = pick.quantity;
    if (st.type === "per_unit") {
      if (typeof q !== "number" || !Number.isInteger(q) || q < st.min || q > st.max) {
        errors.push({ field: "extras", message: `Please choose between ${st.min} and ${st.max} for ${x.label}.` });
        continue;
      }
      const total = st.amount * q;
      lines.push({
        id: x.id, kind: "extra", label: x.label, pricing: "per_unit", unit: x.unit ?? null, quantity: q,
        unit_ugx: st.amount, total_ugx: total, unit_usd: usd(st.amount), total_usd: usd(total), note: x.note ?? null,
      });
      continue;
    }
    if (q !== undefined && q !== 1) {
      errors.push({ field: "extras", message: `${x.label} cannot have a quantity.` });
      continue;
    }
    if (st.type === "fixed") {
      lines.push({
        id: x.id, kind: "extra", label: x.label, pricing: "fixed", unit: null, quantity: 1,
        unit_ugx: st.amount, total_ugx: st.amount, unit_usd: usd(st.amount), total_usd: usd(st.amount), note: x.note ?? null,
      });
    } else {
      special_items.push({ id: x.id, label: x.label, pricing: st.type, note: x.note ?? null });
    }
  }

  if (errors.length) return { ok: false, errors };
  const estimate_ugx = lines.reduce((s, l) => s + l.total_ugx, 0);
  return {
    ok: true,
    quote: {
      event: event.id,
      event_label: event.label,
      services,
      deliverables,
      currency: sel.currency,
      ugx_per_usd: rate, // the configured rate at submission time, kept whatever the currency
      lines,
      special_items,
      estimate_ugx,
      estimate_usd: sel.currency === "USD" && rate !== null ? toUsd(estimate_ugx, rate) : null,
    },
  };
}
