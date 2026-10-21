// Validation of the structured part of a Capture Films quotation request
// (body.quote). Prices are never read from here: see pricing.ts.
import type { Selection } from "./pricing.ts";
import type { FieldError } from "./validate.ts";

export const LOGISTICS = ["kampala", "upcountry_client", "upcountry_quote"] as const;
export type Logistics = (typeof LOGISTICS)[number];

export const LOGISTICS_LABEL: Record<Logistics, string> = {
  kampala: "Within the Kampala service area: transport for the team provided by Synergy Capture Films",
  upcountry_client: "Outside Kampala: the client provides transport and accommodation for the team",
  upcountry_quote: "Outside Kampala: the client asks for a separate logistics quotation",
};

export type EventDetails = {
  date: string | null;
  date_fixed: boolean;
  approx_timeframe: string | null;
  venue: string;
  district: string;
  duration: string | null;
  notes: string | null;
};

export type QuotePayload = {
  catalogVersion: number;
  expectedEstimateUgx: number;
  selection: Selection;
  details: EventDetails;
  logistics: Logistics;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function s(v: unknown, max: number): string | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t) return null;
  return t.length <= max ? t : false;
}

/** Today's date in Kampala (YYYY-MM-DD). */
export function kampalaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function validDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  const dt = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}

export function validateQuotePayload(
  raw: unknown,
  today = kampalaToday()
): { ok: true; data: QuotePayload } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: "quote", message: "Invalid quotation request." }] };
  }
  const q = raw as Record<string, unknown>;

  const catalogVersion = q.catalog_version;
  if (typeof catalogVersion !== "number" || !Number.isInteger(catalogVersion) || catalogVersion < 1) {
    errors.push({ field: "catalog_version", message: "Please reload the page and try again." });
  }
  const expected = q.expected_estimate_ugx;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) {
    errors.push({ field: "expected_estimate_ugx", message: "Please reload the page and try again." });
  }

  const event = typeof q.event === "string" ? q.event : "";
  const services = Array.isArray(q.services) && q.services.every((x) => typeof x === "string") ? (q.services as string[]) : null;
  if (!services || services.length > 5) errors.push({ field: "services", message: "Please choose photography, videography or both." });
  const extrasRaw = Array.isArray(q.extras) ? q.extras : q.extras === undefined ? [] : null;
  if (!extrasRaw || extrasRaw.length > 40) errors.push({ field: "extras", message: "Invalid extras." });
  const extras: { id: string; quantity?: number }[] = [];
  for (const x of extrasRaw ?? []) {
    if (!x || typeof x !== "object" || typeof (x as { id?: unknown }).id !== "string") {
      errors.push({ field: "extras", message: "Invalid extras." });
      break;
    }
    const { id, quantity } = x as { id: string; quantity?: unknown };
    if (quantity !== undefined && typeof quantity !== "number") {
      errors.push({ field: "extras", message: "Invalid quantity." });
      break;
    }
    extras.push(quantity === undefined ? { id } : { id, quantity: quantity as number });
  }
  const currency = q.currency;
  if (currency !== "UGX" && currency !== "USD") errors.push({ field: "currency", message: "Please choose UGX or USD." });

  const d = (q.event_details ?? {}) as Record<string, unknown>;
  const dateFixed = d.date_fixed;
  if (typeof dateFixed !== "boolean") errors.push({ field: "date", message: "Please tell us the event date, or that it is not fixed yet." });
  let date: string | null = null;
  if (dateFixed === true) {
    const v = typeof d.date === "string" ? d.date.trim() : "";
    if (!validDate(v)) errors.push({ field: "date", message: "Please enter a valid event date." });
    else if (v < today) errors.push({ field: "date", message: "The event date cannot be in the past." });
    else if (v > `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`) errors.push({ field: "date", message: "Please choose a date within the next three years." });
    else date = v;
  }
  const approx = dateFixed === false ? s(d.approx_timeframe, 100) : null;
  const venue = s(d.venue, 200);
  const district = s(d.district, 100);
  const duration = s(d.duration, 60);
  const notes = s(d.notes, 2000);
  if (approx === false) errors.push({ field: "approx_timeframe", message: "Please keep the timeframe short." });
  if (!venue) errors.push({ field: "venue", message: venue === false ? "Venue is too long." : "Please enter the venue." });
  if (!district) errors.push({ field: "district", message: district === false ? "District or town is too long." : "Please enter the district or town." });
  if (duration === false) errors.push({ field: "duration", message: "Please keep the duration short." });
  if (notes === false) errors.push({ field: "notes", message: "Please keep the notes under 2000 characters." });

  const logistics = q.logistics;
  if (typeof logistics !== "string" || !(LOGISTICS as readonly string[]).includes(logistics)) {
    errors.push({ field: "logistics", message: "Please tell us where the event is." });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      catalogVersion: catalogVersion as number,
      expectedEstimateUgx: expected as number,
      selection: { event, services: services!, extras, currency: currency as "UGX" | "USD" },
      details: {
        date,
        date_fixed: dateFixed as boolean,
        approx_timeframe: (approx || null) as string | null,
        venue: venue as string,
        district: district as string,
        duration: (duration || null) as string | null,
        notes: (notes || null) as string | null,
      },
      logistics: logistics as Logistics,
    },
  };
}
