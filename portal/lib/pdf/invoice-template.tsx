import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { Invoice, InvoiceLineItem, Payment } from "@/lib/types";
import {
  SCH_BRAND,
  DEFAULT_PAYMENT_SCHEDULE,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_STANDARD_TERMS,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_NOTES,
  DEFAULT_SIGNATURE,
  defaultScheduleAmounts,
  isNoteHeading,
  stripMarkdown,
  type InvoiceDoc,
} from "./invoice-doc";
import { registerPdfFonts, T, PAGE_X, fmtDate, stampForStatus } from "./pdf-theme";

// Minimal SCH layout: typography, whitespace and hairline rules do the work.
// No filled panels, no shading, square corners. The document flows onto as
// many pages as its content needs; every page carries the footer.
registerPdfFonts();

const styles = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 9.5,
    color: T.ink,
    backgroundColor: T.white,
    paddingTop: 51,
    paddingBottom: 72,
    paddingHorizontal: PAGE_X,
  },

  // Running head, pages 2+
  contHeader: { position: "absolute", top: 24, left: PAGE_X, right: PAGE_X },
  contInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: T.line,
  },
  contBrand: { fontSize: 7.5, fontWeight: 600, color: T.navy },
  contMeta: { fontSize: 7.5, color: T.muted },

  // Header (page 1)
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 20, height: 20, objectFit: "contain", marginRight: 10 },
  brandName: { fontFamily: "Sora", fontWeight: 600, fontSize: 12, color: T.navy },
  contact: { marginTop: 10, fontSize: 8, lineHeight: 1.7, color: T.muted },
  docBlock: { alignItems: "flex-end" },
  docTitle: { fontFamily: "Sora", fontWeight: 600, fontSize: 30, lineHeight: 1, color: T.navy, letterSpacing: -0.8 },
  docNo: { marginTop: 8, fontSize: 9, color: T.muted },
  docNoValue: { fontWeight: 600, color: T.ink },
  stamp: { width: 66, height: 66, objectFit: "contain", marginTop: 10 },
  draft: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderWidth: 0.75,
    borderColor: T.muted,
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: T.muted,
  },

  // Meta row
  meta: { flexDirection: "row", marginTop: 34 },
  metaCell: { paddingRight: 12 },
  metaCellNext: { paddingLeft: 12 },
  metaValue: { marginTop: 5, fontWeight: 600, color: T.ink },
  metaSub: { lineHeight: 1.45, fontSize: 8.5, color: T.muted },
  metaDue: { marginTop: 4, fontFamily: "Sora", fontWeight: 600, fontSize: 12, color: T.navy },

  // Labels and sections
  label: { fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.muted },
  section: { marginTop: 24 },
  sectionRule: { height: 0.75, backgroundColor: T.navy, marginTop: 7 },
  scopeTitle: { fontFamily: "Sora", fontWeight: 600, fontSize: 11, color: T.navy, marginTop: 10 },
  para: { fontSize: 9.5, lineHeight: 1.45, marginTop: 6, color: T.muted },

  // Numbered / dashed lists with hairlines
  li: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.75, borderBottomColor: T.line },
  liNum: { width: 24, fontSize: 7.5, fontWeight: 600, color: T.navy, paddingTop: 1 },
  liDash: { width: 24, paddingTop: 6 },
  dash: { width: 7, height: 0.75, backgroundColor: T.navy },
  liBody: { fontSize: 9.5, lineHeight: 1.45, flex: 1, color: T.muted },
  liTitle: { fontSize: 9.5, lineHeight: 1.45, fontWeight: 600, color: T.ink },
  liSub: { lineHeight: 1.45, fontSize: 8.5, color: T.muted },

  // Notes sub-headings
  subHead: { fontFamily: "Sora", fontWeight: 600, fontSize: 10.5, color: T.navy, marginTop: 16, marginBottom: 2 },

  // Investment table
  tableHead: { flexDirection: "row", paddingTop: 12, paddingBottom: 7, borderBottomWidth: 0.75, borderBottomColor: T.navy },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.muted },
  tr: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 0.75, borderBottomColor: T.line },
  cDesc: { flex: 4, paddingRight: 12 },
  cQty: { flex: 0.6, textAlign: "right", paddingRight: 12 },
  cPrice: { flex: 1.5, textAlign: "right", paddingRight: 12 },
  cAmount: { flex: 1.5, textAlign: "right" },
  td: { fontSize: 9.5, lineHeight: 1.45, color: T.ink },
  tdAmount: { fontWeight: 600, color: T.ink },

  // Totals
  totals: { marginTop: 12, marginLeft: "auto", width: "46%" },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { color: T.muted },
  totalValue: { color: T.ink },
  totalStrong: { fontWeight: 600, color: T.ink },
  totalSep: { borderTopWidth: 0.75, borderTopColor: T.line, marginTop: 4, paddingTop: 8 },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: T.navy,
  },
  grandLabel: { fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.navy },
  grandValue: { fontFamily: "Sora", fontWeight: 600, fontSize: 17, color: T.navy, letterSpacing: -0.3 },

  // Payment details
  payCols: { flexDirection: "row" },
  payCol: { flex: 1, paddingTop: 12, paddingRight: 14 },
  payColNext: { paddingLeft: 14, borderLeftWidth: 0.75, borderLeftColor: T.line },
  payTitle: { fontWeight: 600, color: T.ink, marginBottom: 6 },
  payRow: { flexDirection: "row", marginBottom: 3 },
  payLabel: { width: 84, fontSize: 8.5, color: T.muted },
  payValue: { lineHeight: 1.45, flex: 1, fontSize: 8.5, color: T.ink },

  // Agreed arrangement call-out
  callout: { marginTop: 10, paddingVertical: 4, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: T.orange },
  calloutLine: { lineHeight: 1.45, fontSize: 9, color: T.ink, marginBottom: 4 },

  // Schedule amounts
  schedule: { marginTop: 10, width: "50%", borderTopWidth: 0.75, borderTopColor: T.line },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: T.line,
  },
  scheduleLabel: { fontSize: 8.5, color: T.muted },
  scheduleValue: { fontSize: 8.5, fontWeight: 600, color: T.ink },

  // Signature
  signWrap: { marginTop: 40, flexDirection: "row", justifyContent: "flex-end" },
  sign: { width: 176 },
  signImage: { width: 120, height: 40, objectFit: "contain", marginTop: 8, marginBottom: 2 },
  signLine: { borderTopWidth: 0.75, borderTopColor: T.ink, paddingTop: 5 },
  signName: { fontWeight: 600, color: T.ink },
  signSub: { fontSize: 8, color: T.muted },

  // Footer, every page
  footer: {
    position: "absolute",
    bottom: 26,
    left: PAGE_X,
    right: PAGE_X,
    paddingTop: 9,
    borderTopWidth: 0.75,
    borderTopColor: T.line,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footLeft: { flexDirection: "row", alignItems: "center" },
  footBar: { width: 14, height: 2.5, backgroundColor: T.orange, marginRight: 8 },
  footBrand: { fontSize: 7.5, fontWeight: 600, color: T.navy, marginRight: 6 },
  footText: { fontSize: 7.5, color: T.muted },
  footRight: { flexDirection: "row" },
});

function Section({ title, children, keepTogether = false }: { title: string; children: ReactNode; keepTogether?: boolean }) {
  return (
    <View style={styles.section} wrap={!keepTogether} minPresenceAhead={70}>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.sectionRule} />
      {children}
    </View>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={styles.li} wrap={false}>
          <Text style={styles.liNum}>{String(i + 1).padStart(2, "0")}</Text>
          <Text style={styles.liBody}>{item}</Text>
        </View>
      ))}
    </>
  );
}

function Row({ item, money }: { item: InvoiceLineItem; money: (n: number) => string }) {
  return (
    <View style={styles.tr} wrap={false}>
      <Text style={[styles.cDesc, styles.td]}>{item.description}</Text>
      <Text style={[styles.cQty, styles.td]}>{Number(item.quantity).toLocaleString("en-US")}</Text>
      <Text style={[styles.cPrice, styles.td]}>{money(item.unit_price)}</Text>
      <Text style={[styles.cAmount, styles.tdAmount]}>{money(item.amount)}</Text>
    </View>
  );
}

type NoteNode =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "item"; n: number | null; title: string | null; text: string };

/**
 * Turns free-text notes into structure: short lines become sub-headings,
 * "1. Title: detail" becomes a numbered item, and lines after an intro that
 * ends with ":" become a dashed list.
 */
function parseNotes(lines: string[]): NoteNode[] {
  const out: NoteNode[] = [];
  let listMode = false;
  for (const raw of lines) {
    const line = stripMarkdown(raw);
    if (!line) continue;
    if (isNoteHeading(line)) {
      out.push({ kind: "heading", text: line });
      listMode = false;
      continue;
    }
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      const body = numbered[2];
      const split = /^([^:]{2,60}):\s+(.+)$/.exec(body);
      out.push({ kind: "item", n: Number(numbered[1]), title: split ? split[1] : null, text: split ? split[2] : body });
      continue;
    }
    if (listMode) {
      out.push({ kind: "item", n: null, title: null, text: line });
      continue;
    }
    out.push({ kind: "para", text: line });
    if (line.endsWith(":")) listMode = true;
  }
  return out;
}

function Notes({ lines }: { lines: string[] }) {
  const nodes = parseNotes(lines);
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === "heading") {
          return (
            <Text key={i} style={styles.subHead} minPresenceAhead={40}>
              {n.text}
            </Text>
          );
        }
        if (n.kind === "para") {
          return (
            <Text key={i} style={styles.para}>
              {n.text}
            </Text>
          );
        }
        return (
          <View key={i} style={styles.li} wrap={false}>
            {n.n !== null ? (
              <Text style={styles.liNum}>{String(n.n).padStart(2, "0")}</Text>
            ) : (
              <View style={styles.liDash}>
                <View style={styles.dash} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              {n.title ? (
                <>
                  <Text style={styles.liTitle}>{n.title}</Text>
                  <Text style={styles.liSub}>{n.text}</Text>
                </>
              ) : (
                <Text style={styles.liBody}>{n.text}</Text>
              )}
            </View>
          </View>
        );
      })}
    </>
  );
}

export default function InvoicePDF({
  invoice,
  lineItems,
  client,
  logoSrc,
  paidStampSrc,
  unpaidStampSrc,
  partialStampSrc,
  cancelledStampSrc,
  signatureSrc,
  payments,
  doc,
}: {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  client: {
    full_name?: string | null;
    company_name?: string | null;
    email: string;
    billing_address?: string | null;
    phone?: string | null;
    tax_id?: string | null;
  };
  logoSrc?: string;
  paidStampSrc?: string;
  unpaidStampSrc?: string;
  partialStampSrc?: string;
  cancelledStampSrc?: string;
  /** @deprecated prefer doc.signature.imageSrc */
  signatureSrc?: string;
  /** @deprecated no longer shown; scope comes from doc.scope */
  project?: { title: string; description?: string | null } | null;
  /** Payments recorded against this invoice: shown as "Paid to date". */
  payments?: Payment[] | null;
  doc?: InvoiceDoc | null;
}) {
  // Totals are stored by the database (migration 010); the document only
  // displays them so it can never disagree with the invoice.
  const cc = invoice.currency || "UGX";
  const money = (n: number) => `${cc} ${Math.round(Number(n)).toLocaleString("en-US")}`;
  const subtotal = Number(invoice.subtotal);
  const taxRate = Number(invoice.tax_rate) || 0;
  const taxAmount = Number(invoice.tax_amount);
  const total = Number(invoice.total);
  const paid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const due = Math.max(0, total - paid);
  const dueLabel = paid > 0 ? "Balance due" : "Amount due";

  const stampKind = stampForStatus(invoice.status);
  const stampSrc =
    stampKind === "paid"
      ? paidStampSrc
      : stampKind === "partial"
        ? partialStampSrc
        : stampKind === "unpaid"
          ? unpaidStampSrc
          : stampKind === "cancelled"
            ? cancelledStampSrc
            : undefined;

  // Document sections: invoice-specific content wins, defaults fill gaps,
  // empty sections are not rendered.
  const scopeItems = doc?.scope?.items ?? [];
  const scopeParagraphs = doc?.scope?.paragraphs ?? [];
  const hasScope = !!doc?.scope && (scopeItems.length > 0 || scopeParagraphs.length > 0 || !!doc.scope.title);

  const usesDefaultTerms = doc?.paymentTerms == null;
  const paymentTerms = doc?.paymentTerms ?? DEFAULT_PAYMENT_TERMS;
  const termsLabel = doc?.paymentTermsLabel || "Payment Terms";
  const agreedTerms = !usesDefaultTerms && !!doc?.paymentTermsLabel;
  const schedule = usesDefaultTerms && total > 0 ? defaultScheduleAmounts(total) : null;
  const standardTerms = doc?.standardTerms ?? DEFAULT_STANDARD_TERMS;
  const additionalTerms = doc?.additionalTerms ?? [];
  const notes = doc?.projectNotes ?? DEFAULT_NOTES;
  const paymentMethods = doc?.paymentMethods ?? DEFAULT_PAYMENT_METHODS;
  const signature =
    doc && "signature" in doc ? doc.signature : signatureSrc ? { ...DEFAULT_SIGNATURE, imageSrc: signatureSrc } : null;

  const clientName = client.company_name || client.full_name || client.email;
  const clientLines = [
    client.company_name && client.full_name ? client.full_name : null,
    client.billing_address,
    client.email,
    client.phone,
    client.tax_id ? `Tax ID: ${client.tax_id}` : null,
  ].filter((v): v is string => !!v && v !== clientName);

  return (
    <Document title={`Invoice ${invoice.invoice_number}`} author={SCH_BRAND.name}>
      <Page size="A4" style={styles.page} wrap>
        {/* Running head on pages 2+ */}
        <View
          fixed
          style={styles.contHeader}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={styles.contInner}>
                <Text style={styles.contBrand}>{SCH_BRAND.name}</Text>
                <Text style={styles.contMeta}>Invoice {invoice.invoice_number}</Text>
              </View>
            ) : null
          }
        />

        {/* Header, page 1 */}
        <View style={styles.header} wrap={false}>
          <View>
            <View style={styles.brandRow}>
              {logoSrc && <Image style={styles.logo} src={logoSrc} />}
              <Text style={styles.brandName}>{SCH_BRAND.name}</Text>
            </View>
            <View style={styles.contact}>
              <Text>{SCH_BRAND.phone}</Text>
              <Text>{SCH_BRAND.email}</Text>
              <Text>{SCH_BRAND.website}</Text>
            </View>
          </View>
          <View style={styles.docBlock}>
            <Text style={styles.docTitle}>Invoice</Text>
            <Text style={styles.docNo}>
              No. <Text style={styles.docNoValue}>{invoice.invoice_number}</Text>
            </Text>
            {stampSrc ? <Image style={styles.stamp} src={stampSrc} /> : <Text style={styles.draft}>{invoice.status}</Text>}
          </View>
        </View>

        {/* Bill to · dates · amount due */}
        <View style={styles.meta} wrap={false}>
          <View style={[styles.metaCell, { flex: 1.5 }]}>
            <Text style={styles.label}>Bill To</Text>
            <Text style={styles.metaValue}>{clientName}</Text>
            {clientLines.map((l, i) => (
              <Text key={i} style={styles.metaSub}>
                {l}
              </Text>
            ))}
          </View>
          <View style={[styles.metaCell, styles.metaCellNext, { flex: 0.95 }]}>
            <Text style={styles.label}>Issue Date</Text>
            <Text style={styles.metaValue}>{fmtDate(invoice.issue_date)}</Text>
          </View>
          {invoice.due_date && (
            <View style={[styles.metaCell, styles.metaCellNext, { flex: 0.95 }]}>
              <Text style={styles.label}>Due Date</Text>
              <Text style={styles.metaValue}>{fmtDate(invoice.due_date)}</Text>
            </View>
          )}
          <View style={[styles.metaCell, styles.metaCellNext, { flex: 1.25, paddingRight: 0 }]}>
            <Text style={styles.label}>{dueLabel}</Text>
            <Text style={styles.metaDue}>{money(due)}</Text>
          </View>
        </View>

        {/* Scope of Work, immediately above the Investment table */}
        {hasScope && (
          <Section title="Scope of Work">
            {doc!.scope!.title && <Text style={styles.scopeTitle}>{doc!.scope!.title}</Text>}
            {scopeParagraphs.map((p, i) => (
              <Text key={i} style={styles.para}>
                {p}
              </Text>
            ))}
            <NumberedList items={scopeItems} />
          </Section>
        )}

        {/* Investment: the column header repeats on continuation pages */}
        <View style={styles.section} minPresenceAhead={90}>
          <Text style={styles.label}>Investment</Text>
        </View>
        <View>
          <View style={styles.tableHead} fixed>
            <Text style={[styles.cDesc, styles.th]}>Description</Text>
            <Text style={[styles.cQty, styles.th]}>Qty</Text>
            <Text style={[styles.cPrice, styles.th]}>Unit Price</Text>
            <Text style={[styles.cAmount, styles.th]}>Amount</Text>
          </View>
          {lineItems.slice(0, -1).map((item) => (
            <Row key={item.id} item={item} money={money} />
          ))}
          {/* The last row travels with the totals so they never sit alone on a page. */}
          <View wrap={false}>
            {lineItems.length > 0 && <Row item={lineItems[lineItems.length - 1]} money={money} />}
            <View style={styles.totals}>
          {taxRate > 0 && (
            <>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{money(subtotal)}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Tax ({taxRate}%)</Text>
                <Text style={styles.totalValue}>{money(taxAmount)}</Text>
              </View>
            </>
          )}
          <View style={styles.totalLine}>
            <Text style={styles.totalStrong}>Invoice total</Text>
            <Text style={styles.totalStrong}>{money(total)}</Text>
          </View>
          {paid > 0 && (
            <View style={[styles.totalLine, styles.totalSep]}>
              <Text style={styles.totalLabel}>Paid to date</Text>
              <Text style={styles.totalValue}>{money(paid)}</Text>
            </View>
          )}
          <View style={styles.grand}>
            <Text style={styles.grandLabel}>{dueLabel}</Text>
            <Text style={styles.grandValue}>{money(due)}</Text>
          </View>
            </View>
          </View>
        </View>

        {paymentMethods.length > 0 && (
          <Section title="Payment Details" keepTogether>
            <View style={styles.payCols}>
              {paymentMethods.map((m, i) => (
                <View key={i} style={i > 0 ? [styles.payCol, styles.payColNext] : styles.payCol}>
                  <Text style={styles.payTitle}>{m.label}</Text>
                  {m.fields.map((f, j) => (
                    <View key={j} style={styles.payRow}>
                      <Text style={styles.payLabel}>{f.label}</Text>
                      <Text style={styles.payValue}>{f.value}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Section>
        )}

        {notes.length > 0 && (
          <Section title="Notes">
            <Notes lines={notes} />
          </Section>
        )}

        {paymentTerms.length > 0 && (
          <Section title={termsLabel} keepTogether>
            {agreedTerms ? (
              <View style={styles.callout}>
                {paymentTerms.map((t, i) => (
                  <Text key={i} style={styles.calloutLine}>
                    {t}
                  </Text>
                ))}
              </View>
            ) : (
              <NumberedList items={paymentTerms} />
            )}
            {schedule && (
              <View style={styles.schedule}>
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{`Deposit (${DEFAULT_PAYMENT_SCHEDULE.depositPercent}%)`}</Text>
                  <Text style={styles.scheduleValue}>{money(schedule.deposit)}</Text>
                </View>
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{`Balance (${DEFAULT_PAYMENT_SCHEDULE.balancePercent}%)`}</Text>
                  <Text style={styles.scheduleValue}>{money(schedule.balance)}</Text>
                </View>
              </View>
            )}
          </Section>
        )}

        {additionalTerms.length > 0 && (
          <Section title="Additional Terms" keepTogether>
            <NumberedList items={additionalTerms} />
          </Section>
        )}

        {standardTerms.length > 0 && (
          <Section title="Standard Terms" keepTogether>
            <NumberedList items={standardTerms} />
          </Section>
        )}

        {signature && (signature.imageSrc || signature.name) && (
          <View style={styles.signWrap} wrap={false}>
            <View style={styles.sign}>
              <Text style={styles.label}>{signature.title || "Authorized by"}</Text>
              {signature.imageSrc ? <Image style={styles.signImage} src={signature.imageSrc} /> : <View style={{ height: 36 }} />}
              <View style={styles.signLine}>
                {signature.name && <Text style={styles.signName}>{signature.name}</Text>}
                {signature.company && <Text style={styles.signSub}>{signature.company}</Text>}
              </View>
            </View>
          </View>
        )}

        {/* Footer, every page */}
        <View fixed style={styles.footer}>
          <View style={styles.footLeft}>
            <View style={styles.footBar} />
            <Text style={styles.footBrand}>{SCH_BRAND.name}</Text>
            <Text style={styles.footText}>{SCH_BRAND.tagline}</Text>
          </View>
          <View style={styles.footRight}>
            <Text style={styles.footText}>{`${invoice.invoice_number}  ·  `}</Text>
            <Text style={styles.footText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

