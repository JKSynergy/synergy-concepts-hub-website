"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import {
  BreakdownEditor,
  breakdownTotal,
  formatMoney,
  toEditorItems,
  toRows,
  type BreakdownRow,
  type EditorItem,
} from "@/components/billing/breakdown-editor";
import {
  createSupportRequest,
  invoiceSupportRequests,
  saveSupportRequestCharges,
  setQuoteAgreement,
  updateSupportRequest,
} from "@/lib/actions/service-billing";

export type RateCard = { id: string; name: string; currency: string; items: BreakdownRow[] };

export type SupportRequestRow = {
  id: string;
  reference: string;
  client_id: string;
  clientName: string;
  system_id: string | null;
  systemName: string | null;
  agreementName: string | null;
  rate_package_id: string | null;
  summary: string;
  work_done: string | null;
  priority: string;
  channel: string;
  billing: string;
  status: string;
  requested_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  quote_agreed_at: string | null;
  invoice_id: string | null;
  invoice: { number: string; status: string } | null;
  recordedBy: string | null;
  items: BreakdownRow[];
};

type Option = { id: string; label: string };
type SystemOpt = { id: string; name: string; client_id: string };
type AgreementOpt = { id: string; name: string; client_id: string; status: string };

const PRIORITY: Record<string, string> = { critical: "Critical", high: "High", normal: "Normal", change: "Change request" };
const CHANNEL: Record<string, string> = {
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  portal: "Portal",
  on_site: "On site",
  other: "Other",
};
const BILLING: Record<string, string> = { covered: "Covered by agreement", chargeable: "Chargeable", no_charge: "No charge" };
const STATUS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};
const STATUS_CHIP: Record<string, string> = {
  open: "is-warn",
  in_progress: "is-info",
  resolved: "is-ok",
  invoiced: "is-strong",
  cancelled: "",
};

const TZ = "Africa/Kampala";
const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
const duration = (from: string, to: string | null) => {
  if (!to) return null;
  const mins = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${String(mins % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};
/** Value for <input type="datetime-local"> in the browser's own time zone. */
const localInput = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const itemsTotal = (items: BreakdownRow[]) =>
  Math.round(items.reduce((a, i) => a + Math.round(i.quantity * i.unit_price * 100) / 100, 0) * 100) / 100;

export default function SupportManager({
  requests,
  clients,
  systems,
  agreements,
  rateCards,
  currencyByClient,
  canPrice,
}: {
  requests: SupportRequestRow[];
  clients: Option[];
  systems: SystemOpt[];
  agreements: AgreementOpt[];
  rateCards: RateCard[];
  currencyByClient: Record<string, string>;
  canPrice: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [clientFilter, setClientFilter] = useState("all");
  const [billingFilter, setBillingFilter] = useState("all");
  const [logOpen, setLogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);

  const open = requests.filter((r) => r.status === "open" || r.status === "in_progress");
  const awaiting = requests.filter((r) => r.status === "open" && !r.first_response_at);
  const chargeable = requests.filter(
    (r) => r.billing === "chargeable" && ["open", "in_progress", "resolved"].includes(r.status),
  );
  const needQuote = chargeable.filter((r) => !r.items.length);
  const awaitingAgreement = chargeable.filter((r) => r.items.length && !r.quote_agreed_at);
  const toInvoice = requests.filter((r) => readyToInvoice(r));
  const thisMonth = requests.filter((r) => new Date(r.requested_at).getTime() >= monthStart);
  const responded = thisMonth.filter((r) => r.first_response_at);
  const median = (() => {
    const mins = responded
      .map((r) => (new Date(r.first_response_at!).getTime() - new Date(r.requested_at).getTime()) / 60000)
      .sort((a, b) => a - b);
    if (!mins.length) return null;
    const m = mins[Math.floor(mins.length / 2)];
    return duration(new Date(0).toISOString(), new Date(m * 60000).toISOString());
  })();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter === "active" && !["open", "in_progress", "resolved"].includes(r.status)) return false;
      if (statusFilter === "to_invoice" && !readyToInvoice(r)) return false;
      if (statusFilter === "quotes" && !(r.billing === "chargeable" && ["open", "in_progress", "resolved"].includes(r.status) && !r.quote_agreed_at)) return false;
      if (!["active", "to_invoice", "quotes", "all"].includes(statusFilter) && r.status !== statusFilter) return false;
      if (clientFilter !== "all" && r.client_id !== clientFilter) return false;
      if (billingFilter !== "all" && r.billing !== billingFilter) return false;
      if (q && !`${r.reference} ${r.summary} ${r.clientName} ${r.systemName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requests, query, statusFilter, clientFilter, billingFilter]);

  const detail = requests.find((r) => r.id === detailId) ?? null;
  const invoiceRow = requests.find((r) => r.id === invoiceId && readyToInvoice(r)) ?? null;

  return (
    <>
      <div className="bl-top">
        <div className="bl-summary">
          <div className={`bl-sum${awaiting.length ? " is-warn" : ""}`}>
            <span className="bl-label">Open</span>
            <b>{open.length}</b>
            <small>{awaiting.length ? `${awaiting.length} awaiting first response` : "all responded to"}</small>
          </div>
          <div className="bl-sum">
            <span className="bl-label">This month</span>
            <b>{thisMonth.length}</b>
            <small>{median ? `median first response ${median}` : "no responses yet"}</small>
          </div>
          {canPrice && (
            <div className={`bl-sum${needQuote.length || awaitingAgreement.length ? " is-warn" : ""}`}>
              <span className="bl-label">Quotes</span>
              <b>{needQuote.length + awaitingAgreement.length}</b>
              <small>
                {needQuote.length || awaitingAgreement.length
                  ? `${needQuote.length} to quote · ${awaitingAgreement.length} awaiting agreement`
                  : "all jobs agreed"}
              </small>
            </div>
          )}
          {canPrice && (
            <div className={`bl-sum${toInvoice.length ? " is-warn" : ""}`}>
              <span className="bl-label">Ready to invoice</span>
              <b>{toInvoice.length}</b>
              <small>{toInvoice.length ? "finished, quote agreed" : "nothing waiting"}</small>
            </div>
          )}
        </div>
        <div className="bl-actions">
          <button type="button" className="ux-btn ux-btn--primary" onClick={() => setLogOpen(true)}>
            + Log request
          </button>
          {canPrice && (
            <Link href="/admin/finances/packages" className="ux-btn ux-btn--secondary">
              Quote templates
            </Link>
          )}
        </div>
      </div>

      {notice && <p className="bl-ok" role="status">{notice}</p>}

      <div className="bl-filters">
        <input
          className="ux-input"
          type="search"
          placeholder="Search reference, client, summary"
          aria-label="Search requests"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="ux-select" aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Open &amp; resolved</option>
          {canPrice && <option value="quotes">Quotes pending</option>}
          {canPrice && <option value="to_invoice">Ready to invoice</option>}
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="invoiced">Invoiced</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        <select className="ux-select" aria-label="Client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="ux-select" aria-label="Billing" value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
          <option value="all">Any billing</option>
          <option value="covered">Covered</option>
          <option value="chargeable">Chargeable</option>
          <option value="no_charge">No charge</option>
        </select>
        <span className="bl-count">
          {visible.length} of {requests.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="bl-panel bl-empty">
          <b>{requests.length ? "Nothing matches these filters" : "No support requests yet"}</b>
          {requests.length ? "Try another status or client." : "Log the next call, WhatsApp or email from a client here."}
        </div>
      ) : (
        <div className="bl-list">
          {visible.map((r) => {
            const resp = duration(r.requested_at, r.first_response_at);
            return (
              <div key={r.id} className="bl-req">
                <span>
                  <span className={`bl-pri is-${r.priority}`} title={PRIORITY[r.priority]} />
                </span>
                <span className="bl-req-ref">{r.reference}</span>
                <div className="bl-req-main">
                  <button type="button" onClick={() => setDetailId(r.id)}>
                    {r.summary}
                  </button>
                  <div className="bl-req-chips">
                    <span className="bl-chip">{r.clientName}</span>
                    {r.systemName && <span className="bl-chip">{r.systemName}</span>}
                    <span className="bl-chip">
                      <span className={`bl-pri is-${r.priority}`} /> {PRIORITY[r.priority]}
                    </span>
                    <span className={`bl-chip${r.billing === "covered" ? " is-info" : ""}`}>
                      {r.billing === "chargeable" && canPrice && r.items.length
                        ? formatMoney(itemsTotal(r.items), rateCurrency(r, rateCards, currencyByClient))
                        : BILLING[r.billing]}
                    </span>
                    {canPrice && r.billing === "chargeable" && r.status !== "invoiced" && r.status !== "cancelled" && (
                      <span className={`bl-chip${r.quote_agreed_at ? " is-ok" : " is-warn"}`}>
                        {!r.items.length ? "Needs quote" : r.quote_agreed_at ? "Quote agreed" : "Awaiting agreement"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="bl-req-time">
                  {fmtTime(r.requested_at)} · {CHANNEL[r.channel]}
                  <br />
                  {resp ? `responded in ${resp}` : r.status === "cancelled" ? "" : "no response yet"}
                </div>
                <div className="bl-req-status">
                  {r.invoice && canPrice ? (
                    <Link href={`/admin/invoices/${r.invoice_id}`} className="bl-chip is-strong">
                      {r.invoice.number}
                    </Link>
                  ) : canPrice && readyToInvoice(r) ? (
                    <button type="button" className="ux-btn ux-btn--primary ux-btn--small" onClick={() => setInvoiceId(r.id)}>
                      Create invoice
                    </button>
                  ) : (
                    <span className={`bl-chip ${STATUS_CHIP[r.status] ?? ""}`}>{STATUS[r.status]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logOpen && (
        <LogRequestDialog
          clients={clients}
          systems={systems}
          agreements={agreements}
          rateCards={rateCards}
          canPrice={canPrice}
          onClose={() => setLogOpen(false)}
          onDone={(ref) => {
            setLogOpen(false);
            setNotice(`${ref} logged.`);
            router.refresh();
          }}
        />
      )}

      {detail && (
        <RequestDialog
          key={detail.id}
          request={detail}
          systems={systems.filter((s) => s.client_id === detail.client_id)}
          rateCards={rateCards}
          currency={rateCurrency(detail, rateCards, currencyByClient)}
          canPrice={canPrice}
          onClose={() => setDetailId(null)}
          onSaved={() => router.refresh()}
        />
      )}

      {invoiceRow && (
        <InvoiceDialog
          rows={[invoiceRow]}
          currency={rateCurrency(invoiceRow, rateCards, currencyByClient)}
          onClose={() => setInvoiceId(null)}
          onDone={(newInvoiceId) => {
            setInvoiceId(null);
            router.push(`/admin/invoices/${newInvoiceId}`);
          }}
        />
      )}
    </>
  );
}

/** A finished, chargeable job whose quote the client has agreed. */
function readyToInvoice(r: SupportRequestRow) {
  return r.status === "resolved" && r.billing === "chargeable" && r.items.length > 0 && !!r.quote_agreed_at;
}

function rateCurrency(r: SupportRequestRow, cards: RateCard[], byClient: Record<string, string>) {
  return cards.find((c) => c.id === r.rate_package_id)?.currency ?? byClient[r.client_id] ?? "UGX";
}

// ---------------------------------------------------------------------------

function LogRequestDialog({
  clients,
  systems,
  agreements,
  rateCards,
  canPrice,
  onClose,
  onDone,
}: {
  clients: Option[];
  systems: SystemOpt[];
  agreements: AgreementOpt[];
  rateCards: RateCard[];
  canPrice: boolean;
  onClose: () => void;
  onDone: (reference: string) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [systemId, setSystemId] = useState("");
  const [summary, setSummary] = useState("");
  const [priority, setPriority] = useState("normal");
  const [channel, setChannel] = useState("phone");
  const [billing, setBilling] = useState("chargeable");
  const [rateId, setRateId] = useState("");
  const [when, setWhen] = useState(localInput());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clientSystems = systems.filter((s) => s.client_id === clientId);
  const activeAgreement = agreements.find(
    (a) => a.client_id === clientId && (a.status === "active" || a.status === "reactivation_pending"),
  );

  const pickClient = (id: string) => {
    setClientId(id);
    const sys = systems.filter((s) => s.client_id === id);
    setSystemId(sys.length === 1 ? sys[0].id : "");
    const agr = agreements.find((a) => a.client_id === id && (a.status === "active" || a.status === "reactivation_pending"));
    setBilling(agr ? "covered" : "chargeable");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await createSupportRequest({
      clientId,
      systemId: systemId || null,
      agreementId: billing === "covered" ? activeAgreement?.id ?? null : null,
      ratePackageId: billing === "chargeable" && rateId ? rateId : null,
      summary,
      priority,
      channel,
      billing,
      requestedAt: when ? new Date(when).toISOString() : null,
    });
    setSaving(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not log the request");
      return;
    }
    onDone(res.data.reference);
  }

  return (
    <Dialog labelledBy="log-req-title" onClose={onClose} maxWidth={640}>
      <form className="bl-form bl-dialog-scroll" onSubmit={submit}>
        <h3 id="log-req-title">Log a support request</h3>
        <p>Record it as soon as the client gets in touch — the time is used for response tracking.</p>
        {error && <p className="bl-error">{error}</p>}
        <div className="bl-fields">
          <label className="ux-label is-wide">
            <span>Client</span>
            <select className="ux-select ux-input" required value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label is-wide">
            <span>What do they need?</span>
            <input
              className="ux-input"
              required
              minLength={3}
              maxLength={300}
              placeholder="e.g. Depot user locked out after password reset"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label className="ux-label">
            <span>System</span>
            <select className="ux-select ux-input" value={systemId} onChange={(e) => setSystemId(e.target.value)} disabled={!clientId}>
              <option value="">{clientSystems.length ? "Not specific" : "No systems"}</option>
              {clientSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label">
            <span>Priority</span>
            <select className="ux-select ux-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label">
            <span>Came in by</span>
            <select className="ux-select ux-input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {Object.entries(CHANNEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label">
            <span>Received at</span>
            <input className="ux-input" type="datetime-local" value={when} max={localInput()} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="ux-label">
            <span>Billing</span>
            <select className="ux-select ux-input" value={billing} onChange={(e) => setBilling(e.target.value)}>
              <option value="covered" disabled={!activeAgreement}>
                Covered by agreement{activeAgreement ? "" : " (none active)"}
              </option>
              <option value="chargeable">Chargeable (quoted job)</option>
              <option value="no_charge">No charge</option>
            </select>
          </label>
          {canPrice && billing === "chargeable" && (
            <label className="ux-label">
              <span>Start quote from</span>
              <select className="ux-select ux-input" value={rateId} onChange={(e) => setRateId(e.target.value)}>
                <option value="">{rateCards.length ? "Quote later" : "No quote templates yet"}</option>
                {rateCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {billing === "covered" && activeAgreement && (
          <p className="bl-meta" style={{ margin: 0 }}>
            Covered by <b>{activeAgreement.name}</b>. It will appear in that client&apos;s monthly service record, not as a charge.
          </p>
        )}
        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ux-btn ux-btn--primary" disabled={saving || !clientId || summary.trim().length < 3}>
            {saving ? "Logging…" : "Log request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function RequestDialog({
  request: r,
  systems,
  rateCards,
  currency,
  canPrice,
  onClose,
  onSaved,
}: {
  request: SupportRequestRow;
  systems: SystemOpt[];
  rateCards: RateCard[];
  currency: string;
  canPrice: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const locked = r.status === "invoiced";
  const [summary, setSummary] = useState(r.summary);
  const [workDone, setWorkDone] = useState(r.work_done ?? "");
  const [priority, setPriority] = useState(r.priority);
  const [channel, setChannel] = useState(r.channel);
  const [billing, setBilling] = useState(r.billing);
  const [systemId, setSystemId] = useState(r.system_id ?? "");
  const [charges, setCharges] = useState<EditorItem[]>(() => toEditorItems(r.items));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const dirty =
    summary !== r.summary ||
    workDone !== (r.work_done ?? "") ||
    priority !== r.priority ||
    channel !== r.channel ||
    billing !== r.billing ||
    systemId !== (r.system_id ?? "");

  async function run(patch: Parameters<typeof updateSupportRequest>[1], message: string) {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await updateSupportRequest(r.id, patch);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not update the request");
      return false;
    }
    setSaved(message);
    onSaved();
    return true;
  }

  const saveDetails = () =>
    run({ summary, workDone, priority, channel, billing, systemId: systemId || null }, "Details saved.");

  async function saveCharges() {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await saveSupportRequestCharges(r.id, toRows(charges));
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save the charges");
      return;
    }
    setSaved(r.quote_agreed_at ? "Quote saved. The client needs to agree the new amount." : "Quote saved.");
    onSaved();
  }

  const quoteDirty = JSON.stringify(toRows(charges)) !== JSON.stringify(toRows(toEditorItems(r.items)));
  const [agreedAt, setAgreedAt] = useState(() => localInput());

  async function agree(value: string | null) {
    setSaving(true);
    setError(null);
    setSaved(null);
    const res = await setQuoteAgreement(r.id, value ? new Date(value).toISOString() : null);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not record the agreement");
      return;
    }
    setSaved(value ? "Client agreement recorded." : "Agreement withdrawn.");
    onSaved();
  }

  const step = async (status: string, label: string) => {
    // Save edited details first so "Mark resolved" never loses the notes.
    if (dirty && !(await run({ summary, workDone, priority, channel, billing, systemId: systemId || null }, "Details saved."))) return;
    await run({ status }, label);
  };

  return (
    <Dialog labelledBy="req-title" onClose={onClose} maxWidth={900}>
      <div className="bl-form bl-dialog-scroll">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h3 id="req-title">
            <span className="bl-mono">{r.reference}</span> · {r.clientName}
          </h3>
          <span className={`bl-chip ${STATUS_CHIP[r.status] ?? ""}`}>{STATUS[r.status]}</span>
        </div>

        <dl className="bl-kv" style={{ margin: 0 }}>
          <div>
            <dt>Received</dt>
            <dd>{fmtTime(r.requested_at)} EAT</dd>
          </div>
          <div>
            <dt>First response</dt>
            <dd>{r.first_response_at ? `${fmtTime(r.first_response_at)} · ${duration(r.requested_at, r.first_response_at)}` : "—"}</dd>
          </div>
          <div>
            <dt>Resolved</dt>
            <dd>{r.resolved_at ? `${fmtTime(r.resolved_at)} · ${duration(r.requested_at, r.resolved_at)}` : "—"}</dd>
          </div>
          <div>
            <dt>Logged by</dt>
            <dd>{r.recordedBy ?? "—"}</dd>
          </div>
          {r.agreementName && (
            <div>
              <dt>Agreement</dt>
              <dd>{r.agreementName}</dd>
            </div>
          )}
          {r.invoice && (
            <div>
              <dt>Invoice</dt>
              <dd>
                <Link href={`/admin/invoices/${r.invoice_id}`}>{r.invoice.number}</Link> · {r.invoice.status}
              </dd>
            </div>
          )}
        </dl>

        {error && <p className="bl-error">{error}</p>}
        {saved && <p className="bl-ok" role="status">{saved}</p>}

        {!locked && (
          <div className="bl-steps">
            {r.status === "open" && (
              <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" disabled={saving} onClick={() => step("in_progress", "Marked in progress; first response recorded.")}>
                Start work
              </button>
            )}
            {(r.status === "open" || r.status === "in_progress") && (
              <button type="button" className="ux-btn ux-btn--primary ux-btn--small" disabled={saving || !workDone.trim()} onClick={() => step("resolved", "Marked resolved.")}>
                Mark resolved
              </button>
            )}
            {(r.status === "resolved" || r.status === "cancelled") && (
              <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" disabled={saving} onClick={() => step("in_progress", "Reopened.")}>
                Reopen
              </button>
            )}
            {(r.status === "open" || r.status === "in_progress") && (
              <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" disabled={saving} onClick={() => step("cancelled", "Cancelled.")}>
                Cancel request
              </button>
            )}
            {(r.status === "open" || r.status === "in_progress") && !workDone.trim() && (
              <span className="bl-meta" style={{ alignSelf: "center" }}>Describe the work done to resolve it.</span>
            )}
          </div>
        )}

        <div className="bl-fields">
          <label className="ux-label is-wide">
            <span>Summary</span>
            <input className="ux-input" value={summary} disabled={locked} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="ux-label is-wide">
            <span>Work done (shown to the client on the invoice)</span>
            <textarea className="ux-input" value={workDone} disabled={locked} rows={3} onChange={(e) => setWorkDone(e.target.value)} />
          </label>
          <label className="ux-label">
            <span>System</span>
            <select className="ux-select ux-input" value={systemId} disabled={locked} onChange={(e) => setSystemId(e.target.value)}>
              <option value="">Not specific</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label">
            <span>Priority</span>
            <select className="ux-select ux-input" value={priority} disabled={locked} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label">
            <span>Came in by</span>
            <select className="ux-select ux-input" value={channel} disabled={locked} onChange={(e) => setChannel(e.target.value)}>
              {Object.entries(CHANNEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label">
            <span>Billing</span>
            <select className="ux-select ux-input" value={billing} disabled={locked} onChange={(e) => setBilling(e.target.value)}>
              {Object.entries(BILLING).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!locked && (
          <div className="bl-form-foot">
            <button type="button" className="ux-btn ux-btn--secondary" disabled={saving || !dirty} onClick={saveDetails}>
              Save details
            </button>
          </div>
        )}

        {canPrice && billing === "chargeable" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
              <span className="bl-label">Quote · {currency}</span>
              {!locked && rateCards.length > 0 && (
                <select
                  className="ux-select ux-input"
                  style={{ maxWidth: 280, height: 32 }}
                  aria-label="Fill from a quote template"
                  value=""
                  onChange={(e) => {
                    const c = rateCards.find((x) => x.id === e.target.value);
                    if (c) setCharges(toEditorItems(c.items));
                  }}
                >
                  <option value="">Start from a template…</option>
                  {rateCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {locked ? (
              <ul className="bl-lines">
                {r.items.map((i, idx) => (
                  <li key={idx}>
                    <span>
                      {i.description} · {i.quantity} {i.unit ?? ""}
                    </span>
                    <span>{formatMoney(Math.round(i.quantity * i.unit_price * 100) / 100, currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <BreakdownEditor items={charges} onChange={setCharges} currency={currency} />
                <div className="bl-form-foot">
                  <button type="button" className="ux-btn ux-btn--primary" disabled={saving || !quoteDirty} onClick={saveCharges}>
                    Save quote · {formatMoney(breakdownTotal(charges), currency)}
                  </button>
                </div>
              </>
            )}

            {r.items.length > 0 && (
              <div className={`bl-agree${r.quote_agreed_at ? " is-agreed" : ""}`}>
                {r.quote_agreed_at ? (
                  <>
                    <span>
                      <b>Client agreed</b> {formatMoney(itemsTotal(r.items), currency)} on {fmtTime(r.quote_agreed_at)} EAT
                    </span>
                    {!locked && (
                      <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" disabled={saving} onClick={() => agree(null)}>
                        Withdraw
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span>
                      <b>Awaiting client agreement</b> to {formatMoney(itemsTotal(r.items), currency)}. The job can only be
                      invoiced once they agree.
                    </span>
                    <span className="bl-agree-act">
                      <input
                        className="ux-input"
                        type="datetime-local"
                        aria-label="When the client agreed"
                        value={agreedAt}
                        max={localInput()}
                        onChange={(e) => setAgreedAt(e.target.value)}
                      />
                      <button
                        type="button"
                        className="ux-btn ux-btn--primary ux-btn--small"
                        disabled={saving || !agreedAt || quoteDirty}
                        title={quoteDirty ? "Save the quote first" : undefined}
                        onClick={() => agree(agreedAt)}
                      >
                        Client agreed
                      </button>
                    </span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function InvoiceDialog({
  rows,
  currency: initialCurrency,
  onClose,
  onDone,
}: {
  rows: SupportRequestRow[];
  currency: string;
  onClose: () => void;
  onDone: (invoiceId: string) => void;
}) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const total = rows.reduce((a, r) => a + itemsTotal(r.items), 0);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await invoiceSupportRequests(
      rows.map((r) => r.id),
      currency,
      due,
    );
    setSaving(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not create the invoice");
      return;
    }
    onDone(res.data.invoiceId);
  }

  return (
    <Dialog labelledBy="inv-req-title" onClose={onClose} maxWidth={620}>
      <div className="bl-form">
        <h3 id="inv-req-title">Invoice {rows.length === 1 ? rows[0].reference : `${rows.length} jobs`}</h3>
        <p>
          Creates a <b>draft</b> invoice for {rows[0].clientName} with the agreed quote as its lines and a job report (work
          done, response times, quote agreement). The job is then locked; deleting the draft makes it billable again.
        </p>
        {error && <p className="bl-error">{error}</p>}
        <ul className="bl-lines">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                <span className="bl-mono">{r.reference}</span> · {r.summary}
              </span>
              <span>{formatMoney(itemsTotal(r.items), currency)}</span>
            </li>
          ))}
        </ul>
        <div className="bl-fields">
          <label className="ux-label">
            <span>Currency</span>
            <select className="ux-select ux-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="UGX">UGX</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="ux-label">
            <span>Due date</span>
            <input className="ux-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <div className="bl-ed-total">
          <span className="bl-label">Invoice total</span>
          <b>{formatMoney(total, currency)}</b>
        </div>
        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ux-btn ux-btn--primary" disabled={saving} onClick={create}>
            {saving ? "Creating…" : "Create draft invoice"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
