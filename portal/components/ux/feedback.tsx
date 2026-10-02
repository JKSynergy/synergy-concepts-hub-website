"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ux/dialog";

/* One feedback system for the admin app: toasts for outcomes,
   a promise-based confirm dialog instead of window.confirm/alert. */

type ToastTone = "ok" | "error";
type Toast = { id: number; tone: ToastTone; message: string };
type ConfirmOptions = { title: string; body?: string; confirmLabel?: string; destructive?: boolean };

type Ctx = {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<Ctx | null>(null);

export function useFeedback(): Ctx {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = "ok") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    []
  );

  const close = (result: boolean) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="ux-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ux-toast ux-toast--${t.tone}`}>
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <Dialog alert maxWidth={440} labelledBy="ux-confirm-title" onClose={() => close(false)}>
          <>
            <h3 id="ux-confirm-title">{dialog.title}</h3>
            {dialog.body && <p className="ux-desc">{dialog.body}</p>}
            <div className="ux-dialog-actions">
              <button type="button" className="ux-btn ux-btn--secondary" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`ux-btn ${dialog.destructive ? "ux-btn--danger" : "ux-btn--primary"}`}
                onClick={() => close(true)}
              >
                {dialog.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </>
        </Dialog>
      )}
    </FeedbackContext.Provider>
  );
}
