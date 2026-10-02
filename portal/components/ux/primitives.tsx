import type { ReactNode } from "react";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ux-head">
      <div>
        {eyebrow && <span className="ux-eyebrow">{eyebrow}</span>}
        <h1 className="ux-title">{title}</h1>
        {description && <p className="ux-desc">{description}</p>}
      </div>
      {actions && <div className="ux-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ux-section">
      <div className="ux-section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatusMark({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const label = typeof children === "string" ? children.replaceAll("_", " ") : children;
  return <span className={`ux-status ${tone === "neutral" ? "" : `ux-status--${tone}`}`}>{label}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ux-empty">
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export const PROJECT_TONE: Record<string, Tone> = {
  lead: "neutral",
  quoted: "neutral",
  active: "info",
  review: "warning",
  completed: "success",
  archived: "neutral",
};

export const INVOICE_TONE: Record<string, Tone> = {
  draft: "neutral",
  sent: "info",
  "partially paid": "warning",
  overdue: "danger",
  paid: "success",
  cancelled: "neutral",
};

export function ugx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString("en-US")}`;
}
