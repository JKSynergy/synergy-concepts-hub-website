import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isOperationalStaff, canAccessFinance } from "@/lib/security/roles";
import AgreementsManager from "./agreements-manager";
import type { ChargePackageOption } from "./charge-breakdown";
import type { BreakdownRow } from "@/components/billing/breakdown-editor";
import "@/components/billing/billing.css";

export const metadata = { title: "Service Agreements & Recurring Billing" };

export default async function AgreementsPage() {
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

  if (!profile || !isInternal(profile.role)) {
    redirect("/client");
  }

  const isAdmin = checkIsAdmin(profile.role);
  const canSeeFinancials = canAccessFinance(profile.role);
  const isStaff = isOperationalStaff(profile.role) && !isAdmin;

  // 1. Fetch Agreements via staff-safe view (has derived billing standing and client metadata)
  const { data: agreementsData } = await supabase
    .from("staff_service_agreements_view")
    .select("*")
    .order("created_at", { ascending: false });

  // 2. Fetch Agreement Resources
  const { data: agreementResourcesData } = await supabase
    .from("agreement_resources")
    .select(`
      id, agreement_id, resource_id, notes, created_at,
      resource:resources(id, name, resource_type, status, client_id)
    `)
    .order("created_at", { ascending: false });

  // 3. Fetch Financials (Admin & Finance only; Staff NEVER fetches these)
  type RecurringChargeItem = {
    id: string;
    agreement_id: string;
    name: string;
    amount: number;
    currency: "UGX" | "USD";
    billing_cycle: string;
    payment_timing: string;
    active: boolean;
    start_date: string;
    end_date: string | null;
    created_at: string;
    package_id?: string | null;
  };

  type RecurringChargeRunItem = {
    id: string;
    recurring_charge_id: string;
    period_start: string;
    period_end: string;
    invoice_id: string;
    generated_at: string;
    status: string;
    invoice?: {
      id: string;
      invoice_number: string;
      status: string;
      due_date: string;
      total_amount: number;
      currency: string;
    } | null;
  };

  let recurringCharges: RecurringChargeItem[] = [];
  let recurringChargeRuns: RecurringChargeRunItem[] = [];
  const chargeItems: Record<string, BreakdownRow[]> = {};
  let chargePackages: ChargePackageOption[] = [];

  if (canSeeFinancials) {
    const { data: rc } = await supabase
      .from("recurring_charges")
      .select("*")
      .order("created_at", { ascending: false });
    recurringCharges = (rc ?? []) as RecurringChargeItem[];

    // Itemised breakdowns (migration 037) and the monthly packages to start from.
    const { data: rci } = await supabase
      .from("recurring_charge_items")
      .select("recurring_charge_id, section, description, detail, quantity, unit, unit_price, position")
      .order("position");
    for (const i of rci ?? []) {
      (chargeItems[i.recurring_charge_id] ??= []).push({
        section: i.section,
        description: i.description,
        detail: i.detail,
        quantity: Number(i.quantity),
        unit: i.unit,
        unit_price: Number(i.unit_price),
      });
    }
    const { data: pk } = await supabase
      .from("service_packages")
      .select("id, name, currency, items:service_package_items(section, description, detail, quantity, unit, unit_price, position)")
      .eq("kind", "recurring")
      .is("archived_at", null)
      .order("name");
    chargePackages = (pk ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      currency: p.currency,
      items: [...(p.items ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    }));

    const { data: rcr } = await supabase
      .from("recurring_charge_runs")
      .select(`
        id, recurring_charge_id, period_start, period_end, invoice_id, generated_at, status,
        invoice:invoices(id, invoice_number, status, due_date, total_amount, currency)
      `)
      .order("generated_at", { ascending: false });
    recurringChargeRuns = ((rcr ?? []).map((r) => ({
      ...r,
      invoice: Array.isArray(r.invoice) ? r.invoice[0] : r.invoice,
    }))) as RecurringChargeRunItem[];
  }

  // 4. Reference data for creation dropdowns
  const { data: clientsData } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  const { data: systemsData } = await supabase
    .from("systems")
    .select("id, name, client_id, status")
    .order("name");

  const { data: resourcesData } = await supabase
    .from("resources")
    .select("id, name, client_id, resource_type, status")
    .order("name");

  const clientOptions = (clientsData ?? []).map((c) => ({
    id: c.id,
    label: c.company_name ? `${c.company_name} (${c.email})` : (c.full_name || c.email),
  }));

  const systemOptions = (systemsData ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    client_id: s.client_id,
  }));

  const resourceOptions = (resourcesData ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    client_id: r.client_id,
    resource_type: r.resource_type,
    status: r.status,
  }));

  const agreementResources = (agreementResourcesData ?? []).map((ar) => ({
    ...ar,
    resource: Array.isArray(ar.resource) ? ar.resource[0] : ar.resource,
  }));

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        eyebrow="Commercial Operations"
        title="Service Agreements & Recurring Billing"
        description="Service agreements, linked infrastructure resources, and recurring billing schedules. Invoices are generated into Finance."
      />

      <AgreementsManager
        agreements={agreementsData ?? []}
        agreementResources={agreementResources}
        recurringCharges={recurringCharges}
        recurringChargeRuns={recurringChargeRuns}
        clients={clientOptions}
        systems={systemOptions}
        resources={resourceOptions}
        isAdmin={isAdmin}
        canSeeFinancials={canSeeFinancials}
        isStaff={isStaff}
        chargeItems={chargeItems}
        chargePackages={chargePackages}
      />
    </div>
  );
}
