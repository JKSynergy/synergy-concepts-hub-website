"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveService, toggleServiceActive } from "@/lib/actions/bookings";
import { Dialog } from "@/components/ux/dialog";
import { useFeedback } from "@/components/ux/feedback";
import { EmptyState, PageHeader, StatusMark, ugx } from "@/components/ux/primitives";
import type { Service } from "@/lib/types";

export default function ServicesManager({ services, canEdit = false }: { services: Service[]; canEdit?: boolean }) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const showForm = creating || editing !== null;

  function close() {
    if (saving) return;
    setEditing(null);
    setCreating(false);
    setError("");
  }

  async function action(formData: FormData) {
    setError("");
    setSaving(true);
    const wasEditing = !!editing;
    const res = await saveService(editing?.id ?? null, formData);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(null);
    setCreating(false);
    toast(wasEditing ? "Service updated." : "Service created.");
    router.refresh();
  }

  async function toggle(s: Service) {
    const next = !s.is_active;
    const ok = await askConfirm({
      title: next ? "Activate service?" : "Deactivate service?",
      body: next
        ? `${s.name} becomes available again for new bookings.`
        : `${s.name} will no longer be offered for new bookings. Existing records are kept.`,
      confirmLabel: next ? "Activate" : "Deactivate",
      destructive: !next,
    });
    if (!ok) return;
    setBusy(s.id);
    const res = await toggleServiceActive(s.id, next);
    setBusy(null);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast(next ? "Service activated." : "Service deactivated.");
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Services"
        description="The catalogue of services Synergy offers. Active services can be selected when a booking is created."
        actions={
          !canEdit ? undefined : (
          <button
            type="button"
            className="ux-btn ux-btn--primary"
            onClick={() => {
              setCreating(true);
              setEditing(null);
              setError("");
            }}
          >
            New service
          </button>
          )
        }
      />

      {services.length === 0 ? (
        <EmptyState title="No services yet">{canEdit ? "Add a service to make it available for booking." : "An administrator has not added any services yet."}</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Service</th>
                <th className="ux-num">Price</th>
                <th style={{ paddingLeft: 32 }}>Duration</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="ux-cell-main">{s.name}</span>
                    {s.description && <span className="ux-cell-sub">{s.description}</span>}
                  </td>
                  <td className="ux-num" data-label="Price">
                    {s.price_ugx != null ? ugx(Number(s.price_ugx)) : s.price_usd == null ? <span className="ux-muted">Not priced</span> : <span className="ux-muted">No UGX price</span>}
                    {s.price_usd != null && (
                      <span className="ux-cell-sub">USD {Number(s.price_usd).toLocaleString("en-US")}</span>
                    )}
                  </td>
                  <td data-label="Duration" className="ux-muted ux-enq-after-num">
                    {s.duration_days != null ? `${s.duration_days} day${s.duration_days === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td data-label="Status">
                    <StatusMark tone={s.is_active ? "success" : "neutral"}>{s.is_active ? "Active" : "Inactive"}</StatusMark>
                  </td>
                  <td>
                    {canEdit && (
                    <div className="ux-rowactions">
                      <button
                        type="button"
                        className="ux-textbtn"
                        onClick={() => {
                          setEditing(s);
                          setCreating(false);
                          setError("");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`ux-textbtn${s.is_active ? " ux-textbtn--danger" : ""}`}
                        disabled={busy === s.id}
                        onClick={() => toggle(s)}
                      >
                        {s.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && showForm && (
        <Dialog onClose={close} labelledBy="service-title" maxWidth={600}>
          <>
            <h3 id="service-title">{editing ? "Edit service" : "New service"}</h3>
            <form action={action} style={{ marginTop: 20 }}>
              {error && <div className="ux-notice ux-notice--error">{error}</div>}
              <div className="ux-formgrid">
                <label className="ux-field ux-full">
                  <span>Name *</span>
                  <input name="name" required defaultValue={editing?.name ?? ""} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Price (UGX)</span>
                  <input name="price_ugx" type="number" defaultValue={editing?.price_ugx ?? ""} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Price (USD, optional)</span>
                  <input name="price_usd" type="number" defaultValue={editing?.price_usd ?? ""} className="ux-input" />
                </label>
                <label className="ux-field">
                  <span>Duration (days)</span>
                  <input name="duration_days" type="number" defaultValue={editing?.duration_days ?? ""} className="ux-input" />
                </label>
                <label className="ux-field" style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "end" }}>
                  <input type="checkbox" name="is_active" defaultChecked={editing ? editing.is_active : true} />
                  <span>Active</span>
                </label>
                <label className="ux-field ux-full">
                  <span>Description</span>
                  <textarea name="description" rows={2} defaultValue={editing?.description ?? ""} className="ux-input" />
                </label>
                <label className="ux-field ux-full">
                  <span>Deliverables</span>
                  <textarea name="deliverables" rows={2} defaultValue={editing?.deliverables ?? ""} className="ux-input" />
                </label>
              </div>
              <div className="ux-dialog-actions">
                <button type="button" onClick={close} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="ux-btn ux-btn--primary">
                  {saving ? "Saving…" : editing ? "Save changes" : "Create service"}
                </button>
              </div>
            </form>
          </>
        </Dialog>
      )}
    </>
  );
}
