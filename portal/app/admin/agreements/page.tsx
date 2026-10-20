import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, canAccessFinance } from "@/lib/security/roles";
import { loadAgreements, chargePeriods } from "@/lib/billing/agreement-data";
import { todayEAT, periodLabel } from "@/lib/billing/periods";
import AgreementsList, { type AgreementListItem, type PackageOption } from "./agreements-list";
import "@/components/billing/billing.css";
import "./agreements.css";

export const metadata = { title: "Agreements" };

export default async function AgreementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isInternal(profile.role)) redirect("/client");
  const finance = canAccessFinance(profile.role);

  const { agreements, charges, runs } = await loadAgreements(supabase, { finance });
  const today = todayEAT();

  const items: AgreementListItem[] = agreements.map((a) => {
    const own = charges.filter((c) => c.agreement_id === a.id && c.active);
    const periods = own.flatMap((c) => chargePeriods(a, c, runs, today));
    const due = periods.filter((p) => p.state === "due");
    const next = periods.find((p) => p.state === "upcoming") ?? null;
    return {
      ...a,
      charges: own.map((c) => ({ amount: c.amount, currency: c.currency, billing_cycle: c.billing_cycle })),
      dueCount: due.length,
      dueLabel: due.length ? periodLabel(due[0]) : null,
      nextInvoiceDate: next?.invoiceDate ?? null,
    };
  });

  let packages: PackageOption[] = [];
  let clients: { id: string; label: string }[] = [];
  let systems: { id: string; name: string; client_id: string }[] = [];
  if (finance) {
    const [{ data: pk }, { data: cl }, { data: sy }] = await Promise.all([
      supabase
        .from("service_packages")
        .select("id, name, currency, description, annual_discount, items:service_package_items(quantity, unit_price, section, description, position)")
        .eq("kind", "recurring")
        .is("archived_at", null)
        .order("name"),
      supabase.from("profiles").select("id, email, company_name, full_name").eq("role", "client").is("archived_at", null).order("company_name"),
      supabase.from("systems").select("id, name, client_id").order("name"),
    ]);
    packages = (pk ?? []).map((p) => {
      const lines = [...(p.items ?? [])].sort((a, b) => a.position - b.position);
      return {
        id: p.id,
        name: p.name,
        currency: p.currency,
        description: p.description,
        annualDiscount: Number(p.annual_discount ?? 0),
        monthly: Math.round(lines.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0) * 100) / 100,
        sections: [...new Set(lines.map((i) => i.section || i.description))].slice(0, 4),
      };
    });
    clients = (cl ?? []).map((c) => ({ id: c.id, label: c.company_name || c.full_name || c.email }));
    systems = (sy ?? []).map((s) => ({ id: s.id, name: s.name, client_id: s.client_id }));
  }

  return (
    <div className="ux-page ux-page--wide ops-page">
      <PageHeader
        eyebrow="Money"
        title="Agreements"
        description="Each client's service contract: what's included, response targets, acceptance, and the invoice for every billing period."
      />
      <AgreementsList items={items} packages={packages} clients={clients} systems={systems} finance={finance} today={today} />
    </div>
  );
}
