"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Search,
  Filter,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  X,
  TrendingUp,
} from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  createProviderCost,
  updateProviderCost,
  updateProviderCostStatus,
  cancelProviderCost,
  type CostType,
  type CostStatus,
} from "@/lib/actions/provider-costs";

type RenewalState = "no_renewal" | "upcoming" | "due" | "overdue";

export interface ProviderCostItem {
  id: string;
  provider_account_id: string | null;
  resource_id: string | null;
  system_id: string | null;
  client_id: string | null;
  service_agreement_id: string | null;
  allocation_type: "client" | "overhead";
  cost_type: string;
  description: string;
  amount: number;
  currency: "UGX" | "USD";
  billing_period_start: string | null;
  billing_period_end: string | null;
  incurred_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  status: CostStatus;
  is_recurring: boolean;
  renewal_date: string | null;
  renewal_state: RenewalState;
  renewal_notes: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  provider_account_name: string | null;
  provider_name: string | null;
  resource_name: string | null;
  resource_type: string | null;
  system_name: string | null;
  agreement_name: string | null;
  client_company: string | null;
  client_email: string | null;
}

export interface ServiceMarginItem {
  agreement_id: string;
  agreement_name: string | null;
  client_id: string;
  agreement_status: string;
  client_company: string | null;
  client_email: string | null;
  currency: "UGX" | "USD";
  service_revenue: number | null;
  allocated_cost: number;
  margin_amount: number | null;
  margin_pct: number | null;
  margin_state: "computed" | "unavailable";
}

export interface ClientOption {
  id: string;
  email: string;
  company_name: string | null;
  full_name: string | null;
}

export interface ProviderAccountOption {
  id: string;
  account_name: string;
  provider: { id: string; name: string } | null;
}

export interface ResourceOption {
  id: string;
  name: string;
  client_id: string | null;
  system_id: string | null;
  provider_account_id: string | null;
  resource_type: string;
  status: string;
}

export interface SystemOption {
  id: string;
  name: string;
  client_id: string;
}

export interface AgreementOption {
  id: string;
  name: string;
  client_id: string;
  status: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  record_id: string | null;
  created_at: string;
  actor?: { full_name?: string | null; email?: string | null } | null;
}

interface Props {
  currentUserId: string;
  costs: ProviderCostItem[];
  margins: ServiceMarginItem[];
  auditTrail: AuditEvent[];
  clients: ClientOption[];
  providerAccounts: ProviderAccountOption[];
  resources: ResourceOption[];
  systems: SystemOption[];
  agreements: AgreementOption[];
  isAdmin: boolean;
  isFinance: boolean;
}

function statusTone(status: string): Tone {
  switch (status) {
    case "paid":
      return "success";
    case "due":
      return "warning";
    case "accrued":
      return "info";
    case "estimated":
      return "neutral";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

function renewalTone(state: string): Tone {
  switch (state) {
    case "overdue":
      return "danger";
    case "due":
      return "warning";
    case "upcoming":
      return "info";
    default:
      return "neutral";
  }
}

function formatMoney(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  const digits = currency === "UGX" ? 0 : 2;
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default function ProviderCostsManager({
  costs,
  margins,
  auditTrail,
  clients,
  providerAccounts,
  resources,
  systems,
  agreements,
  isAdmin,
  isFinance,
}: Props) {
  const router = useRouter();

  const [selectedCostId, setSelectedCostId] = useState<string | null>(costs[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [renewalFilter, setRenewalFilter] = useState<string>("all");
  const [allocationFilter, setAllocationFilter] = useState<string>("all");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form fields
  const [formAllocation, setFormAllocation] = useState<"client" | "overhead">("client");
  const [formClientId, setFormClientId] = useState<string>("");
  const [formAccountId, setFormAccountId] = useState<string>("");
  const [formResourceId, setFormResourceId] = useState<string>("");
  const [formSystemId, setFormSystemId] = useState<string>("");
  const [formAgreementId, setFormAgreementId] = useState<string>("");
  const [formCostType, setFormCostType] = useState<string>("hosting");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCurrency, setFormCurrency] = useState<"UGX" | "USD">("UGX");
  const [formPeriodStart, setFormPeriodStart] = useState<string>("");
  const [formPeriodEnd, setFormPeriodEnd] = useState<string>("");
  const [formDueAt, setFormDueAt] = useState<string>("");
  const [formStatus, setFormStatus] = useState<string>("estimated");
  const [formRecurring, setFormRecurring] = useState<boolean>(false);
  const [formRenewalDate, setFormRenewalDate] = useState<string>("");
  const [formRenewalNotes, setFormRenewalNotes] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");

  const canManage = isAdmin || isFinance;
  const activeCost = costs.find((c) => c.id === selectedCostId) || costs[0] || null;
  const activeAudit = activeCost ? auditTrail.filter((a) => a.record_id === activeCost.id) : [];

  const providerOptions = Array.from(
    new Map(providerAccounts.filter((a) => a.provider).map((a) => [a.provider!.id, a.provider!])).values()
  );

  const availableResources = resources.filter((r) => !formClientId || r.client_id === formClientId);
  const availableSystems = systems.filter((s) => !formClientId || s.client_id === formClientId);
  const availableAgreements = agreements.filter((a) => !formClientId || a.client_id === formClientId);

  const filteredCosts = costs.filter((c) => {
    if (clientFilter !== "all" && c.client_id !== clientFilter) return false;
    if (providerFilter !== "all") {
      const acc = providerAccounts.find((a) => a.id === c.provider_account_id);
      if (acc?.provider?.id !== providerFilter) return false;
    }
    if (systemFilter !== "all" && c.system_id !== systemFilter) return false;
    if (typeFilter !== "all" && c.cost_type !== typeFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (currencyFilter !== "all" && c.currency !== currencyFilter) return false;
    if (renewalFilter !== "all" && c.renewal_state !== renewalFilter) return false;
    if (allocationFilter !== "all" && c.allocation_type !== allocationFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        c.description.toLowerCase().includes(q) ||
        (c.client_company || c.client_email || "").toLowerCase().includes(q) ||
        (c.provider_name || "").toLowerCase().includes(q) ||
        (c.resource_name || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Per-currency active totals — UGX and USD are NEVER combined.
  const totalsByCurrency = filteredCosts
    .filter((c) => c.status !== "cancelled")
    .reduce<Record<string, number>>((acc, c) => {
      acc[c.currency] = (acc[c.currency] || 0) + c.amount;
      return acc;
    }, {});
  const renewalCounts = costs.reduce<Record<string, number>>((acc, c) => {
    if (c.renewal_state !== "no_renewal") acc[c.renewal_state] = (acc[c.renewal_state] || 0) + 1;
    return acc;
  }, {});

  function resetForm() {
    setFormAllocation("client");
    setFormClientId("");
    setFormAccountId("");
    setFormResourceId("");
    setFormSystemId("");
    setFormAgreementId("");
    setFormCostType("hosting");
    setFormDescription("");
    setFormAmount("");
    setFormCurrency("UGX");
    setFormPeriodStart("");
    setFormPeriodEnd("");
    setFormDueAt("");
    setFormStatus("estimated");
    setFormRecurring(false);
    setFormRenewalDate("");
    setFormRenewalNotes("");
    setFormNotes("");
  }

  function openEditModal() {
    if (!activeCost) return;
    setFormAllocation(activeCost.allocation_type);
    setFormClientId(activeCost.client_id || "");
    setFormCostType(activeCost.cost_type);
    setFormDescription(activeCost.description);
    setFormAmount(activeCost.amount.toString());
    setFormCurrency(activeCost.currency);
    setFormPeriodStart(activeCost.billing_period_start || "");
    setFormPeriodEnd(activeCost.billing_period_end || "");
    setFormDueAt(activeCost.due_at ? activeCost.due_at.slice(0, 10) : "");
    setFormRecurring(activeCost.is_recurring);
    setFormRenewalDate(activeCost.renewal_date || "");
    setFormRenewalNotes(activeCost.renewal_notes || "");
    setFormNotes(activeCost.notes || "");
    setEditModalOpen(true);
  }

  async function handleCreateCost(e: React.FormEvent) {
    e.preventDefault();
    if (!formDescription.trim() || !formAmount) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createProviderCost({
      allocationType: formAllocation,
      clientId: formAllocation === "client" ? formClientId || null : null,
      providerAccountId: formAccountId || null,
      resourceId: formResourceId || null,
      systemId: formSystemId || null,
      serviceAgreementId: formAgreementId || null,
      costType: formCostType as CostType,
      description: formDescription.trim(),
      amount: Number(formAmount),
      currency: formCurrency,
      billingPeriodStart: formPeriodStart || null,
      billingPeriodEnd: formPeriodEnd || null,
      dueAt: formDueAt || null,
      status: formStatus as CostStatus,
      isRecurring: formRecurring,
      renewalDate: formRecurring ? formRenewalDate || null : null,
      renewalNotes: formRenewalNotes.trim() || null,
      notes: formNotes.trim() || null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to create provider cost");
    } else {
      setCreateModalOpen(false);
      resetForm();
      router.refresh();
      if (res.data?.id) setSelectedCostId(res.data.id);
    }
  }

  async function handleEditCost(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCost || !canManage) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await updateProviderCost(activeCost.id, {
      costType: formCostType as CostType,
      description: formDescription.trim(),
      amount: Number(formAmount),
      currency: formCurrency,
      billingPeriodStart: formPeriodStart || null,
      billingPeriodEnd: formPeriodEnd || null,
      dueAt: formDueAt || null,
      isRecurring: formRecurring,
      renewalDate: formRecurring ? formRenewalDate || null : null,
      renewalNotes: formRenewalNotes.trim() || null,
      notes: formNotes.trim() || null,
    });

    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to update provider cost");
    } else {
      setEditModalOpen(false);
      router.refresh();
    }
  }

  async function handleSetStatus(status: "estimated" | "accrued" | "due" | "paid") {
    if (!activeCost || !canManage) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await updateProviderCostStatus(activeCost.id, status);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to update cost status");
    } else {
      router.refresh();
    }
  }

  async function handleCancel() {
    if (!activeCost || !canManage) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    const res = await cancelProviderCost(activeCost.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error || "Failed to cancel provider cost");
    } else {
      router.refresh();
    }
  }

  const costFormFields = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="ux-label">Allocation *</label>
          <select
            id="select-cost-allocation"
            value={formAllocation}
            onChange={(e) => setFormAllocation(e.target.value as "client" | "overhead")}
            className="ux-select"
            style={{ width: "100%" }}
            disabled={editModalOpen}
          >
            <option value="client">Client allocated</option>
            <option value="overhead">SCH overhead</option>
          </select>
        </div>
        <div>
          <label className="ux-label">Cost Type *</label>
          <select
            id="select-cost-type"
            value={formCostType}
            onChange={(e) => setFormCostType(e.target.value)}
            className="ux-select"
            style={{ width: "100%" }}
          >
            <option value="hosting">Hosting</option>
            <option value="database">Database</option>
            <option value="storage">Storage</option>
            <option value="domain">Domain</option>
            <option value="email">Email</option>
            <option value="software">Software</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {!editModalOpen && (
        <>
          {formAllocation === "client" && (
            <div>
              <label className="ux-label">Client *</label>
              <select
                id="select-cost-client"
                value={formClientId}
                onChange={(e) => {
                  setFormClientId(e.target.value);
                  setFormResourceId("");
                  setFormSystemId("");
                  setFormAgreementId("");
                }}
                required={formAllocation === "client"}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name || c.full_name || c.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="ux-label">Provider Account</label>
              <select
                id="select-cost-account"
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">None</option>
                {providerAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.provider?.name ? `${a.provider.name} — ` : ""}{a.account_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ux-label">Resource</label>
              <select
                id="select-cost-resource"
                value={formResourceId}
                onChange={(e) => setFormResourceId(e.target.value)}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">None</option>
                {availableResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.resource_type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="ux-label">System</label>
              <select
                id="select-cost-system"
                value={formSystemId}
                onChange={(e) => setFormSystemId(e.target.value)}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">None</option>
                {availableSystems.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ux-label">Service Agreement</label>
              <select
                id="select-cost-agreement"
                value={formAgreementId}
                onChange={(e) => setFormAgreementId(e.target.value)}
                className="ux-select"
                style={{ width: "100%" }}
              >
                <option value="">None</option>
                {availableAgreements.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <div>
        <label className="ux-label">Description *</label>
        <input
          id="input-cost-description"
          type="text"
          required
          placeholder="e.g. Supabase Pro database — Oct 2026"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          className="ux-input"
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="ux-label">Amount *</label>
          <input
            id="input-cost-amount"
            type="number"
            min={0}
            step="0.01"
            required
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className="ux-label">Currency *</label>
          <select
            id="select-cost-currency"
            value={formCurrency}
            onChange={(e) => setFormCurrency(e.target.value as "UGX" | "USD")}
            className="ux-select"
            style={{ width: "100%" }}
          >
            <option value="UGX">UGX</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="ux-label">Billing Period Start</label>
          <input
            id="input-cost-period-start"
            type="date"
            value={formPeriodStart}
            onChange={(e) => setFormPeriodStart(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className="ux-label">Billing Period End</label>
          <input
            id="input-cost-period-end"
            type="date"
            value={formPeriodEnd}
            onChange={(e) => setFormPeriodEnd(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="ux-label">Due Date</label>
          <input
            id="input-cost-due-at"
            type="date"
            value={formDueAt}
            onChange={(e) => setFormDueAt(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
        {!editModalOpen && (
          <div>
            <label className="ux-label">Status</label>
            <select
              id="select-cost-status"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
              className="ux-select"
              style={{ width: "100%" }}
            >
              <option value="estimated">Estimated</option>
              <option value="accrued">Accrued</option>
              <option value="due">Due</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          id="input-cost-recurring"
          type="checkbox"
          checked={formRecurring}
          onChange={(e) => setFormRecurring(e.target.checked)}
        />
        <label htmlFor="input-cost-recurring" style={{ fontSize: "0.8125rem" }}>
          Recurring provider cost — track a renewal date
        </label>
      </div>

      {formRecurring && (
        <div>
          <label className="ux-label">Renewal Date</label>
          <input
            id="input-cost-renewal-date"
            type="date"
            value={formRenewalDate}
            onChange={(e) => setFormRenewalDate(e.target.value)}
            className="ux-input"
            style={{ width: "100%" }}
          />
        </div>
      )}

      <div>
        <label className="ux-label">Notes</label>
        <textarea
          id="input-cost-notes"
          rows={2}
          placeholder="Provider invoice reference, billing context..."
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          className="ux-input"
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Governance & Disclaimer */}
      <div className="ux-notice">
        Provider and infrastructure costs are recorded manually and allocated to a client or kept as
        SCH overhead. Margins are calculated deterministically in the matching currency — UGX and USD
        are never combined. No provider APIs, imports, or automation exist in this layer.
      </div>

      {/* Summary strip — per-currency totals, renewal states */}
      <div id="cost-summary-strip" className="ux-figures">
        {(["UGX", "USD"] as const).map((cur) => (
          <div key={cur} id={`cost-total-${cur}`} className="ux-figure">
            <span>Active {cur} cost</span>
            <b data-currency-total={cur}>{formatMoney(totalsByCurrency[cur] ?? 0, cur)}</b>
          </div>
        ))}
        {(["upcoming", "due", "overdue"] as const).map((state) => (
          <div key={state} id={`renewal-count-${state}`} className="ux-figure">
            <span>Renewals {state}</span>
            <b data-renewal-count={state}>{renewalCounts[state] ?? 0}</b>
          </div>
        ))}
      </div>

      {errorMessage && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--ux-danger-bg)",
            border: "1px solid var(--ux-danger-line)",
            color: "var(--ux-danger)",
            borderRadius: "4px",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ux-danger)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Header & Filters */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: "220px" }}>
            <Search className="w-4 h-4 text-muted-foreground" style={{ position: "absolute", left: "0.625rem", top: "0.625rem" }} />
            <input
              id="input-cost-search"
              type="text"
              placeholder="Search costs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ux-input"
              style={{ paddingLeft: "2rem", width: "100%", fontSize: "0.8125rem" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              id="filter-cost-client"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name || c.full_name || c.email}</option>
              ))}
            </select>

            <select
              id="filter-cost-provider"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Providers</option>
              {providerOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              id="filter-cost-system"
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Systems</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select
              id="filter-cost-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Types</option>
              <option value="hosting">Hosting</option>
              <option value="database">Database</option>
              <option value="storage">Storage</option>
              <option value="domain">Domain</option>
              <option value="email">Email</option>
              <option value="software">Software</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="other">Other</option>
            </select>

            <select
              id="filter-cost-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Statuses</option>
              <option value="estimated">Estimated</option>
              <option value="accrued">Accrued</option>
              <option value="due">Due</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              id="filter-cost-currency"
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Currencies</option>
              <option value="UGX">UGX</option>
              <option value="USD">USD</option>
            </select>

            <select
              id="filter-cost-renewal"
              value={renewalFilter}
              onChange={(e) => setRenewalFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Renewal States</option>
              <option value="upcoming">Upcoming</option>
              <option value="due">Due</option>
              <option value="overdue">Overdue</option>
              <option value="no_renewal">No Renewal</option>
            </select>

            <select
              id="filter-cost-allocation"
              value={allocationFilter}
              onChange={(e) => setAllocationFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.5rem" }}
            >
              <option value="all">All Allocations</option>
              <option value="client">Client allocated</option>
              <option value="overhead">SCH overhead</option>
            </select>
          </div>
        </div>

        {canManage && (
          <button
            id="btn-create-cost"
            onClick={() => {
              resetForm();
              setCreateModalOpen(true);
            }}
            className="ux-btn ux-btn--primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Plus className="w-4 h-4" />
            <span>New Provider Cost</span>
          </button>
        )}
      </div>

      {/* Main Master-Detail Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: "1.25rem",
          alignItems: "start",
        }}
        className="provider-costs-layout"
      >
        {/* Left Column: Cost List */}
        <div
          id="provider-cost-list"
          style={{
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--card)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              fontWeight: 600,
              fontSize: "0.8125rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Provider Costs ({filteredCosts.length})</span>
            <span className="ux-muted" style={{ fontWeight: 400 }}>Audit-logged</span>
          </div>

          <div style={{ maxHeight: "680px", overflowY: "auto" }}>
            {filteredCosts.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                No provider costs recorded.
              </div>
            ) : (
              filteredCosts.map((c) => {
                const isSelected = c.id === activeCost?.id;
                return (
                  <div
                    key={c.id}
                    id={`cost-card-${c.id}`}
                    data-cost-status={c.status}
                    data-cost-currency={c.currency}
                    data-renewal-state={c.renewal_state}
                    onClick={() => setSelectedCostId(c.id)}
                    style={{
                      padding: "0.875rem 1rem",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: isSelected ? "var(--surface)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--primary, #000)" : "3px solid transparent",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{c.description}</span>
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <StatusMark tone={statusTone(c.status)}>{c.status}</StatusMark>
                        {c.renewal_state !== "no_renewal" && (
                          <StatusMark tone={renewalTone(c.renewal_state)}>{c.renewal_state}</StatusMark>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.375rem" }}>
                      <b className="cost-amount">{formatMoney(c.amount, c.currency)}</b>
                      <span> • {c.cost_type}</span>
                      {c.allocation_type === "overhead" ? (
                        <span> • SCH overhead</span>
                      ) : (
                        <span> • {c.client_company || c.client_email}</span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.75rem",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      <span>{c.provider_name || "—"}{c.resource_name ? ` • ${c.resource_name}` : ""}</span>
                      {c.renewal_date && <span>Renews {formatDate(c.renewal_date)}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Cost Detail */}
        {activeCost ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "var(--card)",
                padding: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                    <Wallet className="w-5 h-5 text-indigo-500" />
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                      {activeCost.description}
                    </h2>
                    <span id="active-cost-status" data-status={activeCost.status}>
                      <StatusMark tone={statusTone(activeCost.status)}>{activeCost.status}</StatusMark>
                    </span>
                    <StatusMark tone={activeCost.allocation_type === "client" ? "info" : "neutral"}>
                      {activeCost.allocation_type === "client" ? "client allocated" : "SCH overhead"}
                    </StatusMark>
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                    <b id="active-cost-amount">{formatMoney(activeCost.amount, activeCost.currency)}</b>
                    <span> • {activeCost.cost_type}</span>
                    {activeCost.client_id && (
                      <span> • Client: <b>{activeCost.client_company || activeCost.client_email}</b></span>
                    )}
                    {activeCost.provider_name && <span> • Provider: <b>{activeCost.provider_name}</b></span>}
                    {activeCost.system_name && <span> • System: <b>{activeCost.system_name}</b></span>}
                    {activeCost.resource_name && <span> • Resource: <b>{activeCost.resource_name}</b></span>}
                    {activeCost.agreement_name && <span> • Agreement: <b>{activeCost.agreement_name}</b></span>}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: "0.375rem" }}>
                    Period: {formatDate(activeCost.billing_period_start)} → {formatDate(activeCost.billing_period_end)}
                    {activeCost.due_at && <span> • Due {formatDate(activeCost.due_at)}</span>}
                    {activeCost.paid_at && <span> • Paid {formatDate(activeCost.paid_at)}</span>}
                    {activeCost.is_recurring && activeCost.renewal_date && (
                      <span> • Renewal {formatDate(activeCost.renewal_date)} ({activeCost.renewal_state})</span>
                    )}
                  </div>
                </div>

                {canManage && activeCost.status !== "cancelled" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      id="btn-edit-cost"
                      onClick={openEditModal}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    {activeCost.status !== "paid" && (
                      <button
                        id="btn-mark-cost-paid"
                        onClick={() => handleSetStatus("paid")}
                        disabled={isSubmitting}
                        className="ux-btn ux-btn--secondary ux-btn--sm"
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Paid</span>
                      </button>
                    )}
                    {activeCost.status === "estimated" && (
                      <button
                        id="btn-mark-cost-due"
                        onClick={() => handleSetStatus("due")}
                        disabled={isSubmitting}
                        className="ux-btn ux-btn--secondary ux-btn--sm"
                      >
                        <span>Mark Due</span>
                      </button>
                    )}
                    <button
                      id="btn-cancel-cost"
                      onClick={handleCancel}
                      disabled={isSubmitting}
                      className="ux-btn ux-btn--secondary ux-btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--ux-danger)" }}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel Cost</span>
                    </button>
                  </div>
                )}
              </div>

              {activeCost.notes && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                  {activeCost.notes}
                </div>
              )}
            </div>

            {/* Audit Trail */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "var(--card)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                }}
              >
                Activity History
              </div>
              <div id="cost-audit-trail" style={{ maxHeight: "240px", overflowY: "auto" }}>
                {activeAudit.length === 0 ? (
                  <div style={{ padding: "1rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                    {isAdmin ? "No audit entries yet." : "Audit history is visible to administrators."}
                  </div>
                ) : (
                  activeAudit.map((a) => (
                    <div
                      key={a.id}
                      className="audit-entry"
                      data-audit-action={a.action}
                      style={{
                        padding: "0.625rem 1rem",
                        borderBottom: "1px solid var(--border)",
                        fontSize: "0.8125rem",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                      }}
                    >
                      <span>{a.action}</span>
                      <span className="ux-muted">
                        {a.actor?.full_name || a.actor?.email || "system"} • {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "var(--muted-foreground)",
              fontSize: "0.875rem",
              border: "1px dashed var(--border)",
              borderRadius: "4px",
            }}
          >
            Select a provider cost from the list or create a new one.
          </div>
        )}
      </div>

      {/* Service Margin Table — currencies never combined */}
      <div
        id="service-margin-section"
        style={{
          border: "1px solid var(--border)",
          borderRadius: "4px",
          background: "var(--card)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600,
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Service Margin — per agreement, per currency (derived from recurring charges minus allocated provider costs)</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="ux-table" id="service-margin-table" style={{ width: "100%", fontSize: "0.8125rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.625rem 1rem" }}>Client</th>
                <th style={{ textAlign: "left", padding: "0.625rem 1rem" }}>Agreement</th>
                <th style={{ textAlign: "left", padding: "0.625rem 1rem" }}>Currency</th>
                <th style={{ textAlign: "right", padding: "0.625rem 1rem" }}>Revenue</th>
                <th style={{ textAlign: "right", padding: "0.625rem 1rem" }}>Allocated Cost</th>
                <th style={{ textAlign: "right", padding: "0.625rem 1rem" }}>Margin</th>
                <th style={{ textAlign: "right", padding: "0.625rem 1rem" }}>Margin %</th>
              </tr>
            </thead>
            <tbody>
              {margins.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted-foreground)" }}>
                    No agreements with revenue or allocated provider costs yet.
                  </td>
                </tr>
              ) : (
                margins.map((m) => (
                  <tr
                    key={`${m.agreement_id}-${m.currency}`}
                    className="margin-row"
                    data-agreement={m.agreement_id}
                    data-margin-currency={m.currency}
                    data-margin-state={m.margin_state}
                  >
                    <td style={{ padding: "0.625rem 1rem" }}>{m.client_company || m.client_email}</td>
                    <td style={{ padding: "0.625rem 1rem" }}>{m.agreement_name}</td>
                    <td style={{ padding: "0.625rem 1rem" }}>{m.currency}</td>
                    <td className="margin-revenue" style={{ padding: "0.625rem 1rem", textAlign: "right" }}>
                      {formatMoney(m.service_revenue, m.currency)}
                    </td>
                    <td className="margin-cost" style={{ padding: "0.625rem 1rem", textAlign: "right" }}>
                      {formatMoney(m.allocated_cost, m.currency)}
                    </td>
                    <td className="margin-amount" style={{ padding: "0.625rem 1rem", textAlign: "right" }}>
                      {m.margin_state === "computed" ? formatMoney(m.margin_amount, m.currency) : "unavailable"}
                    </td>
                    <td className="margin-pct" style={{ padding: "0.625rem 1rem", textAlign: "right" }}>
                      {m.margin_pct === null ? "—" : `${m.margin_pct}%`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Cost Modal */}
      {createModalOpen && (
        <Dialog onClose={() => setCreateModalOpen(false)} labelledBy="dialog-create-cost-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-create-cost-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              New Provider Cost
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Record a provider or infrastructure cost. Client, resource, system, and agreement links must be consistent.
            </p>
            <form onSubmit={handleCreateCost} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {costFormFields}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setCreateModalOpen(false)} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button id="submit-create-cost" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
                  {isSubmitting ? "Creating..." : "Create Cost"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Edit Cost Modal */}
      {editModalOpen && (
        <Dialog onClose={() => setEditModalOpen(false)} labelledBy="dialog-edit-cost-title">
          <div style={{ padding: "1.5rem" }}>
            <h2 id="dialog-edit-cost-title" style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
              Edit Provider Cost
            </h2>
            <p className="ux-muted" style={{ fontSize: "0.8125rem", margin: "0 0 1rem 0" }}>
              Client, resource, account and agreement bindings are immutable — record a corrected cost to reallocate.
            </p>
            <form onSubmit={handleEditCost} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {costFormFields}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setEditModalOpen(false)} className="ux-btn ux-btn--secondary">
                  Cancel
                </button>
                <button id="submit-edit-cost" type="submit" disabled={isSubmitting} className="ux-btn ux-btn--primary">
                  {isSubmitting ? "Saving..." : "Save Cost"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}
