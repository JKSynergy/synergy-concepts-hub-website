import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { Invoice, Payment, Receipt } from "@/lib/types";
import { SCH_BRAND, DEFAULT_PAYMENT_METHODS, DEFAULT_SIGNATURE } from "./invoice-doc";
import { registerPdfFonts, T, PAGE_X, fmtDate, titleCase } from "./pdf-theme";

// Minimal SCH receipt: same system as the invoice (Sora/Inter, hairlines,
// square corners). The stamp follows the balance left after this payment:
// "Paid" only once nothing is outstanding, otherwise "Partially paid".
registerPdfFonts();

/** Time a payment was made (falls back to when it was recorded); NaN if unknown. */
const when = (p: Payment) => Date.parse(p.paid_at || p.created_at || "");

/**
 * Amount still owed on the invoice immediately after `payment`: payments
 * made up to and including this one count; later payments do not, so an
 * older receipt keeps showing the balance as it was on that day. If the
 * timing is unknown, every recorded payment counts.
 */
export function balanceAfterPayment(invoice: Pick<Invoice, "total">, payment: Payment, payments: Payment[] | null | undefined): number {
  const cutoff = when(payment);
  const upTo = (payments ?? []).filter(
    (p) => p.id === payment.id || Number.isNaN(cutoff) || Number.isNaN(when(p)) || when(p) <= cutoff
  );
  if (!upTo.some((p) => p.id === payment.id)) upTo.push(payment);
  const paid = upTo.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return Math.max(0, Number(invoice.total) - paid);
}

export function receiptStamp(balance: number): "paid" | "partial" {
  return balance <= 0 ? "paid" : "partial";
}

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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 20, height: 20, objectFit: "contain", marginRight: 10 },
  brandName: { fontFamily: "Sora", fontWeight: 600, fontSize: 12, color: T.navy },
  contact: { marginTop: 10, fontSize: 8, lineHeight: 1.7, color: T.muted },
  docBlock: { alignItems: "flex-end" },
  docTitle: { fontFamily: "Sora", fontWeight: 600, fontSize: 30, lineHeight: 1, color: T.navy, letterSpacing: -0.8 },
  docNo: { marginTop: 8, fontSize: 9, color: T.muted },
  docNoValue: { fontWeight: 600, color: T.ink },
  stamp: { width: 66, height: 66, objectFit: "contain", marginTop: 12 },

  label: { fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.muted },

  meta: { flexDirection: "row", marginTop: 34 },
  metaCell: { paddingRight: 12 },
  metaCellNext: { paddingLeft: 12 },
  metaValue: { marginTop: 5, fontWeight: 600, color: T.ink },
  metaSub: { lineHeight: 1.45, fontSize: 8.5, color: T.muted },

  tableHead: { flexDirection: "row", marginTop: 32, paddingBottom: 7, borderBottomWidth: 0.75, borderBottomColor: T.navy },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.muted },
  tr: { flexDirection: "row", paddingVertical: 11, borderBottomWidth: 0.75, borderBottomColor: T.line },
  cDate: { flex: 1.1, paddingRight: 10 },
  cDesc: { flex: 2.6, paddingRight: 10 },
  cMethod: { flex: 1.2, paddingRight: 10 },
  cAmount: { flex: 1.3, textAlign: "right" },
  td: { fontSize: 9.5, lineHeight: 1.45, color: T.ink },
  tdSub: { lineHeight: 1.45, fontSize: 8.5, color: T.muted },
  tdAmount: { fontWeight: 600, color: T.ink },

  totals: { marginTop: 12, marginLeft: "auto", width: "46%" },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { color: T.muted },
  totalValue: { color: T.ink },
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

  lower: { flexDirection: "row", marginTop: 36, borderTopWidth: 0.75, borderTopColor: T.line },
  lowerCell: { flex: 1, paddingTop: 12, paddingRight: 14 },
  lowerCellNext: { paddingLeft: 14, borderLeftWidth: 0.75, borderLeftColor: T.line },
  pm: { marginTop: 8 },
  pmTitle: { fontWeight: 600, color: T.ink },
  pmLine: { lineHeight: 1.45, fontSize: 8.5, color: T.muted },
  note: { lineHeight: 1.45, marginTop: 8, fontSize: 8.5, color: T.muted },
  noteStrong: { fontWeight: 600, color: T.ink },
  signImage: { width: 110, height: 36, objectFit: "contain", marginTop: 8, marginBottom: 2 },
  signLine: { borderTopWidth: 0.75, borderTopColor: T.ink, paddingTop: 5 },
  signName: { fontWeight: 600, color: T.ink },
  signSub: { fontSize: 8, color: T.muted },

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

export default function ReceiptPDF({
  receipt,
  payment,
  invoice,
  client,
  logoSrc,
  signatureSrc,
  paidStampSrc,
  partialStampSrc,
  payments,
}: {
  receipt: Receipt;
  payment: Payment;
  invoice: Invoice;
  client: { full_name?: string | null; company_name?: string | null; email: string };
  logoSrc?: string;
  signatureSrc?: string;
  /** Shown only when this payment leaves nothing outstanding. */
  paidStampSrc?: string;
  /** Shown while a balance remains after this payment. */
  partialStampSrc?: string;
  payments?: Payment[] | null;
}) {
  const cc = invoice.currency || "UGX";
  const money = (n: number) => `${cc} ${Math.round(Number(n)).toLocaleString("en-US")}`;
  const paidOn = fmtDate(payment.paid_at || payment.created_at);
  const method = titleCase(payment.method);
  const balance = balanceAfterPayment(invoice, payment, payments);
  const stampSrc = receiptStamp(balance) === "paid" ? paidStampSrc : partialStampSrc;
  const clientName = client.company_name || client.full_name || client.email;
  const reference = payment.reference || payment.paystack_reference;

  return (
    <Document title={`Receipt ${receipt.receipt_number}`} author={SCH_BRAND.name}>
      <Page size="A4" style={styles.page} wrap>
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
            <Text style={styles.docTitle}>Receipt</Text>
            <Text style={styles.docNo}>
              No. <Text style={styles.docNoValue}>{receipt.receipt_number}</Text>
            </Text>
            {stampSrc && <Image style={styles.stamp} src={stampSrc} />}
          </View>
        </View>

        <View style={styles.meta} wrap={false}>
          <View style={[styles.metaCell, { flex: 1.6 }]}>
            <Text style={styles.label}>Received From</Text>
            <Text style={styles.metaValue}>{clientName}</Text>
            {client.email !== clientName && <Text style={styles.metaSub}>{client.email}</Text>}
          </View>
          <View style={[styles.metaCell, styles.metaCellNext, { flex: 1 }]}>
            <Text style={styles.label}>Invoice</Text>
            <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
          </View>
          <View style={[styles.metaCell, styles.metaCellNext, { flex: 1 }]}>
            <Text style={styles.label}>Date Paid</Text>
            <Text style={styles.metaValue}>{paidOn}</Text>
          </View>
          <View style={[styles.metaCell, styles.metaCellNext, { flex: 1, paddingRight: 0 }]}>
            <Text style={styles.label}>Method</Text>
            <Text style={styles.metaValue}>{method}</Text>
          </View>
        </View>

        <View wrap={false}>
          <View style={styles.tableHead}>
            <Text style={[styles.cDate, styles.th]}>Date</Text>
            <Text style={[styles.cDesc, styles.th]}>Description</Text>
            <Text style={[styles.cMethod, styles.th]}>Method</Text>
            <Text style={[styles.cAmount, styles.th]}>Amount</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.cDate, styles.td]}>{paidOn}</Text>
            <View style={styles.cDesc}>
              <Text style={styles.td}>Payment for invoice {invoice.invoice_number}</Text>
              {reference && <Text style={styles.tdSub}>Ref. {reference}</Text>}
            </View>
            <Text style={[styles.cMethod, styles.td]}>{method}</Text>
            <Text style={[styles.cAmount, styles.tdAmount]}>{money(payment.amount)}</Text>
          </View>

          <View style={styles.totals}>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Amount paid</Text>
              <Text style={styles.totalValue}>{money(payment.amount)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Balance due</Text>
              <Text style={styles.totalValue}>{money(balance)}</Text>
            </View>
            <View style={styles.grand}>
              <Text style={styles.grandLabel}>Total Paid</Text>
              <Text style={styles.grandValue}>{money(payment.amount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.lower} wrap={false}>
          <View style={styles.lowerCell}>
            <Text style={styles.label}>Payment Details</Text>
            {DEFAULT_PAYMENT_METHODS.map((m, i) => (
              <View key={i} style={styles.pm}>
                <Text style={styles.pmTitle}>{m.label}</Text>
                {m.fields.map((f, j) => (
                  <Text key={j} style={styles.pmLine}>
                    {f.value}
                  </Text>
                ))}
              </View>
            ))}
          </View>
          <View style={[styles.lowerCell, styles.lowerCellNext]}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.note}>
              Thank you for your payment. This receipt confirms the payment above has been received.
            </Text>
            <Text style={styles.note}>
              Reference <Text style={styles.noteStrong}>{reference || `Invoice ${invoice.invoice_number}`}</Text>
            </Text>
          </View>
          <View style={[styles.lowerCell, styles.lowerCellNext, { paddingRight: 0 }]}>
            <Text style={styles.label}>{DEFAULT_SIGNATURE.title}</Text>
            {signatureSrc ? <Image style={styles.signImage} src={signatureSrc} /> : <View style={{ height: 34 }} />}
            <View style={styles.signLine}>
              <Text style={styles.signName}>{DEFAULT_SIGNATURE.name}</Text>
              <Text style={styles.signSub}>{DEFAULT_SIGNATURE.company}</Text>
            </View>
          </View>
        </View>

        <View fixed style={styles.footer}>
          <View style={styles.footLeft}>
            <View style={styles.footBar} />
            <Text style={styles.footBrand}>{SCH_BRAND.name}</Text>
            <Text style={styles.footText}>{SCH_BRAND.tagline}</Text>
          </View>
          <View style={styles.footRight}>
            <Text style={styles.footText}>{`${receipt.receipt_number}  ·  `}</Text>
            <Text style={styles.footText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
