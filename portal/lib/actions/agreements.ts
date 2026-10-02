"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { canAccessFinance, isOperationalStaff } from "@/lib/security/roles";

export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export interface CreateAgreementInput {
  clientId: string;
  systemId?: string | null;
  name: string;
  serviceType?: string;
  status?: string;
  startDate: string;
  endDate?: string | null;
  renewalDate?: string | null;
  billingCycle?: string;
  paymentTiming?: string;
  defaultGraceDays?: number;
  noticeDays?: number;
  contractReference?: string | null;
  operationalNotes?: string | null;
}

export async function createAgreement(
  input: CreateAgreementInput | FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!canAccessFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Admin or Finance access required" };
  }

  let clientId: string | undefined;
  let systemId: string | null = null;
  let name: string | undefined;
  let serviceType = "hosting_maintenance";
  let status = "active";
  let startDate: string | undefined;
  let endDate: string | null = null;
  let renewalDate: string | null = null;
  let billingCycle = "monthly";
  let paymentTiming = "month_end";
  let defaultGraceDays = 7;
  let noticeDays = 14;
  let contractReference: string | null = null;
  let operationalNotes: string | null = null;

  if (input instanceof FormData) {
    clientId = input.get("client_id")?.toString();
    systemId = input.get("system_id")?.toString() || null;
    name = input.get("name")?.toString()?.trim();
    serviceType = input.get("service_type")?.toString() || serviceType;
    status = input.get("status")?.toString() || status;
    startDate = input.get("start_date")?.toString();
    endDate = input.get("end_date")?.toString() || null;
    renewalDate = input.get("renewal_date")?.toString() || null;
    billingCycle = input.get("billing_cycle")?.toString() || billingCycle;
    paymentTiming = input.get("payment_timing")?.toString() || paymentTiming;
    defaultGraceDays = parseInt(input.get("default_grace_days")?.toString() || "7", 10);
    noticeDays = parseInt(input.get("notice_days")?.toString() || "14", 10);
    contractReference = input.get("contract_reference")?.toString()?.trim() || null;
    operationalNotes = input.get("operational_notes")?.toString()?.trim() || null;
  } else {
    clientId = input.clientId;
    systemId = input.systemId ?? null;
    name = input.name?.trim();
    serviceType = input.serviceType || serviceType;
    status = input.status || status;
    startDate = input.startDate;
    endDate = input.endDate ?? null;
    renewalDate = input.renewalDate ?? null;
    billingCycle = input.billingCycle || billingCycle;
    paymentTiming = input.paymentTiming || paymentTiming;
    defaultGraceDays = input.defaultGraceDays ?? defaultGraceDays;
    noticeDays = input.noticeDays ?? noticeDays;
    contractReference = input.contractReference?.trim() || null;
    operationalNotes = input.operationalNotes?.trim() || null;
  }

  if (!clientId || !name || !startDate) {
    return { ok: false, error: "Client, Agreement Name, and Start Date are required" };
  }

  const { data, error } = await supabase
    .from("service_agreements")
    .insert({
      client_id: clientId,
      system_id: systemId,
      name,
      service_type: serviceType,
      status,
      start_date: startDate,
      end_date: endDate,
      renewal_date: renewalDate,
      billing_cycle: billingCycle,
      payment_timing: paymentTiming,
      default_grace_days: defaultGraceDays,
      notice_days: noticeDays,
      contract_reference: contractReference,
      operational_notes: operationalNotes,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/agreements");
  return { ok: true, data: { id: data.id } };
}

export interface AttachResourceInput {
  agreementId: string;
  resourceId: string;
  notes?: string | null;
}

export async function attachResourceToAgreement(
  input: AttachResourceInput
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!canAccessFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Admin or Finance access required" };
  }

  const { data, error } = await supabase
    .from("agreement_resources")
    .insert({
      agreement_id: input.agreementId,
      resource_id: input.resourceId,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/agreements");
  return { ok: true, data: { id: data.id } };
}

export interface CreateRecurringChargeInput {
  agreementId: string;
  name: string;
  description?: string | null;
  amount: number;
  currency: "UGX" | "USD";
  billingCycle?: string;
  paymentTiming?: string;
  servicePeriodRule?: string;
  startDate: string;
  endDate?: string | null;
}

export async function createRecurringCharge(
  input: CreateRecurringChargeInput | FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!canAccessFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Admin or Finance access required" };
  }

  let agreementId: string | undefined;
  let name: string | undefined;
  let description: string | null = null;
  let amount = 0;
  let currency = "UGX";
  let billingCycle = "monthly";
  let paymentTiming = "month_end";
  let servicePeriodRule = "calendar_month";
  let startDate: string | undefined;
  let endDate: string | null = null;

  if (input instanceof FormData) {
    agreementId = input.get("agreement_id")?.toString();
    name = input.get("name")?.toString()?.trim();
    description = input.get("description")?.toString()?.trim() || null;
    amount = parseFloat(input.get("amount")?.toString() || "0");
    currency = input.get("currency")?.toString() || "UGX";
    billingCycle = input.get("billing_cycle")?.toString() || billingCycle;
    paymentTiming = input.get("payment_timing")?.toString() || paymentTiming;
    servicePeriodRule = input.get("service_period_rule")?.toString() || servicePeriodRule;
    startDate = input.get("start_date")?.toString();
    endDate = input.get("end_date")?.toString() || null;
  } else {
    agreementId = input.agreementId;
    name = input.name?.trim();
    description = input.description?.trim() || null;
    amount = input.amount;
    currency = input.currency || "UGX";
    billingCycle = input.billingCycle || billingCycle;
    paymentTiming = input.paymentTiming || paymentTiming;
    servicePeriodRule = input.servicePeriodRule || servicePeriodRule;
    startDate = input.startDate;
    endDate = input.endDate ?? null;
  }

  if (!agreementId || !name || isNaN(amount) || amount <= 0 || !startDate) {
    return { ok: false, error: "Agreement, Charge Name, Positive Amount, and Start Date are required" };
  }

  if (currency !== "UGX" && currency !== "USD") {
    return { ok: false, error: "Currency must be either UGX or USD" };
  }

  const { data, error } = await supabase
    .from("recurring_charges")
    .insert({
      agreement_id: agreementId,
      name,
      description,
      amount,
      currency,
      billing_cycle: billingCycle,
      payment_timing: paymentTiming,
      active: true,
      start_date: startDate,
      end_date: endDate,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/agreements");
  return { ok: true, data: { id: data.id } };
}

export interface UpdateNotesInput {
  id: string;
  operationalNotes: string | null;
}

export async function updateAgreementOperationalNotes(
  input: UpdateNotesInput
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isOperationalStaff(profile?.role) && !canAccessFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Operational staff access required" };
  }

  const { error } = await supabase
    .from("service_agreements")
    .update({
      operational_notes: input.operationalNotes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/agreements");
  return { ok: true };
}

export async function terminateAgreement(agreementId: string): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!canAccessFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Admin or Finance access required" };
  }

  const { error } = await supabase
    .from("service_agreements")
    .update({
      status: "terminated",
      terminated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreementId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/agreements");
  return { ok: true };
}

export interface GenerateInvoiceInput {
  chargeId: string;
  periodStart: string;
  periodEnd: string;
}

export interface GeneratedRunResult {
  id: string;
  invoice_id: string;
  invoice?: {
    id: string;
    invoice_number: string;
    due_date: string;
    total_amount: number;
    currency: string;
    status: string;
  };
}

export async function generateRecurringInvoice(
  input: GenerateInvoiceInput
): Promise<ActionResult<GeneratedRunResult>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentication required" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!canAccessFinance(profile?.role)) {
    return { ok: false, error: "Permission denied: Admin or Finance access required" };
  }

  // 1. Fetch recurring charge & agreement
  const { data: charge, error: chargeErr } = await supabase
    .from("recurring_charges")
    .select("*, service_agreements(*)")
    .eq("id", input.chargeId)
    .single();

  if (chargeErr || !charge) {
    return { ok: false, error: "Recurring charge not found" };
  }

  if (!charge.active) {
    return { ok: false, error: "Cannot generate invoice for inactive recurring charge" };
  }

  const agreementRaw = charge.service_agreements;
  const agreement = Array.isArray(agreementRaw) ? agreementRaw[0] : agreementRaw;
  if (!agreement || (agreement.status !== "active" && agreement.status !== "reactivation_pending")) {
    return { ok: false, error: `Cannot generate invoice: Service agreement is ${agreement?.status || "missing"}` };
  }

  // 2. Idempotency Check
  const { data: existingRun } = await supabase
    .from("recurring_charge_runs")
    .select(`
      id, invoice_id,
      invoices(id, invoice_number, due_date, total, currency, status)
    `)
    .eq("recurring_charge_id", input.chargeId)
    .eq("period_start", input.periodStart)
    .eq("period_end", input.periodEnd)
    .maybeSingle();

  if (existingRun) {
    const inv = Array.isArray(existingRun.invoices) ? existingRun.invoices[0] : existingRun.invoices;
    return {
      ok: true,
      data: {
        id: existingRun.id,
        invoice_id: existingRun.invoice_id,
        invoice: inv
          ? {
              id: inv.id,
              invoice_number: inv.invoice_number,
              due_date: inv.due_date,
              total_amount: inv.total,
              currency: inv.currency,
              status: inv.status,
            }
          : undefined,
      },
    };
  }

  // 3. Determine Due Date based on payment_timing
  let dueDate = input.periodEnd;
  const timing = charge.payment_timing || agreement.payment_timing || "month_end";
  const today = new Date().toISOString().split("T")[0];

  if (timing === "advance") {
    dueDate = input.periodStart;
  } else if (timing === "net_15") {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    dueDate = d.toISOString().split("T")[0];
  } else if (timing === "net_30") {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    dueDate = d.toISOString().split("T")[0];
  }

  // 4. Generate unique invoice number
  const { data: invNum } = await supabase.rpc("generate_invoice_number");
  const invoiceNumber = invNum || `INV-${Date.now().toString().slice(-6)}`;

  // 5. Create Draft Invoice
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      client_id: agreement.client_id,
      agreement_id: agreement.id,
      recurring_charge_id: charge.id,
      currency: charge.currency || "UGX",
      invoice_number: invoiceNumber,
      status: "draft",
      issue_date: today,
      due_date: dueDate,
      subtotal: charge.amount,
      total: charge.amount,
      notes: `Recurring billing for ${agreement.name} — Period: ${input.periodStart} to ${input.periodEnd}`,
    })
    .select("id, invoice_number, due_date, total, currency, status")
    .single();

  if (invErr || !invoice) {
    return { ok: false, error: invErr ? invErr.message : "Failed to create invoice" };
  }

  // 6. Insert Line Item
  const { error: itemErr } = await supabase
    .from("invoice_line_items")
    .insert({
      invoice_id: invoice.id,
      description: `${charge.name} (${input.periodStart} to ${input.periodEnd})`,
      quantity: 1,
      unit_price: charge.amount,
      amount: charge.amount,
    });

  if (itemErr) {
    return { ok: false, error: itemErr.message };
  }

  // 7. Record Charge Run (idempotency barrier)
  const { data: run, error: runErr } = await supabase
    .from("recurring_charge_runs")
    .insert({
      recurring_charge_id: charge.id,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      invoice_id: invoice.id,
      status: "generated",
    })
    .select("id")
    .single();

  if (runErr) {
    return { ok: false, error: runErr.message };
  }

  revalidatePath("/admin/agreements");
  revalidatePath("/admin/invoices");

  return {
    ok: true,
    data: {
      id: run.id,
      invoice_id: invoice.id,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        due_date: invoice.due_date,
        total_amount: invoice.total,
        currency: invoice.currency,
        status: invoice.status,
      },
    },
  };
}
