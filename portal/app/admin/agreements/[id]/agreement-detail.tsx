"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { formatMoney } from "@/components/billing/breakdown-editor";
import { BillingPreviewDialog, type PreviewTarget } from "@/components/billing/billing-preview";
import { ChargeBreakdownButton, type ChargePackageOption } from "../charge-breakdown";
import { DEFAULT_TARGETS, TargetsEditor, withAllPriorities } from "@/components/billing/targets-editor";
import {
  prepareSignedDocumentUpload,
  registerSignedDocument,
  setAgreementStage,
  signedDocumentUrl,
  updateAgreementTerms,
} from "@/lib/actions/agreement-contracts";
import { attachResourceToAgreement, terminateAgreement, updateAgreementOperationalNotes } from "@/lib/actions/agreements";
import {
  CYCLE_LABEL,
  STANDING_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  type AgreementRow,
  type ChargeRow,
  type PeriodState,
} from "@/lib/billing/agreement-data";
import { fmtDay, periodLabel } from "@/lib/billing/periods";
import { PRIORITY_LABEL, measure, splitList, type ResponseTarget } from "@/lib/billing/response-targets";

export type SupportItem = {
  id: string;
  reference: string;
  summary: string;
  priority: string;
  billing: string;
  status: string;
  requested_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
};
export type ResourceItem = { id: string; name: string; type: string; status: string; notes: string | null };

type Tab = "overview" | "billing" | "scope" | "acceptance" | "resources";

const TZ = "Africa/Kampala";
const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";

const STAGES = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "active", label: "Active" },
] as const;
const STAGE_INDEX: Record<string, number> = { draft: 0, sent: 1, accepted: 2, active: 3, suspended: 3, reactivation_pending: 3, ended: 4, terminated: 4 };

export default function AgreementDetail({
  agreement: a,
  charges,
  periods,
  support,
  resources,
  availableResources,
  systems,
  packages,
  finance,
  today,
  initialTab,
}: {
  initialTab?: string;
  agreement: AgreementRow;
  charges: ChargeRow[];
  periods: PeriodState[];
  support: SupportItem[];
  resources: ResourceItem[];
  availableResources: { id: string; name: string; type: string }[];
  systems: { id: string; name: string }[];
  packages: ChargePackageOption[];
  finance: boolean;
  today: string;
}) {
  const router = useRouter();
  const due = periods.filter((p) => p.state === "due");
  const TABS: Tab[] = ["overview", "billing", "scope", "acceptance", "resources"];
  const [tab, setTab] = useState<Tab>(
    TABS.includes(initialTab as Tab) && (initialTab !== "billing" || finance)
      ? (initialTab as Tab)
      : finance && due.length
        ? "billing"
        : "overview",
  );
  const [dialog, setDialog] = useState<null | "terms" | "scope" | "accept" | "upload" | "terminate">(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const standing = a.standing ? STANDING_LABEL[a.standing] : null;
  const stage = STAGE_INDEX[a.status] ?? 0;
  const ended = ["ended", "terminated"].includes(a.status);

  async function stageTo(next: "draft" | "sent" | "active", message: string) {
    setBusy(true);
    setError(null);
    const res = await setAgreementStage(a.id, next);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Could not update the agreement");
    setNotice(message);
    router.refresh();
  }

  async function download() {
    const res = await signedDocumentUrl(a.id);
    if (!res.ok || !res.data) return setError(res.error ?? "Could not open the document");
    window.location.assign(res.data.url);
  }

  const openPreview = (p: PeriodState) => {
    const c = charges.find((x) => x.id === p.chargeId)!;
    setPreview({
      agreementId: a.id,
      agreementName: a.name,
      chargeId: c.id,
      clientName: a.clientName,
      periodStart: p.start,
      periodLabel: periodLabel(p),
      amount: c.amount,
      currency: c.currency,
    });
  };

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    ...(finance ? [{ key: "billing" as Tab, label: "Billing", badge: due.length || undefined }] : []),
    { key: "scope", label: "Scope & support" },
    { key: "acceptance", label: "Acceptance" },
    { key: "resources", label: "Resources & notes" },
  ];

  return (
    <>
      <header className="ag-head">
        <div className="ag-head-main">
          <span className="ux-eyebrow">{a.clientName}</span>
          <h1 className="ag-title">{a.name}</h1>
          <div className="ag-chips">
            <span className={`bl-chip ${STATUS_TONE[a.status] ?? ""}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
            {standing && a.status === "active" && <span className={`bl-chip ${standing.tone}`}>{standing.label}</span>}
            {a.contract_reference && <span className="bl-chip">{a.contract_reference}</span>}
            {a.systemName && <span className="bl-chip">{a.systemName}</span>}
          </div>
        </div>
        {finance && !ended && (
          <div className="ag-head-actions">
            {a.status === "draft" && (
              <>
                <button type="button" className="ux-btn ux-btn--primary" disabled={busy} onClick={() => stageTo("sent", "Marked as sent to the client.")}>
                  Mark as sent
                </button>
                <button type="button" className="ux-btn ux-btn--secondary" disabled={busy} onClick={() => setDialog("accept")}>
                  Record acceptance
                </button>
              </>
            )}
            {a.status === "sent" && (
              <>
                <button type="button" className="ux-btn ux-btn--primary" disabled={busy} onClick={() => setDialog("accept")}>
                  Record acceptance
                </button>
                <button type="button" className="ux-btn ux-btn--secondary" disabled={busy} onClick={() => stageTo("draft", "Back to draft.")}>
                  Back to draft
                </button>
              </>
            )}
            {a.status === "accepted" && (
              <button type="button" className="ux-btn ux-btn--primary" disabled={busy} onClick={() => stageTo("active", "Agreement is active. Billing starts from its first period.")}>
                Activate &amp; start billing
              </button>
            )}
            {["draft", "sent"].includes(a.status) && (
              <button type="button" className="ux-btn ux-btn--secondary" disabled={busy} onClick={() => stageTo("active", "Agreement is active.")}>
                Activate now
              </button>
            )}
            {a.status === "active" && due.length > 0 && (
              <button type="button" className="ux-btn ux-btn--primary" onClick={() => openPreview(due[0])}>
                Invoice {periodLabel(due[0])}
              </button>
            )}
          </div>
        )}
      </header>

      <ol className="ag-stages" aria-label="Agreement progress">
        {STAGES.map((s, i) => {
          const when =
            s.key === "sent" ? a.sent_at : s.key === "accepted" ? a.accepted_at : s.key === "draft" ? a.created_at : null;
          const state = ended ? "is-done" : i < stage ? "is-done" : i === stage ? "is-now" : "";
          return (
            <li key={s.key} className={state}>
              <span className="ag-stage-dot" aria-hidden="true" />
              <span className="ag-stage-label">{s.label}</span>
              <span className="ag-stage-when">
                {s.key === "active" ? (stage >= 3 ? `from ${fmtDay(a.start_date)}` : `starts ${fmtDay(a.start_date)}`) : when ? fmtDay(when.slice(0, 10)) : "—"}
              </span>
            </li>
          );
        })}
        {ended && (
          <li className="is-now is-end">
            <span className="ag-stage-dot" aria-hidden="true" />
            <span className="ag-stage-label">{STATUS_LABEL[a.status]}</span>
            <span className="ag-stage-when">{a.terminated_at ? fmtDay(a.terminated_at.slice(0, 10)) : a.end_date ? fmtDay(a.end_date) : "—"}</span>
          </li>
        )}
      </ol>

      {error && <p className="bl-error">{error}</p>}
      {notice && <p className="bl-ok" role="status">{notice}</p>}

      <nav className="ag-tabs" aria-label="Agreement sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "is-on" : ""}
            aria-current={tab === t.key ? "page" : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.badge ? <span className="ag-badge">{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="ag-sec">
          <div className="ag-sec-head">
            <h2>Terms</h2>
            {finance && !ended && (
              <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => setDialog("terms")}>
                Edit terms
              </button>
            )}
          </div>
          <dl className="bl-kv">
            <div><dt>Client</dt><dd>{a.clientName}</dd></div>
            <div><dt>System</dt><dd>{a.systemName ?? "Not specific"}</dd></div>
            <div><dt>Billing</dt><dd>{a.billing_cycle === "annual" ? "Annual" : a.billing_cycle === "monthly" ? "Monthly" : a.billing_cycle}</dd></div>
            <div><dt>Invoiced</dt><dd>{a.invoice_timing === "in_advance" ? "Start of each period" : "End of each period"}</dd></div>
            <div><dt>Payment due</dt><dd>{a.payment_due_days} days after invoice</dd></div>
            <div><dt>Grace · notice</dt><dd>{a.default_grace_days} d · {a.notice_days} d</dd></div>
            <div><dt>Start</dt><dd>{fmtDay(a.start_date)}</dd></div>
            <div><dt>Renewal</dt><dd>{fmtDay(a.renewal_date)}</dd></div>
            <div><dt>End</dt><dd>{a.end_date ? fmtDay(a.end_date) : "Open-ended"}</dd></div>
          </dl>

          {finance && (
            <>
              <div className="ag-sec-head">
                <h2>Fees</h2>
              </div>
              {charges.length === 0 ? (
                <div className="bl-panel bl-empty">No charge on this agreement.</div>
              ) : (
                charges.map((c) => <FeeTable key={c.id} charge={c} packages={packages} editable={!ended} />)
              )}
            </>
          )}

          {finance && !ended && (
            <div className="ag-danger">
              <span className="bl-meta">Ending the agreement stops billing. Issued invoices are kept.</span>
              <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => setDialog("terminate")}>
                Terminate agreement
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "billing" && finance && (
        <section className="ag-sec">
          {!["active", "reactivation_pending"].includes(a.status) && !ended && (
            <p className="bl-meta ag-callout">Billing starts once the agreement is active. You can still preview any period.</p>
          )}
          {charges.map((c) => {
            const own = periods.filter((p) => p.chargeId === c.id).slice().reverse();
            return (
              <div key={c.id} className="ag-bill">
                <div className="ag-sec-head">
                  <h2>
                    {c.name} <small>{formatMoney(c.amount, c.currency)} / {CYCLE_LABEL[c.billing_cycle] ?? "period"}</small>
                  </h2>
                </div>
                {own.length === 0 ? (
                  <div className="bl-panel bl-empty">Billing periods appear from {fmtDay(c.start_date)}.</div>
                ) : (
                  <table className="ux-table ux-table--stack ux-table--cards ag-periods">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Invoice date</th>
                        <th>Invoice</th>
                        <th className="ag-num">Amount</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {own.map((p) => (
                        <tr key={p.start} className={`is-${p.state}`}>
                          <td data-label="Period">
                            <b>{periodLabel(p)}</b>
                          </td>
                          <td data-label="Invoice date" className="bl-mono">
                            {fmtDay(p.invoiceDate)}
                          </td>
                          <td data-label="Invoice">
                            {p.run?.invoice ? (
                              <span className="ag-inv">
                                <Link href={`/admin/invoices/${p.run.invoice_id}`} className="bl-mono">
                                  {p.run.invoice.number}
                                </Link>
                                <span className={`bl-chip ${p.run.invoice.status === "paid" ? "is-ok" : p.run.invoice.status === "overdue" ? "is-bad" : p.run.invoice.status === "draft" ? "" : "is-info"}`}>
                                  {p.run.invoice.status}
                                </span>
                              </span>
                            ) : p.state === "due" ? (
                              <span className="bl-chip is-warn">Ready to invoice</span>
                            ) : (
                              <span className="bl-meta">Upcoming</span>
                            )}
                          </td>
                          <td data-label="Amount" className="ag-num bl-mono">
                            {formatMoney(p.run?.invoice?.total ?? c.amount, p.run?.invoice?.currency ?? c.currency)}
                          </td>
                          <td className="ag-act">
                            {p.state === "due" ? (
                              <button type="button" className="ux-btn ux-btn--primary ux-btn--small" onClick={() => openPreview(p)}>
                                Preview &amp; send
                              </button>
                            ) : p.state === "upcoming" ? (
                              <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => openPreview(p)}>
                                Preview
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "scope" && (
        <section className="ag-sec">
          <div className="ag-sec-head">
            <h2>What&apos;s covered</h2>
            {finance && !ended && (
              <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => setDialog("scope")}>
                Edit scope &amp; targets
              </button>
            )}
          </div>
          <div className="ag-scope">
            <div className="bl-panel">
              <span className="bl-label">Included</span>
              <ScopeList items={splitList(a.scope_included)} empty="Nothing listed yet." />
            </div>
            <div className="bl-panel">
              <span className="bl-label">Not included · quoted separately</span>
              <ScopeList items={splitList(a.scope_excluded)} empty="Nothing listed yet." muted />
            </div>
          </div>

          <div className="ag-sec-head">
            <h2>Support response targets</h2>
          </div>
          {a.response_targets.length === 0 ? (
            <div className="bl-panel bl-empty">No response targets agreed.</div>
          ) : (
            <table className="ux-table ux-table--stack ux-table--cards ag-targets">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Example</th>
                  <th>Target initial response</th>
                </tr>
              </thead>
              <tbody>
                {a.response_targets.map((t) => (
                  <tr key={t.priority}>
                    <td data-label="Priority">
                      <span className="ag-pri">
                        <span className={`bl-pri is-${t.priority}`} /> {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </td>
                    <td data-label="Example">{t.example ?? "—"}</td>
                    <td data-label="Target"><b>{t.target}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="bl-meta">Measured in business hours: Monday–Friday, 08:00–17:00 East Africa Time.</p>

          <div className="ag-sec-head">
            <h2>Recent support</h2>
            <Link href="/admin/support" className="ux-btn ux-btn--secondary ux-btn--small">
              Open Support
            </Link>
          </div>
          {support.length === 0 ? (
            <div className="bl-panel bl-empty">No support requests logged for this client yet.</div>
          ) : (
            <ul className="ag-support">
              {support.map((r) => {
                const o = measure(a.response_targets, r);
                return (
                  <li key={r.id}>
                    <span className={`bl-pri is-${r.priority}`} title={PRIORITY_LABEL[r.priority]} />
                    <span className="bl-mono ag-support-ref">{r.reference}</span>
                    <span className="ag-support-sum">{r.summary}</span>
                    <span className="bl-meta">{fmtTime(r.requested_at)}</span>
                    <span>
                      {r.billing !== "covered" ? (
                        <span className="bl-chip">{r.billing === "chargeable" ? "Billed per job" : "No charge"}</span>
                      ) : !o || o.met === null ? (
                        <span className="bl-chip">{r.first_response_at ? "Responded" : "Awaiting response"}</span>
                      ) : o.met ? (
                        <span className="bl-chip is-ok">Target met</span>
                      ) : (
                        <span className="bl-chip is-bad">Target missed</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "acceptance" && (
        <section className="ag-sec">
          <dl className="bl-kv">
            <div><dt>Proposal created</dt><dd>{fmtTime(a.created_at)}</dd></div>
            <div><dt>Sent to client</dt><dd>{fmtTime(a.sent_at)}</dd></div>
            <div><dt>Accepted by</dt><dd>{a.accepted_by_name ? `${a.accepted_by_name}${a.accepted_by_title ? `, ${a.accepted_by_title}` : ""}` : "—"}</dd></div>
            <div><dt>Accepted on</dt><dd>{fmtTime(a.accepted_at)}</dd></div>
          </dl>
          <div className="ag-doc">
            <div>
              <span className="bl-label">Signed agreement</span>
              <p>{a.has_signed_document ? a.signed_document_name ?? "Signed agreement.pdf" : "No signed copy uploaded yet."}</p>
            </div>
            {finance && (
              <span className="bl-row-actions">
                {a.has_signed_document && (
                  <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={download}>
                    Download
                  </button>
                )}
                <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => setDialog("upload")}>
                  {a.has_signed_document ? "Replace PDF" : "Upload signed PDF"}
                </button>
              </span>
            )}
          </div>
          {finance && ["draft", "sent"].includes(a.status) && (
            <div className="bl-form-foot" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="ux-btn ux-btn--primary" onClick={() => setDialog("accept")}>
                Record acceptance
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "resources" && (
        <ResourcesTab agreementId={a.id} notes={a.operational_notes} resources={resources} available={availableResources} finance={finance} />
      )}

      {dialog === "terms" && <TermsDialog a={a} systems={systems} onClose={() => setDialog(null)} />}
      {dialog === "scope" && <ScopeDialog a={a} onClose={() => setDialog(null)} />}
      {dialog === "accept" && <AcceptDialog a={a} today={today} onClose={() => setDialog(null)} />}
      {dialog === "upload" && <UploadDialog a={a} onClose={() => setDialog(null)} />}
      {dialog === "terminate" && <TerminateDialog a={a} onClose={() => setDialog(null)} />}
      {preview && <BillingPreviewDialog target={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------

function ScopeList({ items, empty, muted }: { items: string[]; empty: string; muted?: boolean }) {
  if (!items.length) return <p className="bl-meta">{empty}</p>;
  return (
    <ul className={`ag-scope-list${muted ? " is-muted" : ""}`}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function FeeTable({ charge: c, packages, editable }: { charge: ChargeRow; packages: ChargePackageOption[]; editable: boolean }) {
  const lines = c.items.length
    ? c.items
    : [{ section: null, description: c.name, detail: c.description, quantity: 1, unit: null, unit_price: c.amount }];
  const money = (n: number) => formatMoney(Math.round(n * 100) / 100, c.currency);
  return (
    <div className="ag-fees">
      <div className="ag-fees-head">
        <span>
          <b>{c.name}</b>
          <span className="bl-meta"> · {CYCLE_LABEL[c.billing_cycle] === "year" ? "annual" : `per ${CYCLE_LABEL[c.billing_cycle] ?? "period"}`} · from {fmtDay(c.start_date)}</span>
        </span>
        {editable && (
          <ChargeBreakdownButton
            charge={{ id: c.id, name: c.name, amount: c.amount, currency: c.currency, package_id: c.package_id }}
            items={c.items}
            packages={packages}
          />
        )}
      </div>
      <table className="ag-fees-table">
        <tbody>
          {lines.map((l, i) => {
            const amount = Number(l.quantity) * Number(l.unit_price);
            const newSection = l.section && (i === 0 || lines[i - 1].section !== l.section) && amount >= 0;
            return (
              <Fragment key={i}>
                {newSection && (
                  <tr className="ag-fees-sec">
                    <td colSpan={3}>{l.section}</td>
                  </tr>
                )}
                <tr className={amount < 0 ? "is-discount" : ""}>
                  <td>
                    {l.description}
                    {l.detail && <small>{l.detail}</small>}
                  </td>
                  <td className="bl-mono ag-num">
                    {amount < 0 ? "" : `${Number(l.quantity).toLocaleString("en-US")} ${l.unit ?? ""} × ${Number(l.unit_price).toLocaleString("en-US")}`}
                  </td>
                  <td className="bl-mono ag-num">{amount < 0 ? `−${money(-amount)}` : money(amount)}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total per {CYCLE_LABEL[c.billing_cycle] ?? "period"}</td>
            <td className="bl-mono ag-num">{money(c.amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function useAction() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, onDone: () => void) => {
    setSaving(true);
    setError(null);
    const res = await fn();
    setSaving(false);
    if (!res.ok) return setError(res.error ?? "Something went wrong");
    router.refresh();
    onDone();
  };
  return { saving, error, run };
}

function TermsDialog({ a, systems, onClose }: { a: AgreementRow; systems: { id: string; name: string }[]; onClose: () => void }) {
  const { saving, error, run } = useAction();
  const [f, setF] = useState({
    name: a.name,
    reference: a.contract_reference ?? "",
    systemId: a.system_id ?? "",
    timing: a.invoice_timing,
    dueDays: String(a.payment_due_days),
    grace: String(a.default_grace_days),
    notice: String(a.notice_days),
    renewal: a.renewal_date ?? "",
    end: a.end_date ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog labelledBy="terms-title" onClose={onClose} maxWidth={680}>
      <div className="bl-form">
        <h3 id="terms-title">Edit terms</h3>
        {error && <p className="bl-error">{error}</p>}
        <div className="bl-fields">
          <label className="ux-label is-wide"><span>Agreement name</span><input className="ux-input" value={f.name} onChange={set("name")} /></label>
          <label className="ux-label"><span>Reference</span><input className="ux-input" value={f.reference} onChange={set("reference")} /></label>
          <label className="ux-label">
            <span>System covered</span>
            <select className="ux-select ux-input" value={f.systemId} onChange={set("systemId")}>
              <option value="">Not specific</option>
              {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="ux-label">
            <span>Invoice</span>
            <select className="ux-select ux-input" value={f.timing} onChange={set("timing")}>
              <option value="in_arrears">At the end of each period</option>
              <option value="in_advance">At the start of each period</option>
            </select>
          </label>
          <label className="ux-label"><span>Payment due (days)</span><input className="ux-input" inputMode="numeric" value={f.dueDays} onChange={set("dueDays")} /></label>
          <label className="ux-label"><span>Grace (days)</span><input className="ux-input" inputMode="numeric" value={f.grace} onChange={set("grace")} /></label>
          <label className="ux-label"><span>Notice (days)</span><input className="ux-input" inputMode="numeric" value={f.notice} onChange={set("notice")} /></label>
          <label className="ux-label"><span>Renewal date</span><input className="ux-input" type="date" value={f.renewal} onChange={set("renewal")} /></label>
          <label className="ux-label"><span>End date</span><input className="ux-input" type="date" value={f.end} onChange={set("end")} /></label>
        </div>
        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ux-btn ux-btn--primary"
            disabled={saving}
            onClick={() =>
              run(
                () =>
                  updateAgreementTerms(a.id, {
                    name: f.name,
                    contractReference: f.reference || null,
                    systemId: f.systemId || null,
                    invoiceTiming: f.timing === "in_advance" ? "in_advance" : "in_arrears",
                    paymentDueDays: Number(f.dueDays),
                    graceDays: Number(f.grace),
                    noticeDays: Number(f.notice),
                    renewalDate: f.renewal || null,
                    endDate: f.end || null,
                  }),
                onClose,
              )
            }
          >
            {saving ? "Saving…" : "Save terms"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ScopeDialog({ a, onClose }: { a: AgreementRow; onClose: () => void }) {
  const { saving, error, run } = useAction();
  const [included, setIncluded] = useState(a.scope_included ?? "");
  const [excluded, setExcluded] = useState(a.scope_excluded ?? "");
  const [targets, setTargets] = useState<ResponseTarget[]>(a.response_targets.length ? withAllPriorities(a.response_targets) : DEFAULT_TARGETS);
  return (
    <Dialog labelledBy="scope-title" onClose={onClose} maxWidth={860}>
      <div className="bl-form bl-dialog-scroll">
        <h3 id="scope-title">Scope &amp; response targets</h3>
        <p>One item per line. &ldquo;Not included&rdquo; is also printed on every invoice.</p>
        {error && <p className="bl-error">{error}</p>}
        <div className="bl-fields">
          <label className="ux-label">
            <span>Included</span>
            <textarea className="ux-input" rows={9} value={included} onChange={(e) => setIncluded(e.target.value)} />
          </label>
          <label className="ux-label">
            <span>Not included</span>
            <textarea className="ux-input" rows={9} value={excluded} onChange={(e) => setExcluded(e.target.value)} />
          </label>
        </div>
        <span className="bl-label">Response targets (business hours)</span>
        <TargetsEditor value={targets} onChange={setTargets} />
        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ux-btn ux-btn--primary"
            disabled={saving}
            onClick={() =>
              run(
                () =>
                  updateAgreementTerms(a.id, {
                    scopeIncluded: included,
                    scopeExcluded: excluded,
                    responseTargets: targets.filter((t) => t.target.trim()),
                  }),
                onClose,
              )
            }
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function AcceptDialog({ a, today, onClose }: { a: AgreementRow; today: string; onClose: () => void }) {
  const { saving, error, run } = useAction();
  const [name, setName] = useState(a.accepted_by_name ?? "");
  const [title, setTitle] = useState(a.accepted_by_title ?? "");
  const [date, setDate] = useState(today);
  return (
    <Dialog labelledBy="acc-title" onClose={onClose} maxWidth={560}>
      <div className="bl-form">
        <h3 id="acc-title">Record acceptance</h3>
        <p>Who signed or confirmed the agreement for {a.clientName}, and when. You can upload the signed PDF afterwards.</p>
        {error && <p className="bl-error">{error}</p>}
        <div className="bl-fields">
          <label className="ux-label is-wide"><span>Accepted by</span><input className="ux-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="ux-label"><span>Title / position</span><input className="ux-input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="ux-label"><span>Date</span><input className="ux-input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ux-btn ux-btn--primary"
            disabled={saving || name.trim().length < 2 || !date}
            onClick={() =>
              run(
                // Noon EAT on the chosen day (never in the future for today).
                () => setAgreementStage(a.id, "accepted", {
                  name,
                  title,
                  at: date === today ? new Date().toISOString() : `${date}T09:00:00.000Z`,
                }),
                onClose,
              )
            }
          >
            {saving ? "Saving…" : "Record acceptance"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function UploadDialog({ a, onClose }: { a: AgreementRow; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function upload() {
    if (!file) return;
    setSaving(true);
    setError(null);
    const prep = await prepareSignedDocumentUpload(a.id, { name: file.name, size: file.size, type: file.type || "application/pdf" });
    if (!prep.ok || !prep.data) {
      setSaving(false);
      return setError(prep.error ?? "Could not prepare the upload");
    }
    const { error: upErr } = await createBrowserSupabase()
      .storage.from("agreement-documents")
      .uploadToSignedUrl(prep.data.path, prep.data.token, file, { contentType: "application/pdf" });
    if (upErr) {
      setSaving(false);
      return setError("Upload failed. Check the file and try again.");
    }
    const reg = await registerSignedDocument(a.id, prep.data.path, file.name);
    setSaving(false);
    if (!reg.ok) return setError(reg.error ?? "Could not save the document");
    router.refresh();
    onClose();
  }

  return (
    <Dialog labelledBy="up-title" onClose={onClose} maxWidth={520}>
      <div className="bl-form">
        <h3 id="up-title">Upload signed agreement</h3>
        <p>PDF only, up to 10 MB. Stored privately; only Admin and Finance can download it.</p>
        {error && <p className="bl-error">{error}</p>}
        <input className="ux-input" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ux-btn ux-btn--primary" disabled={saving || !file} onClick={upload}>
            {saving ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function TerminateDialog({ a, onClose }: { a: AgreementRow; onClose: () => void }) {
  const { saving, error, run } = useAction();
  const [typed, setTyped] = useState("");
  return (
    <Dialog labelledBy="term-title" onClose={onClose} maxWidth={520} alert>
      <div className="bl-form">
        <h3 id="term-title">Terminate {a.name}?</h3>
        <p>
          Billing stops and the agreement can no longer be invoiced. Invoices already issued to {a.clientName} stay as they are.
          Type <b>TERMINATE</b> to confirm.
        </p>
        {error && <p className="bl-error">{error}</p>}
        <input className="ux-input" aria-label="Type TERMINATE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>Keep agreement</button>
          <button
            type="button"
            className="ux-btn ux-btn--danger"
            disabled={saving || typed !== "TERMINATE"}
            onClick={() => run(() => terminateAgreement(a.id), onClose)}
          >
            {saving ? "Terminating…" : "Terminate"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ResourcesTab({
  agreementId,
  notes,
  resources,
  available,
  finance,
}: {
  agreementId: string;
  notes: string | null;
  resources: ResourceItem[];
  available: { id: string; name: string; type: string }[];
  finance: boolean;
}) {
  const { saving, error, run } = useAction();
  const [text, setText] = useState(notes ?? "");
  const [pick, setPick] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <section className="ag-sec">
      <div className="ag-sec-head">
        <h2>Operational notes</h2>
      </div>
      {error && <p className="bl-error">{error}</p>}
      {saved && <p className="bl-ok" role="status">Notes saved.</p>}
      <textarea
        className="ux-input ag-notes"
        rows={5}
        aria-label="Operational notes"
        placeholder="How this client's system is run: contacts, access arrangements, quirks. No passwords or keys."
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
      />
      <div className="bl-form-foot" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className="ux-btn ux-btn--secondary ux-btn--small"
          disabled={saving || text === (notes ?? "")}
          onClick={() => run(() => updateAgreementOperationalNotes({ id: agreementId, operationalNotes: text || null }), () => setSaved(true))}
        >
          Save notes
        </button>
      </div>

      <div className="ag-sec-head">
        <h2>Covered resources</h2>
      </div>
      {resources.length === 0 ? (
        <div className="bl-panel bl-empty">No infrastructure resources attached.</div>
      ) : (
        <ul className="ag-res">
          {resources.map((r) => (
            <li key={r.id}>
              <b>{r.name}</b>
              <span className="bl-chip">{r.type.replace(/_/g, " ")}</span>
              <span className="bl-meta">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
      {finance && available.length > 0 && (
        <div className="ag-attach">
          <select className="ux-select ux-input" aria-label="Resource to attach" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Attach a resource…</option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.type.replace(/_/g, " ")})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ux-btn ux-btn--secondary ux-btn--small"
            disabled={!pick || saving}
            onClick={() => run(() => attachResourceToAgreement({ agreementId, resourceId: pick }), () => setPick(""))}
          >
            Attach
          </button>
        </div>
      )}
    </section>
  );
}
