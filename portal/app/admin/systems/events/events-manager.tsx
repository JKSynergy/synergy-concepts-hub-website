"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Radio, Webhook } from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  saveWebhookConfig,
  setWebhookConfigEnabled,
} from "@/lib/actions/provider-events";

export interface WebhookConfig {
  config_id: string;
  provider_account_id: string;
  provider_name: string | null;
  adapter_key: string | null;
  account_name: string | null;
  client_company: string | null;
  auth_type: string;
  enabled: boolean;
  last_received_at: string | null;
  events_received: number;
  last_event_at: string | null;
  created_at: string;
}

export interface ProviderEvent {
  id: string;
  provider_account_id: string;
  provider_name: string | null;
  adapter_key: string | null;
  account_name: string | null;
  provider_event_id: string | null;
  event_type: string;
  normalized_type: string;
  occurred_at: string | null;
  received_at: string;
  status: string;
  duplicate_count: number;
  external_resource_id: string | null;
  external_name: string | null;
  resource_name: string | null;
  client_company: string | null;
  system_name: string | null;
  monitoring_run_id: string | null;
  reconciliation_run_id: string | null;
  action_item_id: string | null;
  processing_error: string | null;
  payload_summary: { summary?: string } | null;
}

export interface EventAccount {
  id: string;
  account_name: string;
  status: string;
  providers: { name: string; adapter_key: string | null } | { name: string; adapter_key: string | null }[] | null;
}

interface Props {
  configs: WebhookConfig[];
  events: ProviderEvent[];
  accounts: EventAccount[];
  isAdmin: boolean;
  isFinance: boolean;
}

const AUTH_LABELS: Record<string, string> = {
  vercel_hmac_sha1: "HMAC-SHA1 signature",
  bearer_token: "Bearer token",
  header_secret: "Shared-secret header",
  url_token: "URL token",
};

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function statusTone(s: string): Tone {
  switch (s) {
    case "processed": return "success";
    case "unmatched": return "warning";
    case "duplicate": return "neutral";
    case "failed": case "rejected": return "danger";
    default: return "info";
  }
}

function normTone(s: string): Tone {
  switch (s) {
    case "resource_unavailable": case "deployment_failed": case "backup_failed":
    case "resource_deleted": return "danger";
    case "resource_recovered": case "deployment_succeeded": case "backup_succeeded":
      return "success";
    case "unknown": return "neutral";
    default: return "info";
  }
}

export default function EventsManager({ configs, events, accounts, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [vercelSecret, setVercelSecret] = useState("");
  const [issuedSecret, setIssuedSecret] = useState<{ endpoint: string; secret: string } | null>(null);

  const configuredAccounts = useMemo(
    () => new Set(configs.map((c) => c.provider_account_id)),
    [configs]
  );
  const unconfigured = useMemo(
    () =>
      accounts.filter((a) => {
        const p = Array.isArray(a.providers) ? a.providers[0] : a.providers;
        return a.status !== "archived" && p?.adapter_key && !configuredAccounts.has(a.id);
      }),
    [accounts, configuredAccounts]
  );

  const selectedProvider = useMemo(() => {
    const a = unconfigured.find((x) => x.id === accountId)
      ?? accounts.find((x) => x.id === accountId);
    if (!a) return null;
    const p = Array.isArray(a.providers) ? a.providers[0] : a.providers;
    return p?.adapter_key ?? null;
  }, [accounts, unconfigured, accountId]);

  async function run<T>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, okMsg?: string) {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setErrorMessage(res.error || "Action failed");
    else if (res.error) setErrorMessage(res.error);
    else if (okMsg) setNotice(okMsg);
    router.refresh();
    return res;
  }

  async function onSetup() {
    if (!accountId) return;
    const res = await run(
      () =>
        saveWebhookConfig({
          providerAccountId: accountId,
          secret: selectedProvider === "vercel" ? vercelSecret : undefined,
        }),
      "Webhook configuration saved"
    );
    if (res.ok && res.data) {
      const d = res.data as { endpointPath: string; secret: string };
      setIssuedSecret({ endpoint: d.endpointPath, secret: d.secret });
    }
  }

  return (
    <div>
      {errorMessage && <p className="ux-alert ux-alert-error" role="alert">{errorMessage}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      <div className="ux-card">
        <div className="ux-card-header">
          <h2><Webhook size={16} style={{ verticalAlign: "-2px" }} /> Webhook endpoints</h2>
          <p className="ux-muted">{configs.filter((c) => c.enabled).length} enabled</p>
        </div>
        {isAdmin && unconfigured.length > 0 && (
          <div style={{ padding: "0 1rem 0.75rem" }}>
            <button className="ux-button" data-action="add-webhook" onClick={() => { setIssuedSecret(null); setSetupOpen(true); }}>
              <Plus size={14} /> Configure webhook
            </button>
          </div>
        )}
        {configs.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            No webhook endpoints configured. {isAdmin ? "Configure one to receive authenticated provider events." : ""}
          </p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-table--cards">
              <thead>
                <tr>
                  <th>Provider</th><th>Account</th><th>Authentication</th><th>Status</th>
                  <th>Last event</th><th>Events</th>{isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.config_id} data-config={c.config_id}>
                    <td>{c.provider_name}</td>
                    <td data-label="Account">
                      {c.account_name}
                      {c.client_company ? <><br /><span className="ux-muted">{c.client_company}</span></> : null}
                    </td>
                    <td data-label="Authentication">{AUTH_LABELS[c.auth_type] ?? c.auth_type}</td>
                    <td data-label="Status">
                      <StatusMark tone={c.enabled ? "success" : "neutral"}>
                        {c.enabled ? "enabled" : "disabled"}
                      </StatusMark>
                    </td>
                    <td data-label="Last event">{fmt(c.last_event_at ?? c.last_received_at)}</td>
                    <td data-label="Events">{c.events_received}</td>
                    {isAdmin && (
                      <td data-label="Actions">
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          <button
                            className="ux-button ux-button-secondary"
                            data-action={c.enabled ? "disable-webhook" : "enable-webhook"}
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => setWebhookConfigEnabled(c.provider_account_id, !c.enabled),
                                c.enabled ? "Webhook disabled" : "Webhook enabled"
                              )
                            }
                          >
                            {c.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            className="ux-button ux-button-secondary"
                            data-action="rotate-webhook"
                            disabled={busy}
                            onClick={async () => {
                              const res = await run(
                                () =>
                                  saveWebhookConfig({
                                    providerAccountId: c.provider_account_id,
                                    secret:
                                      c.adapter_key === "vercel"
                                        ? window.prompt("Paste the new Vercel webhook secret") ?? ""
                                        : undefined,
                                  }),
                                "Webhook secret rotated"
                              );
                              if (res.ok && res.data) {
                                const d = res.data as { endpointPath: string; secret: string };
                                setIssuedSecret({ endpoint: d.endpointPath, secret: d.secret });
                              }
                            }}
                          >
                            Rotate secret
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {issuedSecret && (
          <div style={{ padding: "0 1rem 1rem" }}>
            <p className="ux-alert ux-alert-success" role="status" data-secret-reveal>
              Webhook secret issued — store it now; it will not be shown again.<br />
              <strong>Endpoint:</strong> <code>{issuedSecret.endpoint}</code><br />
              <strong>Secret:</strong> <code>{issuedSecret.secret}</code>
            </p>
          </div>
        )}
      </div>

      <div className="ux-card" style={{ marginTop: "1rem" }}>
        <div className="ux-card-header">
          <h2><Radio size={16} style={{ verticalAlign: "-2px" }} /> Recent provider events</h2>
          <p className="ux-muted">{events.length} events</p>
        </div>
        {events.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>No provider events received. Events will appear here when configured providers send them.</p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-table--cards">
              <thead>
                <tr>
                  <th>Received</th><th>Provider</th><th>Event</th><th>Normalized</th>
                  <th>Resource</th><th>Client / system</th><th>Status</th><th>Reconciliation</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} data-event={e.id}>
                    <td>{fmt(e.received_at)}</td>
                    <td data-label="Provider">
                      {e.provider_name}
                      <br /><span className="ux-muted">{e.account_name}</span>
                    </td>
                    <td data-label="Event">
                      {e.event_type}
                      {e.duplicate_count > 0 && (
                        <><br /><span className="ux-muted">+{e.duplicate_count} duplicates</span></>
                      )}
                    </td>
                    <td data-label="Normalized"><StatusMark tone={normTone(e.normalized_type)}>{e.normalized_type}</StatusMark></td>
                    <td data-label="Resource">
                      {e.resource_name ?? e.external_name ?? e.external_resource_id ?? (
                        <span className="ux-muted">unmatched</span>
                      )}
                    </td>
                    <td data-label="Client / system">
                      {e.client_company ?? "—"}
                      {e.system_name ? <><br /><span className="ux-muted">{e.system_name}</span></> : null}
                    </td>
                    <td data-label="Status">
                      <StatusMark tone={statusTone(e.status)}>{e.status}</StatusMark>
                      {e.processing_error ? (
                        <><br /><span className="ux-muted">{e.processing_error}</span></>
                      ) : null}
                    </td>
                    <td data-label="Reconciliation">
                      {e.monitoring_run_id ? (
                        <span className="ux-muted">run triggered</span>
                      ) : (
                        <span className="ux-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {setupOpen && (
        <Dialog onClose={() => setSetupOpen(false)} labelledBy="evt-setup-title" maxWidth={460}>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <h2 id="evt-setup-title" style={{ margin: 0 }}>Configure provider webhook</h2>
            <label className="ux-field">
              <span>Provider account</span>
              <select
                className="ux-input" data-field="account" value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Select account…</option>
                {unconfigured.map((a) => {
                  const p = Array.isArray(a.providers) ? a.providers[0] : a.providers;
                  return <option key={a.id} value={a.id}>{p?.name} — {a.account_name}</option>;
                })}
              </select>
            </label>
            {selectedProvider === "vercel" && (
              <label className="ux-field">
                <span>Vercel webhook secret</span>
                <input
                  className="ux-input" data-field="vercel-secret" type="password"
                  value={vercelSecret} onChange={(e) => setVercelSecret(e.target.value)}
                  placeholder="Shown once at webhook creation in Vercel"
                />
              </label>
            )}
            <p className="ux-muted">
              SCH issues (or stores, for Vercel) the authentication secret once. Paste it into the
              provider&apos;s webhook settings — SCH never registers webhooks on the provider for you.
            </p>
            <button
              className="ux-button" data-action="save-webhook"
              disabled={busy || !accountId || (selectedProvider === "vercel" && !vercelSecret)}
              onClick={onSetup}
            >
              Create webhook configuration
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
