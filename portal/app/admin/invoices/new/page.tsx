import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewInvoiceForm from "./new-invoice-form";
import { PageHeader } from "@/components/ux/primitives";
import { canAccessFinance } from "@/lib/security/roles";

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

  if (!profile || !canAccessFinance(profile.role)) {
    redirect("/admin");
  }

  const { data: clients } = await supabase
    .from("profiles")
    .select("id, company_name, full_name, email")
    .eq("role", "client")
    .is("archived_at", null)
    .order("company_name");

  return (
    <div className="ux-page ux-page--narrow">
      <Link href="/admin/invoices" className="ux-back">← Invoices</Link>
      <PageHeader
        eyebrow="Invoice"
        title="New invoice"
        description="Set the client and dates first. Line items are added once the draft is created."
      />
      <NewInvoiceForm clients={clients ?? []} />
    </div>
  );
}
