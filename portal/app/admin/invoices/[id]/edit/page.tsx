import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EditInvoiceForm from "./edit-invoice-form";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, client_id, issue_date, due_date, tax_rate, notes")
    .eq("id", id)
    .single();

  if (!invoice) {
    redirect("/admin/invoices");
  }

  const { data: clients } = await supabase
    .from("profiles")
    .select("id, company_name, full_name, email")
    .eq("role", "client")
    .order("company_name", { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Edit Invoice</h1>
      <EditInvoiceForm invoice={invoice} clients={clients ?? []} />
    </div>
  );
}
