"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/security/access";
import { canAccessFinance } from "@/lib/security/roles";
import type { PaymentMethod } from "@/lib/types";

type ActionResult = { error?: string; success?: boolean; id?: string };

async function requireFinance() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, allowed: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const allowed = canAccessFinance(profile?.role);
  return { supabase, user, allowed };
}

export async function recordPayment(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, allowed } = await requireFinance();
  if (!allowed) return { error: "Forbidden" };

  const amount = Number(formData.get("amount"));
  const method = formData.get("method") as PaymentMethod;
  const reference = (formData.get("reference") as string) || null;

  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be greater than 0" };
  if (!isUuid(invoiceId)) return { error: "Invalid invoice" };
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

// Payments are permanent records: there is no delete action, and the database has
// no delete policy for payments or receipts. Corrections will need an explicit
// reversal design in a later phase.
