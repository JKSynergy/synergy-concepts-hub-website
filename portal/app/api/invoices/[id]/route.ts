import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    .single();

  if (!invoice || invoice.client_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: lineItems }, { data: payments }, { data: receipts }] = await Promise.all([
    supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("created_at", { ascending: true }),
    supabase.from("payments").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
    supabase.from("receipts").select("*").eq("invoice_id", id),
  ]);

  return NextResponse.json({ invoice, lineItems: lineItems ?? [], payments: payments ?? [], receipts: receipts ?? [] });
}
