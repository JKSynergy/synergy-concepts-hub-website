import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Invoice, Payment, Receipt } from "@/lib/types";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  header: { marginBottom: 24, alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: "#1773B9", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#6b7280" },
  badge: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: "#d1fae5",
    color: "#065f46",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: "bold",
  },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 10, color: "#6b7280", marginBottom: 4 },
  sectionValue: { fontSize: 11, fontWeight: "bold" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  box: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  boxLabel: { fontSize: 10, color: "#6b7280" },
  boxValue: { fontSize: 12, fontWeight: "bold", color: "#1773B9" },
  footer: { marginTop: 32, fontSize: 9, color: "#9ca3af", textAlign: "center" },
});

export default function ReceiptPDF({
  receipt,
  payment,
  invoice,
  client,
}: {
  receipt: Receipt;
  payment: Payment;
  invoice: Invoice;
  client: { full_name?: string | null; company_name?: string | null; email: string };
}) {
  const paidAt = payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Synergy Concepts Hub</Text>
          <Text style={styles.subtitle}>Payment Receipt</Text>
          <Text style={styles.badge}>PAID</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Receipt Number</Text>
            <Text style={styles.sectionValue}>{receipt.receipt_number}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date</Text>
            <Text style={styles.sectionValue}>{paidAt}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Received From</Text>
          <Text style={styles.sectionValue}>{client.company_name || client.full_name || client.email}</Text>
          <Text style={{ fontSize: 10, color: "#6b7280" }}>{client.email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Reference</Text>
          <Text style={styles.sectionValue}>{invoice.invoice_number}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <Text style={styles.sectionValue}>
            {payment.method.replace("_", " ").toUpperCase()}
          </Text>
          {payment.reference && (
            <Text style={{ fontSize: 10, color: "#6b7280" }}>Ref: {payment.reference}</Text>
          )}
        </View>

        <View style={styles.box}>
          <View>
            <Text style={styles.boxLabel}>Amount Paid</Text>
            <Text style={styles.boxValue}>UGX {Number(payment.amount).toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.boxLabel}>Invoice Total</Text>
            <Text style={styles.boxValue}>UGX {Number(invoice.total).toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Thank you for your payment.</Text>
          <Text>Synergy Concepts Hub • synergyconceptshub.com</Text>
        </View>
      </Page>
    </Document>
  );
}
