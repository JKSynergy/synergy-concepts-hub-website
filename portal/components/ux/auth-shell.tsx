import type { ReactNode } from "react";
import "../../app/ux.css";

/** Two-pane layout for sign-in adjacent pages (forgot password, set password). */
export function AuthShell({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="ux ux-login">
      <section className="ux-login-brand">
        <div className="ux-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Website%20Logo%202.png" alt="" />
          <div>
            <b>Synergy</b>
            <span>Concepts Hub</span>
          </div>
        </div>
        <div>
          <hr />
          <h2>Client and project operations, in one place.</h2>
          <p>Projects, invoices and bookings for Synergy Concepts Hub and its clients.</p>
        </div>
      </section>
      <section className="ux-login-form">
        <div>
          <h1>{title}</h1>
          {description && <p className="ux-muted" style={{ margin: "8px 0 28px" }}>{description}</p>}
          {children}
        </div>
      </section>
    </main>
  );
}
