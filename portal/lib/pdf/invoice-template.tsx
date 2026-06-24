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
  primaryLight: "#FEF3C7",
  primaryMid: "#FDE68A",
  dark: "#0F172A",
  body: "#374151",
  muted: "#6B7280",
  border: "#E5E7EB",
  bgLight: "#F9FAFB",
  bgStripe: "#F3F4F6",
  white: "#FFFFFF",
  tableHead: "#1E293B",
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F3F4F6", text: "#6B7280" },
  sent: { bg: "#EFF6FF", text: "#1E40AF" },
  paid: { bg: "#ECFDF5", text: "#065F46" },
  overdue: { bg: "#FEF2F2", text: "#991B1B" },
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
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.dark,
    backgroundColor: C.white,
    flexDirection: "column",
  },
  topBar: {
    height: 5,
    backgroundColor: C.primary,
    width: "100%",
  },
  content: {
    flex: 1,
    paddingHorizontal: 44,
    paddingTop: 30,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 50,
    height: 50,
    objectFit: "contain",
    marginRight: 12,
  },
  brandName: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 3,
  },
  brandTagline: {
    fontSize: 8.5,
    color: C.muted,
    letterSpacing: 0.4,
  },
  titleBlock: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 34,
    fontWeight: "bold",
    color: C.primary,
    letterSpacing: 5,
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
    marginRight: 8,
    minWidth: 58,
    textAlign: "right",
  },
  metaValue: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: C.dark,
    minWidth: 80,
    textAlign: "right",
  },
  badge: {
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 3,
    alignSelf: "flex-end",
  },
  badgeText: {
    fontSize: 7.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
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
    borderTopWidth: 2,
    borderTopColor: C.primary,
    paddingTop: 14,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  totalLabel: {
    fontSize: 9.5,
    color: C.muted,
  },
  totalValue: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: C.dark,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.dark,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.primary,
  },
  paymentSection: {
    marginBottom: 26,
    padding: 16,
    backgroundColor: C.bgLight,
    borderLeftWidth: 3,
    borderLeftColor: C.primary,
  },
  paymentTitle: {
    fontSize: 7.5,
    color: C.primary,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  paymentLabel: {
    fontSize: 8.5,
    color: C.muted,
    marginTop: 2,
  },
  paymentValue: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: C.dark,
  },
  notesSection: {
    marginBottom: 20,
    padding: 14,
    backgroundColor: C.bgLight,
    borderLeftWidth: 3,
    borderLeftColor: C.border,
  },
  notesTitle: {
    fontSize: 7.5,
    color: C.primary,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    marginBottom: 7,
  },
  notesBody: {
    fontSize: 9.5,
    color: C.body,
    lineHeight: 1.6,
  },
  footer: {
    paddingHorizontal: 44,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft: {},
  footerBrand: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 2,
  },
  footerTagline: {
    fontSize: 8.5,
    color: C.primary,
    letterSpacing: 0.4,
  },
  footerRight: {
    alignItems: "flex-end",
  },
  footerLink: {
    fontSize: 8.5,
    color: C.muted,
    marginBottom: 2,
    textAlign: "right",
  },
  bottomBar: {
    height: 4,
    backgroundColor: C.primary,
    width: "100%",
  },
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
        <View style={styles.topBar} />

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
                  <Text style={styles.totalValue}>− UGX {discount.toLocaleString()}</Text>
                </View>
              )}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total Due</Text>
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
          <View style={styles.footerLeft}>
            <Text style={styles.footerBrand}>Synergy Concepts Hub</Text>
            <Text style={styles.footerTagline}>Where Ideas Come to Life</Text>
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.footerLink}>www.synergyconceptshub.com</Text>
            <Text style={styles.footerLink}>info@synergyconceptshub.com</Text>
          </View>
        </View>

        <View style={styles.bottomBar} />
      </Page>
    </Document>
  );
}
