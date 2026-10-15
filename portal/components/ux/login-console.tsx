import "./login-console.css";

/**
 * Decorative control-plane panel for the sign-in pages' brand column.
 * Purely presentational: lists the portal's modules, never live data,
 * so nothing here can imply a real service state. Hidden from AT.
 */
const MODULES: { name: string; scope: string; led: "live" | "build" | "accent" }[] = [
  { name: "clients", scope: "accounts · contacts", led: "live" },
  { name: "projects", scope: "delivery · tasks", led: "live" },
  { name: "systems", scope: "hosting · monitoring", led: "accent" },
  { name: "finance", scope: "invoices · receipts", led: "live" },
  { name: "operations", scope: "service control", led: "build" },
];

export function LoginGrid() {
  return <div className="lc-grid" aria-hidden="true" />;
}

export function LoginConsole() {
  return (
    <div className="lc" aria-hidden="true">
      <div className="lc-window">
        <div className="lc-bar">
          <span className="lc-dots"><i /><i /><i /></span>
          <span className="lc-path">sch / control-plane</span>
          <span className="lc-tls">TLS</span>
        </div>

        <div className="lc-body">
          <div className="lc-line">
            <span className="lc-prompt">$</span> sch modules list
          </div>

          <ul className="lc-modules">
            {MODULES.map((m) => (
              <li key={m.name}>
                <span className={`lc-led lc-led--${m.led}`} />
                <span className="lc-name">{m.name}</span>
                <span className="lc-scope">{m.scope}</span>
              </li>
            ))}
          </ul>

          <div className="lc-line lc-line--muted">
            <span className="lc-prompt">$</span> sch auth login
            <span className="lc-caret" />
          </div>
        </div>
      </div>

      <div className="lc-rack">
        {[0, 1, 2].map((i) => (
          <div className="lc-unit" key={i}>
            <span className="lc-vents" />
            <span className={`lc-led lc-led--${i === 1 ? "accent" : "live"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoginFootnote() {
  return (
    <div className="lc-foot">
      <span>encrypted session</span>
      <span>role-based access</span>
      <span>portal.synergyconceptshub.com</span>
    </div>
  );
}
