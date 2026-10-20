"use client";

// Preview → decide: shows the exact invoice one agreement period would
// produce (nothing saved), then saves it as a draft or issues it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import { billAgreementPeriod } from "@/lib/actions/agreement-contracts";
import { formatMoney } from "@/components/billing/breakdown-editor";

export type PreviewTarget = {
  agreementId: string;
  agreementName: string;
  chargeId: string;
  clientName: string;
  periodStart: string;
  periodLabel: string;
  amount: number;
  currency: string;
};

export function BillingPreviewDialog({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ invoiceId: string; sent: boolean; emailed: boolean } | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    const q = new URLSearchParams({ charge: target.chargeId, start: target.periodStart });
    fetch(`/api/agreements/${target.agreementId}/preview?${q}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Could not build the preview");
        }
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e: Error) => !revoked && setLoadError(e.message));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target.agreementId, target.chargeId, target.periodStart]);

  async function bill(send: boolean) {
    setBusy(send ? "send" : "draft");
    setError(null);
    const res = await billAgreementPeriod(target.chargeId, target.periodStart, send);
    setBusy(null);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not create the invoice");
      return;
    }
    setDone({ invoiceId: res.data.invoiceId, sent: send, emailed: res.data.emailed });
    router.refresh();
  }

  const amount = formatMoney(target.amount, target.currency);

  return (
    <Dialog labelledBy="bp-title" onClose={onClose} maxWidth={980}>
      <div className="bl-form bp">
        <div className="bp-head">
          <div>
            <span className="bl-label">Invoice preview · not saved</span>
            <h3 id="bp-title">
              {target.clientName} · {target.periodLabel}
            </h3>
            <p className="bl-meta">
              {target.agreementName} · {amount}
            </p>
          </div>
          {url && (
            <a className="ux-btn ux-btn--secondary ux-btn--small" href={url} download={`invoice-preview-${target.periodStart}.pdf`}>
              Download preview
            </a>
          )}
        </div>

        <div className="bp-frame">
          {url ? (
            <iframe src={url} title={`Invoice preview for ${target.clientName}, ${target.periodLabel}`} />
          ) : loadError ? (
            <p className="bl-error">{loadError}</p>
          ) : (
            <div className="bp-loading">Building the invoice…</div>
          )}
        </div>

        {error && <p className="bl-error">{error}</p>}

        {done ? (
          <div className="bp-done" role="status">
            <span>
              <b>{done.sent ? "Invoice sent." : "Draft saved."}</b>{" "}
              {done.sent
                ? done.emailed
                  ? `${target.clientName} can now see it in their portal and was emailed.`
                  : `${target.clientName} can see it in their portal, but no email was sent; let them know directly.`
                : "Review or edit it before sending."}
            </span>
            <span className="bl-row-actions">
              <Link href={`/admin/invoices/${done.invoiceId}`} className="ux-btn ux-btn--secondary ux-btn--small">
                Open invoice
              </Link>
              <button type="button" className="ux-btn ux-btn--primary ux-btn--small" onClick={onClose}>
                Done
              </button>
            </span>
          </div>
        ) : (
          <div className="bl-form-foot bp-foot">
            <span className="bl-meta bp-note">
              Send issues the invoice and emails {target.clientName}. Save as draft if you want to edit it first.
            </span>
            <button type="button" className="ux-btn ux-btn--secondary" onClick={onClose} disabled={!!busy}>
              Cancel
            </button>
            <button type="button" className="ux-btn ux-btn--secondary" onClick={() => bill(false)} disabled={!!busy || !url}>
              {busy === "draft" ? "Saving…" : "Save as draft"}
            </button>
            <button type="button" className="ux-btn ux-btn--primary" onClick={() => bill(true)} disabled={!!busy || !url}>
              {busy === "send" ? "Sending…" : `Send ${amount}`}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
