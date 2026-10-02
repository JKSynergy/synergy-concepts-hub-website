// Invoice document model.
//
// The PDF template is content-driven: every section below renders only when it
// has content, and the document paginates naturally to as many pages as the
// content needs. Project-specific values supplied per invoice always take
// precedence over these defaults.

export type DocPaymentMethod = {
  label: string;
  fields: { label: string; value: string }[];
};

export type DocSignature = {
  imageSrc?: string;
  name: string;
  title?: string;
  company?: string;
};

/** All optional. Anything not supplied simply does not render. */
export type InvoiceDoc = {
  scope?: { title?: string; paragraphs?: string[]; items?: string[] } | null;
  projectNotes?: string[] | null;
  paymentTerms?: string[] | null;
  additionalTerms?: string[] | null;
  /** Defaults when null; [] omits the section entirely. */
  standardTerms?: string[] | null;
  paymentMethods?: DocPaymentMethod[] | null;
  signature?: DocSignature | null;
};

export const SCH_BRAND = {
  name: "Synergy Concepts Hub",
  tagline: "Where Ideas Come to Life",
  phone: "+256706739311",
  email: "synergyconceptshub@gmail.com",
  website: "www.synergyconceptshub.com",
} as const;

/** Payment schedule terms used when the invoice carries none of its own. */
export const DEFAULT_PAYMENT_TERMS: string[] = [
  "An 80% deposit is required before commencement of work unless otherwise agreed in writing.",
  "The remaining 20% balance is payable upon project completion or prior to delivery of the final deliverables.",
];

export const DEFAULT_STANDARD_TERMS: string[] = [
  "Please quote the invoice number as the payment reference for all transactions.",
  "A remittance advice or proof of payment should be emailed to synergyconceptshub@gmail.com after payment.",
  "All deliverables remain the property of Synergy Concepts Hub until full payment has been received.",
];

export const DEFAULT_PAYMENT_METHODS: DocPaymentMethod[] = [
  {
    label: "Bank Transfer",
    fields: [
      { label: "Account Name", value: "Joseph Sengendo" },
      { label: "Account Number", value: "0100823802201" },
      { label: "Bank", value: "Standard Chartered Bank Uganda" },
    ],
  },
  {
    label: "Airtel Money",
    fields: [
      { label: "Phone Number", value: "0704 783 724" },
      { label: "Account Name", value: "Joseph Sengendo" },
    ],
  },
];

export const DEFAULT_SIGNATURE: Omit<DocSignature, "imageSrc"> = {
  name: "Joseph Sengendo",
  title: "Authorized by",
  company: "Synergy Concepts Hub",
};

/** Split free text into display lines: strips bullet glyphs, drops blanks. */
export function splitLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*[•\-–*]\s*/, "").trim())
    .filter(Boolean);
}
