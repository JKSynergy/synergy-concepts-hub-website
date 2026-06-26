import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Circle,
  Text as SvgText,
} from "@react-pdf/renderer";
import type { Invoice, Payment, Receipt } from "@/lib/types";

const C = {
  primary: "#1A2E5A",
  accent: "#1773B9",
  dark: "#0F172A",
  body: "#374151",
  muted: "#6B7280",
  border: "#E5E7EB",
  bgLight: "#F9FAFB",
  greenBg: "#ECFDF5",
  greenText: "#065F46",
  white: "#FFFFFF",
  orange: "#F97316",
};

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.dark,
    backgroundColor: C.white,
    flexDirection: "column",
    paddingTop: 36,
  },
  content: {
    flex: 1,
    paddingHorizontal: 44,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logo: {
    width: 56,
    height: 56,
    objectFit: "contain",
    marginRight: 14,
  },
  brandDetails: {
    flexDirection: "column",
  },
  brandName: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  contactIcon: {
    fontSize: 9,
    color: C.muted,
    marginRight: 6,
    width: 12,
  },
  contactText: {
    fontSize: 9,
    color: C.body,
  },
  titleBlock: {
    alignItems: "center",
  },
  receiptTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: C.primary,
    letterSpacing: 2,
    marginBottom: 10,
  },
  stampArea: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 22,
  },
  receivedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  receivedBlock: {
    width: "46%",
  },
  sectionLabel: {
    fontSize: 8,
    color: C.primary,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sectionName: {
    fontSize: 12,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 9,
    color: C.body,
    marginBottom: 2,
  },
  summaryCard: {
    width: "46%",
    backgroundColor: C.greenBg,
    borderRadius: 4,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.greenText,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: C.greenText,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  summaryIconText: {
    fontSize: 14,
    color: C.white,
    fontWeight: "bold",
  },
  summaryTitle: {
    fontSize: 9,
    color: C.greenText,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 8.5,
    color: C.muted,
  },
  summaryValue: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.dark,
  },
  table: {
    marginBottom: 24,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: C.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
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
    backgroundColor: C.bgLight,
  },
  tableRowAlt: {
    backgroundColor: C.white,
  },
  cellDate: { flex: 1.2, paddingRight: 8 },
  cellDesc: { flex: 2.2, paddingRight: 8 },
  cellInvoice: { flex: 1.4, paddingRight: 8 },
  cellMethod: { flex: 1.4, paddingRight: 8 },
  cellAmount: { flex: 1.2, textAlign: "right" },
  cellText: {
    fontSize: 9,
    color: C.body,
  },
  cellTextBold: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.dark,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  paymentMethod: {
    width: "36%",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 12,
    backgroundColor: C.bgLight,
  },
  paymentTitle: {
    fontSize: 8,
    color: C.greenText,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  paymentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  paymentIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  paymentIconText: {
    fontSize: 11,
    color: C.muted,
  },
  paymentDetails: {
    flex: 1,
  },
  paymentLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.dark,
    marginBottom: 1,
  },
  paymentValue: {
    fontSize: 8.5,
    color: C.body,
  },
  signatureSection: {
    width: "26%",
    alignItems: "center",
    justifyContent: "center",
  },
  signatureImage: {
    width: 120,
    height: 40,
    objectFit: "contain",
    marginBottom: 4,
  },
  signatureLine: {
    width: 120,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.dark,
  },
  signatureTitle: {
    fontSize: 8,
    color: C.muted,
  },
  notesSection: {
    width: "32%",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 12,
    backgroundColor: C.bgLight,
  },
  notesTitle: {
    fontSize: 8,
    color: C.greenText,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  notesBody: {
    fontSize: 9,
    color: C.body,
    lineHeight: 1.5,
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 28,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.dark,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginRight: 12,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.primary,
  },
  footer: {
    paddingHorizontal: 44,
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 4,
    borderTopColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 9,
    color: C.muted,
  },
  footerAccent: {
    width: 60,
    height: 4,
    backgroundColor: C.orange,
    borderRadius: 2,
  },
});

export default function ReceiptPDF({
  receipt,
  payment,
  invoice,
  client,
  logoSrc,
  signatureSrc,
  paidStampSrc,
  payments,
}: {
  receipt: Receipt;
  payment: Payment;
  invoice: Invoice;
  client: { full_name?: string | null; company_name?: string | null; email: string };
  logoSrc?: string;
  signatureSrc?: string;
  paidStampSrc?: string;
  payments?: Payment[] | null;
}) {
  const paidAt = payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : "—";
  const totalPaid = (payments ?? []).reduce((sum: number, p: Payment) => sum + Number(p.amount), 0);
  const balance = Math.max(0, Number(invoice.total) - totalPaid);
  const methodLabel = payment.method.replace(/_/g, " ").toUpperCase();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.brandBlock}>
              {logoSrc && <Image style={styles.logo} src={logoSrc} />}
              <View style={styles.brandDetails}>
                <Text style={styles.brandName}>Synergy Concepts Hub</Text>
                <View style={styles.contactRow}>
                  <Text style={styles.contactIcon}>T</Text>
                  <Text style={styles.contactText}>+256706739311</Text>
                </View>
                <View style={styles.contactRow}>
                  <Text style={styles.contactIcon}>@</Text>
                  <Text style={styles.contactText}>synergyconceptshub@gmail.com</Text>
                </View>
                <View style={styles.contactRow}>
                  <Text style={styles.contactIcon}>W</Text>
                  <Text style={styles.contactText}>www.synergyconceptshub.com</Text>
                </View>
              </View>
            </View>
            <View style={styles.titleBlock}>
              <Text style={styles.receiptTitle}>RECEIPT</Text>
              <View style={styles.stampArea}>
                {paidStampSrc ? (
                  <Image style={{ width: 80, height: 80, objectFit: "contain" }} src={paidStampSrc} />
                ) : (
                  <Svg width={90} height={90} viewBox="0 0 90 90">
                    <Circle cx={45} cy={45} r={40} stroke={C.primary} strokeWidth={2} fill="none" />
                    <Circle cx={45} cy={45} r={33} stroke={C.primary} strokeWidth={1} strokeDasharray="3 3" fill="none" />
                    <SvgText x={45} y={50} textAnchor="middle" style={{ fontSize: 16, fill: C.primary }}>
                      PAID
                    </SvgText>
                  </Svg>
                )}
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.receivedRow}>
            <View style={styles.receivedBlock}>
              <Text style={styles.sectionLabel}>Received From</Text>
              <Text style={styles.sectionName}>{client.company_name || client.full_name || client.email}</Text>
              <Text style={styles.sectionSub}>{client.email}</Text>
              <Text style={styles.sectionSub}>Invoice: {invoice.invoice_number}</Text>
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryIcon}>
                  <Text style={styles.summaryIconText}>$</Text>
                </View>
                <Text style={styles.summaryTitle}>Payment Summary</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount Paid</Text>
                <Text style={styles.summaryValue}>UGX {Number(payment.amount).toLocaleString()}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Date Paid</Text>
                <Text style={styles.summaryValue}>{paidAt}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Balance</Text>
                <Text style={styles.summaryValue}>UGX {balance.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Receipt No.</Text>
                <Text style={styles.summaryValue}>{receipt.receipt_number}</Text>
              </View>
            </View>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cellDate, styles.tableHeaderCell]}>Date</Text>
              <Text style={[styles.cellDesc, styles.tableHeaderCell]}>Description</Text>
              <Text style={[styles.cellInvoice, styles.tableHeaderCell]}>Invoice</Text>
              <Text style={[styles.cellMethod, styles.tableHeaderCell]}>Method</Text>
              <Text style={[styles.cellAmount, styles.tableHeaderCell]}>Amount</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.cellDate, styles.cellText]}>{paidAt}</Text>
              <Text style={[styles.cellDesc, styles.cellText]}>Payment for invoice {invoice.invoice_number}</Text>
              <Text style={[styles.cellInvoice, styles.cellText]}>{invoice.invoice_number}</Text>
              <Text style={[styles.cellMethod, styles.cellText]}>{methodLabel}</Text>
              <Text style={[styles.cellAmount, styles.cellTextBold]}>UGX {Number(payment.amount).toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.paymentMethod}>
              <Text style={styles.paymentTitle}>Payment Method</Text>
              <View style={styles.paymentItem}>
                <View style={styles.paymentIcon}>
                  <Text style={styles.paymentIconText}>B</Text>
                </View>
                <View style={styles.paymentDetails}>
                  <Text style={styles.paymentLabel}>Bank Transfer</Text>
                  <Text style={styles.paymentValue}>Joseph Sengendo</Text>
                  <Text style={styles.paymentValue}>0100823802201</Text>
                  <Text style={styles.paymentValue}>Standard Chartered Bank Uganda</Text>
                </View>
              </View>
              <View style={styles.paymentItem}>
                <View style={styles.paymentIcon}>
                  <Text style={styles.paymentIconText}>A</Text>
                </View>
                <View style={styles.paymentDetails}>
                  <Text style={styles.paymentLabel}>Airtel Money</Text>
                  <Text style={styles.paymentValue}>0704 783 724</Text>
                  <Text style={styles.paymentValue}>Joseph Sengendo</Text>
                </View>
              </View>
            </View>

            <View style={styles.signatureSection}>
              {signatureSrc && <Image style={styles.signatureImage} src={signatureSrc} />}
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>Joseph Sengendo</Text>
              <Text style={styles.signatureTitle}>Authorized by</Text>
            </View>

            <View style={styles.notesSection}>
              <Text style={styles.notesTitle}>Notes</Text>
              <Text style={styles.notesBody}>Thank you for your payment. This receipt confirms the above payment has been received.</Text>
              {payment.reference && (
                <Text style={styles.notesBody}>Reference: {payment.reference}</Text>
              )}
            </View>
          </View>

          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <Text style={styles.totalValue}>UGX {Number(payment.amount).toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Synergy Concepts Hub • Where Ideas Come to Life</Text>
          <View style={styles.footerAccent} />
        </View>
      </Page>
    </Document>
  );
}
