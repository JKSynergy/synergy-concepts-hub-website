import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInternal, canAccessFinance } from "@/lib/security/roles";
import { isUuid } from "@/lib/security/access";
import { loadAgreements, chargePeriods } from "@/lib/billing/agreement-data";
import { todayEAT } from "@/lib/billing/periods";
import type { ChargePackageOption } from "../charge-breakdown";
import AgreementDetail, { type SupportItem, type ResourceItem } from "./agreement-detail";
import "@/components/billing/billing.css";
import "../agreements.css";

export const metadata = { title: "Agreement" };

export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isInternal(profile.role)) redirect("/client");
  const finance = canAccessFinance(profile.role);

  const { agreements, charges, runs } = await loadAgreements(supabase, { finance, id });
  const agreement = agreements[0];
  if (!agreement) notFound();
  const today = todayEAT();
  const periods = charges.flatMap((c) => chargePeriods(agreement, c, runs, today));

  const [{ data: reqs }, { data: attached }, { data: res }, { data: sys }] = await Promise.all([
    supabase
      .from("support_requests")
      .select("id, reference, summary, priority, billing, status, requested_at, first_response_at, resolved_at, service_agreement_id")
      .eq("client_id", agreement.client_id)
      .or(`service_agreement_id.eq.${id},billing.eq.covered`)
      .order("requested_at", { ascending: false })
      .limit(20),
    supabase
      .from("agreement_resources")
      .select("resource_id, notes, attached_at, resource:resources(name, resource_type, status)")
      .eq("agreement_id", id),
    finance
      ? supabase.from("resources").select("id, name, resource_type, client_id").eq("client_id", agreement.client_id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; resource_type: string; client_id: string }[] }),
    finance
      ? supabase.from("systems").select("id, name").eq("client_id", agreement.client_id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  let packages: ChargePackageOption[] = [];
  if (finance) {
    const { data: pk } = await supabase
      .from("service_packages")
      .select("id, name, currency, items:service_package_items(section, description, detail, quantity, unit, unit_price, position)")
      .eq("kind", "recurring")
      .is("archived_at", null)
      .order("name");
    packages = (pk ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      currency: p.currency,
      items: [...(p.items ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    }));
  }

  const support: SupportItem[] = (reqs ?? []).map((r) => ({ ...r }));
  const resources: ResourceItem[] = (attached ?? []).map((a) => {
    const r = Array.isArray(a.resource) ? a.resource[0] : a.resource;
    return {
      id: a.resource_id,
      name: r?.name ?? "Resource",
      type: r?.resource_type ?? "",
      status: r?.status ?? "",
      notes: a.notes,
    };
  });
  const attachedIds = new Set(resources.map((r) => r.id));

  return (
    <div className="ux-page ux-page--wide ops-page">
      <Link href="/admin/agreements" className="ux-back">
        ← Agreements
      </Link>
      <AgreementDetail
        agreement={agreement}
        charges={charges}
        periods={periods}
        support={support}
        resources={resources}
        availableResources={(res ?? []).filter((r) => !attachedIds.has(r.id)).map((r) => ({ id: r.id, name: r.name, type: r.resource_type }))}
        systems={(sys ?? []).map((s) => ({ id: s.id, name: s.name }))}
        packages={packages}
        finance={finance}
        today={today}
        initialTab={tab}
      />
    </div>
  );
}
