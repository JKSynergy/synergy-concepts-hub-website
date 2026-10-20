import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { canAccessFinance, isInternal } from "@/lib/security/roles";
import PackagesManager, { type PackageRow } from "./packages-manager";
import "@/components/billing/billing.css";

export const metadata = { title: "Service Packages" };

export default async function PackagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isInternal(profile.role)) redirect("/client");
  if (!canAccessFinance(profile.role)) redirect("/admin");

  const { data: packages } = await supabase
    .from("service_packages")
    .select("id, name, kind, currency, billing_cycle, description, archived_at, updated_at, items:service_package_items(section, description, detail, quantity, unit, unit_price, position)")
    .order("name");

  const { data: charges } = await supabase.from("recurring_charges").select("package_id").not("package_id", "is", null);
  const { data: requests } = await supabase.from("support_requests").select("rate_package_id").not("rate_package_id", "is", null);

  const usage = new Map<string, number>();
  for (const r of [...(charges ?? []).map((c) => c.package_id), ...(requests ?? []).map((r) => r.rate_package_id)]) {
    if (r) usage.set(r as string, (usage.get(r as string) ?? 0) + 1);
  }

  const rows: PackageRow[] = (packages ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    currency: p.currency,
    billing_cycle: p.billing_cycle,
    description: p.description,
    archived_at: p.archived_at,
    updated_at: p.updated_at,
    usedBy: usage.get(p.id) ?? 0,
    items: [...(p.items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
  }));

  return (
    <div className="ux-page ux-page--wide ops-page">
      <PageHeader
        eyebrow="Finance"
        title="Packages"
        description="Reusable price breakdowns. A monthly package explains a standard fee line by line on the invoice; a quote template holds the usual lines for a one-off job, so each quote starts from them and can be adjusted."
      />
      <PackagesManager packages={rows} />
    </div>
  );
}
