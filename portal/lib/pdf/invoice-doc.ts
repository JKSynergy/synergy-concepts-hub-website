// Invoice document model.
//
// The PDF template is content-driven: every section below renders only when it
// has content, and the document paginates naturally to as many pages as the
// content needs. Project-specific values supplied per invoice always take
// precedence over these defaults.

export type DocPaymentMethod = {
  label: string;
  /** Simple line icon shown beside the method on the PDF. */
  icon?: "bank" | "mobile";
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
  /** Rendered under "Notes". Defaults when null; [] omits the section entirely. */
  projectNotes?: string[] | null;
  paymentTerms?: string[] | null;
  /** Heading for the payment-terms section; set for an invoice's own agreed arrangement. */
  paymentTermsLabel?: string | null;
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
  email: "info@synergyconceptshub.com",
  website: "www.synergyconceptshub.com",
} as const;

/** The official Synergy Concepts Hub payment schedule — the single source for the default Payment Terms. */
export const DEFAULT_PAYMENT_SCHEDULE = { depositPercent: 80, balancePercent: 20 } as const;

/** Payment schedule terms used when the invoice carries none of its own. */
export const DEFAULT_PAYMENT_TERMS: string[] = [
  `An ${DEFAULT_PAYMENT_SCHEDULE.depositPercent}% deposit is required before commencement of work unless otherwise agreed in writing.`,
  `The remaining ${DEFAULT_PAYMENT_SCHEDULE.balancePercent}% balance is payable upon project completion or prior to delivery of the final deliverables.`,
];

/** Deposit / balance amounts for a total under the default schedule. They always sum to the total. */
export function defaultScheduleAmounts(total: number): { deposit: number; balance: number } {
  const deposit = Math.round((Number(total) * DEFAULT_PAYMENT_SCHEDULE.depositPercent) / 100);
  return { deposit, balance: Math.round(Number(total)) - deposit };
}

/** Notes shown when the invoice has none of its own. */
export const DEFAULT_NOTES: string[] = ["Payment due by the due date.", "Thank you for your business."];

export const DEFAULT_STANDARD_TERMS: string[] = [
  "Please quote the invoice number as the payment reference for all transactions.",
  "A remittance advice or proof of payment should be emailed to info@synergyconceptshub.com after payment.",
  "All deliverables remain the property of Synergy Concepts Hub until full payment has been received.",
];

export const DEFAULT_PAYMENT_METHODS: DocPaymentMethod[] = [
  {
    label: "Bank Transfer",
    icon: "bank",
    fields: [
      { label: "Account Name", value: "Joseph Sengendo" },
      { label: "Account Number", value: "0100823802201" },
      { label: "Bank", value: "Standard Chartered Bank Uganda" },
    ],
  },
  {
    label: "Airtel Money",
    icon: "mobile",
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

/** True if a note line reads as a payment/deposit schedule. */
function isPaymentScheduleLine(line: string): boolean {
  const lower = line.toLowerCase();
  const hasPercent = /\d+\s*%/.test(line);
  const hasScheduleWord = /\b(deposit|booking|balance|down payment|final payment|payment schedule)\b/.test(lower);
  return hasPercent && hasScheduleWord;
}

/**
 * Split invoice notes into project notes, filtering out lines that express a
 * payment schedule. This prevents invoice-specific deposit/balance wording
 * from duplicating or contradicting the centralized Payment Terms.
 */
export function splitProjectNotes(text: string | null | undefined): string[] {
  const lines = splitLines(text);
  const block = agreedBlock(lines);
  return lines
    .filter((_, i) => !block || i < block.start || i >= block.end)
    .filter((line) => !isPaymentScheduleLine(line));
}

/**
 * A short line with no sentence punctuation, e.g. "Deliverables" or
 * "Agreed Payment Terms": shown as a sub-heading inside Notes.
 */
export function isNoteHeading(line: string): boolean {
  const l = stripMarkdown(line);
  if (!l || l.length > 40) return false;
  if (/[.;!?,%]$|:/.test(l) || /^\d/.test(l)) return false;
  return l.split(/\s+/).length <= 4;
}

/** Removes stray markdown emphasis (e.g. "**") typed into notes. */
export function stripMarkdown(line: string): string {
  return line.replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
}

const AGREED_HEADING = /^(agreed|special|custom)\s+payment\s+(terms|arrangements?|schedule)\s*:?$/i;

/** Lines [start, end) of an "Agreed Payment Terms" block in the notes, heading included. */
function agreedBlock(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((l) => AGREED_HEADING.test(stripMarkdown(l)));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !isNoteHeading(lines[end])) end++;
  return { start, end };
}

/**
 * An invoice's own payment arrangement, written in its notes under a heading
 * such as "Agreed Payment Terms". When present it replaces the standard 80/20
 * terms on the PDF, and every line under the heading is kept (schedule lines
 * included). Returns null when the notes contain no such block.
 */
export function agreedPaymentTerms(text: string | null | undefined): string[] | null {
  const lines = splitLines(text);
  const block = agreedBlock(lines);
  if (!block) return null;
  const terms = lines.slice(block.start + 1, block.end).map(stripMarkdown).filter(Boolean);
  return terms.length > 0 ? terms : null;
}
