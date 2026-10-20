"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  createAgreement,
  attachResourceToAgreement,
  createRecurringCharge,
  updateAgreementOperationalNotes,
  terminateAgreement,
  generateRecurringInvoice,
} from "@/lib/actions/agreements";
import { ChargeBreakdownButton, type ChargePackageOption } from "./charge-breakdown";
import type { BreakdownRow } from "@/components/billing/breakdown-editor";

export interface AgreementItem {
  id: string;
  client_id: string;
  system_id: string | null;
  name: string;
  service_type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  renewal_date: string | null;
  billing_cycle: string;
  payment_timing: string;
  default_grace_days: number;
  notice_days: number;
  contract_reference: string | null;
  operational_notes: string | null;
  archived_at: string | null;
  created_at: string;
  billing_standing?: string;
  client_name?: string | null;
  client_email?: string;
  system_name?: string | null;
}

export interface AgreementResourceItem {
  id: string;
  agreement_id: string;
  resource_id: string;
  notes: string | null;
  created_at: string;
  resource?: {
    id: string;
    name: string;
    resource_type: string;
    status: string;
    client_id: string | null;
  } | null;
}

export interface RecurringChargeItem {
  id: string;
  agreement_id: string;
  name: string;
  amount: number;
  currency: "UGX" | "USD";
  billing_cycle: string;
  payment_timing: string;
  active: boolean;
  start_date: string;
  end_date: string | null;
  created_at: string;
  package_id?: string | null;
}

export interface RecurringChargeRunItem {
  id: string;
  recurring_charge_id: string;
  period_start: string;
  period_end: string;
  invoice_id: string;
  generated_at: string;
  status: string;
  invoice?: {
    id: string;
    invoice_number: string;
    status: string;
    due_date: string;
    total_amount: number;
    currency: string;
  } | null;
}

interface ClientOption {
  id: string;
  label: string;
}

interface SystemOption {
  id: string;
  name: string;
  client_id: string;
}

interface ResourceOption {
  id: string;
  name: string;
  client_id: string | null;
  resource_type: string;
  status: string;
}

interface Props {
  agreements: AgreementItem[];
  agreementResources: AgreementResourceItem[];
  recurringCharges: RecurringChargeItem[];
  recurringChargeRuns: RecurringChargeRunItem[];
  clients: ClientOption[];
  systems: SystemOption[];
  resources: ResourceOption[];
  isAdmin: boolean;
  canSeeFinancials: boolean;
  isStaff: boolean;
  chargeItems?: Record<string, BreakdownRow[]>;
  chargePackages?: ChargePackageOption[];
}

function standingTone(standing?: string): Tone {
  switch (standing) {
    case "CURRENT":
      return "success";
    case "DUE":
    case "OVERDUE_GRACE":
      return "warning";
    case "NOTICE":
    case "SUSPENSION_ELIGIBLE":
    case "SUSPENDED":
      return "danger";
    case "TERMINATED":
    case "DRAFT":
    default:
      return "neutral";
  }
}

function statusTone(status: string): Tone {
  switch (status) {
    case "active":
      return "success";
    case "suspended":
    case "reactivation_pending":
      return "warning";
    case "terminated":
      return "danger";
    case "draft":
    default:
      return "neutral";
  }
}

export default function AgreementsManager({
  agreements,
  agreementResources,
  recurringCharges,
  recurringChargeRuns,
  clients,
  systems,
  resources,
  isAdmin,
  canSeeFinancials,
  isStaff,
  chargeItems = {},
  chargePackages = [],
}: Props) {
  const router = useRouter();
  const clientLabel = (id: string, name?: string | null, email?: string | null) => {
    if (name || email) return name || email || "";
    const opt = clients.find((c) => c.id === id);
    return opt ? opt.label.replace(/\s*\([^)]*@[^)]*\)\s*$/, "") : "Client";
  };
  const [agreementList, setAgreementList] = useState(agreements);
  const [chargeList, setChargeList] = useState(recurringCharges);
  const [runList, setRunList] = useState(recurringChargeRuns);
  const [resourceList, setResourceList] = useState(agreementResources);

  useEffect(() => { setAgreementList(agreements); }, [agreements]);
  useEffect(() => { setChargeList(recurringCharges); }, [recurringCharges]);
  useEffect(() => { setRunList(recurringChargeRuns); }, [recurringChargeRuns]);
  useEffect(() => { setResourceList(agreementResources); }, [agreementResources]);

  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(
    agreements.length > 0 ? agreements[0].id : null
  );

  // Dialog States
  const [showNewAgreementModal, setShowNewAgreementModal] = useState(false);
  const [showAttachResourceModal, setShowAttachResourceModal] = useState(false);
  const [showNewChargeModal, setShowNewChargeModal] = useState(false);
  const [showGenerateInvoiceModal, setShowGenerateInvoiceModal] = useState(false);
  const [showEditNotesModal, setShowEditNotesModal] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);

  // Form States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // New Agreement Form
  const [newAgrClientId, setNewAgrClientId] = useState(clients[0]?.id || "");
  const [newAgrSystemId, setNewAgrSystemId] = useState<string>("");
  const [newAgrName, setNewAgrName] = useState("");
  const [newAgrServiceType, setNewAgrServiceType] = useState("hosting_maintenance");
  const [newAgrCycle, setNewAgrCycle] = useState("monthly");
  const [newAgrTiming, setNewAgrTiming] = useState("month_end");
  const [newAgrStartDate, setNewAgrStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newAgrEndDate, setNewAgrEndDate] = useState("");
  const [newAgrRenewalDate, setNewAgrRenewalDate] = useState("");
  const [newAgrGraceDays, setNewAgrGraceDays] = useState(7);
  const [newAgrNoticeDays, setNewAgrNoticeDays] = useState(14);
  const [newAgrContractRef, setNewAgrContractRef] = useState("");
  const [newAgrNotes, setNewAgrNotes] = useState("");

  // Attach Resource Form
  const [attachResourceId, setAttachResourceId] = useState("");
  const [attachNotes, setAttachNotes] = useState("");

  // New Recurring Charge Form
  const [chargeName, setChargeName] = useState("");
  const [chargeAmount, setChargeAmount] = useState(150000);
  const [chargeCurrency, setChargeCurrency] = useState<"UGX" | "USD">("UGX");
  const [chargeCycle, setChargeCycle] = useState("monthly");
  const [chargeTiming, setChargeTiming] = useState("month_end");
  const [chargeStartDate, setChargeStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Generate Invoice Form
  const [genChargeId, setGenChargeId] = useState("");
  const [genPeriodStart, setGenPeriodStart] = useState("2026-09-01");
  const [genPeriodEnd, setGenPeriodEnd] = useState("2026-09-30");

  // Edit Notes Form
  const [editNotesText, setEditNotesText] = useState("");

  // Current Selected Agreement
  const currentAgreement =
    agreementList.find((a) => a.id === selectedAgreementId) || agreementList[0] || null;

  // Filtered Systems & Resources for Selected Agreement / Client
  const availableSystems = systems.filter(
    (s) => s.client_id === (showNewAgreementModal ? newAgrClientId : currentAgreement?.client_id)
  );

  const availableResources = resources.filter(
    (r) =>
      r.client_id === currentAgreement?.client_id &&
      !resourceList.some(
        (ar) => ar.agreement_id === currentAgreement?.id && ar.resource_id === r.id
      )
  );

  // Covered Resources for Current Agreement
  const coveredResources = resourceList.filter(
    (ar) => ar.agreement_id === currentAgreement?.id
  );

  // Recurring Charges for Current Agreement (Financials only)
  const currentCharges = chargeList.filter(
    (rc) => rc.agreement_id === currentAgreement?.id
  );

  // Recurring Runs for Current Agreement
  const currentChargeIds = new Set(currentCharges.map((c) => c.id));
  const currentRuns = runList.filter((r) =>
    currentChargeIds.has(r.recurring_charge_id)
  );

  // Handlers
  async function handleCreateAgreement(e: React.FormEvent) {
    e.preventDefault();
    if (!newAgrClientId || !newAgrName.trim()) {
      setFormError("Client and Agreement Name are required.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await createAgreement({
        clientId: newAgrClientId,
        systemId: newAgrSystemId ? newAgrSystemId : null,
        name: newAgrName.trim(),
        serviceType: newAgrServiceType,
        billingCycle: newAgrCycle,
        paymentTiming: newAgrTiming,
        startDate: newAgrStartDate,
        endDate: newAgrEndDate ? newAgrEndDate : null,
        renewalDate: newAgrRenewalDate ? newAgrRenewalDate : null,
        defaultGraceDays: Number(newAgrGraceDays) || 7,
        noticeDays: Number(newAgrNoticeDays) || 14,
        contractReference: newAgrContractRef.trim() ? newAgrContractRef.trim() : null,
        operationalNotes: newAgrNotes.trim() ? newAgrNotes.trim() : null,
      });

      if (!res.ok) {
        setFormError(res.error || "Failed to create agreement");
      } else {
        if (res.data?.id) {
          const clientObj = clients.find((c) => c.id === newAgrClientId);
          const systemObj = systems.find((s) => s.id === newAgrSystemId);
          const newAgr: AgreementItem = {
            id: res.data.id,
            client_id: newAgrClientId,
            system_id: newAgrSystemId || null,
            name: newAgrName.trim(),
            service_type: newAgrServiceType,
            status: "active",
            start_date: newAgrStartDate,
            end_date: newAgrEndDate || null,
            renewal_date: newAgrRenewalDate || null,
            billing_cycle: newAgrCycle,
            payment_timing: newAgrTiming,
            default_grace_days: Number(newAgrGraceDays) || 7,
            notice_days: Number(newAgrNoticeDays) || 14,
            contract_reference: newAgrContractRef.trim() || null,
            operational_notes: newAgrNotes.trim() || null,
            created_at: new Date().toISOString(),
            archived_at: null,
            client_name: clientObj?.label ?? null,
            system_name: systemObj?.name ?? null,
          };
          setAgreementList((prev) => [newAgr, ...prev]);
          setSelectedAgreementId(res.data.id);
        }
        setShowNewAgreementModal(false);
        setNewAgrName("");
        setNewAgrNotes("");
        setNewAgrContractRef("");
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error creating agreement");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAttachResource(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAgreement || !attachResourceId) {
      setFormError("Resource is required.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await attachResourceToAgreement({
        agreementId: currentAgreement.id,
        resourceId: attachResourceId,
        notes: attachNotes.trim() ? attachNotes.trim() : null,
      });
      if (!res.ok) {
        setFormError(res.error || "Failed to attach resource");
      } else {
        if (res.data?.id && currentAgreement) {
          const resObj = resources.find((r) => r.id === attachResourceId);
          const newAR: AgreementResourceItem = {
            id: res.data.id,
            agreement_id: currentAgreement.id,
            resource_id: attachResourceId,
            notes: attachNotes.trim() || null,
            created_at: new Date().toISOString(),
            resource: resObj
              ? {
                  id: resObj.id,
                  name: resObj.name,
                  resource_type: resObj.resource_type,
                  status: resObj.status,
                  client_id: resObj.client_id,
                }
              : undefined,
          };
          setResourceList((prev) => [newAR, ...prev]);
        }
        setShowAttachResourceModal(false);
        setAttachResourceId("");
        setAttachNotes("");
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error attaching resource");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateRecurringCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAgreement || !chargeName.trim() || !chargeAmount) {
      setFormError("Charge name and positive amount are required.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await createRecurringCharge({
        agreementId: currentAgreement.id,
        name: chargeName.trim(),
        amount: Number(chargeAmount),
        currency: chargeCurrency,
        billingCycle: chargeCycle,
        paymentTiming: chargeTiming,
        servicePeriodRule: "calendar_month",
        startDate: chargeStartDate,
      });
      if (!res.ok) {
        setFormError(res.error || "Failed to create charge");
      } else {
        if (res.data?.id && currentAgreement) {
          const newCh: RecurringChargeItem = {
            id: res.data.id,
            agreement_id: currentAgreement.id,
            name: chargeName.trim(),
            amount: Number(chargeAmount),
            currency: chargeCurrency,
            billing_cycle: chargeCycle,
            payment_timing: chargeTiming,
            active: true,
            start_date: chargeStartDate,
            end_date: null,
            created_at: new Date().toISOString(),
          };
          setChargeList((prev) => [newCh, ...prev]);
          setGenChargeId(res.data.id);
        }
        setShowNewChargeModal(false);
        setChargeName("");
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error creating charge");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerateInvoice(e: React.FormEvent) {
    e.preventDefault();
    const effectiveChargeId = genChargeId || currentCharges[0]?.id;
    if (!effectiveChargeId || !genPeriodStart || !genPeriodEnd) {
      setFormError("Charge and billing period are required.");
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await generateRecurringInvoice({
        chargeId: effectiveChargeId,
        periodStart: genPeriodStart,
        periodEnd: genPeriodEnd,
      });
      if (!res.ok) {
        setFormError(res.error || "Failed to generate invoice");
      } else {
        const run = res.data;
        if (run) {
          const newRun: RecurringChargeRunItem = {
            id: run.id,
            recurring_charge_id: effectiveChargeId,
            period_start: genPeriodStart,
            period_end: genPeriodEnd,
            invoice_id: run.invoice_id,
            generated_at: new Date().toISOString(),
            status: "generated",
            invoice: run.invoice,
          };
          setRunList((prev) => [newRun, ...prev.filter((r) => r.id !== newRun.id)]);
        }
        setFormSuccess(
          `Draft invoice generated/returned! Invoice #${run?.invoice?.invoice_number || run?.invoice_id} (Due: ${run?.invoice?.due_date || "calculated"})`
        );
        router.refresh();
        setTimeout(() => {
          setShowGenerateInvoiceModal(false);
          setFormSuccess(null);
        }, 3000);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error generating invoice");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateNotes(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAgreement) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await updateAgreementOperationalNotes({
        id: currentAgreement.id,
        operationalNotes: editNotesText.trim() ? editNotesText.trim() : null,
      });
      if (!res.ok) {
        setFormError(res.error || "Failed to update notes");
      } else {
        setShowEditNotesModal(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error updating notes");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTerminateAgreement() {
    if (!currentAgreement) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await terminateAgreement(currentAgreement.id);
      if (!res.ok) {
        setFormError(res.error || "Failed to terminate agreement");
      } else {
        setShowTerminateModal(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error terminating agreement");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="ux-agreements">
      {/* Section header + primary action */}
      <div className="ux-agr-head">
        <div>
          <h2 className="ux-sec-title">Active Agreements ({agreementList.length})</h2>
          {isStaff && (
            <span className="ux-agr-staffnote">Operational staff view — financials hidden</span>
          )}
        </div>
        {canSeeFinancials && (
          <button
            id="btn-create-agreement"
            onClick={() => {
              setFormError(null);
              setShowNewAgreementModal(true);
            }}
            className="ux-btn ux-btn--primary ux-btn--small"
          >
            + New Agreement
          </button>
        )}
      </div>

      {/* Main Grid: Left Catalog, Right Details */}
      <div className="ux-agr-grid">
        {/* Left Column: Agreement List */}
        <div>
          {agreementList.length === 0 ? (
            <p className="ux-muted">
              No service agreements recorded.
            </p>
          ) : (
            <div className="ux-agr-list">
              {agreementList.map((agr) => {
                const isSelected = agr.id === currentAgreement?.id;
                const standing = agr.billing_standing || "CURRENT";
                return (
                  <button
                    type="button"
                    key={agr.id}
                    id={`agreement-card-${agr.id}`}
                    onClick={() => setSelectedAgreementId(agr.id)}
                    className={`ux-agr-item${isSelected ? " is-selected" : ""}`}
                  >
                    <div className="ux-agr-item-top">
                      <span className="ux-agr-name">{agr.name}</span>
                      <StatusMark tone={statusTone(agr.status)}>
                        {agr.status}
                      </StatusMark>
                    </div>
                    <div className="ux-agr-meta">
                      Client: {clientLabel(agr.client_id, agr.client_name, agr.client_email)}
                    </div>
                    {agr.system_name && (
                      <div className="ux-agr-meta">System: {agr.system_name}</div>
                    )}
                    <div className="ux-agr-standing">
                      <span>Standing</span>
                      <StatusMark tone={standingTone(standing)}>
                        {standing.replaceAll("_", " ")}
                      </StatusMark>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Agreement Details */}
        <div className="ux-agr-detail">
          {currentAgreement ? (
            <>
              {/* Detail header */}
              <div className="ux-agr-detail-head">
                <div>
                  <div className="ux-agr-detail-title">
                    <h3>{currentAgreement.name}</h3>
                    <StatusMark tone={statusTone(currentAgreement.status)}>
                      {currentAgreement.status}
                    </StatusMark>
                    <StatusMark tone={standingTone(currentAgreement.billing_standing)}>
                      {(currentAgreement.billing_standing || "CURRENT").replaceAll("_", " ")}
                    </StatusMark>
                  </div>
                  <p className="ux-agr-meta">
                    Client: {clientLabel(currentAgreement.client_id, currentAgreement.client_name, currentAgreement.client_email)}
                    {currentAgreement.system_name && ` · System: ${currentAgreement.system_name}`}
                  </p>
                </div>
                <div className="ux-agr-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditNotesText(currentAgreement.operational_notes || "");
                      setFormError(null);
                      setShowEditNotesModal(true);
                    }}
                    className="ux-btn ux-btn--secondary ux-btn--small"
                  >
                    Edit Notes
                  </button>
                  {isAdmin && currentAgreement.status !== "terminated" && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setShowTerminateModal(true);
                      }}
                      className="ux-btn ux-btn--outline-danger ux-btn--small"
                    >
                      Terminate
                    </button>
                  )}
                </div>
              </div>

              {/* Terms Grid */}
              <div className="ux-agr-terms">
                <div>
                  <span className="ux-agr-tl">Billing Cycle</span>
                  <span className="ux-agr-tv">{currentAgreement.billing_cycle.replaceAll("_", " ")}</span>
                </div>
                <div>
                  <span className="ux-agr-tl">Payment Timing</span>
                  <span className="ux-agr-tv">{currentAgreement.payment_timing.replaceAll("_", " ")}</span>
                </div>
                <div>
                  <span className="ux-agr-tl">Grace Days</span>
                  <span className="ux-agr-tv">{currentAgreement.default_grace_days} days</span>
                </div>
                <div>
                  <span className="ux-agr-tl">Notice Days</span>
                  <span className="ux-agr-tv">{currentAgreement.notice_days} days</span>
                </div>
                <div>
                  <span className="ux-agr-tl">Start Date</span>
                  <span className="ux-agr-tv ux-agr-tv--flat">{currentAgreement.start_date}</span>
                </div>
                <div>
                  <span className="ux-agr-tl">Renewal Date</span>
                  <span className="ux-agr-tv ux-agr-tv--flat">{currentAgreement.renewal_date || "—"}</span>
                </div>
                <div>
                  <span className="ux-agr-tl">End Date</span>
                  <span className="ux-agr-tv ux-agr-tv--flat">{currentAgreement.end_date || "Indefinite"}</span>
                </div>
                <div>
                  <span className="ux-agr-tl">Contract Ref</span>
                  <span className="ux-agr-tv ux-agr-tv--flat">{currentAgreement.contract_reference || "—"}</span>
                </div>
              </div>

              {/* Operational Notes */}
              {currentAgreement.operational_notes ? (
                <div className="ux-agr-sec">
                  <span className="ux-agr-tl">Operational Notes</span>
                  <p className="ux-agr-notes">{currentAgreement.operational_notes}</p>
                </div>
              ) : null}

              {/* Covered Resources Section */}
              <div className="ux-agr-sec">
                <div className="ux-agr-sec-head">
                  <div>
                    <h4 className="ux-agr-sec-title">
                      Covered Resources ({coveredResources.length})
                    </h4>
                    <p className="ux-agr-meta">
                      Infrastructure items bound under this service agreement. Same-client invariant enforced.
                    </p>
                  </div>
                  {canSeeFinancials && (
                    <button
                      id="btn-attach-resource"
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setAttachResourceId(availableResources[0]?.id || "");
                        setShowAttachResourceModal(true);
                      }}
                      disabled={availableResources.length === 0}
                      className="ux-btn ux-btn--secondary ux-btn--small"
                    >
                      + Attach Resource
                    </button>
                  )}
                </div>

                {coveredResources.length === 0 ? (
                  <p className="ux-agr-empty">
                    No infrastructure resources attached to this agreement yet.
                  </p>
                ) : (
                  <div className="ux-agr-rows">
                    {coveredResources.map((ar) => (
                      <div key={ar.id} className="ux-agr-row">
                        <div>
                          <div className="ux-agr-row-name">
                            {ar.resource?.name || "Resource"}
                          </div>
                          <div className="ux-agr-meta">
                            Type: {ar.resource?.resource_type} · Status: {ar.resource?.status}
                          </div>
                          {ar.notes && (
                            <div className="ux-agr-meta">Note: {ar.notes}</div>
                          )}
                        </div>
                        <StatusMark tone="success">Covered</StatusMark>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recurring Charges Section (Admin & Finance ONLY) */}
              {canSeeFinancials && (
                <div className="ux-agr-sec">
                  <div className="ux-agr-sec-head">
                    <div>
                      <h4 className="ux-agr-sec-title">
                        Recurring Billing Schedules ({currentCharges.length})
                      </h4>
                      <p className="ux-agr-meta">
                        Configured recurring commercial billing items. SCH default is Month-End / Post-Service.
                      </p>
                    </div>
                    <div className="ux-agr-actions">
                      <button
                        id="btn-add-charge"
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setShowNewChargeModal(true);
                        }}
                        className="ux-btn ux-btn--secondary ux-btn--small"
                      >
                        + Add Recurring Charge
                      </button>
                      <button
                        id="btn-generate-invoice"
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setFormSuccess(null);
                          setGenChargeId(currentCharges[0]?.id || "");
                          setShowGenerateInvoiceModal(true);
                        }}
                        disabled={currentCharges.length === 0}
                        className="ux-btn ux-btn--primary ux-btn--small"
                      >
                        Generate Invoice
                      </button>
                    </div>
                  </div>

                  {currentCharges.length === 0 ? (
                    <p className="ux-agr-empty">
                      No recurring billing schedules configured.
                    </p>
                  ) : (
                    <div className="ux-agr-rows">
                      {currentCharges.map((ch) => (
                        <div key={ch.id} className="ux-agr-row">
                          <div>
                            <div className="ux-agr-row-name">{ch.name}</div>
                            <div className="ux-agr-meta">
                              Timing: {ch.payment_timing.replaceAll("_", " ")} · Cycle: {ch.billing_cycle} · Start: {ch.start_date}
                            </div>
                          </div>
                          <div className="ux-agr-row-right">
                            <span className="ux-agr-amount">
                              {ch.currency} {ch.amount.toLocaleString()}
                            </span>
                            <StatusMark tone={ch.active ? "success" : "neutral"}>
                              {ch.active ? "Active" : "Inactive"}
                            </StatusMark>
                            <ChargeBreakdownButton
                              charge={ch}
                              items={chargeItems[ch.id] ?? []}
                              packages={chargePackages}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Billing Runs / Invoice History */}
                  {currentRuns.length > 0 && (
                    <div className="ux-agr-sec">
                      <h5 className="ux-agr-tl">Generated Billing Runs (Idempotent)</h5>
                      <div className="ux-agr-rows">
                        {currentRuns.map((run) => (
                          <div key={run.id} className="ux-agr-row">
                            <div>
                              <div className="ux-agr-row-name">
                                Period: {run.period_start} → {run.period_end}
                              </div>
                              <div className="ux-agr-meta">
                                Invoice: {run.invoice?.invoice_number || run.invoice_id} · Due: {run.invoice?.due_date || "—"}
                              </div>
                            </div>
                            <div className="ux-agr-row-right">
                              {run.invoice && (
                                <span className="ux-agr-amount">
                                  {run.invoice.currency} {run.invoice.total_amount?.toLocaleString()}
                                </span>
                              )}
                              <StatusMark tone={run.invoice?.status === "paid" ? "success" : "warning"}>
                                {run.invoice?.status || run.status}
                              </StatusMark>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="ux-muted">
              Select a service agreement to view operational details and billing configurations.
            </p>
          )}
        </div>
      </div>

      {/* DIALOG 1: Create Service Agreement */}
      {showNewAgreementModal && (
        <Dialog
          labelledBy="modal-create-agreement"
          onClose={() => setShowNewAgreementModal(false)}
          maxWidth={640}
        >
          <div className="p-6 space-y-4">
            <h3 id="modal-create-agreement" className="text-lg font-bold text-[var(--foreground)]">
              New Service Agreement
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Define the commercial and operational terms for a client. System association is optional.
            </p>

            {formError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateAgreement} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Client *
                  </label>
                  <select
                    id="input-agreement-client"
                    value={newAgrClientId}
                    onChange={(e) => {
                      setNewAgrClientId(e.target.value);
                      setNewAgrSystemId("");
                    }}
                    required
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Associated System (Optional)
                  </label>
                  <select
                    id="input-agreement-system"
                    value={newAgrSystemId}
                    onChange={(e) => setNewAgrSystemId(e.target.value)}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  >
                    <option value="">None (Independent Agreement)</option>
                    {availableSystems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Agreement Name *
                </label>
                <input
                  id="input-agreement-name"
                  type="text"
                  placeholder="e.g. Managed Hosting & Technical Maintenance"
                  value={newAgrName}
                  onChange={(e) => setNewAgrName(e.target.value)}
                  required
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={newAgrCycle}
                    onChange={(e) => setNewAgrCycle(e.target.value)}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  >
                    <option value="monthly">Monthly (Default)</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Payment Timing
                  </label>
                  <select
                    value={newAgrTiming}
                    onChange={(e) => setNewAgrTiming(e.target.value)}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  >
                    <option value="month_end">Month-End (SCH Default)</option>
                    <option value="advance">Advance</option>
                    <option value="net_15">Net 15</option>
                    <option value="net_30">Net 30</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={newAgrStartDate}
                    onChange={(e) => setNewAgrStartDate(e.target.value)}
                    required
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Default Grace Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newAgrGraceDays}
                    onChange={(e) => setNewAgrGraceDays(Number(e.target.value))}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Notice Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newAgrNoticeDays}
                    onChange={(e) => setNewAgrNoticeDays(Number(e.target.value))}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Contract Reference (No secrets)
                </label>
                <input
                  type="text"
                  placeholder="e.g. AGR-2026-001"
                  value={newAgrContractRef}
                  onChange={(e) => setNewAgrContractRef(e.target.value)}
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Operational Notes (No secrets)
                </label>
                <textarea
                  rows={3}
                  placeholder="Operational context, agreed scope, SLAs..."
                  value={newAgrNotes}
                  onChange={(e) => setNewAgrNotes(e.target.value)}
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowNewAgreementModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)]"
                >
                  Cancel
                </button>
                <button
                  id="submit-create-agreement"
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--primary ux-btn--small"
                >
                  {isSubmitting ? "Creating..." : "Create Agreement"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* DIALOG 2: Attach Resource */}
      {showAttachResourceModal && currentAgreement && (
        <Dialog
          labelledBy="modal-attach-resource"
          onClose={() => setShowAttachResourceModal(false)}
          maxWidth={480}
        >
          <div className="p-6 space-y-4">
            <h3 id="modal-attach-resource" className="text-lg font-bold text-[var(--foreground)]">
              Attach Resource to Agreement
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Attach a technical resource owned by {currentAgreement.client_name || "this client"}.
            </p>

            {formError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleAttachResource} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Available Resource *
                </label>
                <select
                  id="input-attach-resource"
                  value={attachResourceId}
                  onChange={(e) => setAttachResourceId(e.target.value)}
                  required
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                >
                  {availableResources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.resource_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Attachment Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Primary production database instance"
                  value={attachNotes}
                  onChange={(e) => setAttachNotes(e.target.value)}
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowAttachResourceModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)]"
                >
                  Cancel
                </button>
                <button
                  id="submit-attach-resource"
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--primary ux-btn--small"
                >
                  {isSubmitting ? "Attaching..." : "Attach Resource"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* DIALOG 3: Add Recurring Charge */}
      {showNewChargeModal && currentAgreement && (
        <Dialog
          labelledBy="modal-new-charge"
          onClose={() => setShowNewChargeModal(false)}
          maxWidth={500}
        >
          <div className="p-6 space-y-4">
            <h3 id="modal-new-charge" className="text-lg font-bold text-[var(--foreground)]">
              Add Recurring Commercial Charge
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Configure a recurring charge for &ldquo;{currentAgreement.name}&rdquo;. Explicit currency is required.
            </p>

            {formError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateRecurringCharge} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Charge Name / Description *
                </label>
                <input
                  id="input-charge-name"
                  type="text"
                  placeholder="e.g. Managed Hosting Subscription"
                  value={chargeName}
                  onChange={(e) => setChargeName(e.target.value)}
                  required
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Currency *
                  </label>
                  <select
                    id="input-charge-currency"
                    value={chargeCurrency}
                    onChange={(e) => setChargeCurrency(e.target.value as "UGX" | "USD")}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  >
                    <option value="UGX">UGX (Ugandan Shillings)</option>
                    <option value="USD">USD (US Dollars)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Amount *
                  </label>
                  <input
                    id="input-charge-amount"
                    type="number"
                    min={1}
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(Number(e.target.value))}
                    required
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={chargeCycle}
                    onChange={(e) => setChargeCycle(e.target.value)}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Payment Timing
                  </label>
                  <select
                    value={chargeTiming}
                    onChange={(e) => setChargeTiming(e.target.value)}
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  >
                    <option value="month_end">Month-End (SCH Default)</option>
                    <option value="advance">Advance</option>
                    <option value="net_15">Net 15</option>
                    <option value="net_30">Net 30</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={chargeStartDate}
                  onChange={(e) => setChargeStartDate(e.target.value)}
                  required
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowNewChargeModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)]"
                >
                  Cancel
                </button>
                <button
                  id="submit-create-charge"
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--primary ux-btn--small"
                >
                  {isSubmitting ? "Adding..." : "Add Recurring Charge"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* DIALOG 4: Generate Recurring Invoice */}
      {showGenerateInvoiceModal && (
        <Dialog
          labelledBy="modal-generate-invoice"
          onClose={() => setShowGenerateInvoiceModal(false)}
          maxWidth={500}
        >
          <div className="p-6 space-y-4">
            <h3 id="modal-generate-invoice" className="text-lg font-bold text-[var(--foreground)]">
              Generate Recurring Invoice
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Generate a recurring invoice for a billing period. If already generated, the existing run is returned.
            </p>

            {formError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-3 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleGenerateInvoice} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--foreground)] block mb-1">
                  Select Recurring Charge *
                </label>
                <select
                  id="input-gen-charge"
                  value={genChargeId}
                  onChange={(e) => setGenChargeId(e.target.value)}
                  required
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                >
                  {currentCharges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.currency} {c.amount.toLocaleString()} ({c.billing_cycle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Period Start *
                  </label>
                  <input
                    id="input-gen-period-start"
                    type="date"
                    value={genPeriodStart}
                    onChange={(e) => setGenPeriodStart(e.target.value)}
                    required
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--foreground)] block mb-1">
                    Period End *
                  </label>
                  <input
                    id="input-gen-period-end"
                    type="date"
                    value={genPeriodEnd}
                    onChange={(e) => setGenPeriodEnd(e.target.value)}
                    required
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowGenerateInvoiceModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)]"
                >
                  Close
                </button>
                <button
                  id="submit-generate-invoice"
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--primary ux-btn--small"
                >
                  {isSubmitting ? "Generating..." : "Generate Draft Invoice"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* DIALOG 5: Edit Operational Notes */}
      {showEditNotesModal && currentAgreement && (
        <Dialog
          labelledBy="modal-edit-notes"
          onClose={() => setShowEditNotesModal(false)}
          maxWidth={500}
        >
          <div className="p-6 space-y-4">
            <h3 id="modal-edit-notes" className="text-lg font-bold text-[var(--foreground)]">
              Update Operational Notes
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Operational information for &ldquo;{currentAgreement.name}&rdquo;. Secrets are strictly prohibited.
            </p>

            {formError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleUpdateNotes} className="space-y-4 text-xs">
              <div>
                <textarea
                  id="input-edit-notes"
                  rows={5}
                  value={editNotesText}
                  onChange={(e) => setEditNotesText(e.target.value)}
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--foreground)]"
                  placeholder="Operational notes, support escalation details, maintenance windows..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowEditNotesModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)]"
                >
                  Cancel
                </button>
                <button
                  id="submit-edit-notes"
                  type="submit"
                  disabled={isSubmitting}
                  className="ux-btn ux-btn--primary ux-btn--small"
                >
                  {isSubmitting ? "Saving..." : "Save Notes"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* DIALOG 6: Terminate Agreement Confirmation */}
      {showTerminateModal && currentAgreement && (
        <Dialog
          labelledBy="modal-terminate-agreement"
          onClose={() => setShowTerminateModal(false)}
          alert
          maxWidth={460}
        >
          <div className="p-6 space-y-4">
            <h3 id="modal-terminate-agreement" className="text-lg font-bold text-rose-600">
              Terminate Service Agreement
            </h3>
            <p className="text-xs text-[var(--foreground)]">
              Are you sure you want to terminate &ldquo;{currentAgreement.name}&rdquo;?
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              This sets status to <strong>terminated</strong> and records termination timestamp. Historical invoices, payments, and billing runs are preserved.
            </p>

            {formError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)] text-xs">
              <button
                type="button"
                onClick={() => setShowTerminateModal(false)}
                className="px-4 py-2 font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                id="submit-confirm-terminate"
                type="button"
                onClick={handleTerminateAgreement}
                disabled={isSubmitting}
                className="px-4 py-2 font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isSubmitting ? "Terminating..." : "Confirm Termination"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
