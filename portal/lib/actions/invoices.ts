"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/types";
import { canAccessFinance, isAdmin as isAdminRole } from "@/lib/security/roles";
import { invoiceTransitionError } from "@/lib/finance/lifecycle";

type ActionResult = { error?: string; success?: boolean; id?: string };

// Invoice subtotal, tax and total are calculated in ONE place: the database
// (migration 010 triggers). Actions only change line items, tax rate and status;
// they never compute or write totals.

// Finance and admin operate invoices; deleting a draft stays admin-only.
async function requireFinance() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null, allowed: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? null) as string | null;
  return { supabase, user, role, allowed: canAccessFinance(role) };
}

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const { supabase, allowed } = await requireFinance();
  if (!allowed) return { error: "Forbidden" };

  const client_id = formData.get("client_id") as string;
  const project_id = (formData.get("project_id") as string) || null;
  const issue_date = (formData.get("issue_date") as string) || new Date().toISOString().split("T")[0];
  const due_date = (formData.get("due_date") as string) || null;
  const tax_rate = Number(formData.get("tax_rate") || 0);
  const notes = (formData.get("notes") as string) || null;
  const scope_of_work = (formData.get("scope_of_work") as string) || null;

  if (!client_id) return { error: "Client is required" };

  // The invoice number is assigned atomically by the database on insert.
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      client_id,
      project_id,
      status: "draft",
      issue_date,
      due_date,
      tax_rate,
      notes,
      scope_of_work,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/admin/invoices");
  return { success: true, id: data.id };
}

export async function updateInvoice(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, allowed } = await requireFinance();
  if (!allowed) return { error: "Forbidden" };

  const client_id = formData.get("client_id") as string;

  const { error } = await supabase
    .from("invoices")
    .update({
      client_id: client_id || undefined,
      status: (formData.get("status") as InvoiceStatus) || undefined,
      issue_date: (formData.get("issue_date") as string) || undefined,
      due_date: (formData.get("due_date") as string) || null,
      tax_rate: Number(formData.get("tax_rate") || 0),
      notes: (formData.get("notes") as string) || null,
      scope_of_work: (formData.get("scope_of_work") as string) || null,
    })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/client/invoices/${invoiceId}`);
  return { success: true };
}

export async function addLineItem(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, allowed } = await requireFinance();
  if (!allowed) return { error: "Forbidden" };

  const description = (formData.get("description") as string)?.trim();
  const quantity = Number(formData.get("quantity") || 1);
  const unit_price = Number(formData.get("unit_price") || 0);

  if (!description) return { error: "Description is required" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantity must be greater than 0" };
  if (!Number.isFinite(unit_price) || unit_price < 0) return { error: "Unit price cannot be negative" };

  const { error } = await supabase.from("invoice_line_items").insert({
    invoice_id: invoiceId,
    description,
    quantity,
    unit_price,
  });

  if (error) return { error: error.message };
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { success: true };
}

export async function updateLineItem(
  lineItemId: string,
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, allowed } = await requireFinance();
  if (!allowed) return { error: "Forbidden" };

  const description = (formData.get("description") as string)?.trim();
  const quantity = Number(formData.get("quantity"));
  const unit_price = Number(formData.get("unit_price"));

  if (!description) return { error: "Description is required" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantity must be greater than 0" };
  if (!Number.isFinite(unit_price) || unit_price < 0) return { error: "Unit price cannot be negative" };

  // The amount and the invoice totals are recalculated by the database triggers,
  // which also refuse the change once a payment has been recorded.
  const { data, error } = await supabase
    .from("invoice_line_items")
    .update({ description, quantity, unit_price })
    .eq("id", lineItemId)
    .eq("invoice_id", invoiceId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Line item not found" };
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/client/invoices/${invoiceId}`);
  return { success: true };
}

export async function deleteLineItem(lineItemId: string, invoiceId: string): Promise<ActionResult> {
  const { supabase, allowed } = await requireFinance();
  if (!allowed) return { error: "Forbidden" };

  const { error } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("id", lineItemId);

  if (error) return { error: error.message };
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { success: true };
}

export async function setInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus
): Promise<ActionResult> {
  const { supabase, allowed } = await requireFinance();
  if (!allowed) return { error: "Forbidden" };

  // Readable error first; the database trigger remains the source of truth.
  const { data: current } = await supabase
    .from("invoices")
    .select("status, total")
    .eq("id", invoiceId)
    .single();
  if (!current) return { error: "Invoice not found" };
  const { data: paidRows } = await supabase
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId)
    .not("paid_at", "is", null);
  const paid = (paidRows ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const blocked = invoiceTransitionError(current.status, status, paid, Number(current.total));
  if (blocked) return { error: blocked };

  const { error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/client/invoices/${invoiceId}`);
  return { success: true };
}

export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  const { supabase, allowed, role } = await requireFinance();
  if (!allowed || !isAdminRole(role)) return { error: "Forbidden" };

  // The database only allows deleting a draft with no payments; anything else
  // must be cancelled so the financial record survives.
  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/invoices");
  return { success: true };
}
