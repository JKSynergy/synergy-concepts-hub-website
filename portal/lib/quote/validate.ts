// Validation for the public quote endpoint (/api/quote).
// Pure functions (no I/O) so they are unit-tested directly; the database
// function submit_quote_request() re-checks the essentials.

export type FieldError = { field: string; message: string };

export type EnquiryInput = {
  name: string;
  email: string;
  phone: string | null;
  service: string | null;
  brief: string | null;
  requestId: string | null;
};

export type EnquiryResult =
  | { kind: "ok"; data: EnquiryInput }
  | { kind: "invalid"; errors: FieldError[] }
  | { kind: "spam" };

export const LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  service: 60,
  brief: 5000,
} as const;

/** Submissions faster than this (from page load to send) are treated as automated. */
export const MIN_FILL_MS = 2500;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()\-.]{7,40}$/;
const SERVICE_RE = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export function isEmail(v: string): boolean {
  return v.length <= LIMITS.email && EMAIL_RE.test(v);
}

/** 7 to 15 digits, with optional +, spaces, brackets, dots or dashes. */
export function isPhone(v: string): boolean {
  if (!PHONE_RE.test(v)) return false;
  const digits = v.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

/**
 * Anti-spam signals sent by the marketing forms: a hidden "website" field that
 * people never fill, and the time from page load to submit. Older cached pages
 * send neither, so a missing timing value is not treated as spam.
 */
export function looksAutomated(body: Record<string, unknown>): boolean {
  const honeypot = body.website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") return true;
  if (honeypot !== undefined && typeof honeypot !== "string") return true;
  const elapsed = body.elapsed_ms;
  if (elapsed !== undefined) {
    if (typeof elapsed !== "number" || !Number.isFinite(elapsed)) return true;
    if (elapsed < MIN_FILL_MS) return true;
  }
  return false;
}

/**
 * Validate an enquiry. `requirePhone` is set for structured quotations
 * (the general enquiry forms keep phone optional, as before).
 */
export function validateEnquiry(raw: unknown, opts: { requirePhone?: boolean } = {}): EnquiryResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "invalid", errors: [{ field: "body", message: "Invalid request." }] };
  }
  const body = raw as Record<string, unknown>;
  if (looksAutomated(body)) return { kind: "spam" };

  const errors: FieldError[] = [];
  const name = str(body.name);
  const email = str(body.email);
  const phone = str(body.phone);
  const service = str(body.service);
  const brief = str(body.brief) ?? str(body.message);
  const requestId = str(body.request_id);

  if (!name) errors.push({ field: "name", message: "Please enter your name." });
  else if (name.length > LIMITS.name) errors.push({ field: "name", message: "Name is too long." });

  if (!email) errors.push({ field: "email", message: "Please enter your email address." });
  else if (!isEmail(email)) errors.push({ field: "email", message: "Please enter a valid email address." });

  if (!phone) {
    if (opts.requirePhone) errors.push({ field: "phone", message: "Please enter a phone or WhatsApp number." });
  } else if (phone.length > LIMITS.phone || !isPhone(phone)) {
    errors.push({ field: "phone", message: "Please enter a valid phone or WhatsApp number." });
  }

  if (service && (service.length > LIMITS.service || !SERVICE_RE.test(service))) {
    errors.push({ field: "service", message: "Please choose a service from the list." });
  }
  if (brief && brief.length > LIMITS.brief) {
    errors.push({ field: "brief", message: `Please keep the description under ${LIMITS.brief} characters.` });
  }
  if (requestId && !UUID_RE.test(requestId)) {
    errors.push({ field: "request_id", message: "Invalid request reference." });
  }

  if (errors.length) return { kind: "invalid", errors };
  return {
    kind: "ok",
    data: {
      name: name!,
      email: email!,
      phone,
      service,
      brief,
      requestId: requestId ? requestId.toLowerCase() : null,
    },
  };
}
