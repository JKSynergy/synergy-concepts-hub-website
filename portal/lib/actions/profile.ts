"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string; success?: boolean };

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: (formData.get("full_name") as string) || null,
      company_name: (formData.get("company_name") as string) || null,
      phone: (formData.get("phone") as string) || null,
      billing_address: (formData.get("billing_address") as string) || null,
      tax_id: (formData.get("tax_id") as string) || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/client/profile");
  return { success: true };
}
