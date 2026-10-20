"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import { formatMoney } from "@/components/billing/breakdown-editor";
import { createAgreementFromPackage } from "@/lib/actions/agreement-contracts";
import { CYCLE_LABEL, STANDING_LABEL, STATUS_LABEL, STATUS_TONE, monthlyValue, type AgreementRow } from "@/lib/billing/agreement-data";
import { addMonths, fmtDay } from "@/lib/billing/periods";

export type AgreementListItem = AgreementRow & {
  charges: { amount: number; currency: string; billing_cycle: string }[];
  dueCount: number;
  dueLabel: string | null;
  nextInvoiceDate: string | null;
};

export type PackageOption = {
  id: string;
  name: string;
  currency: string;
  description: string | null;
  annualDiscount: number;
  monthly: number;
  sections: string[];
};

const PROPOSAL = ["draft", "sent", "accepted"];
const LIVE = ["active", "suspended", "reactivation_pending"];

export default function AgreementsList({
  items,
  packages,
  clients,
  systems,
  finance,
  today,
}: {
  items: AgreementListItem[];
  packages: PackageOption[];
  clients: { id: string; label: string }[];
  systems: { id: string; name: string; client_id: string }[];
  finance: boolean;
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("current");
  const [creating, setCreating] = useState(false);

  const live = items.filter((a) => LIVE.includes(a.status));
  const proposals = items.filter((a) => PROPOSAL.includes(a.status));
  const due = items.reduce((n, a) => n + a.dueCount, 0);
  const value = new Map<string, number>();
  for (const a of items.filter((x) => x.status === "active")) {
    for (const c of a.charges) value.set(c.currency, (value.get(c.currency) ?? 0) + monthlyValue(c));
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (status === "current" && !LIVE.includes(a.status) && !PROPOSAL.includes(a.status)) return false;
      if (status === "active" && !LIVE.includes(a.status)) return false;
      if (status === "proposals" && !PROPOSAL.includes(a.status)) return false;
      if (status === "due" && !a.dueCount) return false;
      if (status === "ended" && !["ended", "terminated"].includes(a.status)) return false;
      if (q && !`${a.name} ${a.clientName} ${a.contract_reference ?? ""} ${a.systemName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, status]);

  return (
    <>
      <div className="bl-top">
        <div className="bl-summary">
          <div className="bl-sum">
            <span className="bl-label">Active</span>
            <b>{live.length}</b>
            <small>{live.filter((a) => a.status !== "active").length ? `${live.filter((a) => a.status !== "active").length} suspended` : "all in service"}</small>
          </div>
          <div className={`bl-sum${proposals.length ? " is-warn" : ""}`}>
            <span className="bl-label">Proposals</span>
            <b>{proposals.length}</b>
            <small>
              {proposals.length
                ? `${proposals.filter((a) => a.status === "sent").length} awaiting acceptance`
                : "none open"}
            </small>
          </div>
          {finance && (
            <div className={`bl-sum${due ? " is-warn" : ""}`}>
              <span className="bl-label">To invoice</span>
              <b>{due}</b>
              <small>{due ? "periods ready to bill" : "all periods billed"}</small>
            </div>
          )}
          {finance && (
            <div className="bl-sum">
              <span className="bl-label">Monthly value</span>
              <b className="ag-value">
                {value.size
                  ? [...value.entries()].map(([cur, v]) => <span key={cur}>{formatMoney(Math.round(v * 100) / 100, cur)}</span>)
                  : "—"}
              </b>
              <small>active agreements</small>
            </div>
          )}
        </div>
        {finance && (
          <div className="bl-actions">
            <button type="button" className="ux-btn ux-btn--primary" onClick={() => setCreating(true)}>
              + New agreement
            </button>
            <Link href="/admin/finances/packages" className="ux-btn ux-btn--secondary">
              Packages
            </Link>
          </div>
        )}
      </div>

      <div className="bl-filters">
        <input
          className="ux-input"
          type="search"
          placeholder="Search agreement, client, reference"
          aria-label="Search agreements"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="ux-select" aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="current">Active &amp; proposals</option>
          <option value="active">Active</option>
          <option value="proposals">Proposals</option>
          {finance && <option value="due">To invoice</option>}
          <option value="ended">Ended</option>
          <option value="all">All</option>
        </select>
        <span className="bl-count">
          {visible.length} of {items.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="bl-panel bl-empty">
          <b>{items.length ? "Nothing matches" : "No agreements yet"}</b>
          {items.length
            ? "Try another filter."
            : finance
              ? "Create one from a package: pick the client, the package and the start date."
              : "Agreements appear here once Finance creates them."}
        </div>
      ) : (
        <ul className="ag-list">
          {visible.map((a) => {
            const standing = a.standing ? STANDING_LABEL[a.standing] : null;
            return (
              <li key={a.id}>
                <Link href={`/admin/agreements/${a.id}`} className="ag-row">
                  <span className="ag-row-main">
                    <span className="ag-row-name">{a.name}</span>
                    <span className="ag-row-sub">
                      {a.clientName}
                      {a.systemName ? ` · ${a.systemName}` : ""}
                      {a.contract_reference ? ` · ${a.contract_reference}` : ""}
                    </span>
                  </span>
                  {finance && (
                    <span className="ag-row-price">
                      {a.charges.length
                        ? a.charges.map((c, i) => (
                            <span key={i}>
                              {formatMoney(c.amount, c.currency)}
                              <small> / {CYCLE_LABEL[c.billing_cycle] ?? "period"}</small>
                            </span>
                          ))
                        : <small>No charge</small>}
                    </span>
                  )}
                  <span className="ag-row-bill">
                    {finance && a.dueCount > 0 ? (
                      <span className="bl-chip is-warn">To invoice · {a.dueLabel}{a.dueCount > 1 ? ` +${a.dueCount - 1}` : ""}</span>
                    ) : finance && a.nextInvoiceDate && LIVE.includes(a.status) ? (
                      <span className="bl-meta">Next invoice {fmtDay(a.nextInvoiceDate)}</span>
                    ) : PROPOSAL.includes(a.status) ? (
                      <span className="bl-meta">Starts {fmtDay(a.start_date)}</span>
                    ) : null}
                  </span>
                  <span className="ag-row-status">
                    <span className={`bl-chip ${STATUS_TONE[a.status] ?? ""}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                    {standing && a.status === "active" && a.standing !== "CURRENT" && (
                      <span className={`bl-chip ${standing.tone}`}>{standing.label}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <NewAgreementDialog
          packages={packages}
          clients={clients}
          systems={systems}
          today={today}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

export function NewAgreementDialog({
  packages,
  clients,
  systems,
  today,
  onClose,
}: {
  packages: PackageOption[];
  clients: { id: string; label: string }[];
  systems: { id: string; name: string; client_id: string }[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const firstOfNext = addMonths(`${today.slice(0, 7)}-01`, 1);
  const [clientId, setClientId] = useState("");
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "custom");
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const [name, setName] = useState(packages[0]?.name ?? "");
  const [nameTouched, setNameTouched] = useState(false);
  const [startDate, setStartDate] = useState(firstOfNext);
  const [timing, setTiming] = useState<"in_arrears" | "in_advance">("in_arrears");
  const [dueDays, setDueDays] = useState("14");
  const [systemId, setSystemId] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("UGX");
  const [startAs, setStartAs] = useState<"draft" | "active">("draft");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const clientSystems = systems.filter((s) => s.client_id === clientId);
  const annualGross = pkg ? pkg.monthly * 12 : 0;
  const price = pkg
    ? plan === "annual"
      ? annualGross - pkg.annualDiscount
      : pkg.monthly
    : Number(amount) || 0;
  const cur = pkg?.currency ?? currency;

  const choosePackage = (id: string) => {
    setPackageId(id);
    const p = packages.find((x) => x.id === id);
    if (p && !nameTouched) setName(p.name);
  };

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await createAgreementFromPackage({
      clientId,
      name,
      startDate,
      plan,
      packageId: pkg?.id ?? null,
      amount: pkg ? null : Number(amount),
      currency,
      systemId: systemId || null,
      status: startAs,
      invoiceTiming: timing,
      paymentDueDays: Number(dueDays),
      contractReference: reference || null,
    });
    setSaving(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not create the agreement");
      return;
    }
    router.push(`/admin/agreements/${res.data.id}`);
  }

  return (
    <Dialog labelledBy="na-title" onClose={onClose} maxWidth={760}>
      <div className="bl-form bl-dialog-scroll">
        <h3 id="na-title">New agreement</h3>
        <p>The package fills in the price breakdown, what&apos;s included and excluded, and the response targets. You can adjust all of it afterwards.</p>
        {error && <p className="bl-error">{error}</p>}

        <div className="bl-fields">
          <label className="ux-label is-wide">
            <span>Client</span>
            <select className="ux-select ux-input" value={clientId} onChange={(e) => { setClientId(e.target.value); setSystemId(""); }}>
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="ag-pkgs">
          <legend className="bl-label">Package</legend>
          {packages.map((p) => (
            <label key={p.id} className={`ag-pkg${packageId === p.id ? " is-on" : ""}`}>
              <input type="radio" name="pkg" value={p.id} checked={packageId === p.id} onChange={() => choosePackage(p.id)} />
              <span className="ag-pkg-name">{p.name}</span>
              <span className="ag-pkg-price">
                {formatMoney(p.monthly, p.currency)}
                <small> / month</small>
              </span>
              <span className="ag-pkg-desc">{p.sections.join(" · ")}</span>
            </label>
          ))}
          <label className={`ag-pkg${packageId === "custom" ? " is-on" : ""}`}>
            <input type="radio" name="pkg" value="custom" checked={packageId === "custom"} onChange={() => setPackageId("custom")} />
            <span className="ag-pkg-name">Custom amount</span>
            <span className="ag-pkg-desc">One line at your own price; itemise it later if you like.</span>
          </label>
        </fieldset>

        {!pkg && (
          <div className="bl-fields">
            <label className="ux-label">
              <span>Amount per {plan === "annual" ? "year" : "month"}</span>
              <input className="ux-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="ux-label">
              <span>Currency</span>
              <select className="ux-select ux-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="UGX">UGX</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
        )}

        <div className="ag-plan" role="radiogroup" aria-label="Billing plan">
          {(["monthly", "annual"] as const).map((p) => (
            <label key={p} className={`ag-plan-opt${plan === p ? " is-on" : ""}`}>
              <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} />
              <span>
                <b>{p === "monthly" ? "Monthly" : "Annual"}</b>
                {pkg && (
                  <small>
                    {p === "monthly"
                      ? `${formatMoney(pkg.monthly, pkg.currency)} each month`
                      : pkg.annualDiscount > 0
                        ? `${formatMoney(annualGross - pkg.annualDiscount, pkg.currency)} a year · saves ${formatMoney(pkg.annualDiscount, pkg.currency)}`
                        : `${formatMoney(annualGross, pkg.currency)} a year`}
                  </small>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="bl-fields">
          <label className="ux-label is-wide">
            <span>Agreement name</span>
            <input className="ux-input" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
          </label>
          <label className="ux-label">
            <span>First billing period starts</span>
            <input className="ux-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="ux-label">
            <span>Invoice</span>
            <select className="ux-select ux-input" value={timing} onChange={(e) => setTiming(e.target.value as "in_arrears" | "in_advance")}>
              <option value="in_arrears">At the end of each period</option>
              <option value="in_advance">At the start of each period</option>
            </select>
          </label>
          <label className="ux-label">
            <span>Payment due (days)</span>
            <input className="ux-input" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
          </label>
          <label className="ux-label">
            <span>System covered</span>
            <select className="ux-select ux-input" value={systemId} disabled={!clientId} onChange={(e) => setSystemId(e.target.value)}>
              <option value="">{clientId ? (clientSystems.length ? "Not specific" : "No systems for this client") : "Choose a client first"}</option>
              {clientSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ux-label">
            <span>Reference (optional)</span>
            <input className="ux-input" placeholder="e.g. EBC-MSC-2026" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>

        <div className="ag-plan" role="radiogroup" aria-label="Start as">
          <label className={`ag-plan-opt${startAs === "draft" ? " is-on" : ""}`}>
            <input type="radio" name="startas" checked={startAs === "draft"} onChange={() => setStartAs("draft")} />
            <span>
              <b>Proposal</b>
              <small>Send it, record acceptance, then activate</small>
            </span>
          </label>
          <label className={`ag-plan-opt${startAs === "active" ? " is-on" : ""}`}>
            <input type="radio" name="startas" checked={startAs === "active"} onChange={() => setStartAs("active")} />
            <span>
              <b>Active now</b>
              <small>Already agreed; start billing</small>
            </span>
          </label>
        </div>

        <div className="bl-ed-total">
          <span className="bl-label">{plan === "annual" ? "Per year" : "Per month"}</span>
          <b>{formatMoney(price, cur)}</b>
        </div>

        <div className="bl-form-foot">
          <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ux-btn ux-btn--primary"
            disabled={saving || !clientId || !name.trim() || !startDate || (!pkg && !(Number(amount) > 0))}
            onClick={submit}
          >
            {saving ? "Creating…" : "Create agreement"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
