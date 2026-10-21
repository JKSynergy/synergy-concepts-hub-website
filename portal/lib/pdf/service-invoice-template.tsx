import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { Fragment, type ReactNode } from "react";
import { SCH_BRAND, type DocPaymentMethod, type DocSignature } from "./invoice-doc";
import { registerPdfFonts, T, PAGE_X } from "./pdf-theme";

// Detailed service invoice (recurring / managed services).
// Same minimal system as invoice-template.tsx: Sora titles, Inter text,
// whitespace and hairline rules, no filled panels, square corners. It adds an
// itemised, period-stamped breakdown and a non-billable "service record" that
// shows the client what the fee covered.
registerPdfFonts();

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
  /** Small caps line under the title. */
  kindLabel?: string;
  client: { name: string; lines: string[] };
  groups: ServiceGroup[];
  adjustments?: { label: string; amount: number }[];
  taxRate?: number;
  /** Database-computed totals (authoritative). When given, they are printed as-is. */
  totals?: { subtotal: number; tax: number; total: number };
  metrics?: ServiceMetric[];
  /** Heading of the metrics section; defaults to "Service Record · <period>". */
  metricsTitle?: string;
  /** Note beside the heading; defaults to "Included · not billed separately". null hides it. */
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
    fontFamily: "Inter",
    fontSize: 9.5,
    color: T.ink,
    backgroundColor: T.white,
    paddingTop: 51,
    paddingBottom: 72,
    paddingHorizontal: PAGE_X,
  },

  // Running head, pages 2+
  contHeader: { position: "absolute", top: 24, left: PAGE_X, right: PAGE_X },
  contInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: T.line,
  },
  contBrand: { fontSize: 7.5, fontWeight: 600, color: T.navy },
  contMeta: { fontSize: 7.5, color: T.muted },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 20, height: 20, objectFit: "contain", marginRight: 10 },
  brandName: { fontFamily: "Sora", fontWeight: 600, fontSize: 12, color: T.navy },
  contact: { marginTop: 10, fontSize: 8, lineHeight: 1.7, color: T.muted },
  docBlock: { alignItems: "flex-end" },
  docTitle: { fontFamily: "Sora", fontWeight: 600, fontSize: 30, lineHeight: 1, color: T.navy, letterSpacing: -0.8 },
  docKind: { marginTop: 6, fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.muted },
  docNo: { marginTop: 4, fontSize: 9, color: T.muted },
  docNoValue: { fontWeight: 600, color: T.ink },
  stamp: { width: 66, height: 66, objectFit: "contain", marginTop: 10 },
  draft: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderWidth: 0.75,
    borderColor: T.muted,
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: T.muted,
  },

  // Details rows: plain white, no rules
  meta: { flexDirection: "row", marginTop: 34 },
  metaRow2: { flexDirection: "row", marginTop: 16 },
  metaCell: { flex: 1, paddingRight: 12 },
  metaValue: { marginTop: 5, fontWeight: 600, color: T.ink },
  metaSub: { fontSize: 8.5, lineHeight: 1.45, color: T.muted },
  metaDue: { marginTop: 4, fontFamily: "Sora", fontWeight: 600, fontSize: 12, color: T.navy },

  label: { fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.muted },
  section: { marginTop: 26 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  sectionRule: { height: 0.75, backgroundColor: T.navy, marginTop: 7 },
  tag: { fontSize: 7, color: T.muted },

  // Charges
  thead: { flexDirection: "row", paddingTop: 12, paddingBottom: 7, borderBottomWidth: 0.75, borderBottomColor: T.navy },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: T.muted },
  groupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 14,
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: T.line,
  },
  groupName: { fontFamily: "Sora", fontWeight: 600, fontSize: 10, color: T.navy },
  groupRef: { fontSize: 7.5, color: T.muted, marginTop: 2 },
  groupTotal: { fontWeight: 600, color: T.navy },
  tr: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 0.75, borderBottomColor: T.line },
  cDesc: { flex: 4.2, paddingRight: 10 },
  cQty: { flex: 1.1, textAlign: "right", paddingRight: 10 },
  cPrice: { flex: 1.3, textAlign: "right", paddingRight: 10 },
  cAmt: { flex: 1.3, textAlign: "right" },
  desc: { fontSize: 9.5, lineHeight: 1.4, color: T.ink },
  detail: { fontSize: 8, lineHeight: 1.4, color: T.muted, marginTop: 1 },
  period: { fontSize: 7.5, color: T.muted, marginTop: 2 },
  num: { fontSize: 9, color: T.ink },
  numB: { fontSize: 9, fontWeight: 600, color: T.ink },

  // Totals
  totals: { marginTop: 12, marginLeft: "auto", width: "48%" },
  tl: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  tlSep: { borderTopWidth: 0.75, borderTopColor: T.line, marginTop: 4, paddingTop: 8 },
  tlLabel: { flex: 1, paddingRight: 10, color: T.muted },
  tlValue: { color: T.ink },
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

  // Service record: figures on white, separated by space only
  tiles: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  tile: { width: "25%", paddingTop: 12, paddingRight: 12 },
  tileLabel: { fontSize: 7, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: T.muted },
  tileValue: { fontFamily: "Sora", fontWeight: 600, fontSize: 14, color: T.navy, marginTop: 5 },
  tileNote: { fontSize: 7.5, lineHeight: 1.4, color: T.muted, marginTop: 2 },
  footnote: { fontSize: 8, lineHeight: 1.45, color: T.muted, marginTop: 12 },

  // Support activity
  logHead: {
    flexDirection: "row",
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: T.navy,
  },
  logRow: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 0.75, borderBottomColor: T.line },
  lDate: { width: 48 },
  lRef: { width: 66 },
  lPri: { width: 50 },
  lSum: { flex: 1, paddingRight: 8 },
  lResp: { width: 50, textAlign: "right", paddingRight: 10 },
  lStat: { width: 56 },
  logText: { fontSize: 8.5, lineHeight: 1.4, color: T.ink },
  logMuted: { fontSize: 8.5, lineHeight: 1.4, color: T.muted },

  // Lists
  li: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.75, borderBottomColor: T.line },
  liNum: { width: 24, fontSize: 7.5, fontWeight: 600, color: T.navy, paddingTop: 1.5 },
  liDash: { width: 24, paddingTop: 6.5 },
  dash: { width: 7, height: 0.75, backgroundColor: T.navy },
  liBody: { flex: 1, fontSize: 9.5, lineHeight: 1.45, color: T.muted },

  // Payment details
  payCols: { flexDirection: "row" },
  payCol: { flex: 1, paddingTop: 12, paddingRight: 14 },
  payColNext: { paddingLeft: 14, borderLeftWidth: 0.75, borderLeftColor: T.line },
  payTitle: { fontWeight: 600, color: T.ink, marginBottom: 6 },
  payRow: { flexDirection: "row", marginBottom: 3 },
  payLabel: { width: 84, fontSize: 8.5, color: T.muted },
  payValue: { flex: 1, fontSize: 8.5, lineHeight: 1.45, color: T.ink },

  // Signature
  signWrap: { marginTop: 40, flexDirection: "row", justifyContent: "flex-end" },
  sign: { width: 176 },
  signImage: { width: 120, height: 40, objectFit: "contain", marginTop: 8, marginBottom: 2 },
  signLine: { borderTopWidth: 0.75, borderTopColor: T.ink, paddingTop: 5 },
  signName: { fontWeight: 600, color: T.ink },
  signSub: { fontSize: 8, color: T.muted },

  // Footer, every page
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

function Section({
  title,
  aside,
  children,
  keepTogether = false,
}: {
  title: string;
  aside?: string | null;
  children: ReactNode;
  keepTogether?: boolean;
}) {
  return (
    <View style={s.section} wrap={!keepTogether} minPresenceAhead={70}>
      <View style={s.sectionHead}>
        <Text style={s.label}>{title}</Text>
        {aside ? <Text style={s.tag}>{aside}</Text> : null}
      </View>
      <View style={s.sectionRule} />
      {children}
    </View>
  );
}

function List({ items, numbered }: { items: string[]; numbered: boolean }) {
  return (
    <>
      {items.map((t, i) => (
        <View key={i} style={s.li} wrap={false}>
          {numbered ? (
            <Text style={s.liNum}>{String(i + 1).padStart(2, "0")}</Text>
          ) : (
            <View style={s.liDash}>
              <View style={s.dash} />
            </View>
          )}
          <Text style={s.liBody}>{t}</Text>
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

  const groupTotals = inv.groups.map((g) => g.lines.reduce((a, l) => a + l.amount, 0));
  const subtotal = groupTotals.reduce((a, b) => a + b, 0);
  const adj = (inv.adjustments ?? []).reduce((a, x) => a + x.amount, 0);
  const taxable = subtotal + adj;
  const tax = inv.totals ? inv.totals.tax : inv.taxRate ? Math.round((taxable * inv.taxRate) / 100) : 0;
  const total = inv.totals ? inv.totals.total : taxable + tax;
  const shownSubtotal = inv.totals ? inv.totals.subtotal : subtotal;
  const dueLabel = inv.status === "paid" ? "Paid in full" : "Amount due";
  const lastGroup = inv.groups[inv.groups.length - 1];
  const lastLine = lastGroup?.lines[lastGroup.lines.length - 1];

  const Row = ({ line: l }: { line: ServiceLine }) => (
    <View style={s.tr} wrap={false}>
      <View style={s.cDesc}>
        <Text style={s.desc}>{l.description}</Text>
        {l.detail && <Text style={s.detail}>{l.detail}</Text>}
        <Text style={s.period}>{l.period}</Text>
      </View>
      <Text style={[s.cQty, s.num]}>{`${qty(l.quantity)}${l.unit ? ` ${l.unit}` : ""}`}</Text>
      <Text style={[s.cPrice, s.num]}>{num(l.unitPrice)}</Text>
      <Text style={[s.cAmt, s.numB]}>{num(l.amount)}</Text>
    </View>
  );

  const second = (
    [
      ["Service period", inv.servicePeriod],
      ["Agreement", inv.agreement?.name],
      [inv.agreement?.referenceLabel ?? "Reference", inv.agreement?.reference],
      ["Billing", inv.agreement?.billing],
    ] as [string, string | null | undefined][]
  ).filter(([, v]) => !!v) as [string, string][];

  return (
    <Document title={`Invoice ${inv.number}`} author={SCH_BRAND.name}>
      <Page size="A4" style={s.page} wrap>
        {/* Running head on pages 2+ */}
        <View
          fixed
          style={s.contHeader}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={s.contInner}>
                <Text style={s.contBrand}>{SCH_BRAND.name}</Text>
                <Text style={s.contMeta}>
                  Invoice {inv.number} · {inv.servicePeriod}
                </Text>
              </View>
            ) : null
          }
        />

        {/* Header, page 1 */}
        <View style={s.header} wrap={false}>
          <View>
            <View style={s.brandRow}>
              {logoSrc && <Image style={s.logo} src={logoSrc} />}
              <Text style={s.brandName}>{SCH_BRAND.name}</Text>
            </View>
            <View style={s.contact}>
              <Text>{SCH_BRAND.phone}</Text>
              <Text>{SCH_BRAND.email}</Text>
              <Text>{SCH_BRAND.website}</Text>
            </View>
          </View>
          <View style={s.docBlock}>
            <Text style={s.docTitle}>Invoice</Text>
            <Text style={s.docKind}>{inv.kindLabel ?? "Services · Itemised"}</Text>
            <Text style={s.docNo}>
              No. <Text style={s.docNoValue}>{inv.number}</Text>
            </Text>
            {stampSrc ? <Image style={s.stamp} src={stampSrc} /> : <Text style={s.draft}>{inv.status}</Text>}
          </View>
        </View>

        {/* Details: bill to · dates · amount */}
        <View style={s.meta} wrap={false}>
          <View style={[s.metaCell, { flex: 1.5 }]}>
            <Text style={s.label}>Bill To</Text>
            <Text style={s.metaValue}>{inv.client.name}</Text>
            {inv.client.lines.map((l, i) => (
              <Text key={i} style={s.metaSub}>
                {l}
              </Text>
            ))}
          </View>
          <View style={[s.metaCell, { flex: 0.95 }]}>
            <Text style={s.label}>Issue Date</Text>
            <Text style={s.metaValue}>{inv.issueDate}</Text>
          </View>
          <View style={[s.metaCell, { flex: 0.95 }]}>
            <Text style={s.label}>Due Date</Text>
            <Text style={s.metaValue}>{inv.dueDate}</Text>
          </View>
          <View style={[s.metaCell, { flex: 1.25, paddingRight: 0 }]}>
            <Text style={s.label}>{dueLabel}</Text>
            <Text style={s.metaDue}>{money(total)}</Text>
          </View>
        </View>
        {second.length > 0 && (
          <View style={s.metaRow2} wrap={false}>
            {second.map(([k, v]) => (
              <View key={k} style={s.metaCell}>
                <Text style={s.label}>{k}</Text>
                <Text style={s.metaValue}>{v}</Text>
              </View>
            ))}
            {Array.from({ length: Math.max(0, 4 - second.length) }, (_, i) => (
              <View key={`pad-${i}`} style={s.metaCell} />
            ))}
          </View>
        )}

        {/* Charges: the column header repeats on continuation pages */}
        <View style={s.section} minPresenceAhead={90}>
          <Text style={s.label}>Service Charges</Text>
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
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={s.groupName}>{g.name}</Text>
                  {g.reference && <Text style={s.groupRef}>{g.reference}</Text>}
                </View>
                <Text style={s.groupTotal}>{money(groupTotals[gi])}</Text>
              </View>
              {(gi === inv.groups.length - 1 ? g.lines.slice(0, -1) : g.lines).map((l, li) => (
                <Row key={li} line={l} />
              ))}
            </Fragment>
          ))}
        </View>

        {/* The last line travels with the totals so they never sit alone on a page. */}
        <View wrap={false}>
          {lastLine && <Row line={lastLine} />}
          <View style={s.totals}>
            {inv.groups.length > 1 &&
              inv.groups.map((g, gi) => (
                <View key={g.name} style={s.tl}>
                  <Text style={s.tlLabel}>{g.name}</Text>
                  <Text style={s.tlValue}>{num(groupTotals[gi])}</Text>
                </View>
              ))}
            <View style={inv.groups.length > 1 ? [s.tl, s.tlSep] : s.tl}>
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

        {/* Service record: informational, not billed */}
        {inv.metrics && inv.metrics.length > 0 && (
          <Section
            title={inv.metricsTitle ?? `Service Record · ${inv.servicePeriod}`}
            aside={inv.metricsTag === null ? null : (inv.metricsTag ?? "Included · not billed separately")}
            keepTogether
          >
            <View style={s.tiles}>
              {inv.metrics.map((m) => (
                <View key={m.label} style={s.tile}>
                  <Text style={s.tileLabel}>{m.label}</Text>
                  <Text style={s.tileValue}>{m.value}</Text>
                  {m.note && <Text style={s.tileNote}>{m.note}</Text>}
                </View>
              ))}
            </View>
            {inv.metricsNote && <Text style={s.footnote}>{inv.metricsNote}</Text>}
          </Section>
        )}

        {inv.support && inv.support.length > 0 && (
          <Section title="Support Activity">
            <View style={s.logHead}>
              <Text style={[s.lDate, s.th]}>Date</Text>
              <Text style={[s.lRef, s.th]}>Ref</Text>
              <Text style={[s.lPri, s.th]}>Priority</Text>
              <Text style={[s.lSum, s.th]}>Summary</Text>
              <Text style={[s.lResp, s.th]}>Response</Text>
              <Text style={[s.lStat, s.th]}>Status</Text>
            </View>
            {inv.support.map((e) => (
              <View key={e.ref} style={s.logRow} wrap={false}>
                <Text style={[s.lDate, s.logMuted]}>{e.date}</Text>
                <Text style={[s.lRef, s.logMuted]}>{e.ref}</Text>
                <Text style={[s.lPri, s.logText]}>{e.priority}</Text>
                <View style={s.lSum}>
                  <Text style={s.logText}>{e.summary}</Text>
                  {e.detail && <Text style={s.detail}>{e.detail}</Text>}
                </View>
                <Text style={[s.lResp, s.logMuted]}>{e.response}</Text>
                <Text style={[s.lStat, s.logText]}>{e.status}</Text>
              </View>
            ))}
          </Section>
        )}

        {inv.notCovered && inv.notCovered.length > 0 && (
          <Section title="Not Covered by This Invoice" keepTogether>
            <List items={inv.notCovered} numbered={false} />
          </Section>
        )}

        {inv.paymentMethods.length > 0 && (
          <Section title="Payment Details" keepTogether>
            <View style={s.payCols}>
              {inv.paymentMethods.map((m, i) => (
                <View key={m.label} style={i > 0 ? [s.payCol, s.payColNext] : s.payCol}>
                  <Text style={s.payTitle}>{m.label}</Text>
                  {m.fields.map((f) => (
                    <View key={f.label} style={s.payRow}>
                      <Text style={s.payLabel}>{f.label}</Text>
                      <Text style={s.payValue}>{f.value}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Section>
        )}

        {inv.paymentTerms && inv.paymentTerms.length > 0 && (
          <Section title="Payment Terms" keepTogether>
            <List items={inv.paymentTerms} numbered />
          </Section>
        )}

        {inv.signature && (
          <View style={s.signWrap} wrap={false}>
            <View style={s.sign}>
              <Text style={s.label}>{inv.signature.title || "Authorized by"}</Text>
              {inv.signature.imageSrc ? (
                <Image style={s.signImage} src={inv.signature.imageSrc} />
              ) : (
                <View style={{ height: 36 }} />
              )}
              <View style={s.signLine}>
                <Text style={s.signName}>{inv.signature.name}</Text>
                {inv.signature.company && <Text style={s.signSub}>{inv.signature.company}</Text>}
              </View>
            </View>
          </View>
        )}

        {/* Footer, every page */}
        <View fixed style={s.footer}>
          <View style={s.footLeft}>
            <View style={s.footBar} />
            <Text style={s.footBrand}>{SCH_BRAND.name}</Text>
            <Text style={s.footText}>{SCH_BRAND.tagline}</Text>
          </View>
          <View style={s.footRight}>
            <Text style={s.footText}>{`${inv.number}  ·  `}</Text>
            <Text style={s.footText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
