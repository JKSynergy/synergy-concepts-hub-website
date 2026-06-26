import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdf } from "@react-pdf/renderer";
import ReceiptPDF from "@/lib/pdf/receipt-template";
import { readFileSync } from "fs";
import { join } from "path";

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

  const { data: payments } = await admin
    .from("payments")
    .select("*")
    .eq("invoice_id", receipt.invoice_id);

  const { data: client } = await admin
    .from("profiles")
    .select("full_name, company_name, email")
    .eq("id", invoice.client_id)
    .single();

  if (!payment || !invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const logoPath = join(process.cwd(), "public", "images", "logo-with-black.png");
  const logoBuffer = readFileSync(logoPath);
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const signaturePath = join(process.cwd(), "public", "images", "SCH E-Signature small.png");
  const signatureBuffer = readFileSync(signaturePath);
  const signatureSrc = `data:image/png;base64,${signatureBuffer.toString("base64")}`;

  const paidStampPath = join(process.cwd(), "public", "images", "SCH E-Stamp small paid.png");
  const paidStampBuffer = readFileSync(paidStampPath);
  const paidStampSrc = `data:image/png;base64,${paidStampBuffer.toString("base64")}`;

  const blob = await pdf(
    ReceiptPDF({ receipt, payment, invoice, client: client ?? { email: "" }, logoSrc, signatureSrc, paidStampSrc, payments: payments ?? [] })
  ).toBlob();

  const buffer = Buffer.from(await blob.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receipt.receipt_number}.pdf"`,
    },
  });
}
