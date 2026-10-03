import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import EditInvoiceForm from "./edit-invoice-form";
import { PageHeader } from "@/components/ux/primitives";
import { canAccessFinance } from "@/lib/security/roles";

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

  if (!profile || !canAccessFinance(profile.role)) {
    redirect("/client");
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_id, issue_date, due_date, tax_rate, notes, scope_of_work")
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
    <div className="ux-page ux-page--narrow">
      <Link href={`/admin/invoices/${id}`} className="ux-back">← {invoice.invoice_number ?? "Invoice"}</Link>
      <PageHeader
        eyebrow="Invoice"
        title={`Edit ${invoice.invoice_number ?? "invoice"}`}
        description="Change the client, dates, tax rate, scope of work or notes. Line items are edited on the invoice page."
      />
      <EditInvoiceForm invoice={invoice} clients={clients ?? []} />
    </div>
  );
}
