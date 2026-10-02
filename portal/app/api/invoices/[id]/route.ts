import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromMinor, outstandingMinor, PAYABLE_STATUSES } from "@/lib/finance/payments";
import { isUuid } from "@/lib/security/access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!invoice || invoice.client_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: lineItems }, { data: payments }, { data: receipts }] = await Promise.all([
    supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("created_at", { ascending: true }),
    supabase.from("payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    supabase.from("receipts").select("*").eq("invoice_id", id),
  ]);

  // The balance is computed on the server (same function the payment route uses),
  // so the page never has to work out what is still owed.
  const settled = (payments ?? []).filter((p) => p.paid_at).map((p) => p.amount);
  const outstanding = fromMinor(outstandingMinor(invoice.total, settled));
  const payable =
    (PAYABLE_STATUSES as readonly string[]).includes(invoice.status) && outstanding > 0;

  return NextResponse.json({
    invoice,
    lineItems: lineItems ?? [],
    payments: payments ?? [],
    receipts: receipts ?? [],
    outstanding,
    payable,
  });
}
