"use client";

// Editable itemised breakdown: sections, lines (qty × unit price) and a live
// total. Used for packages, a client's recurring charge, and support charges.
// Amounts shown here mirror the database rule: round(qty × unit price, 2).

import { Fragment, useId } from "react";

export type EditorItem = {
  key: string;
  section: string;
  description: string;
  detail: string;
  quantity: string;
  unit: string;
  unit_price: string;
};

export type BreakdownRow = {
  section?: string | null;
  description: string;
  detail?: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
};

let seq = 0;
const newKey = () => `ln-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function blankItem(section = ""): EditorItem {
  return { key: newKey(), section, description: "", detail: "", quantity: "1", unit: "month", unit_price: "0" };
}

export function toEditorItems(rows: BreakdownRow[] | null | undefined): EditorItem[] {
  return (rows ?? []).map((r) => ({
    key: newKey(),
    section: r.section ?? "",
    description: r.description,
    detail: r.detail ?? "",
    quantity: String(Number(r.quantity)),
    unit: r.unit ?? "",
    unit_price: String(Number(r.unit_price)),
  }));
}

export function toRows(items: EditorItem[]): BreakdownRow[] {
  return items.map((i) => ({
    section: i.section.trim() || null,
    description: i.description.trim(),
    detail: i.detail.trim() || null,
    quantity: Number(i.quantity),
    unit: i.unit.trim() || null,
    unit_price: Number(i.unit_price),
  }));
}

const lineAmount = (i: EditorItem) => {
  const q = Number(i.quantity);
  const p = Number(i.unit_price);
  return Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p * 100) / 100 : 0;
};

export function breakdownTotal(items: EditorItem[]): number {
  return Math.round(items.reduce((a, i) => a + lineAmount(i), 0) * 100) / 100;
}

export function formatMoney(n: number, currency: string): string {
  const cents = currency === "USD";
  return `${currency} ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

export function BreakdownEditor({
  items,
  onChange,
  currency,
  target,
  targetLabel = "Charge amount",
}: {
  items: EditorItem[];
  onChange: (items: EditorItem[]) => void;
  currency: string;
  /** When set, the total must equal it (a client's standard charge). */
  target?: number;
  targetLabel?: string;
}) {
  const uid = useId();
  const total = breakdownTotal(items);
  const fmt = (n: number) => formatMoney(n, currency);
  const set = (key: string, patch: Partial<EditorItem>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const renameSection = (from: string, to: string) =>
    onChange(items.map((i) => (i.section === from ? { ...i, section: to } : i)));
  const lastSection = items.length ? items[items.length - 1].section : "";

  const sectionTotals = new Map<string, number>();
  for (const i of items) sectionTotals.set(i.section, (sectionTotals.get(i.section) ?? 0) + lineAmount(i));

  const diff = target === undefined ? 0 : Math.round((target - total) * 100) / 100;

  return (
    <div className="bl-ed">
      <div className="bl-ed-table" role="table" aria-label="Breakdown lines">
        <div className="bl-ed-head" role="row">
          <span role="columnheader">Description</span>
          <span role="columnheader">Qty</span>
          <span role="columnheader">Unit</span>
          <span role="columnheader">Unit price</span>
          <span role="columnheader">Amount</span>
          <span role="columnheader" aria-label="Actions" />
        </div>
        {items.length === 0 && <div className="bl-empty">No lines yet. Add a section or a line below.</div>}
        {items.map((it, idx) => {
          const startsSection = it.section && (idx === 0 || items[idx - 1].section !== it.section);
          return (
            <Fragment key={it.key}>
              {startsSection && (
                <div className="bl-ed-sec">
                  <input
                    className="ux-input"
                    aria-label="Section name"
                    value={it.section}
                    onChange={(e) => renameSection(it.section, e.target.value)}
                  />
                  <span className="bl-mono">{fmt(sectionTotals.get(it.section) ?? 0)}</span>
                </div>
              )}
              <div className="bl-ed-row" role="row">
                <div className="bl-ed-desc" role="cell">
                  <input
                    id={`${uid}-d-${idx}`}
                    className="ux-input"
                    placeholder="What this line covers"
                    aria-label={`Line ${idx + 1} description`}
                    value={it.description}
                    onChange={(e) => set(it.key, { description: e.target.value })}
                  />
                  <input
                    className="ux-input bl-detail"
                    placeholder="Optional detail shown under the line"
                    aria-label={`Line ${idx + 1} detail`}
                    value={it.detail}
                    onChange={(e) => set(it.key, { detail: e.target.value })}
                  />
                </div>
                <div className="bl-num" role="cell" data-label="Qty">
                  <input
                    className="ux-input"
                    inputMode="decimal"
                    aria-label={`Line ${idx + 1} quantity`}
                    value={it.quantity}
                    onChange={(e) => set(it.key, { quantity: e.target.value })}
                  />
                </div>
                <div role="cell" data-label="Unit">
                  <input
                    className="ux-input"
                    placeholder="month"
                    aria-label={`Line ${idx + 1} unit`}
                    value={it.unit}
                    onChange={(e) => set(it.key, { unit: e.target.value })}
                  />
                </div>
                <div className="bl-num" role="cell" data-label="Unit price">
                  <input
                    className="ux-input"
                    inputMode="decimal"
                    aria-label={`Line ${idx + 1} unit price`}
                    value={it.unit_price}
                    onChange={(e) => set(it.key, { unit_price: e.target.value })}
                  />
                </div>
                <div className="bl-ed-amt" role="cell" data-label="Amount">
                  {lineAmount(it).toLocaleString("en-US", {
                    minimumFractionDigits: currency === "USD" ? 2 : 0,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="bl-ed-tools" role="cell">
                  <button type="button" className="bl-icon-btn" aria-label="Move line up" disabled={idx === 0} onClick={() => move(idx, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="bl-icon-btn is-bad"
                    aria-label={`Remove line ${idx + 1}`}
                    onClick={() => onChange(items.filter((i) => i.key !== it.key))}
                  >
                    ×
                  </button>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="bl-ed-add">
        <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={() => onChange([...items, blankItem(lastSection)])}>
          + Line
        </button>
        <button
          type="button"
          className="ux-btn ux-btn--secondary ux-btn--small"
          onClick={() => onChange([...items, blankItem(`Section ${new Set(items.map((i) => i.section).filter(Boolean)).size + 1}`)])}
        >
          + Section
        </button>
      </div>

      <div className={`bl-ed-total${target === undefined ? "" : diff === 0 ? " is-ok" : " is-off"}`} aria-live="polite">
        <div>
          <span className="bl-label">Total</span>
          {target !== undefined && (
            <div className="bl-meta">
              {diff === 0
                ? `Matches the ${targetLabel.toLowerCase()} exactly`
                : `${targetLabel} is ${fmt(target)} — ${diff > 0 ? `${fmt(diff)} still to allocate` : `${fmt(-diff)} over`}`}
            </div>
          )}
        </div>
        <b>{fmt(total)}</b>
      </div>
    </div>
  );
}
