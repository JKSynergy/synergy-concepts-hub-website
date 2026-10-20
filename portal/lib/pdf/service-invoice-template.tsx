import { Document, Font, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { Fragment, type ReactNode } from "react";
import { SCH_BRAND, type DocPaymentMethod, type DocSignature } from "./invoice-doc";

// Detailed service invoice (recurring / managed services).
// Same visual foundation as invoice-template.tsx — navy, stone panels,
// hairlines, sharp corners — with an itemised, period-stamped breakdown and a
// non-billable "service record" that shows the client what the fee covered.

const C = {
  navy: "#1A2E5A",
  dark: "#0F172A",
  body: "#374151",
  muted: "#6B7280",
  faint: "#9CA3AF",
  hairline: "#E5E7EB",
  stone: "#F4F3F0",
  stoneLine: "#E1DFDA",
  white: "#FFFFFF",
  orange: "#ED8C22",
  green: "#047857",
  greenBg: "#ECFDF5",
};

const PAGE_X = 48;
const MONO = "Courier";
const MONO_B = "Courier-Bold";

Font.registerHyphenationCallback((word) => [word]);

export type ServiceLine = {
  description: string;
  /** Short explanation of what this component covers. */
  detail?: string;
  quantity: number;
  unit: string; // "month", "checks", "backups"…
  unitPrice: number;
  amount: number;
  period: string; // "1 Oct – 31 Oct 2026"
};

export type ServiceGroup = { name: string; reference?: string; lines: ServiceLine[] };

export type ServiceMetric = { label: string; value: string; note?: string };

export type SupportEntry = {
  date: string;
  ref: string;
  priority: "Critical" | "High" | "Normal" | "Change";
  summary: string;
  /** Work done, printed under the summary. */
  detail?: string;
  response: string;
  status: string;
};

export type ServiceInvoice = {
  number: string;
  status: "draft" | "sent" | "paid" | "partially paid" | "overdue" | "cancelled";
  issueDate: string;
  dueDate: string;
  servicePeriod: string;
  currency: string;
  agreement?: { name: string; reference?: string | null; billing?: string | null; referenceLabel?: string } | null;
  /** Small caps line under INVOICE. */
  kindLabel?: string;
  client: { name: string; lines: string[] };
  groups: ServiceGroup[];
  adjustments?: { label: string; amount: number }[];
  taxRate?: number;
  /** Database-computed totals (authoritative). When given, they are printed as-is. */
  totals?: { subtotal: number; tax: number; total: number };
  metrics?: ServiceMetric[];
  /** Heading of the metrics panel; defaults to "Service Record · <period>". */
  metricsTitle?: string;
  /** Tag beside the heading; defaults to "Included · not billed separately". null hides it. */
  metricsTag?: string | null;
  metricsNote?: string;
  support?: SupportEntry[];
  notCovered?: string[];
  paymentTerms?: string[];
  paymentMethods: DocPaymentMethod[];
  signature?: DocSignature | null;
};

const s = StyleSheet.create({
  page: {
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: C.dark,
    paddingTop: 54,
    paddingBottom: 72,
    paddingHorizontal: PAGE_X,
  },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandBlock: { flexDirection: "row", alignItems: "center" },
  logo: { width: 56, height: 56, objectFit: "contain", marginRight: 14 },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  brandTagline: { fontSize: 8.5, color: C.muted, letterSpacing: 0.4, marginBottom: 5 },
  brandContact: { fontSize: 8, color: C.body, lineHeight: 1.55 },
  titleBlock: { minWidth: 190 },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.navy, letterSpacing: 3 },
  titleSub: { fontSize: 7.5, fontFamily: MONO, color: C.muted, letterSpacing: 1, marginTop: 2 },
  accent: { width: 28, height: 1.5, backgroundColor: C.orange, marginTop: 6, marginBottom: 10 },
  metaRow: { flexDirection: "row", marginBottom: 3.5 },
  metaLabel: { fontSize: 8.5, color: C.muted, width: 78 },
  metaValue: { fontSize: 8.5, fontFamily: MONO_B, color: C.dark },
  status: {
    alignSelf: "flex-start",
    marginTop: 7,
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },

  contHeader: { position: "absolute", top: 22, left: PAGE_X, right: PAGE_X },
  contInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
  },
  contBrand: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.navy },
  contMeta: { fontSize: 8, fontFamily: MONO, color: C.muted },

  rule: { height: 0.5, backgroundColor: C.hairline, marginTop: 16, marginBottom: 18 },

  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  infoBlock: { width: "46%" },
  infoName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 4, lineHeight: 1.3 },
  infoSub: { fontSize: 8.5, color: C.body, lineHeight: 1.55 },

  label: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  labelRule: { height: 0.5, backgroundColor: C.hairline, marginTop: 6, marginBottom: 9 },

  // Amount band
  band: {
    flexDirection: "row",
    backgroundColor: C.stone,
    borderLeftWidth: 2,
    borderLeftColor: C.orange,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 20,
    alignItems: "center",
  },
  bandAmount: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.navy },
  bandSub: { fontSize: 8.5, color: C.body, marginTop: 3 },
  bandRight: { flex: 1, alignItems: "flex-end" },
  bandKV: { flexDirection: "row", marginBottom: 2.5 },
  bandK: { fontSize: 7.5, color: C.muted, width: 62, textAlign: "right", marginRight: 8 },
  bandV: { fontSize: 7.5, fontFamily: MONO_B, color: C.dark },

  // Charges table
  thead: { flexDirection: "row", backgroundColor: C.navy, paddingVertical: 8, paddingHorizontal: 10 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.white, textTransform: "uppercase", letterSpacing: 1.1 },
  groupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 11,
    paddingBottom: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.75,
    borderBottomColor: C.navy,
  },
  groupName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.navy },
  groupRef: { fontSize: 7, fontFamily: MONO, color: C.muted, marginTop: 2 },
  groupTotal: { fontSize: 9, fontFamily: MONO_B, color: C.navy },
  tr: {
    flexDirection: "row",
    paddingVertical: 7.5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.stoneLine,
  },
  cDesc: { flex: 4.2, paddingRight: 10 },
  cQty: { flex: 1.1, textAlign: "right", paddingRight: 10 },
  cPrice: { flex: 1.3, textAlign: "right", paddingRight: 10 },
  cAmt: { flex: 1.3, textAlign: "right" },
  desc: { fontSize: 9, color: C.dark, lineHeight: 1.35 },
  detail: { fontSize: 7.5, color: C.muted, lineHeight: 1.4, marginTop: 1.5 },
  period: { fontSize: 7, fontFamily: MONO, color: C.faint, marginTop: 2 },
  num: { fontSize: 8.5, fontFamily: MONO, color: C.body },
  numB: { fontSize: 8.5, fontFamily: MONO_B, color: C.dark },

  totalsRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 12, marginBottom: 22 },
  stampArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6 },
  stamp: { width: 66, height: 66, objectFit: "contain", transform: "rotate(12deg)", opacity: 0.82 },
  totals: { width: 270 },
  tl: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  tlLabel: { fontSize: 8.5, color: C.muted, flex: 1, paddingRight: 10 },
  tlValue: { fontSize: 8.5, fontFamily: MONO, color: C.dark },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 9,
    borderTopWidth: 0.75,
    borderTopColor: C.navy,
  },
  grandLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.4 },
  grandValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.navy },

  // Service record
  section: { marginBottom: 20 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  tag: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: C.green,
    backgroundColor: C.greenBg,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: C.stoneLine },
  tile: {
    width: "25%",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: C.stoneLine,
  },
  tileLabel: { fontSize: 6.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 4 },
  tileValue: { fontSize: 13, fontFamily: MONO_B, color: C.navy },
  tileNote: { fontSize: 6.5, color: C.muted, marginTop: 2 },
  footnote: { fontSize: 7, color: C.muted, marginTop: 6, lineHeight: 1.4 },

  logHead: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: C.stone },
  logTh: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.navy, textTransform: "uppercase", letterSpacing: 0.9 },
  logRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.stoneLine },
  lDate: { width: 52 },
  lRef: { width: 58 },
  lPri: { width: 50 },
  lSum: { flex: 1, paddingRight: 8 },
  lResp: { width: 52, textAlign: "right", paddingRight: 8 },
  lStat: { width: 52 },
  logMono: { fontSize: 7.5, fontFamily: MONO, color: C.body },
  logText: { fontSize: 8, color: C.dark, lineHeight: 1.35 },

  panel: { backgroundColor: C.stone, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 12 },
  panelRule: { height: 0.5, backgroundColor: C.stoneLine, marginTop: 6, marginBottom: 9 },
  bulletRow: { flexDirection: "row", marginBottom: 2.5 },
  bulletDot: { width: 11, fontSize: 8.5, color: C.muted },
  bulletText: { flex: 1, fontSize: 8.5, color: C.body, lineHeight: 1.5 },

  payCols: { flexDirection: "row" },
  payCol: { flex: 1 },
  payDivider: { width: 0.5, backgroundColor: C.stoneLine, marginHorizontal: 14 },
  payTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  payRow: { flexDirection: "row", marginBottom: 2.5 },
  payLabel: { fontSize: 8, color: C.muted, width: 74 },
  payValue: { fontSize: 8, fontFamily: MONO, color: C.dark, flex: 1 },

  signature: { alignItems: "flex-end", marginTop: 4 },
  sigBlock: { alignItems: "center" },
  sigImage: { width: 140, height: 42, objectFit: "contain" },
  sigLine: { width: 150, height: 0.5, backgroundColor: C.muted, marginTop: 2, marginBottom: 4 },
  sigName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  sigTitle: { fontSize: 7.5, color: C.muted, marginTop: 2 },

  footer: {
    position: "absolute",
    bottom: 24,
    left: PAGE_X,
    right: PAGE_X,
    paddingTop: 9,
    borderTopWidth: 0.5,
    borderTopColor: C.hairline,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerBrand: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  footerText: { fontSize: 7.5, color: C.muted },
});

const STATUS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F3F4F6", text: "#374151" },
  sent: { bg: "#EFF6FF", text: "#1E40AF" },
  paid: { bg: "#ECFDF5", text: "#065F46" },
  "partially paid": { bg: "#FEF3C7", text: "#92400E" },
  overdue: { bg: "#FEF2F2", text: "#991B1B" },
  cancelled: { bg: "#F3F4F6", text: "#9CA3AF" },
};

function Label({ children }: { children: ReactNode }) {
  return (
    <>
      <Text style={s.label}>{children}</Text>
      <View style={s.labelRule} />
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((t, i) => (
        <View key={i} style={s.bulletRow} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{t}</Text>
        </View>
      ))}
    </>
  );
}

export default function ServiceInvoicePDF({
  inv,
  logoSrc,
  stampSrc,
}: {
  inv: ServiceInvoice;
  logoSrc?: string;
  stampSrc?: string | null;
}) {
  // UGX prints whole shillings; USD keeps cents.
  const dp = inv.currency === "USD" ? 2 : 0;
  const num = (n: number) =>
    Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const qty = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const money = (n: number) => `${inv.currency} ${num(n)}`;
  const st = STATUS[inv.status] ?? STATUS.draft;

  const groupTotals = inv.groups.map((g) => g.lines.reduce((a, l) => a + l.amount, 0));
  const subtotal = groupTotals.reduce((a, b) => a + b, 0);
  const adj = (inv.adjustments ?? []).reduce((a, x) => a + x.amount, 0);
  const taxable = subtotal + adj;
  const tax = inv.totals ? inv.totals.tax : inv.taxRate ? Math.round((taxable * inv.taxRate) / 100) : 0;
  const total = inv.totals ? inv.totals.total : taxable + tax;
  const shownSubtotal = inv.totals ? inv.totals.subtotal : subtotal;

  return (
    <Document title={`Invoice ${inv.number}`} author={SCH_BRAND.name}>
      <Page size="A4" style={s.page} wrap>
        <View
          fixed
          style={s.contHeader}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={s.contInner}>
                <Text style={s.contBrand}>{SCH_BRAND.name}</Text>
                <Text style={s.contMeta}>
                  INVOICE {inv.number} · {inv.servicePeriod}
                </Text>
              </View>
            ) : null
          }
        />

        <View style={s.header} wrap={false}>
          <View style={s.brandBlock}>
            {logoSrc && <Image style={s.logo} src={logoSrc} />}
            <View>
              <Text style={s.brandName}>{SCH_BRAND.name}</Text>
              <Text style={s.brandTagline}>{SCH_BRAND.tagline}</Text>
              <Text style={s.brandContact}>Phone: {SCH_BRAND.phone}</Text>
              <Text style={s.brandContact}>Email: {SCH_BRAND.email}</Text>
              <Text style={s.brandContact}>Website: {SCH_BRAND.website}</Text>
            </View>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>INVOICE</Text>
            <Text style={s.titleSub}>{inv.kindLabel ?? "SERVICES · ITEMISED"}</Text>
            <View style={s.accent} />
            {[
              ["Invoice #", inv.number],
              ["Issue date", inv.issueDate],
              ["Due date", inv.dueDate],
              ["Service period", inv.servicePeriod],
            ].map(([k, v]) => (
              <View key={k} style={s.metaRow}>
                <Text style={s.metaLabel}>{k}</Text>
                <Text style={s.metaValue}>{v}</Text>
              </View>
            ))}
            <Text style={[s.status, { backgroundColor: st.bg, color: st.text }]}>{inv.status}</Text>
          </View>
        </View>

        <View style={s.rule} />

        <View style={s.infoRow} wrap={false}>
          <View style={s.infoBlock}>
            <Label>Bill To</Label>
            <Text style={s.infoName}>{inv.client.name}</Text>
            {inv.client.lines.map((l, i) => (
              <Text key={i} style={s.infoSub}>{l}</Text>
            ))}
          </View>
          <View style={s.infoBlock}>
            <Label>From</Label>
            <Text style={s.infoName}>{SCH_BRAND.name}</Text>
            <Text style={s.infoSub}>{SCH_BRAND.email}</Text>
            <Text style={s.infoSub}>{SCH_BRAND.website}</Text>
          </View>
        </View>

        {/* Amount band */}
        <View style={s.band} wrap={false}>
          <View>
            <Text style={s.bandAmount}>{money(total)}</Text>
            <Text style={s.bandSub}>
              {inv.status === "paid" ? "Paid in full" : `Due ${inv.dueDate}`}
              {inv.agreement ? ` · ${inv.agreement.name}` : ""}
            </Text>
          </View>
          <View style={s.bandRight}>
            {([
              [inv.agreement?.referenceLabel ?? "Agreement", inv.agreement?.reference],
              ["Billing", inv.agreement?.billing],
              ["Period", inv.servicePeriod],
            ].filter(([, v]) => !!v) as [string, string][]).map(([k, v]) => (
              <View key={k} style={s.bandKV}>
                <Text style={s.bandK}>{k}</Text>
                <Text style={s.bandV}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Charges */}
        <View minPresenceAhead={90}>
          <Label>Service Charges</Label>
        </View>
        <View>
          <View style={s.thead} fixed>
            <Text style={[s.cDesc, s.th]}>Description</Text>
            <Text style={[s.cQty, s.th]}>Qty</Text>
            <Text style={[s.cPrice, s.th]}>Unit price</Text>
            <Text style={[s.cAmt, s.th]}>Amount</Text>
          </View>
          {inv.groups.map((g, gi) => (
            <Fragment key={g.name}>
              <View style={s.groupRow} wrap={false} minPresenceAhead={40}>
                <View>
                  <Text style={s.groupName}>{g.name}</Text>
                  {g.reference && <Text style={s.groupRef}>{g.reference}</Text>}
                </View>
                <Text style={s.groupTotal}>{money(groupTotals[gi])}</Text>
              </View>
              {g.lines.map((l, li) => (
                <View key={li} style={s.tr} wrap={false}>
                  <View style={s.cDesc}>
                    <Text style={s.desc}>{l.description}</Text>
                    {l.detail && <Text style={s.detail}>{l.detail}</Text>}
                    <Text style={s.period}>{l.period}</Text>
                  </View>
                  <Text style={[s.cQty, s.num]}>
                    {`${qty(l.quantity)}${l.unit ? ` ${l.unit}` : ""}`}
                  </Text>
                  <Text style={[s.cPrice, s.num]}>{num(l.unitPrice)}</Text>
                  <Text style={[s.cAmt, s.numB]}>{num(l.amount)}</Text>
                </View>
              ))}
            </Fragment>
          ))}
        </View>

        <View style={s.totalsRow} wrap={false}>
          <View style={s.stampArea}>{stampSrc && <Image style={s.stamp} src={stampSrc} />}</View>
          <View style={s.totals}>
            {inv.groups.length > 1 && inv.groups.map((g, gi) => (
              <View key={g.name} style={s.tl}>
                <Text style={s.tlLabel}>{g.name}</Text>
                <Text style={s.tlValue}>{num(groupTotals[gi])}</Text>
              </View>
            ))}
            <View style={inv.groups.length > 1 ? [s.tl, { borderTopWidth: 0.5, borderTopColor: C.hairline, marginTop: 3, paddingTop: 5 }] : s.tl}>
              <Text style={s.tlLabel}>Subtotal</Text>
              <Text style={s.tlValue}>{money(shownSubtotal)}</Text>
            </View>
            {(inv.adjustments ?? []).map((a) => (
              <View key={a.label} style={s.tl}>
                <Text style={s.tlLabel}>{a.label}</Text>
                <Text style={s.tlValue}>{a.amount < 0 ? `-${num(-a.amount)}` : num(a.amount)}</Text>
              </View>
            ))}
            {inv.taxRate || tax ? (
              <View style={s.tl}>
                <Text style={s.tlLabel}>Tax{inv.taxRate ? ` (${inv.taxRate}%)` : ""}</Text>
                <Text style={s.tlValue}>{num(tax)}</Text>
              </View>
            ) : null}
            <View style={s.grand}>
              <Text style={s.grandLabel}>Total due</Text>
              <Text style={s.grandValue}>{money(total)}</Text>
            </View>
          </View>
        </View>

        {/* Service record — informational, not billed */}
        {inv.metrics && inv.metrics.length > 0 && (
          <View style={s.section} wrap={false}>
            <View style={s.sectionHead}>
              <Text style={s.label}>{inv.metricsTitle ?? `Service Record · ${inv.servicePeriod}`}</Text>
              {inv.metricsTag !== null && <Text style={s.tag}>{inv.metricsTag ?? "Included · not billed separately"}</Text>}
            </View>
            <View style={s.labelRule} />
            <View style={s.grid}>
              {inv.metrics.map((m) => (
                <View key={m.label} style={s.tile}>
                  <Text style={s.tileLabel}>{m.label}</Text>
                  <Text style={s.tileValue}>{m.value}</Text>
                  {m.note && <Text style={s.tileNote}>{m.note}</Text>}
                </View>
              ))}
            </View>
            {inv.metricsNote && <Text style={s.footnote}>{inv.metricsNote}</Text>}
          </View>
        )}

        {inv.support && inv.support.length > 0 && (
          <View style={s.section}>
            <View minPresenceAhead={60}>
              <Label>Support Activity</Label>
            </View>
            <View style={s.logHead} fixed={false}>
              <Text style={[s.lDate, s.logTh]}>Date</Text>
              <Text style={[s.lRef, s.logTh]}>Ref</Text>
              <Text style={[s.lPri, s.logTh]}>Priority</Text>
              <Text style={[s.lSum, s.logTh]}>Summary</Text>
              <Text style={[s.lResp, s.logTh]}>Response</Text>
              <Text style={[s.lStat, s.logTh]}>Status</Text>
            </View>
            {inv.support.map((e) => (
              <View key={e.ref} style={s.logRow} wrap={false}>
                <Text style={[s.lDate, s.logMono]}>{e.date}</Text>
                <Text style={[s.lRef, s.logMono]}>{e.ref}</Text>
                <Text style={[s.lPri, s.logText]}>{e.priority}</Text>
                <View style={s.lSum}>
                  <Text style={s.logText}>{e.summary}</Text>
                  {e.detail && <Text style={s.detail}>{e.detail}</Text>}
                </View>
                <Text style={[s.lResp, s.logMono]}>{e.response}</Text>
                <Text style={[s.lStat, s.logText]}>{e.status}</Text>
              </View>
            ))}
          </View>
        )}

        {inv.notCovered && inv.notCovered.length > 0 && (
          <View style={s.panel} wrap={false}>
            <Text style={s.label}>Not Covered by This Invoice</Text>
            <View style={s.panelRule} />
            <Bullets items={inv.notCovered} />
          </View>
        )}

        <View style={s.panel} wrap={false}>
          <Text style={s.label}>Payment Details</Text>
          <View style={s.panelRule} />
          <View style={s.payCols}>
            {inv.paymentMethods.map((m, i) => (
              <Fragment key={m.label}>
                {i > 0 && <View style={s.payDivider} />}
                <View style={[s.payCol, { flex: i === 0 ? 1.35 : 1 }]}>
                  <Text style={s.payTitle}>{m.label}</Text>
                  {m.fields.map((f) => (
                    <View key={f.label} style={s.payRow}>
                      <Text style={s.payLabel}>{f.label}</Text>
                      <Text style={s.payValue}>{f.value}</Text>
                    </View>
                  ))}
                </View>
              </Fragment>
            ))}
          </View>
        </View>

        {inv.paymentTerms && inv.paymentTerms.length > 0 && (
          <View style={s.panel} wrap={false}>
            <Text style={s.label}>Payment Terms</Text>
            <View style={s.panelRule} />
            <Bullets items={inv.paymentTerms} />
          </View>
        )}

        {inv.signature && (
          <View style={s.signature} wrap={false}>
            <View style={s.sigBlock}>
              {inv.signature.imageSrc && <Image style={s.sigImage} src={inv.signature.imageSrc} />}
              <View style={s.sigLine} />
              <Text style={s.sigName}>{inv.signature.name}</Text>
              <Text style={s.sigTitle}>
                {[inv.signature.title, inv.signature.company].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
        )}

        <View fixed style={s.footer}>
          <View>
            <Text style={s.footerBrand}>{SCH_BRAND.name}</Text>
            <Text style={s.footerText}>{SCH_BRAND.tagline}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.footerText}>
              {SCH_BRAND.website} · {SCH_BRAND.email}
            </Text>
            <Text
              style={s.footerText}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
