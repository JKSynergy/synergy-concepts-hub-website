"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import {
  BreakdownEditor,
  blankItem,
  breakdownTotal,
  formatMoney,
  toEditorItems,
  toRows,
  type BreakdownRow,
  type EditorItem,
} from "@/components/billing/breakdown-editor";
import { savePackage, setPackageArchived } from "@/lib/actions/service-billing";
import { DEFAULT_TARGETS, TargetsEditor, withAllPriorities } from "@/components/billing/targets-editor";
import type { ResponseTarget } from "@/lib/billing/response-targets";

export type PackageRow = {
  id: string;
  name: string;
  kind: "recurring" | "per_request" | string;
  currency: string;
  billing_cycle: string;
  description: string | null;
  archived_at: string | null;
  updated_at: string;
  usedBy: number;
  items: (BreakdownRow & { position: number })[];
  scope_included: string | null;
  scope_excluded: string | null;
  response_targets: ResponseTarget[];
  annual_discount: number;
};

const KIND_LABEL: Record<string, string> = { recurring: "Monthly package", per_request: "Quote template" };
const CYCLE_LABEL: Record<string, string> = {
  monthly: "/ month",
  quarterly: "/ quarter",
  semi_annual: "/ 6 months",
  annual: "/ year",
  custom: "",
};

type Draft = {
  id?: string;
  name: string;
  kind: string;
  currency: string;
  billingCycle: string;
  description: string;
  items: EditorItem[];
  scopeIncluded: string;
  scopeExcluded: string;
  targets: ResponseTarget[];
  annualDiscount: string;
};

const emptyDraft = (kind: string): Draft => ({
  name: "",
  kind,
  currency: "UGX",
  billingCycle: "monthly",
  description: "",
  scopeIncluded: "",
  scopeExcluded: "",
  targets: DEFAULT_TARGETS,
  annualDiscount: "0",
  items:
    kind === "per_request"
      ? [
          { ...blankItem(), description: "Call-out & diagnosis", unit: "visit" },
          { ...blankItem(), description: "Technical work", unit: "hours" },
        ]
      : [blankItem("Maintenance & support"), blankItem("Hosting & infrastructure")],
});

const templateFields = (p: PackageRow) => ({
  scopeIncluded: p.scope_included ?? "",
  scopeExcluded: p.scope_excluded ?? "",
  targets: p.response_targets.length ? withAllPriorities(p.response_targets) : DEFAULT_TARGETS,
  annualDiscount: String(p.annual_discount ?? 0),
});

export default function PackagesManager({ packages }: { packages: PackageRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [kindFilter, setKindFilter] = useState("all");

  const active = packages.filter((p) => !p.archived_at);
  const visible = useMemo(
    () =>
      packages.filter(
        (p) => (showArchived || !p.archived_at) && (kindFilter === "all" || p.kind === kindFilter),
      ),
    [packages, showArchived, kindFilter],
  );

  const open = (p?: PackageRow, kind = "recurring") => {
    setError(null);
    setDraft(
      p
        ? {
            id: p.id,
            name: p.name,
            kind: p.kind,
            currency: p.currency,
            billingCycle: p.billing_cycle,
            description: p.description ?? "",
            items: toEditorItems(p.items),
            ...templateFields(p),
          }
        : emptyDraft(kind),
    );
  };

  const duplicate = (p: PackageRow) => {
    setError(null);
    setDraft({
      name: `${p.name} (copy)`,
      kind: p.kind,
      currency: p.currency,
      billingCycle: p.billing_cycle,
      description: p.description ?? "",
      items: toEditorItems(p.items),
      ...templateFields(p),
    });
  };

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await savePackage({
      id: draft.id,
      name: draft.name,
      kind: draft.kind,
      currency: draft.currency,
      billingCycle: draft.billingCycle,
      description: draft.description,
      items: toRows(draft.items),
      ...(draft.kind === "recurring"
        ? {
            scopeIncluded: draft.scopeIncluded,
            scopeExcluded: draft.scopeExcluded,
            responseTargets: draft.targets.filter((t) => t.target.trim()),
            annualDiscount: Number(draft.annualDiscount) || 0,
          }
        : {}),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save the package");
      return;
    }
    setDraft(null);
    router.refresh();
  }

  async function toggleArchive(p: PackageRow) {
    const res = await setPackageArchived(p.id, !p.archived_at);
    if (!res.ok) setError(res.error ?? "Could not update the package");
    router.refresh();
  }

  return (
    <>
      <div className="bl-top">
        <div className="bl-summary">
          <div className="bl-sum">
            <span className="bl-label">Monthly packages</span>
            <b>{active.filter((p) => p.kind === "recurring").length}</b>
            <small>standard fees, itemised</small>
          </div>
          <div className="bl-sum">
            <span className="bl-label">Quote templates</span>
            <b>{active.filter((p) => p.kind === "per_request").length}</b>
            <small>starting points for one-off job quotes</small>
          </div>
          <div className="bl-sum">
            <span className="bl-label">In use</span>
            <b>{active.reduce((a, p) => a + p.usedBy, 0)}</b>
            <small>charges and requests</small>
          </div>
        </div>
        <div className="bl-actions">
          <button type="button" className="ux-btn ux-btn--primary" onClick={() => open(undefined, "recurring")}>
            + Monthly package
          </button>
          <button type="button" className="ux-btn ux-btn--secondary" onClick={() => open(undefined, "per_request")}>
            + Quote template
          </button>
        </div>
      </div>

      {error && !draft && <p className="bl-error">{error}</p>}

      <div className="bl-filters">
        <select className="ux-select" aria-label="Package type" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="recurring">Monthly packages</option>
          <option value="per_request">Quote templates</option>
        </select>
        <label className="bl-meta" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        <span className="bl-count">
          {visible.length} of {packages.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="bl-panel bl-empty">
          <b>No packages yet</b>
          Create a monthly package to itemise a standard fee, or a quote template to start one-off job quotes from.
        </div>
      ) : (
        <ul className="bl-grid">
          {visible.map((p) => {
            const total = p.items.reduce((a, i) => a + Math.round(i.quantity * i.unit_price * 100) / 100, 0);
            let lastSec: string | null | undefined;
            return (
              <li key={p.id} className={`bl-card${p.archived_at ? " is-archived" : ""}`}>
                <div className="bl-card-head">
                  <div style={{ minWidth: 0 }}>
                    <h3>{p.name}</h3>
                    <div className="bl-req-chips">
                      <span className={`bl-chip${p.kind === "per_request" ? " is-info" : ""}`}>{KIND_LABEL[p.kind] ?? p.kind}</span>
                      <span className="bl-chip">{p.currency}</span>
                      {p.archived_at && <span className="bl-chip is-warn">Archived</span>}
                    </div>
                  </div>
                  {p.kind === "recurring" ? (
                    <div className="bl-price">
                      {formatMoney(total, p.currency)} <small>{CYCLE_LABEL[p.billing_cycle] ?? ""}</small>
                    </div>
                  ) : (
                    <div className="bl-price">
                      <small>rates</small>
                    </div>
                  )}
                </div>
                {p.description && <p className="bl-meta" style={{ margin: 0 }}>{p.description}</p>}
                <ul className="bl-lines">
                  {p.items.slice(0, 8).flatMap((i, idx) => {
                    const out = [];
                    if (i.section && i.section !== lastSec) {
                      out.push(<li key={`s${idx}`} className="is-sec"><span>{i.section}</span><span /></li>);
                    }
                    lastSec = i.section;
                    out.push(
                      <li key={idx}>
                        <span>{i.description}</span>
                        <span>
                          {p.kind === "per_request"
                            ? `${formatMoney(i.unit_price, p.currency)} / ${i.unit || "unit"}`
                            : formatMoney(Math.round(i.quantity * i.unit_price * 100) / 100, p.currency)}
                        </span>
                      </li>,
                    );
                    return out;
                  })}
                  {p.items.length > 8 && (
                    <li>
                      <span className="bl-meta">+ {p.items.length - 8} more lines</span>
                      <span />
                    </li>
                  )}
                </ul>
                <div className="bl-card-foot">
                  <span className="bl-meta">
                    {p.usedBy ? `Used by ${p.usedBy}` : "Not used yet"} · {p.items.length} lines
                  </span>
                  <div className="bl-row-actions">
                    <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => open(p)}>
                      Edit
                    </button>
                    <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => duplicate(p)}>
                      Duplicate
                    </button>
                    <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => toggleArchive(p)}>
                      {p.archived_at ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <Dialog labelledBy="pkg-dialog-title" onClose={() => setDraft(null)} maxWidth={920}>
          <div className="bl-form bl-dialog-scroll">
            <h3 id="pkg-dialog-title">
              {draft.id ? "Edit" : "New"} {draft.kind === "per_request" ? "quote template" : "monthly package"}
            </h3>
            <p>
              {draft.kind === "per_request"
                ? "Unit prices used to price a one-off support request. Quantities are set per request."
                : "Each line appears on the client's invoice with the billing period under it. Changes here do not alter charges already using the package."}
            </p>
            {error && <p className="bl-error">{error}</p>}
            <div className="bl-fields">
              <label className="ux-label is-wide">
                <span>Name</span>
                <input
                  className="ux-input"
                  value={draft.name}
                  placeholder={draft.kind === "per_request" ? "Ad-hoc support — standard rates" : "Managed System Care"}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="ux-label">
                <span>Currency</span>
                <select className="ux-select ux-input" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                  <option value="UGX">UGX</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              {draft.kind === "recurring" && (
                <label className="ux-label">
                  <span>Billing cycle</span>
                  <select className="ux-select ux-input" value={draft.billingCycle} onChange={(e) => setDraft({ ...draft, billingCycle: e.target.value })}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="semi_annual">Every 6 months</option>
                    <option value="annual">Annual</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
              )}
              <label className="ux-label is-wide">
                <span>Internal note (not printed)</span>
                <input className="ux-input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </label>
            </div>
            <BreakdownEditor items={draft.items} onChange={(items) => setDraft({ ...draft, items })} currency={draft.currency} />
            {draft.kind === "recurring" && (
              <details className="pk-defaults" open={!draft.id}>
                <summary>
                  <span className="bl-label">Agreement defaults</span>
                  <span className="bl-meta">Copied into each new agreement made from this package</span>
                </summary>
                <div className="bl-fields">
                  <label className="ux-label">
                    <span>Included (one per line)</span>
                    <textarea className="ux-input" rows={7} value={draft.scopeIncluded} onChange={(e) => setDraft({ ...draft, scopeIncluded: e.target.value })} />
                  </label>
                  <label className="ux-label">
                    <span>Not included (printed on invoices)</span>
                    <textarea className="ux-input" rows={7} value={draft.scopeExcluded} onChange={(e) => setDraft({ ...draft, scopeExcluded: e.target.value })} />
                  </label>
                  <label className="ux-label">
                    <span>Annual commitment discount ({draft.currency})</span>
                    <input className="ux-input" inputMode="decimal" value={draft.annualDiscount} onChange={(e) => setDraft({ ...draft, annualDiscount: e.target.value })} />
                  </label>
                  <div className="ux-label bl-meta" style={{ alignSelf: "end" }}>
                    Annual price: {formatMoney(Math.max(0, breakdownTotal(draft.items) * 12 - (Number(draft.annualDiscount) || 0)), draft.currency)}
                  </div>
                </div>
                <span className="bl-label">Response targets</span>
                <TargetsEditor value={draft.targets} onChange={(targets) => setDraft({ ...draft, targets })} />
              </details>
            )}
            <div className="bl-form-foot">
              <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className="ux-btn ux-btn--primary" disabled={saving} onClick={save}>
                {saving ? "Saving…" : `Save · ${formatMoney(breakdownTotal(draft.items), draft.currency)}`}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
