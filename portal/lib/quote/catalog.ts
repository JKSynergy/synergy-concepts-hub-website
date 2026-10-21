// Synergy Capture Films quotation catalogue: types and validation.
//
// The catalogue is stored as versioned JSON in public.quote_catalogs
// (migration 040). UGX is the only price currency; USD is derived from the
// configured UGX-per-USD rate at quotation time. A price state that is not a
// number ("special_quote", "on_request") is never treated as zero, and an
// item with no entry for an event is not offered for that event.

export type PriceState =
  | { type: "fixed"; amount: number }
  | { type: "per_unit"; amount: number; min: number; max: number }
  | { type: "special_quote" }
  | { type: "on_request" };

export type CatalogEvent = { id: string; label: string };
export type CatalogService = {
  id: string;
  label: string;
  prices: Record<string, number>;
  deliverables: Record<string, string[]>;
};
export type CatalogExtra = {
  id: string;
  label: string;
  unit?: string;
  note?: string;
  requires?: string[];
  pricing: Record<string, PriceState>;
};
export type Catalog = {
  schema: 1;
  currency: "UGX";
  events: CatalogEvent[];
  services: CatalogService[];
  extras: CatalogExtra[];
  logistics: { kampala: string; upcountry: string; area: string };
  notes: { usd: string; request: string };
};

const ID_RE = /^[a-z][a-z0-9_]{1,39}$/;
const MAX_UGX = 10_000_000_000;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function text(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}
function ugxAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_UGX;
}

/** Validate a catalogue. Returns the catalogue (typed) or a list of problems. */
export function parseCatalog(raw: unknown): { ok: true; catalog: Catalog } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["Catalogue must be an object."] };
  if (raw.schema !== 1) errors.push("Unsupported catalogue schema.");
  if (raw.currency !== "UGX") errors.push("Catalogue prices must be in UGX.");

  const events = Array.isArray(raw.events) ? raw.events : [];
  const eventIds = new Set<string>();
  if (!events.length) errors.push("At least one event category is required.");
  for (const e of events) {
    if (!isObj(e) || typeof e.id !== "string" || !ID_RE.test(e.id) || !text(e.label, 80)) {
      errors.push("Each event needs an id and a label.");
      continue;
    }
    if (eventIds.has(e.id)) errors.push(`Duplicate event ${e.id}.`);
    eventIds.add(e.id);
  }

  const services = Array.isArray(raw.services) ? raw.services : [];
  const serviceIds = new Set<string>();
  if (!services.length) errors.push("At least one service is required.");
  for (const s of services) {
    if (!isObj(s) || typeof s.id !== "string" || !ID_RE.test(s.id) || !text(s.label, 80)) {
      errors.push("Each service needs an id and a label.");
      continue;
    }
    if (serviceIds.has(s.id)) errors.push(`Duplicate service ${s.id}.`);
    serviceIds.add(s.id);
    if (!isObj(s.prices)) errors.push(`${s.id}: prices are required.`);
    else
      for (const [ev, amt] of Object.entries(s.prices)) {
        if (!eventIds.has(ev)) errors.push(`${s.id}: unknown event ${ev}.`);
        if (!ugxAmount(amt)) errors.push(`${s.id}/${ev}: price must be a whole UGX amount.`);
      }
    if (!isObj(s.deliverables)) errors.push(`${s.id}: deliverables are required.`);
    else
      for (const [ev, list] of Object.entries(s.deliverables)) {
        if (!eventIds.has(ev)) errors.push(`${s.id}: deliverables for unknown event ${ev}.`);
        if (!Array.isArray(list) || list.some((d) => !text(d, 200))) errors.push(`${s.id}/${ev}: deliverables must be short text.`);
      }
  }

  const extras = Array.isArray(raw.extras) ? raw.extras : [];
  const extraIds = new Set<string>();
  for (const x of extras) {
    if (!isObj(x) || typeof x.id !== "string" || !ID_RE.test(x.id) || !text(x.label, 80)) {
      errors.push("Each extra needs an id and a label.");
      continue;
    }
    if (extraIds.has(x.id)) errors.push(`Duplicate extra ${x.id}.`);
    extraIds.add(x.id);
    if (x.unit !== undefined && !text(x.unit, 24)) errors.push(`${x.id}: unit must be short text.`);
    if (x.note !== undefined && !text(x.note, 300)) errors.push(`${x.id}: note must be short text.`);
    if (x.requires !== undefined && (!Array.isArray(x.requires) || x.requires.some((r) => !serviceIds.has(r as string)))) {
      errors.push(`${x.id}: requires must list known services.`);
    }
    if (!isObj(x.pricing)) {
      errors.push(`${x.id}: pricing is required.`);
      continue;
    }
    for (const [ev, st] of Object.entries(x.pricing)) {
      if (!eventIds.has(ev)) errors.push(`${x.id}: unknown event ${ev}.`);
      if (!isObj(st)) {
        errors.push(`${x.id}/${ev}: invalid price.`);
        continue;
      }
      if (st.type === "fixed") {
        if (!ugxAmount(st.amount)) errors.push(`${x.id}/${ev}: price must be a whole UGX amount.`);
      } else if (st.type === "per_unit") {
        if (!ugxAmount(st.amount)) errors.push(`${x.id}/${ev}: unit price must be a whole UGX amount.`);
        const okRange = Number.isInteger(st.min) && Number.isInteger(st.max) && (st.min as number) >= 1 && (st.max as number) <= 1000 && (st.min as number) <= (st.max as number);
        if (!okRange) errors.push(`${x.id}/${ev}: quantity range is invalid.`);
        if (x.unit === undefined) errors.push(`${x.id}: a per-unit price needs a unit.`);
      } else if (st.type !== "special_quote" && st.type !== "on_request") {
        errors.push(`${x.id}/${ev}: unknown price type.`);
      }
    }
  }

  const lg = raw.logistics, nt = raw.notes;
  if (!isObj(lg) || !text(lg.kampala, 400) || !text(lg.upcountry, 400) || !text(lg.area, 400)) errors.push("Logistics wording is required.");
  if (!isObj(nt) || !text(nt.usd, 400) || !text(nt.request, 400)) errors.push("Notes wording is required.");

  if (errors.length) return { ok: false, errors };
  return { ok: true, catalog: raw as unknown as Catalog };
}

/** Is this a usable exchange rate (UGX per 1 USD)? */
export function validRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 && rate < 1_000_000;
}

/** UGX to USD at the configured rate, rounded half-up to cents. */
export function toUsd(ugx: number, rate: number): number {
  return Math.round((ugx * 100) / rate) / 100;
}
