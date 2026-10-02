import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice, InvoiceLineItem, Payment } from "@/lib/types";
import {
  SCH_BRAND,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_STANDARD_TERMS,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_SIGNATURE,
  type InvoiceDoc,
} from "./invoice-doc";

const C = {
  navy: "#1A2E5A",
  dark: "#0F172A",
  body: "#374151",
  muted: "#6B7280",
  line: "#E5E7EB",
  bgLight: "#F9FAFB",
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

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.dark,
    backgroundColor: C.white,
    flexDirection: "column",
    paddingTop: 30,
    paddingBottom: 56,
  },
  content: {
    flex: 1,
    paddingHorizontal: 44,
  },

  // Page-1 header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  brandBlock: { flexDirection: "row", alignItems: "center" },
  logo: { width: 54, height: 54, objectFit: "contain", marginRight: 12 },
  brandName: { fontSize: 13, fontWeight: "bold", color: C.dark, marginBottom: 3 },
  brandTagline: { fontSize: 8.5, color: C.muted, letterSpacing: 0.4 },
  brandContact: { fontSize: 8, color: C.body, marginTop: 3 },
  titleBlock: { alignItems: "flex-end" },
  invoiceTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.navy,
    letterSpacing: 2,
    marginBottom: 12,
  },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  metaLabel: { fontSize: 8.5, color: C.muted, marginRight: 8, minWidth: 58, textAlign: "right" },
  metaValue: { fontSize: 8.5, fontWeight: "bold", color: C.dark, textAlign: "left" },
  statusText: {
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },

  // Compact continuation header (pages 2+)
  contHeader: {
    position: "absolute",
    top: 16,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  contBrand: { fontSize: 8.5, fontWeight: "bold", color: C.navy },
  contMeta: { fontSize: 8.5, color: C.muted },

  divider: { height: 1, backgroundColor: C.navy, marginBottom: 14 },
  thinRule: { height: 1, backgroundColor: C.line, marginVertical: 14 },

  // Bill To / From
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  infoBlock: { width: "46%" },
  infoLabel: {
    fontSize: 7.5,
    color: C.navy,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  infoName: { fontSize: 12.5, fontWeight: "bold", color: C.dark, marginBottom: 5, lineHeight: 1.3 },
  infoSub: { fontSize: 9, color: C.body, marginBottom: 2, lineHeight: 1.5 },

  // Sections
  section: { marginBottom: 13 },
  sectionHead: {
    fontSize: 8,
    color: C.navy,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sectionBody: { fontSize: 9.5, color: C.body, lineHeight: 1.55 },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 12, fontSize: 9.5, color: C.orange },
  bulletText: { flex: 1, fontSize: 9.5, color: C.body, lineHeight: 1.45 },
  scopeTitle: { fontSize: 10.5, fontWeight: "bold", color: C.dark, marginBottom: 5 },

  // Line items
  table: { marginBottom: 14 },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: C.navy,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  cellDesc: { flex: 3.2, paddingRight: 10 },
  cellQty: { flex: 0.8, textAlign: "right", paddingRight: 10 },
  cellPrice: { flex: 1.6, textAlign: "right", paddingRight: 10 },
  cellAmount: { flex: 1.6, textAlign: "right" },
  cellText: { fontSize: 9.5, color: C.body, lineHeight: 1.45 },
  cellTextBold: { fontSize: 9.5, fontWeight: "bold", color: C.dark },
  cellDescText: { fontSize: 9.5, color: C.dark, lineHeight: 1.45 },

  // Totals
  totalsSection: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  stampArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  stampImage: { width: 80, height: 80, objectFit: "contain" },
  totalsCard: { width: 270 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 8.5, color: C.muted },
  totalValue: { fontSize: 8.5, fontWeight: "bold", color: C.dark },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: C.navy,
    marginTop: 6,
  },
  grandTotalLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.dark,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  grandTotalValue: { fontSize: 14, fontWeight: "bold", color: C.navy },

  // Payment details — flat ruled block, not a card
  paymentBlock: { marginBottom: 13 },
  paymentMethods: { flexDirection: "row", flexWrap: "wrap" },
  paymentMethod: { width: "46%", marginRight: "4%", marginBottom: 8 },
  paymentMethodTitle: { fontSize: 9, fontWeight: "bold", color: C.dark, marginBottom: 3 },
  paymentField: { fontSize: 8.5, color: C.body, marginBottom: 2 },

  // Signature
  signatureSection: { marginTop: 2, alignItems: "flex-end" },
  signatureBlock: { alignItems: "center" },
  signatureImage: { width: 110, height: 32, objectFit: "contain" },
  signatureLine: { width: 160, borderBottomWidth: 1, borderBottomColor: C.line, marginTop: 2, marginBottom: 4 },
  signatureName: { fontSize: 9, color: C.dark, fontWeight: "bold", marginTop: 2 },
  signatureTitle: { fontSize: 8, color: C.muted, marginTop: 2 },

  // Footer (every page)
  footer: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerBrand: { fontSize: 8.5, color: C.muted },
  footerPage: { fontSize: 8.5, color: C.muted, textAlign: "right" },
});

function SectionList({ items }: { items: string[] }) {
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

  const paymentTerms = doc?.paymentTerms ?? DEFAULT_PAYMENT_TERMS;
  const standardTerms = doc?.standardTerms ?? DEFAULT_STANDARD_TERMS;
  const additionalTerms = doc?.additionalTerms ?? [];
  const projectNotes = doc?.projectNotes ?? [];
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
            <>
              <Text style={styles.contBrand}>{SCH_BRAND.name}</Text>
              <Text style={styles.contMeta}>Invoice {invoice.invoice_number}</Text>
            </>
          ) : null
        } />

        <View style={styles.content}>
          {/* Full header — page 1 only (flows, not fixed) */}
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
              <Text style={[styles.statusText, { backgroundColor: statusStyle.bg, color: statusStyle.text }]}>
                {invoice.status}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow} wrap={false}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Bill To</Text>
              <Text style={styles.infoName}>{client.company_name || client.full_name || client.email}</Text>
              {client.billing_address && <Text style={styles.infoSub}>{client.billing_address}</Text>}
              <Text style={styles.infoSub}>{client.email}</Text>
              {client.phone && <Text style={styles.infoSub}>{client.phone}</Text>}
              {client.tax_id && <Text style={styles.infoSub}>Tax ID: {client.tax_id}</Text>}
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>From</Text>
              <Text style={styles.infoName}>{SCH_BRAND.name}</Text>
              <Text style={styles.infoSub}>{SCH_BRAND.email}</Text>
              <Text style={styles.infoSub}>{SCH_BRAND.website}</Text>
            </View>
          </View>

          {/* Scope of Work — before the pricing table */}
          {hasScope && (
            <View style={styles.section} minPresenceAhead={40}>
              <Text style={styles.sectionHead}>Scope of Work</Text>
              {doc!.scope!.title && <Text style={styles.scopeTitle}>{doc!.scope!.title}</Text>}
              {scopeParagraphs.map((p, i) => (
                <Text key={i} style={styles.sectionBody}>{p}</Text>
              ))}
              <SectionList items={scopeItems} />
            </View>
          )}

          {/* Services / Fees — header repeats on continuation pages */}
          <View style={styles.table}>
            <View style={styles.tableHeader} fixed>
              <Text style={[styles.cellDesc, styles.tableHeaderCell]}>Description</Text>
              <Text style={[styles.cellQty, styles.tableHeaderCell]}>Qty</Text>
              <Text style={[styles.cellPrice, styles.tableHeaderCell]}>Unit Price</Text>
              <Text style={[styles.cellAmount, styles.tableHeaderCell]}>Amount</Text>
            </View>
            {lineItems.map((item) => (
              <View style={styles.tableRow} key={item.id} wrap={false}>
                <Text style={[styles.cellDesc, styles.cellDescText]}>{item.description}</Text>
                <Text style={[styles.cellQty, styles.cellText]}>{Number(item.quantity).toLocaleString()}</Text>
                <Text style={[styles.cellPrice, styles.cellText]}>{money(item.unit_price)}</Text>
                <Text style={[styles.cellAmount, styles.cellTextBold]}>{money(item.amount)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsSection} wrap={false}>
            <View style={styles.stampArea}>
              {stampImageSrc && <Image style={styles.stampImage} src={stampImageSrc} />}
            </View>
            <View style={styles.totalsCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{money(displaySubtotal)}</Text>
              </View>
              {displayTaxRate > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tax ({displayTaxRate}%)</Text>
                  <Text style={styles.totalValue}>{money(displayTaxAmount)}</Text>
                </View>
              )}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total Due</Text>
                <Text style={styles.grandTotalValue}>{money(displayTotal)}</Text>
              </View>
            </View>
          </View>

          {paymentMethods.length > 0 && (
            <View style={styles.paymentBlock} wrap={false}>
              <Text style={styles.sectionHead}>Payment Details</Text>
              <View style={styles.paymentMethods}>
                {paymentMethods.map((m, i) => (
                  <View key={i} style={styles.paymentMethod}>
                    <Text style={styles.paymentMethodTitle}>{m.label}</Text>
                    {m.fields.map((f, j) => (
                      <Text key={j} style={styles.paymentField}>
                        <Text style={{ color: C.muted }}>{f.label}: </Text>{f.value}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )}

          {projectNotes.length > 0 && (
            <View style={styles.section} minPresenceAhead={40}>
              <Text style={styles.sectionHead}>Project Notes</Text>
              <SectionList items={projectNotes} />
            </View>
          )}

          {paymentTerms.length > 0 && (
            <View style={styles.section} minPresenceAhead={40}>
              <Text style={styles.sectionHead}>Payment Terms</Text>
              <SectionList items={paymentTerms} />
            </View>
          )}

          {additionalTerms.length > 0 && (
            <View style={styles.section} minPresenceAhead={40}>
              <Text style={styles.sectionHead}>Additional Terms</Text>
              <SectionList items={additionalTerms} />
            </View>
          )}

          {standardTerms.length > 0 && (
            <View style={styles.section} minPresenceAhead={40}>
              <Text style={styles.sectionHead}>Standard Terms</Text>
              <SectionList items={standardTerms} />
            </View>
          )}

          {signature && (signature.imageSrc || signature.name) && (
            <View style={styles.signatureSection} wrap={false}>
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
        </View>

        {/* Footer — every page */}
        <View fixed style={styles.footer}>
          <Text style={styles.footerBrand}>
            {SCH_BRAND.name} · {SCH_BRAND.tagline} · {SCH_BRAND.website} · {SCH_BRAND.email}
          </Text>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
