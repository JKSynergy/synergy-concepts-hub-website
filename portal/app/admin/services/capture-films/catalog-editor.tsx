"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ux/primitives";
import { useFeedback } from "@/components/ux/feedback";
import { publishQuoteCatalog } from "@/lib/actions/quotes";
import type { Catalog, PriceState } from "@/lib/quote/catalog";

// Edits prices, price states and the exchange rate. Labels, deliverables and
// availability wording are kept as published. Each publish is a new version.

type StateKind = "none" | PriceState["type"];
const KIND_LABEL: Record<StateKind, string> = {
  none: "Not offered",
  fixed: "Fixed price",
  per_unit: "Per unit",
  special_quote: "Special quotation",
  on_request: "On request",
};

const digits = (s: string) => s.replace(/[^\d]/g, "");

export default function CatalogEditor({
  catalog,
  version,
  ugxPerUsd,
  canEdit,
}: {
  catalog: Catalog;
  version: number;
  ugxPerUsd: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [draft, setDraft] = useState<Catalog>(() => JSON.parse(JSON.stringify(catalog)));
  const [rate, setRate] = useState(ugxPerUsd === null ? "" : String(ugxPerUsd));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(catalog) || rate !== (ugxPerUsd === null ? "" : String(ugxPerUsd)),
    [draft, catalog, rate, ugxPerUsd]
  );

  const setServicePrice = (sid: string, ev: string, v: string) =>
    setDraft((d) => ({
      ...d,
      services: d.services.map((s) => (s.id === sid ? { ...s, prices: { ...s.prices, [ev]: Number(digits(v) || "0") } } : s)),
    }));

  const setExtra = (xid: string, ev: string, next: PriceState | null) =>
    setDraft((d) => ({
      ...d,
      extras: d.extras.map((x) => {
        if (x.id !== xid) return x;
        const pricing = { ...x.pricing };
        if (next) pricing[ev] = next;
        else delete pricing[ev];
        return { ...x, pricing };
      }),
    }));

  function changeKind(xid: string, ev: string, kind: StateKind, current?: PriceState) {
    const amount = current && "amount" in current ? current.amount : 0;
    if (kind === "none") setExtra(xid, ev, null);
    else if (kind === "fixed") setExtra(xid, ev, { type: "fixed", amount });
    else if (kind === "per_unit") setExtra(xid, ev, { type: "per_unit", amount, min: 1, max: 50 });
    else setExtra(xid, ev, { type: kind });
  }

  async function publish() {
    setError("");
    const ok = await askConfirm({
      title: `Publish price list version ${version + 1}?`,
      body: "The website quotation builder uses the new prices straight away. Quotations already submitted keep their prices.",
      confirmLabel: "Publish",
    });
    if (!ok) return;
    setSaving(true);
    const res = await publishQuoteCatalog({ catalog: draft, ugxPerUsd: rate, note });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    toast(`Price list version ${res.version} published.`);
    setNote("");
    router.refresh();
  }

  const events = draft.events;

  return (
    <>
      <Section title={`Active version ${version}`}>
        {error ? <p className="ux-notice ux-notice--error" role="alert">{error}</p> : null}
        {!canEdit ? <p className="ux-notice">Read only. Only an administrator can change prices or the exchange rate.</p> : null}
        <div className="ux-formgrid" style={{ maxWidth: 640 }}>
          <label className="ux-field">
            <span>Exchange rate (UGX per 1 USD)</span>
            <input
              className="ux-input" inputMode="decimal" placeholder="Not set: USD unavailable" value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} disabled={!canEdit}
            />
          </label>
          <p className="ux-muted" style={{ fontSize: 13, alignSelf: "end" }}>
            Leave empty to offer UGX only. The rate is never fetched automatically.
          </p>
        </div>
      </Section>

      <Section title="Standard services (UGX)">
        <div className="ux-tablewrap">
          <table className="ux-table">
            <thead>
              <tr>
                <th>Service</th>
                {events.map((e) => <th key={e.id}>{e.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {draft.services.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  {events.map((e) => (
                    <td key={e.id}>
                      <input
                        className="ux-input" inputMode="numeric" aria-label={`${s.label}, ${e.label}, UGX`}
                        value={s.prices[e.id] === undefined ? "" : String(s.prices[e.id])}
                        onChange={(ev) => setServicePrice(s.id, e.id, ev.target.value)} disabled={!canEdit}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Extras and upgrades (UGX)">
        <div className="ux-tablewrap">
          <table className="ux-table">
            <thead>
              <tr>
                <th>Extra</th>
                {events.map((e) => <th key={e.id}>{e.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {draft.extras.map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.label}
                    {x.requires?.length ? <div className="ux-muted" style={{ fontSize: 12 }}>Needs {x.requires.join(" and ")}</div> : null}
                    {x.unit ? <div className="ux-muted" style={{ fontSize: 12 }}>Priced per {x.unit}</div> : null}
                  </td>
                  {events.map((e) => {
                    const st = x.pricing[e.id];
                    const kind: StateKind = st ? st.type : "none";
                    return (
                      <td key={e.id} style={{ minWidth: 150 }}>
                        <select
                          className="ux-input" aria-label={`${x.label}, ${e.label}, price type`} value={kind}
                          onChange={(ev) => changeKind(x.id, e.id, ev.target.value as StateKind, st)} disabled={!canEdit}
                        >
                          {(Object.keys(KIND_LABEL) as StateKind[])
                            .filter((k) => k !== "per_unit" || x.unit)
                            .map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </select>
                        {st && (st.type === "fixed" || st.type === "per_unit") ? (
                          <input
                            className="ux-input" style={{ marginTop: 6 }} inputMode="numeric" aria-label={`${x.label}, ${e.label}, UGX`}
                            value={String(st.amount)}
                            onChange={(ev) => setExtra(x.id, e.id, { ...st, amount: Number(digits(ev.target.value) || "0") })}
                            disabled={!canEdit}
                          />
                        ) : null}
                        {st && st.type === "per_unit" ? (
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <input
                              className="ux-input" inputMode="numeric" aria-label={`${x.label}, ${e.label}, minimum quantity`} value={String(st.min)}
                              onChange={(ev) => setExtra(x.id, e.id, { ...st, min: Number(digits(ev.target.value) || "1") })} disabled={!canEdit}
                            />
                            <input
                              className="ux-input" inputMode="numeric" aria-label={`${x.label}, ${e.label}, maximum quantity`} value={String(st.max)}
                              onChange={(ev) => setExtra(x.id, e.id, { ...st, max: Number(digits(ev.target.value) || "1") })} disabled={!canEdit}
                            />
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {canEdit ? (
        <Section title="Publish">
          <label className="ux-field" style={{ maxWidth: 640 }}>
            <span>What changed (kept with the version)</span>
            <input className="ux-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="ux-actions" style={{ marginTop: 16 }}>
            <button type="button" className="ux-btn ux-btn--primary" disabled={!dirty || saving} onClick={publish}>
              {saving ? "Publishing…" : `Publish version ${version + 1}`}
            </button>
            {dirty ? (
              <button type="button" className="ux-btn ux-btn--secondary" disabled={saving}
                onClick={() => { setDraft(JSON.parse(JSON.stringify(catalog))); setRate(ugxPerUsd === null ? "" : String(ugxPerUsd)); }}>
                Discard changes
              </button>
            ) : null}
          </div>
        </Section>
      ) : null}
    </>
  );
}
