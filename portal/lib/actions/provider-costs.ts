"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isAdmin as checkIsAdmin, isFinance } from "@/lib/security/roles";

export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type CostType =
  | "hosting"
  | "database"
  | "storage"
  | "domain"
  | "email"
  | "software"
  | "infrastructure"
  | "other";

export type CostStatus = "estimated" | "accrued" | "due" | "paid" | "cancelled";
export type AllocationType = "client" | "overhead";
export type Currency = "UGX" | "USD";

const COST_TYPES: CostType[] = [
  "hosting", "database", "storage", "domain", "email", "software", "infrastructure", "other",
];
const COST_STATUSES: CostStatus[] = ["estimated", "accrued", "due", "paid", "cancelled"];
const CURRENCIES: Currency[] = ["UGX", "USD"];

async function callerProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, user, role: profile?.role ?? null };
}

function canManageCosts(role: string | null) {
  return checkIsAdmin(role) || isFinance(role);
}

function revalidateCostPaths() {
  revalidatePath("/admin/finances");
  revalidatePath("/admin/finances/provider-costs");
  revalidatePath("/admin/operations");
}

// ============================================================================
// PROVIDER COST MANAGEMENT (Admin + Finance only — financial data)
// ============================================================================

export interface CreateProviderCostInput {
  providerAccountId?: string | null;
  resourceId?: string | null;
  systemId?: string | null;
  clientId?: string | null;
  serviceAgreementId?: string | null;
  allocationType: AllocationType;
  costType: CostType;
  description: string;
  amount: number;
  currency: Currency;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  incurredAt?: string | null;
  dueAt?: string | null;
  status?: CostStatus;
  isRecurring?: boolean;
  renewalDate?: string | null;
  renewalNotes?: string | null;
  notes?: string | null;
}

export async function createProviderCost(
  input: CreateProviderCostInput | FormData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!canManageCosts(role)) {
    return { ok: false, error: "Permission denied: Only administrators and finance manage provider costs" };
  }

  const f = (k: string) => (input instanceof FormData ? input.get(k)?.toString() : undefined);

  const payload = input instanceof FormData
    ? {
        provider_account_id: f("provider_account_id") || null,
        resource_id: f("resource_id") || null,
        system_id: f("system_id") || null,
        client_id: f("client_id") || null,
        service_agreement_id: f("service_agreement_id") || null,
        allocation_type: (f("allocation_type") || "client") as AllocationType,
        cost_type: (f("cost_type") || "hosting") as CostType,
        description: f("description")?.trim(),
        amount: Number(f("amount") || NaN),
        currency: (f("currency") || "UGX") as Currency,
        billing_period_start: f("billing_period_start") || null,
        billing_period_end: f("billing_period_end") || null,
        incurred_at: f("incurred_at") || null,
        due_at: f("due_at") || null,
        status: (f("status") || "estimated") as CostStatus,
        is_recurring: f("is_recurring") === "true",
        renewal_date: f("renewal_date") || null,
        renewal_notes: f("renewal_notes")?.trim() || null,
        notes: f("notes")?.trim() || null,
      }
    : {
        provider_account_id: input.providerAccountId ?? null,
        resource_id: input.resourceId ?? null,
        system_id: input.systemId ?? null,
        client_id: input.clientId ?? null,
        service_agreement_id: input.serviceAgreementId ?? null,
        allocation_type: input.allocationType || "client",
        cost_type: input.costType || "hosting",
        description: input.description?.trim(),
        amount: Number(input.amount),
        currency: input.currency || "UGX",
        billing_period_start: input.billingPeriodStart || null,
        billing_period_end: input.billingPeriodEnd || null,
        incurred_at: input.incurredAt || null,
        due_at: input.dueAt || null,
        status: input.status || "estimated",
        is_recurring: input.isRecurring ?? false,
        renewal_date: input.renewalDate || null,
        renewal_notes: input.renewalNotes?.trim() || null,
        notes: input.notes?.trim() || null,
      };

  if (payload.allocation_type !== "client" && payload.allocation_type !== "overhead") {
    return { ok: false, error: "Allocation type must be 'client' or 'overhead'" };
  }
  if (payload.allocation_type === "overhead") payload.client_id = null;
  if (!COST_TYPES.includes(payload.cost_type)) {
    return { ok: false, error: `Cost type must be one of: ${COST_TYPES.join(", ")}` };
  }
  if (!CURRENCIES.includes(payload.currency)) {
    return { ok: false, error: "Currency must be UGX or USD" };
  }
  if (payload.status && !COST_STATUSES.includes(payload.status)) {
    return { ok: false, error: `Status must be one of: ${COST_STATUSES.join(", ")}` };
  }
  if (payload.status === "cancelled") {
    return { ok: false, error: "New provider costs cannot be created as cancelled" };
  }
  if (!payload.description || payload.description.length < 2) {
    return { ok: false, error: "Description is required" };
  }
  if (!Number.isFinite(payload.amount) || payload.amount < 0) {
    return { ok: false, error: "Amount must be a non-negative number" };
  }
  if (payload.billing_period_start && payload.billing_period_end &&
      payload.billing_period_end < payload.billing_period_start) {
    return { ok: false, error: "Billing period end cannot precede the start" };
  }

  const { data, error } = await supabase
    .from("provider_costs")
    .insert({ ...payload, created_by: user.id })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateCostPaths();
  return { ok: true, data: { id: data.id } };
}

export async function updateProviderCost(
  costId: string,
  input: {
    costType?: CostType;
    description?: string;
    amount?: number;
    currency?: Currency;
    billingPeriodStart?: string | null;
    billingPeriodEnd?: string | null;
    incurredAt?: string | null;
    dueAt?: string | null;
    isRecurring?: boolean;
    renewalDate?: string | null;
    renewalNotes?: string | null;
    notes?: string | null;
  }
): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!canManageCosts(role)) {
    return { ok: false, error: "Permission denied: Only administrators and finance manage provider costs" };
  }

  const updates: Record<string, unknown> = {};
  if (input.costType !== undefined) {
    if (!COST_TYPES.includes(input.costType)) return { ok: false, error: "Invalid cost type" };
    updates.cost_type = input.costType;
  }
  if (input.description !== undefined) {
    if (!input.description?.trim() || input.description.trim().length < 2) {
      return { ok: false, error: "Description must be at least 2 characters" };
    }
    updates.description = input.description.trim();
  }
  if (input.amount !== undefined) {
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      return { ok: false, error: "Amount must be a non-negative number" };
    }
    updates.amount = input.amount;
  }
  if (input.currency !== undefined) {
    if (!CURRENCIES.includes(input.currency)) return { ok: false, error: "Currency must be UGX or USD" };
    updates.currency = input.currency;
  }
  if (input.billingPeriodStart !== undefined) updates.billing_period_start = input.billingPeriodStart;
  if (input.billingPeriodEnd !== undefined) updates.billing_period_end = input.billingPeriodEnd;
  if (input.incurredAt !== undefined) updates.incurred_at = input.incurredAt;
  if (input.dueAt !== undefined) updates.due_at = input.dueAt;
  if (input.isRecurring !== undefined) updates.is_recurring = input.isRecurring;
  if (input.renewalDate !== undefined) updates.renewal_date = input.renewalDate;
  if (input.renewalNotes !== undefined) updates.renewal_notes = input.renewalNotes?.trim() || null;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  if (Object.keys(updates).length === 0) return { ok: false, error: "Nothing to update" };

  const { error } = await supabase
    .from("provider_costs")
    .update(updates)
    .eq("id", costId);

  if (error) return { ok: false, error: error.message };

  revalidateCostPaths();
  return { ok: true };
}

export async function updateProviderCostStatus(
  costId: string,
  status: CostStatus
): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!canManageCosts(role)) {
    return { ok: false, error: "Permission denied: Only administrators and finance manage provider costs" };
  }
  if (!COST_STATUSES.includes(status) || status === "cancelled") {
    return { ok: false, error: "Invalid status transition — use cancelProviderCost to cancel" };
  }

  const { error } = await supabase
    .from("provider_costs")
    .update({ status })
    .eq("id", costId);

  if (error) return { ok: false, error: error.message };

  revalidateCostPaths();
  return { ok: true };
}

export async function cancelProviderCost(costId: string, reason?: string): Promise<ActionResult> {
  const { supabase, user, role } = await callerProfile();
  if (!user) return { ok: false, error: "Authentication required" };
  if (!canManageCosts(role)) {
    return { ok: false, error: "Permission denied: Only administrators and finance manage provider costs" };
  }

  const updates: Record<string, unknown> = { status: "cancelled" };
  if (reason?.trim()) updates.notes = reason.trim();

  const { error } = await supabase
    .from("provider_costs")
    .update(updates)
    .eq("id", costId);

  if (error) return { ok: false, error: error.message };

  revalidateCostPaths();
  return { ok: true };
}
