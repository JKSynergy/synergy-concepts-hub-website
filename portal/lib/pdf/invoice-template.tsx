import {
  Document,
  Font,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Path,
  Rect,
  Line,
} from "@react-pdf/renderer";
import { Fragment, type ReactNode } from "react";
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
  type InvoiceDoc,
} from "./invoice-doc";

// Visual foundation: invoice SCH-2026-0005. Hierarchy comes from typography,
// whitespace and hairline rules; supporting sections sit on the Portal's
// off-white (--ux-stone) as flat, borderless, sharp-cornered panels.
const C = {
  navy: "#1A2E5A",
  dark: "#0F172A",
  body: "#374151",
  muted: "#6B7280",
  hairline: "#E5E7EB",
  rowRule: "#EEF0F3",
  stone: "#F4F3F0",
  stoneLine: "#E1DFDA",
  white: "#FFFFFF",
  orange: "#ED8C22",
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F3F4F6", text: "#374151" },
  sent: { bg: "#EFF6FF", text: "#1E40AF" },
  paid: { bg: "#ECFDF5", text: "#065F46" },
  "partially paid": { bg: "#FEF3C7", text: "#92400E" },
  overdue: { bg: "#FEF2F2", text: "#991B1B" },
  cancelled: { bg: "#F3F4F6", text: "#9CA3AF" },
};

const PAGE_X = 48;

// Wrap whole words only — no mid-word hyphenation in descriptions or terms.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.dark,
    backgroundColor: C.white,
    paddingTop: 60,
    paddingBottom: 72,
    paddingHorizontal: PAGE_X,
  },

  // Header (page 1)
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandBlock: { flexDirection: "row", alignItems: "center" },
  logo: { width: 60, height: 60, objectFit: "contain", marginRight: 14 },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.dark, marginBottom: 3 },
  brandTagline: { fontSize: 8.5, color: C.muted, letterSpacing: 0.4, marginBottom: 5 },
  brandContact: { fontSize: 8, color: C.body, lineHeight: 1.55 },
  titleBlock: { alignItems: "flex-start", minWidth: 170 },
  invoiceTitle: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.navy, letterSpacing: 3 },
  accentRule: { width: 28, height: 1.5, backgroundColor: C.orange, marginTop: 6, marginBottom: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  metaLabel: { fontSize: 8.5, color: C.muted, width: 64 },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.dark },
  status: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },

  // Continuation header (pages 2+)
  contHeader: { position: "absolute", top: 22, left: PAGE_X, right: PAGE_X },
  contInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
  },
  contBrand: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.navy },
  contMeta: { fontSize: 8.5, color: C.muted },

  rule: { height: 0.5, backgroundColor: C.hairline, marginTop: 18, marginBottom: 20 },

  // Bill To / From
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  infoBlock: { width: "46%" },
  infoName: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: C.dark, marginBottom: 5, lineHeight: 1.3 },
  infoSub: { fontSize: 9, color: C.body, lineHeight: 1.55 },

  // Sections
  section: { marginBottom: 22 },
  panel: { backgroundColor: C.stone, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 14 },
  panelRule: { height: 0.5, backgroundColor: C.stoneLine, marginTop: 7, marginBottom: 10 },
  label: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  labelRule: { height: 0.5, backgroundColor: C.hairline, marginTop: 7, marginBottom: 10 },
  line: { fontSize: 9.5, color: C.body, lineHeight: 1.5, marginBottom: 1 },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 12, fontSize: 9, color: C.muted, lineHeight: 1.55 },
  bulletText: { flex: 1, fontSize: 9, color: C.body, lineHeight: 1.55 },
  scopeTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.dark, marginBottom: 5 },

  // Investment table
  tableHead: {
    flexDirection: "row",
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: C.navy,
  },
  th: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.stoneLine,
  },
  trAlt: { backgroundColor: C.stone },
  cDesc: { flex: 4, paddingRight: 12 },
  cQty: { flex: 0.5, textAlign: "right", paddingRight: 12 },
  cPrice: { flex: 1.45, textAlign: "right", paddingRight: 12 },
  cAmount: { flex: 1.45, textAlign: "right" },
  td: { fontSize: 9.5, color: C.body, lineHeight: 1.45 },
  tdDesc: { fontSize: 9.5, color: C.dark, lineHeight: 1.45 },
  tdAmount: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.dark },

  // Totals (beside the stamp, as on SCH-2026-0005)
  totalsRow: { flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 26 },
  stampArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  stamp: { width: 68, height: 68, objectFit: "contain", transform: "rotate(12deg)", opacity: 0.82 },
  totals: { width: 250 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 8.5, color: C.muted },
  totalValue: { fontSize: 9, color: C.dark },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 0.75,
    borderTopColor: C.navy,
  },
  grandLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  grandValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.navy },

  // Payment details
  payCols: { flexDirection: "row" },
  payCol: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  payDivider: { width: 0.5, backgroundColor: C.stoneLine, marginHorizontal: 14 },
  payIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  payBody: { flex: 1 },
  payTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.dark, marginBottom: 6 },
  payRow: { flexDirection: "row", marginBottom: 3 },
  payLabel: { fontSize: 8.5, color: C.muted, width: 72 },
  payValue: { fontSize: 8.5, color: C.dark, flex: 1 },

  // Payment schedule amounts
  schedule: { marginTop: 6, width: 260 },
  scheduleRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  scheduleLabel: { fontSize: 9, color: C.body },
  scheduleValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.dark },

  // Signature
  signature: { alignItems: "flex-end", marginTop: 6 },
  signatureBlock: { alignItems: "center" },
  signatureImage: { width: 150, height: 46, objectFit: "contain" },
  signatureLine: { width: 160, height: 0.5, backgroundColor: C.muted, marginTop: 2, marginBottom: 5 },
  signatureName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.dark },
  signatureTitle: { fontSize: 8, color: C.muted, marginTop: 2 },

  // Footer (every page)
  footer: {
    position: "absolute",
    bottom: 24,
    left: PAGE_X,
    right: PAGE_X,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: C.hairline,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerBrand: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.dark, marginBottom: 2 },
  footerText: { fontSize: 8, color: C.muted },
  footerRight: { alignItems: "flex-end" },
});

function Section({
  title,
  children,
  keepTogether = false,
  panel = false,
}: {
  title: string;
  children: ReactNode;
  keepTogether?: boolean;
  /** Flat off-white background (no border, sharp corners). */
  panel?: boolean;
}) {
  return (
    <View style={panel ? styles.panel : styles.section} wrap={!keepTogether} minPresenceAhead={60}>
      <Text style={styles.label}>{title}</Text>
      <View style={panel ? styles.panelRule : styles.labelRule} />
      {children}
    </View>
  );
}

/** Simple navy line icons for the payment methods. */
function PayIcon({ kind }: { kind?: "bank" | "mobile" }) {
  if (!kind) return null;
  const stroke = { stroke: C.navy, strokeWidth: 1.2, fill: "none" } as const;
  return (
    <View style={styles.payIcon}>
      <Svg width={16} height={16} viewBox="0 0 16 16">
        {kind === "bank" ? (
          <>
            <Path d="M2 6 L8 2.5 L14 6 Z" {...stroke} strokeLinejoin="round" />
            <Line x1={4} y1={7.5} x2={4} y2={12} {...stroke} />
            <Line x1={8} y1={7.5} x2={8} y2={12} {...stroke} />
            <Line x1={12} y1={7.5} x2={12} y2={12} {...stroke} />
            <Line x1={2} y1={13.5} x2={14} y2={13.5} {...stroke} />
          </>
        ) : (
          <>
            <Rect x={4.5} y={1.5} width={7} height={13} rx={1.2} {...stroke} />
            <Line x1={7} y1={12.2} x2={9} y2={12.2} {...stroke} />
          </>
        )}
      </Svg>
    </View>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <Text key={i} style={styles.line}>{item}</Text>
      ))}
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow} wrap={false}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
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
  project,
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
  project?: { title: string; description?: string | null } | null;
  /** @deprecated unused — kept in signature for the caller */
  payments?: Payment[] | null;
  doc?: InvoiceDoc | null;
}) {
  const statusStyle = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;

  // Totals are stored by the database (migration 010); the document only
  // displays them so it can never disagree with the invoice.
  const cc = invoice.currency || "UGX";
  const money = (n: number) => `${cc} ${Math.round(Number(n)).toLocaleString("en-US")}`;
  const displaySubtotal = Number(invoice.subtotal);
  const displayTaxRate = Number(invoice.tax_rate) || 0;
  const displayTaxAmount = Number(invoice.tax_amount);
  const displayTotal = Number(invoice.total);

  const stampImageSrc =
    invoice.status === "paid" && paidStampSrc
      ? paidStampSrc
      : invoice.status === "partially paid" && partialStampSrc
      ? partialStampSrc
      : (invoice.status === "sent" || invoice.status === "overdue") && unpaidStampSrc
      ? unpaidStampSrc
      : invoice.status === "cancelled" && cancelledStampSrc
      ? cancelledStampSrc
      : null;

  // Document sections — invoice-specific content wins; defaults fill gaps;
  // empty sections are simply not rendered.
  const scopeItems = doc?.scope?.items ?? [];
  const scopeParagraphs = doc?.scope?.paragraphs ?? [];
  const hasScope = !!doc?.scope && (scopeItems.length > 0 || scopeParagraphs.length > 0 || !!doc.scope.title);

  const usesDefaultTerms = doc?.paymentTerms == null;
  const paymentTerms = doc?.paymentTerms ?? DEFAULT_PAYMENT_TERMS;
  const schedule = usesDefaultTerms && displayTotal > 0 ? defaultScheduleAmounts(displayTotal) : null;
  const standardTerms = doc?.standardTerms ?? DEFAULT_STANDARD_TERMS;
  const additionalTerms = doc?.additionalTerms ?? [];
  const notes = doc?.projectNotes ?? DEFAULT_NOTES;
  const paymentMethods = doc?.paymentMethods ?? DEFAULT_PAYMENT_METHODS;
  const signature = doc && "signature" in doc
    ? doc.signature
    : signatureSrc
      ? { ...DEFAULT_SIGNATURE, imageSrc: signatureSrc }
      : null;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Compact continuation header on pages 2+ */}
        <View fixed style={styles.contHeader} render={({ pageNumber }) =>
          pageNumber > 1 ? (
            <View style={styles.contInner}>
              <Text style={styles.contBrand}>{SCH_BRAND.name}</Text>
              <Text style={styles.contMeta}>Invoice {invoice.invoice_number}</Text>
            </View>
          ) : null
        } />

        {/* Header — page 1 only (flows, not fixed) */}
        <View style={styles.header} wrap={false}>
          <View style={styles.brandBlock}>
            {logoSrc && <Image style={styles.logo} src={logoSrc} />}
            <View>
              <Text style={styles.brandName}>{SCH_BRAND.name}</Text>
              <Text style={styles.brandTagline}>{SCH_BRAND.tagline}</Text>
              <Text style={styles.brandContact}>Phone: {SCH_BRAND.phone}</Text>
              <Text style={styles.brandContact}>Email: {SCH_BRAND.email}</Text>
              <Text style={styles.brandContact}>Website: {SCH_BRAND.website}</Text>
            </View>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.accentRule} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice #</Text>
              <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Issue Date</Text>
              <Text style={styles.metaValue}>{invoice.issue_date}</Text>
            </View>
            {invoice.due_date && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due Date</Text>
                <Text style={styles.metaValue}>{invoice.due_date}</Text>
              </View>
            )}
            <Text style={[styles.status, { backgroundColor: statusStyle.bg, color: statusStyle.text }]}>
              {invoice.status}
            </Text>
          </View>
        </View>

        <View style={styles.rule} />

        {/* Bill To / From */}
        <View style={styles.infoRow} wrap={false}>
          <View style={styles.infoBlock}>
            <Text style={styles.label}>Bill To</Text>
            <View style={styles.labelRule} />
            <Text style={styles.infoName}>{client.company_name || client.full_name || client.email}</Text>
            {client.billing_address && <Text style={styles.infoSub}>{client.billing_address}</Text>}
            <Text style={styles.infoSub}>{client.email}</Text>
            {client.phone && <Text style={styles.infoSub}>{client.phone}</Text>}
            {client.tax_id && <Text style={styles.infoSub}>Tax ID: {client.tax_id}</Text>}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.label}>From</Text>
            <View style={styles.labelRule} />
            <Text style={styles.infoName}>{SCH_BRAND.name}</Text>
            <Text style={styles.infoSub}>{SCH_BRAND.email}</Text>
            <Text style={styles.infoSub}>{SCH_BRAND.website}</Text>
          </View>
        </View>

        {/* Scope of Work — immediately above the Investment table */}
        {hasScope && (
          <Section title="Scope of Work">
            {doc!.scope!.title && <Text style={styles.scopeTitle}>{doc!.scope!.title}</Text>}
            <Lines items={scopeParagraphs} />
            <Lines items={scopeItems} />
          </Section>
        )}

        {/* Investment — column header repeats on continuation pages */}
        <View minPresenceAhead={80}>
          <Text style={styles.label}>Investment</Text>
        </View>
        <View>
          <View style={styles.tableHead} fixed>
            <Text style={[styles.cDesc, styles.th]}>Description</Text>
            <Text style={[styles.cQty, styles.th]}>Qty</Text>
            <Text style={[styles.cPrice, styles.th]}>Unit Price</Text>
            <Text style={[styles.cAmount, styles.th]}>Amount</Text>
          </View>
          {lineItems.map((item, index) => (
            <View style={[styles.tr, index % 2 === 1 ? styles.trAlt : {}]} key={item.id} wrap={false}>
              <Text style={[styles.cDesc, styles.tdDesc]}>{item.description}</Text>
              <Text style={[styles.cQty, styles.td]}>{Number(item.quantity).toLocaleString()}</Text>
              <Text style={[styles.cPrice, styles.td]}>{money(item.unit_price)}</Text>
              <Text style={[styles.cAmount, styles.tdAmount]}>{money(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow} wrap={false}>
          <View style={styles.stampArea}>
            {stampImageSrc && <Image style={styles.stamp} src={stampImageSrc} />}
          </View>
          <View style={styles.totals}>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{money(displaySubtotal)}</Text>
            </View>
            {displayTaxRate > 0 && (
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Tax ({displayTaxRate}%)</Text>
                <Text style={styles.totalValue}>{money(displayTaxAmount)}</Text>
              </View>
            )}
            <View style={styles.grandTotal}>
              <Text style={styles.grandLabel}>Total Due</Text>
              <Text style={styles.grandValue}>{money(displayTotal)}</Text>
            </View>
          </View>
        </View>

        {paymentMethods.length > 0 && (
          <Section title="Payment Details" keepTogether panel>
            <View style={styles.payCols}>
              {paymentMethods.map((m, i) => (
                <Fragment key={i}>
                  {i > 0 && <View style={styles.payDivider} />}
                  <View
                    style={[
                      styles.payCol,
                      // Wider column for longer values (e.g. the bank name) so they stay on one line.
                      { flex: Math.max(1, Math.max(...m.fields.map((f) => f.value.length)) / 22) },
                    ]}
                  >
                    <PayIcon kind={m.icon} />
                    <View style={styles.payBody}>
                      <Text style={styles.payTitle}>{m.label}</Text>
                      {m.fields.map((f, j) => (
                        <View key={j} style={styles.payRow}>
                          <Text style={styles.payLabel}>{f.label}</Text>
                          <Text style={styles.payValue}>{f.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </Fragment>
              ))}
            </View>
          </Section>
        )}

        {notes.length > 0 && (
          <Section title="Notes" keepTogether panel>
            <Lines items={notes} />
          </Section>
        )}

        {paymentTerms.length > 0 && (
          <Section title="Payment Terms" keepTogether panel>
            <Bullets items={paymentTerms} />
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
          <Section title="Additional Terms" keepTogether panel>
            <Bullets items={additionalTerms} />
          </Section>
        )}

        {standardTerms.length > 0 && (
          <Section title="Standard Terms" keepTogether panel>
            <Bullets items={standardTerms} />
          </Section>
        )}

        {signature && (signature.imageSrc || signature.name) && (
          <View style={styles.signature} wrap={false}>
            <View style={styles.signatureBlock}>
              {signature.imageSrc && <Image style={styles.signatureImage} src={signature.imageSrc} />}
              <View style={styles.signatureLine} />
              {signature.name && <Text style={styles.signatureName}>{signature.name}</Text>}
              {(signature.title || signature.company) && (
                <Text style={styles.signatureTitle}>
                  {[signature.title, signature.company].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Footer — every page */}
        <View fixed style={styles.footer}>
          <View>
            <Text style={styles.footerBrand}>{SCH_BRAND.name}</Text>
            <Text style={styles.footerText}>{SCH_BRAND.tagline}</Text>
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.footerText}>{SCH_BRAND.website} · {SCH_BRAND.email}</Text>
            <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
