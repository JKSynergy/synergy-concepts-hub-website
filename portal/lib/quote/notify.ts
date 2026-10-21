// Staff notification for a new enquiry or quotation request. Every customer
// value is escaped: these requests come from the public internet.
import { escapeHtml, escapeMultiline, safeHeaderText } from "./escape.ts";

export type EnquiryNotice = {
  reference: string | null;
  name: string;
  email: string;
  phone: string | null;
  service: string | null;
  message: string | null;
  /** Extra labelled rows (structured quotations), already plain text. */
  rows?: [string, string][];
};

export function enquiryEmail(n: EnquiryNotice): { subject: string; html: string } {
  const ref = n.reference ? ` (${safeHeaderText(n.reference, 30)})` : "";
  const subject = `New quote request from ${safeHeaderText(n.name, 80)}${ref}`;
  const rows: [string, string][] = [
    ["Reference", n.reference ?? "—"],
    ["Name", n.name],
    ["Email", n.email],
    ["Phone", n.phone ?? "—"],
    ["Service", n.service ?? "—"],
    ...(n.rows ?? []),
  ];
  const table = rows
    .map(([k, v]) => `<tr><th align="left" style="padding:4px 12px 4px 0">${escapeHtml(k)}</th><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("");
  const html = `<p>A new request arrived from the marketing site.</p><table>${table}</table>` +
    (n.message ? `<p style="margin-top:16px">${escapeMultiline(n.message)}</p>` : "") +
    `<p style="margin-top:16px">Open the portal to review it.</p>`;
  return { subject, html };
}
