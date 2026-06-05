import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdf } from "@react-pdf/renderer";
import ReceiptPDF from "@/lib/pdf/receipt-template";

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

  const admin = createAdminClient();

  const { data: receipt } = await admin
    .from("receipts")
    .select("*")
    .eq("id", id)
    .single();

  if (!receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("id", receipt.payment_id)
    .single();

  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", receipt.invoice_id)
    .single();

  const { data: client } = await admin
    .from("profiles")
    .select("full_name, company_name, email")
    .eq("id", invoice.client_id)
    .single();

  if (!payment || !invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blob = await pdf(
    ReceiptPDF({ receipt, payment, invoice, client: client ?? { email: "" } })
  ).toBlob();

  const buffer = Buffer.from(await blob.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receipt.receipt_number}.pdf"`,
    },
  });
}
