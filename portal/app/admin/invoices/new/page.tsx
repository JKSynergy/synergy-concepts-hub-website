import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewInvoiceForm from "./new-invoice-form";

export default async function NewInvoicePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/admin");
  }

  const { data: clients } = await supabase
    .from("profiles")
    .select("id, company_name, full_name, email")
    .eq("role", "client")
    .order("company_name");

  return <NewInvoiceForm clients={clients ?? []} />;
}
