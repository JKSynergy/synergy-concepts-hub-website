import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice, InvoiceLineItem, Payment } from "@/lib/types";

const C = {
  primary: "#1A2E5A",
  dark: "#0F172A",
  body: "#374151",
  muted: "#6B7280",
  border: "#E5E7EB",
  bgLight: "#F9FAFB",
  bgStripe: "#F3F4F6",
  white: "#FFFFFF",
  tableHead: "#1A2E5A",
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#1A2E5A", text: "#FFFFFF" },
  sent: { bg: "#EFF6FF", text: "#1E40AF" },
  paid: { bg: "#ECFDF5", text: "#065F46" },
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
  },
  content: {
    flex: 1,
    paddingHorizontal: 44,
    paddingTop: 36,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: "contain",
    marginRight: 12,
  },
  brandName: {
    fontSize: 13,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 3,
  },
  brandTagline: {
    fontSize: 8.5,
    color: C.muted,
    letterSpacing: 0.4,
  },
  brandContact: {
    fontSize: 8,
    color: C.body,
    marginTop: 4,
  },
  titleBlock: {
    alignItems: "flex-start",
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: C.primary,
    letterSpacing: 2,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 8.5,
    color: C.muted,
    marginRight: 8,
    minWidth: 58,
    textAlign: "left",
  },
  metaValue: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: C.dark,
    minWidth: 80,
    textAlign: "left",
  },
  badge: {
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 26,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  infoBlock: {
    width: "46%",
  },
  infoLabel: {
    fontSize: 7.5,
    color: C.primary,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  infoName: {
    fontSize: 13,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 5,
    lineHeight: 1.3,
  },
  infoSub: {
    fontSize: 9,
    color: C.body,
    marginBottom: 2,
    lineHeight: 1.5,
  },
  projectCard: {
    backgroundColor: C.bgLight,
    padding: 14,
    marginBottom: 26,
    borderLeftWidth: 3,
    borderLeftColor: C.primary,
  },
  sectionLabel: {
    fontSize: 7.5,
    color: C.primary,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 3,
  },
  sectionBody: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.5,
  },
  table: {
    marginBottom: 26,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: C.tableHead,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.white,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRowAlt: {
    backgroundColor: C.bgLight,
  },
  cellDesc: { flex: 3.2, paddingRight: 10 },
  cellQty: { flex: 0.8, textAlign: "right", paddingRight: 10 },
  cellPrice: { flex: 1.6, textAlign: "right", paddingRight: 10 },
  cellAmount: { flex: 1.6, textAlign: "right" },
  cellText: {
    fontSize: 9.5,
    color: C.body,
  },
  cellTextBold: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: C.dark,
  },
  cellDescText: {
    fontSize: 9.5,
    color: C.dark,
  },
  totalsSection: {
    alignItems: "flex-end",
    marginBottom: 28,
  },
  totalsCard: {
    width: 268,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 14,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  totalLabel: {
    fontSize: 8.5,
    color: C.muted,
  },
  totalValue: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: C.dark,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 6,
  },
  grandTotalLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.dark,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.primary,
  },
  paymentCard: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    backgroundColor: C.bgLight,
    padding: 16,
  },
  paymentCardTitle: {
    fontSize: 8,
    color: C.primary,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 12,
  },
  paymentCardBody: {
    flexDirection: "row",
  },
  paymentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bankIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  bankIconText: {
    fontSize: 16,
    color: "#6B7280",
  },
  bankDetails: {
    flex: 1,
  },
  bankDetailLabel: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 1,
  },
  bankDetailValue: {
    fontSize: 8.5,
    color: C.body,
    marginBottom: 5,
  },
  paymentCardDivider: {
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: 16,
  },
  notesCard: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    backgroundColor: C.bgLight,
    padding: 16,
  },
  notesTitle: {
    fontSize: 8,
    color: C.dark,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  notesBody: {
    fontSize: 9,
    color: C.body,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  termsCard: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    backgroundColor: C.bgLight,
    padding: 16,
  },
  termsTitle: {
    fontSize: 8,
    color: C.dark,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  termsBody: {
    fontSize: 9,
    color: C.body,
    lineHeight: 1.6,
    marginBottom: 4,
  },
  stampContainer: {
    marginTop: 14,
    alignItems: "flex-start",
  },
  stampImage: {
    width: 80,
    height: 80,
    objectFit: "contain",
  },
  signatureSection: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  signatureImage: {
    width: 160,
    height: 50,
    objectFit: "contain",
  },
  signatureName: {
    fontSize: 9,
    color: C.dark,
    fontWeight: "bold",
    marginTop: 4,
  },
  signatureTitle: {
    fontSize: 8,
    color: C.muted,
    marginBottom: 2,
  },
  footer: {
    paddingHorizontal: 44,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    alignItems: "center",
  },
  footerLeft: {
    flexDirection: "column",
    justifyContent: "center",
    flex: 1,
  },
  footerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.bgStripe,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  footerIconText: {
    fontSize: 11,
    color: C.muted,
  },
  footerBrand: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 2,
  },
  footerTagline: {
    fontSize: 8,
    color: C.muted,
    letterSpacing: 0.4,
  },
  footerVerticalDivider: {
    width: 1,
    height: 36,
    backgroundColor: C.border,
    marginHorizontal: 24,
  },
  footerRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  footerLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
    justifyContent: "flex-end",
  },
  footerLinkIcon: {
    fontSize: 9,
    color: C.muted,
    marginRight: 4,
  },
  footerLink: {
    fontSize: 8.5,
    color: C.muted,
    textAlign: "right",
  },
});

export default function InvoicePDF({
  invoice,
  lineItems,
  client,
  logoSrc,
  stampSrc,
  signatureSrc,
  project,
  payments,
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
  stampSrc?: string;
  signatureSrc?: string;
  project?: { title: string; description?: string | null } | null;
  payments?: Payment[] | null;
}) {
  const statusStyle = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;

  // Compute totals from line items directly — the stored invoice fields may be stale (0)
  // if line items were added after the invoice was created without a recalc trigger.
  const computedSubtotal = lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const displaySubtotal = invoice.subtotal > 0 ? Number(invoice.subtotal) : computedSubtotal;
  const displayTaxRate = Number(invoice.tax_rate) || 0;
  const displayTaxAmount =
    displayTaxRate > 0
      ? invoice.tax_amount > 0
        ? Number(invoice.tax_amount)
        : displaySubtotal * (displayTaxRate / 100)
      : 0;
  const displayTotal =
    invoice.total > 0 ? Number(invoice.total) : displaySubtotal + displayTaxAmount;
  const discount = Math.max(0, displaySubtotal + displayTaxAmount - displayTotal);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.brandBlock}>
              {logoSrc && <Image style={styles.logo} src={logoSrc} />}
              <View>
                <Text style={styles.brandName}>Synergy Concepts Hub</Text>
                <Text style={styles.brandTagline}>Where Ideas Come to Life</Text>
                <Text style={styles.brandContact}>Phone: +256706739311</Text>
                <Text style={styles.brandContact}>Email: synergyconceptshub@gmail.com</Text>
                <Text style={styles.brandContact}>Website: www.synergyconceptshub.com</Text>
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
              <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.badgeText, { color: statusStyle.text }]}>{invoice.status}</Text>
              </View>
              {invoice.status === "paid" && stampSrc && (
                <View style={styles.stampContainer}>
                  <Image style={styles.stampImage} src={stampSrc} />
                </View>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
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
              <Text style={styles.infoName}>Synergy Concepts Hub</Text>
              <Text style={styles.infoSub}>info@synergyconceptshub.com</Text>
              <Text style={styles.infoSub}>www.synergyconceptshub.com</Text>
            </View>
          </View>

          {project && (
            <View style={styles.projectCard}>
              <Text style={styles.sectionLabel}>Project Summary</Text>
              <Text style={styles.sectionTitle}>{project.title}</Text>
              {project.description && <Text style={styles.sectionBody}>{project.description}</Text>}
            </View>
          )}

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cellDesc, styles.tableHeaderCell]}>Description</Text>
              <Text style={[styles.cellQty, styles.tableHeaderCell]}>Qty</Text>
              <Text style={[styles.cellPrice, styles.tableHeaderCell]}>Unit Price</Text>
              <Text style={[styles.cellAmount, styles.tableHeaderCell]}>Amount</Text>
            </View>
            {lineItems.map((item, index) => (
              <View
                style={[styles.tableRow, index % 2 !== 0 ? styles.tableRowAlt : {}]}
                key={item.id}
              >
                <Text style={[styles.cellDesc, styles.cellDescText]}>{item.description}</Text>
                <Text style={[styles.cellQty, styles.cellText]}>{Number(item.quantity).toLocaleString()}</Text>
                <Text style={[styles.cellPrice, styles.cellText]}>UGX {Number(item.unit_price).toLocaleString()}</Text>
                <Text style={[styles.cellAmount, styles.cellTextBold]}>UGX {Number(item.amount).toLocaleString()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsSection}>
            <View style={styles.totalsCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>UGX {displaySubtotal.toLocaleString()}</Text>
              </View>
              {displayTaxRate > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tax ({displayTaxRate}%)</Text>
                  <Text style={styles.totalValue}>UGX {displayTaxAmount.toLocaleString()}</Text>
                </View>
              )}
              {discount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={styles.totalValue}>− UGX {discount.toLocaleString()}</Text>
                </View>
              )}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total Due</Text>
                <Text style={styles.grandTotalValue}>UGX {displayTotal.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          <View style={styles.paymentCard}>
            <Text style={styles.paymentCardTitle}>Payment Details</Text>
            <View style={styles.paymentCardBody}>
              <View style={styles.paymentRow}>
                <View style={styles.bankIconCircle}>
                  <Text style={styles.bankIconText}>H</Text>
                </View>
                <View style={styles.bankDetails}>
                  <Text style={styles.bankDetailLabel}>Account Name:</Text>
                  <Text style={styles.bankDetailValue}>Joseph Sengendo</Text>
                  <Text style={styles.bankDetailLabel}>Account Number:</Text>
                  <Text style={styles.bankDetailValue}>0100823802201</Text>
                  <Text style={styles.bankDetailLabel}>Bank:</Text>
                  <Text style={styles.bankDetailValue}>Standard Chartered Bank Uganda</Text>
                </View>
              </View>
              <View style={styles.paymentCardDivider} />
              <View style={styles.paymentRow}>
                <View style={styles.bankIconCircle}>
                  <Text style={styles.bankIconText}>A</Text>
                </View>
                <View style={styles.bankDetails}>
                  <Text style={styles.bankDetailLabel}>Airtel Money:</Text>
                  <Text style={styles.bankDetailValue}>0704 783 724</Text>
                  <Text style={styles.bankDetailLabel}>Account Name:</Text>
                  <Text style={styles.bankDetailValue}>Joseph Sengendo</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>Notes</Text>
            {invoice.notes?.trim() ? (
              <Text style={styles.notesBody}>{invoice.notes.trim()}</Text>
            ) : (
              <>
                <Text style={styles.notesBody}>Payment due by the due date.</Text>
                <Text style={styles.notesBody}>Thank you for your business.</Text>
              </>
            )}
          </View>

          <View style={styles.termsCard}>
            <Text style={styles.termsTitle}>Standard Terms</Text>
            <Text style={styles.termsBody}>• An 80% deposit is required before commencement of work unless otherwise agreed in writing.</Text>
            <Text style={styles.termsBody}>• The remaining 20% balance is payable upon project completion or prior to delivery of the final deliverables.</Text>
            <Text style={styles.termsBody}>• Please quote the invoice number as the payment reference for all transactions.</Text>
            <Text style={styles.termsBody}>• A remittance advice or proof of payment should be emailed to accounts@synergyconceptshub.com after payment.</Text>
            <Text style={styles.termsBody}>• All deliverables remain the property of Synergy Concepts Hub until full payment has been received.</Text>
            <Text style={styles.termsBody}>• We appreciate your business and look forward to serving you.</Text>
          </View>

          <View style={styles.signatureSection}>
            <Text style={styles.signatureTitle}>Authorized by</Text>
            {signatureSrc && <Image style={styles.signatureImage} src={signatureSrc} />}
            <Text style={styles.signatureName}>Joseph Sengendo</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerBrand}>Synergy Concepts Hub</Text>
            <Text style={styles.footerTagline}>Where Ideas Come to Life</Text>
          </View>
          <View style={styles.footerVerticalDivider} />
          <View style={styles.footerRight}>
            <Text style={styles.footerLink}>www.synergyconceptshub.com</Text>
            <Text style={styles.footerLink}>info@synergyconceptshub.com</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
