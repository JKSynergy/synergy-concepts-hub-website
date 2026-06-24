"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/types";

type ActionResult = { error?: string; success?: boolean; id?: string };

async function recalcInvoiceTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string
) {
  const [{ data: items }, { data: inv }] = await Promise.all([
    supabase.from("invoice_line_items").select("amount").eq("invoice_id", invoiceId),
    supabase.from("invoices").select("tax_rate").eq("id", invoiceId).single(),
  ]);

  const subtotal = (items ?? []).reduce((sum, i) => sum + Number(i.amount), 0);
  const taxRate = Number(inv?.tax_rate ?? 0);
  const tax_amount = subtotal * (taxRate / 100);
  const total = subtotal + tax_amount;

  await supabase
    .from("invoices")
    .update({ subtotal, tax_amount, total })
    .eq("id", invoiceId);
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  return { supabase, user, isAdmin };
}

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const client_id = formData.get("client_id") as string;
  const project_id = (formData.get("project_id") as string) || null;
  const issue_date = (formData.get("issue_date") as string) || new Date().toISOString().split("T")[0];
  const due_date = (formData.get("due_date") as string) || null;
  const tax_rate = Number(formData.get("tax_rate") || 0);
  const notes = (formData.get("notes") as string) || null;

  if (!client_id) return { error: "Client is required" };

  // Generate invoice number via DB function
  const { data: numData, error: numError } = await supabase.rpc("generate_invoice_number");
  if (numError) return { error: numError.message };

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      client_id,
      project_id,
      invoice_number: numData as string,
      status: "draft",
      issue_date,
      due_date,
      tax_rate,
      notes,
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
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

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
    })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  await recalcInvoiceTotals(supabase, invoiceId);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/client/invoices/${invoiceId}`);
  return { success: true };
}

export async function addLineItem(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const description = (formData.get("description") as string)?.trim();
  const quantity = Number(formData.get("quantity") || 1);
  const unit_price = Number(formData.get("unit_price") || 0);

  if (!description) return { error: "Description is required" };

  const { error } = await supabase.from("invoice_line_items").insert({
    invoice_id: invoiceId,
    description,
    quantity,
    unit_price,
    amount: quantity * unit_price,
  });

  if (error) return { error: error.message };
  await recalcInvoiceTotals(supabase, invoiceId);
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { success: true };
}

export async function deleteLineItem(lineItemId: string, invoiceId: string): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const { error } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("id", lineItemId);

  if (error) return { error: error.message };
  await recalcInvoiceTotals(supabase, invoiceId);
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { success: true };
}

export async function setInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus
): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

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
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/invoices");
  return { success: true };
}
