// Escaping for customer-supplied text placed into staff notification emails.
// Quote requests come from the public internet; never insert them into HTML raw.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Escaped text with line breaks kept, for multi-line messages. */
export function escapeMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

/** One-line header value (email subject): no control characters, bounded length. */
export function safeHeaderText(value: unknown, max = 120): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
