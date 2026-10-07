"use client";

import { useState } from "react";
import { Dialog } from "@/components/ux/dialog";
import { updateSystem } from "@/lib/actions/systems";

export interface EditableSystem {
  id: string;
  client_id: string;
  name: string;
  system_type: string;
  status: string;
  description: string | null;
  primary_url: string | null;
}

/**
 * Admin edit form for system registry metadata. Mirrors the Create Digital
 * System fields. The system id, infrastructure/provider links, monitoring
 * history and status tokens are never part of this form.
 */
export default function SystemEdit({
  system,
  clients,
}: {
  system: EditableSystem;
  clients: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await updateSystem(system.id, fd);
    setLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setOpen(false);
    }
  }

  return (
    <>
      <button type="button" className="ux-btn" onClick={() => setOpen(true)}>
        Edit System
      </button>

      {open && (
        <Dialog labelledBy="dialog-edit-system-title" onClose={() => setOpen(false)} maxWidth={550}>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
            <h2 id="dialog-edit-system-title" style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              Edit Digital System
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8rem", margin: 0 }}>
              Registry metadata only. Infrastructure links, monitoring history and status tokens are unchanged.
            </p>

            {errorMsg && (
              <div className="ux-alert ux-alert--danger" style={{ padding: "0.75rem 1rem", borderRadius: "6px", backgroundColor: "rgba(220, 38, 38, 0.1)", color: "#ef4444" }}>
                {errorMsg}
              </div>
            )}

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Client *</span>
              <select name="client_id" required className="ux-input" defaultValue={system.client_id}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>System Name *</span>
              <input type="text" name="name" required defaultValue={system.name} className="ux-input" />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>System Type</span>
                <select name="system_type" className="ux-input" defaultValue={system.system_type}>
                  <option value="web_platform">Web Platform</option>
                  <option value="mobile_app">Mobile App</option>
                  <option value="ecommerce">E-Commerce</option>
                  <option value="sacco_platform">SACCO Platform</option>
                  <option value="lending_system">Lending System</option>
                  <option value="corporate_website">Corporate Website</option>
                  <option value="custom_api">Custom API</option>
                  <option value="internal_tool">Internal Tool</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
                <span>Status</span>
                <select name="status" className="ux-input" defaultValue={system.status}>
                  <option value="planned">Planned</option>
                  <option value="in_build">In Build</option>
                  <option value="live">Live</option>
                  <option value="maintenance_only">Maintenance Only</option>
                  <option value="suspended">Suspended</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Primary URL (Optional)</span>
              <input type="url" name="primary_url" defaultValue={system.primary_url ?? ""} placeholder="https://clientapp.com" className="ux-input" />
            </label>

            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem" }}>
              <span>Description / Scope</span>
              <textarea name="description" rows={3} defaultValue={system.description ?? ""} placeholder="Operational overview of this system..." className="ux-input" />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button type="button" className="ux-btn" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
