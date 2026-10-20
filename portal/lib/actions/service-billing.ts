"use server";

// Itemised service billing: packages (reusable price breakdowns), the
// breakdown of each client's recurring charge, and support requests that are
// either covered by an agreement or priced and invoiced per request.
// The database (migration 037) enforces every rule below again.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { canAccessFinance, isOperationalStaff } from "@/lib/security/roles";
import { isUuid } from "@/lib/security/access";
import { cleanTargets, type ResponseTarget } from "@/lib/billing/response-targets";

export type ActionResult<T = unknown> = { ok: boolean; data?: T; error?: string };

export type BreakdownItem = {
  section?: string | null;
  description: string;
  detail?: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
};

const CURRENCIES = ["UGX", "USD"] as const;
const PACKAGE_KINDS = ["recurring", "per_request"] as const;
const CYCLES = ["monthly", "quarterly", "semi_annual", "annual", "custom"] as const;
const PRIORITIES = ["critical", "high", "normal", "change"] as const;
const CHANNELS = ["phone", "whatsapp", "email", "portal", "on_site", "other"] as const;
const BILLING = ["covered", "chargeable", "no_charge"] as const;
const STATUSES = ["open", "in_progress", "resolved", "cancelled"] as const;

const oneOf = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** Validate a breakdown before it reaches the database. */
function cleanItems(raw: unknown): { items?: BreakdownItem[]; error?: string } {
  if (!Array.isArray(raw)) return { error: "Invalid breakdown" };
  if (raw.length > 60) return { error: "A breakdown can have at most 60 lines" };
  const items: BreakdownItem[] = [];
  for (const [i, r] of raw.entries()) {
    const row = (r ?? {}) as Record<string, unknown>;
    const description = text(row.description, 200);
    if (!description || description.length < 2) return { error: `Line ${i + 1}: add a description` };
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unit_price);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: `Line ${i + 1}: quantity must be above 0` };
    // A negative unit price is a discount line (e.g. an annual-commitment discount).
    if (!Number.isFinite(unitPrice)) return { error: `Line ${i + 1}: enter a unit price` };
    items.push({
      section: text(row.section, 120),
      description,
      detail: text(row.detail, 400),
      quantity: Math.round(quantity * 100) / 100,
      unit: text(row.unit, 24),
      unit_price: Math.round(unitPrice * 100) / 100,
    });
  }
  return { items };
}

async function context(require: "finance" | "operations") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication required" as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role ?? null;
  const allowed =
    require === "finance" ? canAccessFinance(role) : canAccessFinance(role) || isOperationalStaff(role);
  if (!allowed) {
    return {
      error: (require === "finance"
        ? "Permission denied: Admin or Finance access required"
        : "Permission denied") as string,
    };
  }
  return { supabase, user, role };
}

const dbError = (message: string) =>
  message.replace(/^.*?ERROR:\s*/i, "").replace(/\s*\(SQLSTATE.*$/, "");

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

export type PackageInput = {
  id?: string;
  name: string;
  kind: string;
  currency: string;
  billingCycle?: string;
  description?: string | null;
  items: BreakdownItem[];
  /** Agreement template fields (monthly packages). */
  scopeIncluded?: string | null;
  scopeExcluded?: string | null;
  responseTargets?: ResponseTarget[] | null;
  annualDiscount?: number | null;
};

export async function savePackage(input: PackageInput): Promise<ActionResult<{ id: string; total: number }>> {
  const ctx = await context("finance");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase } = ctx;

  const name = text(input.name, 120);
  if (!name || name.length < 2) return { ok: false, error: "Give the package a name" };
  const cleaned = cleanItems(input.items);
  if (cleaned.error) return { ok: false, error: cleaned.error };
  if (!cleaned.items!.length) return { ok: false, error: "A package needs at least one line" };

  const row = {
    name,
    kind: oneOf(PACKAGE_KINDS, input.kind, "recurring"),
    currency: oneOf(CURRENCIES, input.currency, "UGX"),
    billing_cycle: oneOf(CYCLES, input.billingCycle, "monthly"),
    description: text(input.description, 600),
    scope_included: text(input.scopeIncluded, 4000),
    scope_excluded: text(input.scopeExcluded, 4000),
    response_targets: cleanTargets(input.responseTargets),
    annual_discount: Math.max(0, Math.round(Number(input.annualDiscount ?? 0) * 100) / 100 || 0),
  };

  let id = input.id;
  if (id) {
    if (!isUuid(id)) return { ok: false, error: "Invalid package" };
    const { error } = await supabase.from("service_packages").update(row).eq("id", id);
    if (error) return { ok: false, error: dbError(error.message) };
  } else {
    const { data, error } = await supabase.from("service_packages").insert(row).select("id").single();
    if (error || !data) return { ok: false, error: dbError(error?.message ?? "Could not create package") };
    id = data.id as string;
  }

  const { data: total, error } = await supabase.rpc("replace_service_package_items", {
    p_package_id: id,
    p_items: cleaned.items,
  });
  if (error) return { ok: false, error: dbError(error.message) };

  revalidatePath("/admin/finances/packages");
  return { ok: true, data: { id: id!, total: Number(total) } };
}

export async function setPackageArchived(id: string, archived: boolean): Promise<ActionResult> {
  const ctx = await context("finance");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid package" };
  const { error } = await ctx.supabase
    .from("service_packages")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidatePath("/admin/finances/packages");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Recurring charge breakdown
// ---------------------------------------------------------------------------

export async function saveChargeBreakdown(
  chargeId: string,
  items: BreakdownItem[],
  packageId: string | null,
): Promise<ActionResult<{ total: number }>> {
  const ctx = await context("finance");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(chargeId)) return { ok: false, error: "Invalid charge" };
  if (packageId !== null && !isUuid(packageId)) return { ok: false, error: "Invalid package" };
  const cleaned = cleanItems(items);
  if (cleaned.error) return { ok: false, error: cleaned.error };

  const { data, error } = await ctx.supabase.rpc("replace_recurring_charge_items", {
    p_charge_id: chargeId,
    p_items: cleaned.items,
    p_package_id: packageId,
  });
  if (error) return { ok: false, error: dbError(error.message) };

  revalidatePath("/admin/agreements");
  return { ok: true, data: { total: Number(data) } };
}

// ---------------------------------------------------------------------------
// Support requests
// ---------------------------------------------------------------------------

export type SupportRequestInput = {
  clientId: string;
  systemId?: string | null;
  agreementId?: string | null;
  ratePackageId?: string | null;
  summary: string;
  priority?: string;
  channel?: string;
  billing?: string;
  requestedAt?: string | null;
};

export async function createSupportRequest(
  input: SupportRequestInput,
): Promise<ActionResult<{ id: string; reference: string }>> {
  const ctx = await context("operations");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase } = ctx;

  if (!isUuid(input.clientId)) return { ok: false, error: "Choose a client" };
  const summary = text(input.summary, 300);
  if (!summary || summary.length < 3) return { ok: false, error: "Describe what the client asked for" };
  for (const v of [input.systemId, input.agreementId, input.ratePackageId]) {
    if (v && !isUuid(v)) return { ok: false, error: "Invalid reference" };
  }
  const requestedAt = input.requestedAt ? new Date(input.requestedAt) : new Date();
  if (Number.isNaN(requestedAt.getTime())) return { ok: false, error: "Invalid request time" };
  if (requestedAt.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: "Request time is in the future" };

  const { data, error } = await supabase
    .from("support_requests")
    .insert({
      client_id: input.clientId,
      system_id: input.systemId || null,
      service_agreement_id: input.agreementId || null,
      rate_package_id: input.ratePackageId || null,
      summary,
      priority: oneOf(PRIORITIES, input.priority, "normal"),
      channel: oneOf(CHANNELS, input.channel, "phone"),
      billing: oneOf(BILLING, input.billing, "chargeable"),
      requested_at: requestedAt.toISOString(),
    })
    .select("id, reference")
    .single();
  if (error || !data) return { ok: false, error: dbError(error?.message ?? "Could not log the request") };

  // Pre-price chargeable work from the chosen quote template (finance/admin only).
  if (input.ratePackageId && oneOf(BILLING, input.billing, "chargeable") === "chargeable" && canAccessFinance(ctx.role)) {
    const { data: rate } = await supabase
      .from("service_package_items")
      .select("section, description, detail, quantity, unit, unit_price, position")
      .eq("package_id", input.ratePackageId)
      .order("position");
    if (rate?.length) {
      await supabase.rpc("replace_support_request_items", { p_request_id: data.id, p_items: rate });
    }
  }

  revalidatePath("/admin/support");
  return { ok: true, data: { id: data.id as string, reference: data.reference as string } };
}

export type SupportRequestUpdate = {
  summary?: string;
  workDone?: string | null;
  priority?: string;
  channel?: string;
  billing?: string;
  status?: string;
  systemId?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
};

export async function updateSupportRequest(id: string, patch: SupportRequestUpdate): Promise<ActionResult> {
  const ctx = await context("operations");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid request" };

  const row: Record<string, unknown> = {};
  if (patch.summary !== undefined) {
    const s = text(patch.summary, 300);
    if (!s || s.length < 3) return { ok: false, error: "Summary is too short" };
    row.summary = s;
  }
  if (patch.workDone !== undefined) row.work_done = text(patch.workDone, 4000);
  if (patch.priority !== undefined) row.priority = oneOf(PRIORITIES, patch.priority, "normal");
  if (patch.channel !== undefined) row.channel = oneOf(CHANNELS, patch.channel, "phone");
  if (patch.billing !== undefined) row.billing = oneOf(BILLING, patch.billing, "chargeable");
  if (patch.systemId !== undefined) {
    if (patch.systemId && !isUuid(patch.systemId)) return { ok: false, error: "Invalid system" };
    row.system_id = patch.systemId || null;
  }
  for (const [key, col] of [
    ["firstResponseAt", "first_response_at"],
    ["resolvedAt", "resolved_at"],
  ] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v === null || v === "") {
      row[col] = null;
      continue;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid time" };
    row[col] = d.toISOString();
  }
  if (patch.status !== undefined) {
    const status = oneOf(STATUSES, patch.status, "open");
    row.status = status;
    if (status === "resolved" && row.resolved_at === undefined) {
      const { data: cur } = await ctx.supabase.from("support_requests").select("resolved_at").eq("id", id).single();
      if (!cur?.resolved_at) row.resolved_at = new Date().toISOString();
    }
    if (status === "in_progress" && row.first_response_at === undefined) {
      const { data: cur } = await ctx.supabase.from("support_requests").select("first_response_at").eq("id", id).single();
      if (!cur?.first_response_at) row.first_response_at = new Date().toISOString();
    }
  }
  if (!Object.keys(row).length) return { ok: true };

  const { error } = await ctx.supabase.from("support_requests").update(row).eq("id", id);
  if (error) return { ok: false, error: dbError(error.message) };
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function saveSupportRequestCharges(
  id: string,
  items: BreakdownItem[],
): Promise<ActionResult<{ total: number }>> {
  const ctx = await context("finance");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid request" };
  const cleaned = cleanItems(items);
  if (cleaned.error) return { ok: false, error: cleaned.error };
  const { data, error } = await ctx.supabase.rpc("replace_support_request_items", {
    p_request_id: id,
    p_items: cleaned.items,
  });
  if (error) return { ok: false, error: dbError(error.message) };
  revalidatePath("/admin/support");
  return { ok: true, data: { total: Number(data) } };
}

/** Record (or withdraw) the client's agreement to a job's current quote. */
export async function setQuoteAgreement(
  id: string,
  agreedAt: string | null,
): Promise<ActionResult> {
  const ctx = await context("finance");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid request" };
  let value: string | null = null;
  if (agreedAt) {
    const d = new Date(agreedAt);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid time" };
    if (d.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: "Agreement time cannot be in the future" };
    value = d.toISOString();
  }
  const { error } = await ctx.supabase.from("support_requests").update({ quote_agreed_at: value }).eq("id", id);

  await writeAuditLog(createAdminClient(), {
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: error ? "SUPPORT_QUOTE_AGREEMENT_FAILED" : value ? "SUPPORT_QUOTE_AGREED" : "SUPPORT_QUOTE_AGREEMENT_WITHDRAWN",
    table: "support_requests",
    recordId: id,
    details: { quote_agreed_at: value, ...(error ? { error: error.message } : {}) },
  });

  if (error) return { ok: false, error: dbError(error.message) };
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function invoiceSupportRequests(
  ids: string[],
  currency: string,
  dueDate?: string | null,
): Promise<ActionResult<{ invoiceId: string }>> {
  const ctx = await context("finance");
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!Array.isArray(ids) || !ids.length || !ids.every(isUuid)) return { ok: false, error: "Select requests to invoice" };
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, error: "Invalid due date" };

  const { data, error } = await ctx.supabase.rpc("invoice_support_requests", {
    p_request_ids: ids,
    p_currency: oneOf(CURRENCIES, currency, "UGX"),
    p_due_date: dueDate || null,
  });

  await writeAuditLog(createAdminClient(), {
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: error ? "SUPPORT_INVOICE_FAILED" : "SUPPORT_REQUESTS_INVOICED",
    table: "invoices",
    recordId: error ? null : (data as string),
    details: { support_request_ids: ids, ...(error ? { error: error.message } : {}) },
  });

  if (error || !data) return { ok: false, error: dbError(error?.message ?? "Could not create the invoice") };
  revalidatePath("/admin/support");
  revalidatePath("/admin/invoices");
  return { ok: true, data: { invoiceId: data as string } };
}
