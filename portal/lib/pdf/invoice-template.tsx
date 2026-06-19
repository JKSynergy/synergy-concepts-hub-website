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
  primary: "#D97706",
  secondary: "#2563EB",
  neutral: "#111827",
  gray: "#D1D5DB",
  grayLight: "#F3F4F6",
  grayText: "#6B7280",
  white: "#FFFFFF",
  darkBg: "#1F2937",
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F3F4F6", text: "#6B7280" },
  sent: { bg: "#EFF6FF", text: "#1E73BE" },
  paid: { bg: "#ECFDF5", text: "#059669" },
  overdue: { bg: "#FEF2F2", text: "#DC2626" },
  cancelled: { bg: "#F3F4F6", text: "#9CA3AF" },
};

const PAYMENT_LABEL: Record<string, string> = {
  paystack: "Paystack",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingTop: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.neutral,
    lineHeight: 1.35,
    flexDirection: "column",
  },
  content: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  brandBlock: { flexDirection: "row", alignItems: "center" },
  logo: { width: 56, height: 56, objectFit: "contain", marginRight: 14 },
  brandName: { fontSize: 16, fontWeight: "bold", color: C.neutral, marginBottom: 3 },
  brandTagline: { fontSize: 9, color: C.grayText, letterSpacing: 0.5 },
  titleBlock: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 28, fontWeight: "bold", color: C.neutral, letterSpacing: 3, marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  metaLabel: { width: 80, fontSize: 10, color: C.grayText, textAlign: "right", marginRight: 10 },
  metaValue: { fontSize: 10, fontWeight: "bold", color: C.neutral, width: 90 },
  badge: { marginTop: 6, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 0 },
  badgeText: { fontSize: 9, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.5 },
  divider: { height: 2, backgroundColor: C.primary, marginBottom: 24 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  infoBlock: { width: "48%" },
  infoLabel: { fontSize: 9, color: C.grayText, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 },
  infoValue: { fontSize: 12, fontWeight: "bold", color: C.neutral, marginBottom: 5 },
  infoSub: { fontSize: 10, color: C.grayText, marginBottom: 3 },
  projectCard: {
    backgroundColor: C.grayLight,
    borderRadius: 0,
    padding: 16,
    marginBottom: 32,
    borderLeftWidth: 3,
    borderLeftColor: C.secondary,
  },
  sectionLabel: { fontSize: 9, color: C.grayText, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", color: C.neutral, marginBottom: 4 },
  sectionBody: { fontSize: 10, color: C.grayText, lineHeight: 1.5 },
  table: { marginBottom: 28 },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: C.darkBg,
    borderRadius: 0,
    marginBottom: 2,
  },
  tableHeaderCell: { fontSize: 9, fontWeight: "bold", color: C.white, textTransform: "uppercase", letterSpacing: 1.2 },
  tableRow: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.grayLight },
  cellDesc: { flex: 3, fontSize: 11, paddingRight: 12 },
  cellQty: { flex: 1, fontSize: 11, textAlign: "right", paddingRight: 12 },
  cellPrice: { flex: 1.5, fontSize: 11, textAlign: "right", paddingRight: 12 },
  cellAmount: { flex: 1.5, fontSize: 11, textAlign: "right", fontWeight: "bold", color: C.neutral },
  totalsSection: { alignItems: "flex-end", marginBottom: 32 },
  totalsCard: { width: 280, padding: 20, backgroundColor: C.grayLight, borderRadius: 0, borderLeftWidth: 3, borderLeftColor: C.primary },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  totalLabel: { fontSize: 11, color: C.grayText },
  totalValue: { fontSize: 11, fontWeight: "bold", color: C.neutral },
  totalDivider: { height: 1, backgroundColor: C.gray, marginVertical: 14 },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  grandTotalLabel: { fontSize: 13, fontWeight: "bold", color: C.neutral },
  grandTotalValue: { fontSize: 18, fontWeight: "bold", color: C.primary },
  paymentSection: {
    marginBottom: 32,
    padding: 16,
    backgroundColor: "#FFF7ED",
    borderRadius: 0,
    borderLeftWidth: 3,
    borderLeftColor: C.primary,
  },
  paymentTitle: { fontSize: 9, color: C.grayText, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 },
  paymentRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  paymentLabel: { fontSize: 9, color: C.grayText },
  paymentValue: { fontSize: 10, fontWeight: "bold", color: C.neutral },
  notesSection: { marginBottom: 20, padding: 16, borderRadius: 0, backgroundColor: C.grayLight },
  notesTitle: { fontSize: 9, color: C.grayText, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 },
  notesBody: { fontSize: 11, color: C.neutral, lineHeight: 1.6 },
  footer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.gray,
    alignItems: "center",
  },
  footerBrand: { fontSize: 12, fontWeight: "bold", color: C.neutral, marginBottom: 2, textAlign: "center" },
  footerTagline: { fontSize: 10, color: C.primary, marginBottom: 8, textAlign: "center", letterSpacing: 0.5 },
  footerLinks: { fontSize: 10, color: C.grayText, textAlign: "center", marginBottom: 2 },
});

export default function InvoicePDF({
  invoice,
  lineItems,
  client,
  logoSrc,
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
  project?: { title: string; description?: string | null } | null;
  payments?: Payment[] | null;
}) {
  const statusStyle = STATUS_STYLES[invoice.status] || STATUS_STYLES.draft;
  const discount = Math.max(0, invoice.subtotal + invoice.tax_amount - invoice.total);

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
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Bill To</Text>
              <Text style={styles.infoValue}>{client.company_name || client.full_name || client.email}</Text>
              {client.billing_address && <Text style={styles.infoSub}>{client.billing_address}</Text>}
              <Text style={styles.infoSub}>{client.email}</Text>
              {client.phone && <Text style={styles.infoSub}>{client.phone}</Text>}
              {client.tax_id && <Text style={styles.infoSub}>Tax ID: {client.tax_id}</Text>}
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>From</Text>
              <Text style={styles.infoValue}>Synergy Concepts Hub</Text>
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
            {lineItems.map((item) => (
              <View style={styles.tableRow} key={item.id}>
                <Text style={styles.cellDesc}>{item.description}</Text>
                <Text style={styles.cellQty}>{Number(item.quantity).toLocaleString()}</Text>
                <Text style={styles.cellPrice}>UGX {Number(item.unit_price).toLocaleString()}</Text>
                <Text style={styles.cellAmount}>UGX {Number(item.amount).toLocaleString()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsSection}>
            <View style={styles.totalsCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>UGX {Number(invoice.subtotal).toLocaleString()}</Text>
              </View>
              {invoice.tax_rate > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tax ({invoice.tax_rate}%)</Text>
                  <Text style={styles.totalValue}>UGX {Number(invoice.tax_amount).toLocaleString()}</Text>
                </View>
              )}
              {discount > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={styles.totalValue}>UGX {discount.toLocaleString()}</Text>
                </View>
              )}
              <View style={styles.totalDivider} />
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total</Text>
                <Text style={styles.grandTotalValue}>UGX {Number(invoice.total).toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {payments && payments.length > 0 && (
            <View style={styles.paymentSection}>
              <Text style={styles.paymentTitle}>Payment Details</Text>
              {payments.map((p) => (
                <View style={styles.paymentRow} key={p.id}>
                  <View>
                    <Text style={styles.paymentValue}>
                      {PAYMENT_LABEL[p.method] || p.method}
                    </Text>
                    {p.reference && <Text style={styles.paymentLabel}>Ref: {p.reference}</Text>}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.paymentValue}>UGX {Number(p.amount).toLocaleString()}</Text>
                    <Text style={styles.paymentLabel}>
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "Pending"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {invoice.notes && (
            <View style={styles.notesSection}>
              <Text style={styles.notesTitle}>Notes</Text>
              <Text style={styles.notesBody}>{invoice.notes}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Synergy Concepts Hub</Text>
          <Text style={styles.footerTagline}>Where Ideas Come to Life</Text>
          <Text style={styles.footerLinks}>www.synergyconceptshub.com</Text>
          <Text style={styles.footerLinks}>info@synergyconceptshub.com</Text>
        </View>
      </Page>
    </Document>
  );
}
