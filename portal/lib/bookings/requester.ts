// Who asked for a booking when it is not linked to a client account yet.
// Website enquiries (/api/quote, submit_quote_request) store the contact as
// metadata.lead_name / lead_email / lead_phone; bookings added by staff on
// someone's behalf may use name / full_name / email / phone. Both are read.

export type BookingMetadata = Record<string, unknown> | null | undefined;

export interface MetadataRequester {
  name: string | null;
  email: string | null;
  phone: string | null;
}

function pick(meta: BookingMetadata, keys: string[]): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function requesterFromMetadata(meta: BookingMetadata): MetadataRequester {
  return {
    name: pick(meta, ["lead_name", "name", "full_name"]),
    email: pick(meta, ["lead_email", "email"]),
    phone: pick(meta, ["lead_phone", "phone"]),
  };
}

// Lead and booking records keep the website's category codes; show words instead.
export const SERVICE_INTEREST_LABELS: Record<string, string> = {
  systems: "Technology and systems",
  media: "Creative and media",
  products: "Products",
  other: "Other",
};

export function serviceInterestLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return SERVICE_INTEREST_LABELS[code] ?? code;
}
