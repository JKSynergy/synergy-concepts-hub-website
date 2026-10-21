import { NextRequest, NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { canAccessFinance } from "@/lib/security/roles";
import { isUuid } from "@/lib/security/access";
import ServiceInvoicePDF from "@/lib/pdf/service-invoice-template";
import { buildServiceInvoice, type SvcRequestRecord } from "@/lib/pdf/service-invoice-doc";
import { DEFAULT_PAYMENT_METHODS, DEFAULT_SIGNATURE } from "@/lib/pdf/invoice-doc";
import { brandAssets } from "@/lib/pdf/brand-assets";
import { preparePdfFonts } from "@/lib/pdf/pdf-theme";
import { addDays, todayEAT } from "@/lib/billing/periods";

// Preview of the invoice one billing period of an agreement would produce.
// Nothing is saved. Admin/Finance only; every read goes through RLS and the
// period itself is validated by the database (agreement_charge_period).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const charge = req.nextUrl.searchParams.get("charge") ?? "";
  const start = req.nextUrl.searchParams.get("start") ?? "";
  if (!isUuid(id) || !isUuid(charge) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!canAccessFinance(me?.role)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: agr } = await supabase
    .from("service_agreements")
    .select("id, client_id, payment_due_days")
    .eq("id", id)
    .maybeSingle();
  const { data: ch } = await supabase
    .from("recurring_charges")
    .select("id, agreement_id, name, description, amount, currency")
    .eq("id", charge)
    .maybeSingle();
  if (!agr || !ch || ch.agreement_id !== agr.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: period, error: periodError } = await supabase
    .rpc("agreement_charge_period", { p_charge_id: charge, p_period_start: start })
    .single();
  if (periodError || !period) {
    return NextResponse.json({ error: periodError?.message ?? "Invalid period" }, { status: 400 });
  }
  const { period_start, period_end } = period as { period_start: string; period_end: string };

  const [{ data: items }, { data: record }, { data: client }] = await Promise.all([
    supabase
      .from("recurring_charge_items")
      .select("section, description, detail, quantity, unit, unit_price, position")
      .eq("recurring_charge_id", charge)
      .order("position"),
    supabase.rpc("agreement_period_record", { p_agreement_id: id, p_start: period_start, p_end: period_end }),
    supabase
      .from("profiles")
      .select("company_name, full_name, email, billing_address, phone, tax_id")
      .eq("id", agr.client_id)
      .single(),
  ]);

  const lines = (items?.length
    ? items
    : [{ section: null, description: ch.name, detail: ch.description, quantity: 1, unit: null, unit_price: ch.amount, position: 0 }]
  ).map((i) => ({
    ...i,
    amount: Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100,
    period_start,
    period_end,
  }));
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const issue = todayEAT();
  const rec = (record ?? {}) as {
    agreement?: { name: string; contract_reference: string | null; billing_cycle: string | null; response_targets?: unknown; scope_excluded?: string | null } | null;
    requests?: SvcRequestRecord[];
    incidents?: { severity: string; opened_at: string }[] | null;
    backups?: { status: string }[] | null;
  };
  const c = client ?? ({} as Record<string, string | null>);
  const assets = brandAssets();

  const svc = buildServiceInvoice({
    invoice: {
      invoice_number: "PREVIEW",
      status: "draft",
      issue_date: issue,
      due_date: addDays(issue, Number(agr.payment_due_days ?? 14)),
      currency: ch.currency,
      subtotal: total,
      tax_rate: 0,
      tax_amount: 0,
      total,
      service_period_start: period_start,
      service_period_end: period_end,
    },
    lines,
    client: {
      name: c.company_name || c.full_name || c.email || "Client",
      lines: [c.billing_address, c.email, c.phone, c.tax_id ? `Tax ID: ${c.tax_id}` : null].filter(Boolean) as string[],
    },
    agreement: rec.agreement ?? null,
    requests: rec.requests ?? [],
    incidents: rec.incidents ?? null,
    backups: rec.backups ?? null,
    paymentMethods: DEFAULT_PAYMENT_METHODS,
    signature: { ...DEFAULT_SIGNATURE, imageSrc: assets.signature },
  });

  await preparePdfFonts();
  const blob = await pdf(ServiceInvoicePDF({ inv: svc, logoSrc: assets.logo, stampSrc: null })).toBlob();
  return new NextResponse(Buffer.from(await blob.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-preview-${period_start}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
