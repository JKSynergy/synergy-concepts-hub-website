import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewInvoiceDocument, isPortalRole, isUuid } from "@/lib/security/access";
import { checkApplicationAccess } from "@/lib/actions/application-suspension";
import { pdf } from "@react-pdf/renderer";
import ReceiptPDF from "@/lib/pdf/receipt-template";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same model as the invoice PDF: caller's own session (row-level security)
  // plus an explicit ownership check. The service-role key is not used here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await checkApplicationAccess(user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = isPortalRole(me?.role) ? me.role : null;

  const { data: receipt } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", receipt.invoice_id)
    .maybeSingle();

  if (!canViewInvoiceDocument({ role, userId: user.id, invoice })) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", receipt.payment_id)
    .maybeSingle();

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", receipt.invoice_id);

  const { data: client } = await supabase
    .from("profiles")
    .select("full_name, company_name, email")
    .eq("id", invoice!.client_id)
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
