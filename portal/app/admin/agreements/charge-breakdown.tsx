"use client";

import { useState } from "react";
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
import { saveChargeBreakdown } from "@/lib/actions/service-billing";

export type ChargePackageOption = {
  id: string;
  name: string;
  currency: string;
  items: BreakdownRow[];
};

export function ChargeBreakdownButton({
  charge,
  items,
  packages,
}: {
  charge: { id: string; name: string; amount: number; currency: string; package_id?: string | null };
  items: BreakdownRow[];
  packages: ChargePackageOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EditorItem[]>([]);
  const [packageId, setPackageId] = useState<string | null>(charge.package_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usable = packages.filter((p) => p.currency === charge.currency);
  const linked = packages.find((p) => p.id === charge.package_id);
  const amount = Number(charge.amount);

  const start = () => {
    setDraft(toEditorItems(items));
    setPackageId(charge.package_id ?? null);
    setError(null);
    setOpen(true);
  };

  const applyPackage = (id: string) => {
    const p = usable.find((x) => x.id === id);
    if (!p) return;
    setPackageId(p.id);
    setDraft(toEditorItems(p.items));
  };

  /** Scale every line so the breakdown adds up to the standard charge. */
  const fitToCharge = () => {
    const total = breakdownTotal(draft);
    if (!total) return;
    const cents = charge.currency === "USD" ? 100 : 1;
    let running = 0;
    const next = draft.map((i, idx) => {
      const q = Number(i.quantity) || 1;
      let price: number;
      if (idx === draft.length - 1) {
        price = (amount - running) / q;
      } else {
        price = Math.round(((Number(i.unit_price) * amount) / total) * cents) / cents;
      }
      running += Math.round(q * price * 100) / 100;
      return { ...i, unit_price: String(Math.round(price * 100) / 100) };
    });
    setDraft(next);
  };

  async function save(clear = false) {
    setSaving(true);
    setError(null);
    const res = await saveChargeBreakdown(charge.id, clear ? [] : toRows(draft), clear ? null : packageId);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save the breakdown");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const total = breakdownTotal(draft);

  return (
    <>
      <button type="button" className="ux-btn ux-btn--secondary ux-btn--small" onClick={start}>
        {items.length ? `Itemised · ${items.length} lines` : "Itemise"}
      </button>
      {open && (
        <Dialog labelledBy={`bd-${charge.id}`} onClose={() => setOpen(false)} maxWidth={920}>
          <div className="bl-form bl-dialog-scroll">
            <h3 id={`bd-${charge.id}`}>Invoice breakdown · {charge.name}</h3>
            <p>
              What the client sees on each invoice for this charge. The lines must add up to the standard charge of{" "}
              <b className="bl-mono">{formatMoney(amount, charge.currency)}</b>; the price itself does not change.
            </p>
            {error && <p className="bl-error">{error}</p>}
            <div className="bl-fields">
              <label className="ux-label">
                <span>Start from a package</span>
                <select
                  className="ux-select ux-input"
                  value=""
                  onChange={(e) => e.target.value && applyPackage(e.target.value)}
                >
                  <option value="">{usable.length ? "Choose a package…" : `No ${charge.currency} packages yet`}</option>
                  {usable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatMoney(p.items.reduce((a, i) => a + i.quantity * i.unit_price, 0), p.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ux-label">
                <span>Linked package</span>
                <div className="bl-meta" style={{ paddingTop: 8 }}>
                  {packages.find((p) => p.id === packageId)?.name ?? (linked ? linked.name : "None — custom breakdown")}
                  {" · "}
                  <Link href="/admin/finances/packages">Manage packages</Link>
                </div>
              </div>
            </div>
            <BreakdownEditor items={draft} onChange={setDraft} currency={charge.currency} target={amount} targetLabel="Standard charge" />
            <div className="bl-form-foot">
              {items.length > 0 && (
                <button type="button" className="ux-btn ux-btn--secondary" disabled={saving} onClick={() => save(true)} style={{ marginRight: "auto" }}>
                  Remove breakdown
                </button>
              )}
              {total > 0 && total !== amount && (
                <button type="button" className="ux-btn ux-btn--secondary" onClick={fitToCharge}>
                  Scale lines to fit
                </button>
              )}
              <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="ux-btn ux-btn--primary" disabled={saving || total !== amount || draft.length === 0} onClick={() => save()}>
                {saving ? "Saving…" : "Save breakdown"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
