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
  navy: "#0B1628",
  navyMid: "#1A2E5A",
  dark: "#111827",
  body: "#374151",
  muted: "#6B7280",
  line: "#D6D8DD",
  lineDark: "#1A2E5A",
  white: "#FFFFFF",
  orange: "#ED8C22",
  bgLight: "#F7F7F5",
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
    paddingTop: 32,
    paddingBottom: 44,
    paddingHorizontal: 44,
  },

  // Page-1 hero header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: C.lineDark,
  },
  brandBlock: {},
  brandName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  brandTagline: {
    fontSize: 9.5,
    color: C.muted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  brandContact: {
    fontSize: 8.5,
    color: C.body,
    lineHeight: 1.5,
  },
  titleBlock: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 34,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    letterSpacing: 3,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 8.5,
    color: C.muted,
    textAlign: "right",
    width: 72,
    marginRight: 10,
  },
  metaValue: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    textAlign: "right",
    width: 100,
  },
  statusBadge: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    textAlign: "center",
  },

  // Continuation header (pages 2+)
  contHeader: {
    position: "absolute",
    top: 20,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  contBrand: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  contMeta: {
    fontSize: 9,
    color: C.muted,
  },

  // Client
  clientSection: {
    marginBottom: 12,
  },
  clientLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  clientName: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    marginBottom: 4,
  },
  clientSub: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.6,
    marginBottom: 2,
  },

  // Section headings
  section: {
    marginBottom: 10,
  },
  sectionHead: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sectionBody: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.6,
  },
  scopeTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 5,
    paddingLeft: 2,
  },
  bulletDot: {
    width: 14,
    fontSize: 9,
    color: C.orange,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.55,
  },

  // Investment table
  table: {
    marginBottom: 18,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    borderTopWidth: 2,
    borderTopColor: C.navy,
    borderBottomWidth: 1,
    borderBottomColor: C.navy,
    backgroundColor: C.bgLight,
  },
  tableHeaderCell: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
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
  cellDesc: { flex: 3.4, paddingRight: 14 },
  cellQty: { flex: 0.7, textAlign: "right", paddingRight: 10 },
  cellPrice: { flex: 1.5, textAlign: "right", paddingRight: 10 },
  cellAmount: { flex: 1.6, textAlign: "right" },
  cellText: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.45,
  },
  cellTextBold: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  cellDescText: {
    fontSize: 9.5,
    color: C.dark,
    lineHeight: 1.45,
  },

  // Total
  totalBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: C.navy,
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  totalValue: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  stampImage: {
    width: 76,
    height: 76,
    objectFit: "contain",
    marginRight: 14,
  },

  // Payment details
  paymentGrid: {
    flexDirection: "row",
    gap: 18,
  },
  paymentMethod: {
    flex: 1,
  },
  paymentMethodTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  paymentLabel: {
    fontSize: 8.5,
    color: C.muted,
    marginRight: 8,
  },
  paymentValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    textAlign: "right",
    flex: 1,
  },

  // Signature
  signatureSection: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  signatureImage: {
    width: 130,
    height: 40,
    objectFit: "contain",
    marginBottom: 4,
  },
  signatureLine: {
    width: 180,
    borderBottomWidth: 1,
    borderBottomColor: C.lineDark,
    marginBottom: 6,
  },
  signatureName: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  signatureTitle: {
    fontSize: 8.5,
    color: C.muted,
    marginTop: 2,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 16,
    left: 44,
    right: 44,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerBrand: {
    fontSize: 8.5,
    color: C.muted,
  },
  footerPage: {
    fontSize: 8.5,
    color: C.muted,
    textAlign: "right",
  },

  // Page-2 deliberate continuation title
  continuationTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
});

function SectionList({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow} wrap={false}>
          <Text style={styles.bulletDot}>▸</Text>
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

  const continuationSections = [
    { title: "Project Notes", items: projectNotes },
    { title: "Payment Terms", items: paymentTerms },
    { title: "Additional Terms", items: additionalTerms },
    { title: "Standard Terms", items: standardTerms },
  ].filter((s) => s.items.length > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Continuation header on pages 2+ */}
        <View fixed style={styles.contHeader} render={({ pageNumber }) =>
          pageNumber > 1 ? (
            <>
              <Text style={styles.contBrand}>{SCH_BRAND.name}</Text>
              <Text style={styles.contMeta}>Invoice {invoice.invoice_number}</Text>
            </>
          ) : null
        } />

        {/* Hero header */}
        <View style={styles.header} wrap={false}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>{SCH_BRAND.name}</Text>
            <Text style={styles.brandTagline}>Technology • Creative</Text>
            <Text style={styles.brandContact}>{SCH_BRAND.email}</Text>
            <Text style={styles.brandContact}>{SCH_BRAND.website}</Text>
            <Text style={styles.brandContact}>Phone: {SCH_BRAND.phone}</Text>
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
            <Text
              style={[
                styles.statusBadge,
                { backgroundColor: statusStyle.bg, color: statusStyle.text },
              ]}
            >
              {invoice.status}
            </Text>
          </View>
        </View>

        {/* Client */}
        <View style={styles.clientSection} wrap={false}>
          <Text style={styles.clientLabel}>Bill To</Text>
          <Text style={styles.clientName}>{client.company_name || client.full_name || client.email}</Text>
          {client.billing_address && <Text style={styles.clientSub}>{client.billing_address}</Text>}
          <Text style={styles.clientSub}>{client.email}</Text>
          {client.phone && <Text style={styles.clientSub}>{client.phone}</Text>}
          {client.tax_id && <Text style={styles.clientSub}>Tax ID: {client.tax_id}</Text>}
        </View>

        {/* Scope of Work — before the investment table */}
        {hasScope && (
          <View style={styles.section} minPresenceAhead={60}>
            <Text style={styles.sectionHead}>Scope of Work</Text>
            {doc!.scope!.title && <Text style={styles.scopeTitle}>{doc!.scope!.title}</Text>}
            {scopeParagraphs.map((p, i) => (
              <Text key={i} style={styles.sectionBody}>{p}</Text>
            ))}
            <SectionList items={scopeItems} />
          </View>
        )}

        {/* Investment / line items */}
        <View style={styles.section}>
          <Text style={styles.sectionHead}>Investment</Text>
        </View>
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

        {/* Total Due focal band */}
        <View style={styles.totalBand} wrap={false}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            {stampImageSrc && <Image style={styles.stampImage} src={stampImageSrc} />}
            <View>
              <Text style={styles.totalLabel}>Total Due</Text>
              {displayTaxRate > 0 && (
                <Text style={{ fontSize: 8, color: "#CBD5E1", marginTop: 2 }}>
                  Includes {money(displayTaxAmount)} tax ({displayTaxRate}%)
                </Text>
              )}
            </View>
          </View>
          <Text style={styles.totalValue}>{money(displayTotal)}</Text>
        </View>

        {/* Payment details */}
        {paymentMethods.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionHead}>Payment Details</Text>
            <View style={styles.paymentGrid}>
              {paymentMethods.map((m, i) => (
                <View key={i} style={styles.paymentMethod}>
                  <Text style={styles.paymentMethodTitle}>{m.label}</Text>
                  {m.fields.map((f, j) => (
                    <View key={j} style={styles.paymentRow}>
                      <Text style={styles.paymentLabel}>{f.label}</Text>
                      <Text style={styles.paymentValue}>{f.value}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {continuationSections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionHead}>{s.title}</Text>
            <SectionList items={s.items} />
          </View>
        ))}

        {signature && (signature.imageSrc || signature.name) && (
          <View style={styles.signatureSection} wrap={false}>
            <View style={{ alignItems: "flex-end" }}>
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

        {/* Footer */}
        <View fixed style={styles.footer}>
          <Text style={styles.footerBrand}>
            {SCH_BRAND.name} · Technology • Creative · {SCH_BRAND.website} · {SCH_BRAND.email}
          </Text>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
