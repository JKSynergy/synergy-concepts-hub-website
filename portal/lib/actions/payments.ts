"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/types";

type ActionResult = { error?: string; success?: boolean; id?: string };

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

export async function recordPayment(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const amount = Number(formData.get("amount"));
  const method = formData.get("method") as PaymentMethod;
  const reference = (formData.get("reference") as string) || null;

  if (!amount || amount <= 0) return { error: "Amount must be greater than 0" };
  if (!method) return { error: "Payment method is required" };

  const { data, error } = await supabase
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount,
      method,
      reference,
      paid_at: new Date().toISOString(),
      recorded_by: user!.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/client/invoices/${invoiceId}`);
  revalidatePath("/admin/invoices");
  revalidatePath("/client/invoices");
  return { success: true, id: data.id };
}

export async function deletePayment(paymentId: string, invoiceId: string): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const { error } = await supabase.from("payments").delete().eq("id", paymentId);

  if (error) return { error: error.message };
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath("/admin/invoices");
  return { success: true };
}
