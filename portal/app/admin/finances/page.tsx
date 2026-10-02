import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import PaymentsTable, { type PaymentRow } from "./payments-table";
import { canAccessFinance } from "@/lib/security/roles";

export default async function AdminFinancesPage() {
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

  const [{ data: payments }, { data: invoices }, { data: clients }, { data: receipts }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, method, reference, paystack_reference, paid_at, invoice_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, invoice_number, client_id"),
    supabase.from("profiles").select("id, company_name, full_name, email"),
    supabase.from("receipts").select("id, payment_id"),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.company_name || c.full_name || c.email]));
  const invMap = new Map((invoices ?? []).map((i) => [i.id, i]));
  const receiptMap = new Map((receipts ?? []).map((r) => [r.payment_id, r.id]));

  const rows: PaymentRow[] = (payments ?? []).map((p) => {
    const inv = invMap.get(p.invoice_id);
    return {
      id: p.id,
      date: p.paid_at ?? p.created_at,
      invoice_id: p.invoice_id,
      invoice_number: inv?.invoice_number ?? null,
      client_name: inv ? clientMap.get(inv.client_id) ?? "Unknown client" : "Unknown client",
      method: p.method,
      reference: p.reference ?? p.paystack_reference ?? null,
      amount: Number(p.amount),
      receipt_id: receiptMap.get(p.id) ?? null,
    };
  });

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader title="Payments" description="Every payment recorded against an invoice, newest first. Amounts are in UGX." />
      <PaymentsTable rows={rows} />
    </div>
  );
}
