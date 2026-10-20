import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { canAccessFinance, isInternal } from "@/lib/security/roles";
import SupportManager, { type SupportRequestRow, type RateCard } from "./support-manager";
import type { BreakdownRow } from "@/components/billing/breakdown-editor";
import { measure, parseTargets } from "@/lib/billing/response-targets";
import "@/components/billing/billing.css";

export const metadata = { title: "Support Requests" };

// Embedded rows arrive as an object or a one-element array depending on the relation.
const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] as T) ?? null : (v as T) ?? null);

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isInternal(profile.role)) redirect("/client");
  const finance = canAccessFinance(profile.role);

  const { data: requests } = await supabase
    .from("support_requests")
    .select(`
      id, reference, client_id, system_id, service_agreement_id, rate_package_id, summary, work_done,
      priority, channel, billing, status, requested_at, first_response_at, resolved_at, quote_agreed_at, invoice_id, created_at,
      client:profiles!client_id(company_name, full_name, email),
      system:systems(name),
      agreement:service_agreements(name),
      recorder:profiles!recorded_by(full_name, email)
    `)
    .order("requested_at", { ascending: false })
    .limit(500);

  const { data: clientsData } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  const { data: systemsData } = await supabase.from("systems").select("id, name, client_id").order("name");
  const { data: agreementsData } = await supabase
    .from("staff_service_agreements_view")
    .select("id, name, client_id, status, response_targets");

  const items: Record<string, BreakdownRow[]> = {};
  const invoices: Record<string, { number: string; status: string }> = {};
  let rateCards: RateCard[] = [];
  const currencyByClient: Record<string, string> = {};

  if (finance) {
    const { data: it } = await supabase
      .from("support_request_items")
      .select("support_request_id, section, description, detail, quantity, unit, unit_price, position")
      .order("position");
    for (const i of it ?? []) {
      (items[i.support_request_id] ??= []).push({
        section: i.section,
        description: i.description,
        detail: i.detail,
        quantity: Number(i.quantity),
        unit: i.unit,
        unit_price: Number(i.unit_price),
      });
    }

    const invoiceIds = [...new Set((requests ?? []).map((r) => r.invoice_id).filter(Boolean))] as string[];
    if (invoiceIds.length) {
      const { data: inv } = await supabase.from("invoices").select("id, invoice_number, status").in("id", invoiceIds);
      for (const i of inv ?? []) invoices[i.id] = { number: i.invoice_number, status: i.status };
    }

    const { data: pk } = await supabase
      .from("service_packages")
      .select("id, name, currency, items:service_package_items(section, description, detail, quantity, unit, unit_price, position)")
      .eq("kind", "per_request")
      .is("archived_at", null)
      .order("name");
    rateCards = (pk ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      currency: p.currency,
      items: [...(p.items ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    }));

    // Default invoice currency per client: their recurring charges, else UGX.
    const { data: ch } = await supabase.from("recurring_charges").select("currency, agreement:service_agreements(client_id)");
    for (const c of ch ?? []) {
      const a = one<{ client_id: string }>(c.agreement);
      if (a?.client_id) currencyByClient[a.client_id] = c.currency;
    }
  }

  // Response targets: the request's agreement, else the client's active one.
  const targetsByAgreement: Record<string, ReturnType<typeof parseTargets>> = {};
  const activeByClient: Record<string, string> = {};
  for (const a of agreementsData ?? []) {
    targetsByAgreement[a.id] = parseTargets(a.response_targets);
    if (a.status === "active" && !activeByClient[a.client_id]) activeByClient[a.client_id] = a.id;
  }
  const now = new Date();

  const rows: SupportRequestRow[] = (requests ?? []).map((r) => {
    const agrId = r.service_agreement_id ?? activeByClient[r.client_id] ?? null;
    const outcome = r.billing === "covered" && agrId && r.status !== "cancelled" ? measure(targetsByAgreement[agrId], r, now) : null;
    const client = one<{ company_name: string | null; full_name: string | null; email: string }>(r.client);
    const recorder = one<{ full_name: string | null; email: string }>(r.recorder);
    return {
      id: r.id,
      reference: r.reference,
      client_id: r.client_id,
      clientName: client?.company_name || client?.full_name || client?.email || "Client",
      system_id: r.system_id,
      systemName: one<{ name: string }>(r.system)?.name ?? null,
      agreementName: one<{ name: string }>(r.agreement)?.name ?? null,
      rate_package_id: r.rate_package_id,
      summary: r.summary,
      work_done: r.work_done,
      priority: r.priority,
      channel: r.channel,
      billing: r.billing,
      status: r.status,
      requested_at: r.requested_at,
      first_response_at: r.first_response_at,
      resolved_at: r.resolved_at,
      quote_agreed_at: r.quote_agreed_at,
      target: outcome ? { label: outcome.target.target, met: outcome.met } : null,
      invoice_id: r.invoice_id,
      invoice: r.invoice_id ? invoices[r.invoice_id] ?? null : null,
      recordedBy: recorder?.full_name || recorder?.email || null,
      items: items[r.id] ?? [],
    };
  });

  const clients = (clientsData ?? []).map((c) => ({
    id: c.id,
    label: c.company_name || c.full_name || c.email,
  }));

  return (
    <div className="ux-page ux-page--wide ops-page">
      <PageHeader
        eyebrow="Work"
        title="Support"
        description="Every time a client contacts us for help. Requests under a managed agreement are covered and appear in that client's monthly service record; one-off maintenance is quoted per job, agreed with the client, and each finished job is invoiced from here."
      />
      <SupportManager
        requests={rows}
        clients={clients}
        systems={(systemsData ?? []).map((s) => ({ id: s.id, name: s.name, client_id: s.client_id }))}
        agreements={(agreementsData ?? []).map((a) => ({ id: a.id, name: a.name, client_id: a.client_id, status: a.status }))}
        rateCards={rateCards}
        currencyByClient={currencyByClient}
        canPrice={finance}
      />
    </div>
  );
}
