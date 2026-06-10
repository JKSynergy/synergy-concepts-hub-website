import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Invoice, InvoiceLineItem } from "@/lib/types";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  header: { marginBottom: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 80, height: 80, objectFit: "contain" },
  title: { fontSize: 24, fontWeight: "bold", color: "#ED8C22", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#1773B9", marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  label: { color: "#6b7280", fontSize: 10 },
  value: { fontWeight: "bold", fontSize: 10 },
  table: { marginTop: 16, borderTop: "1px solid #e5e7eb" },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1px solid #e5e7eb",
    paddingVertical: 8,
    backgroundColor: "#f9fafb",
  },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #e5e7eb", paddingVertical: 8 },
  cellDesc: { flex: 3, fontSize: 10 },
  cellQty: { flex: 1, fontSize: 10, textAlign: "right" },
  cellPrice: { flex: 1.5, fontSize: 10, textAlign: "right" },
  cellAmount: { flex: 1.5, fontSize: 10, textAlign: "right" },
  totals: { marginTop: 16, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", marginBottom: 4 },
  totalLabel: { width: 100, fontSize: 10, color: "#6b7280", textAlign: "right" },
  totalValue: { width: 100, fontSize: 10, textAlign: "right", fontWeight: "bold" },
  grandTotal: { fontSize: 14, fontWeight: "bold", color: "#ED8C22", marginTop: 8 },
  notes: { marginTop: 24, padding: 12, backgroundColor: "#f9fafb", borderRadius: 4 },
  footer: { marginTop: 32, fontSize: 9, color: "#9ca3af", textAlign: "center" },
});

export default function InvoicePDF({
  invoice,
  lineItems,
  client,
  logoSrc,
}: {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  client: { full_name?: string | null; company_name?: string | null; email: string; billing_address?: string | null };
  logoSrc?: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Synergy Concepts Hub</Text>
            <Text style={styles.subtitle}>Invoice</Text>
          </View>
          {logoSrc && <Image style={styles.logo} src={logoSrc} />}
        </View>

        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Bill To</Text>
            <Text style={styles.value}>{client.company_name || client.full_name || client.email}</Text>
            {client.billing_address && <Text style={styles.label}>{client.billing_address}</Text>}
            <Text style={styles.label}>{client.email}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.label}>Invoice Number</Text>
            <Text style={styles.value}>{invoice.invoice_number}</Text>
            <Text style={styles.label}>Issue Date</Text>
            <Text style={styles.value}>{invoice.issue_date}</Text>
            {invoice.due_date && (
              <>
                <Text style={styles.label}>Due Date</Text>
                <Text style={styles.value}>{invoice.due_date}</Text>
              </>
            )}
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{invoice.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.cellDesc}>Description</Text>
            <Text style={styles.cellQty}>Qty</Text>
            <Text style={styles.cellPrice}>Unit Price</Text>
            <Text style={styles.cellAmount}>Amount</Text>
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

        <View style={styles.totals}>
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
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={[styles.totalLabel, { color: "#ED8C22", fontSize: 14 }]}>Total</Text>
            <Text style={[styles.totalValue, { color: "#ED8C22", fontSize: 14 }]}>
              UGX {Number(invoice.total).toLocaleString()}
            </Text>
          </View>
        </View>

        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={{ fontSize: 10, fontWeight: "bold", marginBottom: 4 }}>Notes</Text>
            <Text style={{ fontSize: 10 }}>{invoice.notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>Thank you for your business.</Text>
          <Text>Synergy Concepts Hub • synergyconceptshub.com</Text>
        </View>
      </Page>
    </Document>
  );
}
