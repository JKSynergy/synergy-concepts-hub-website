import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "@/lib/pdf/invoice-template";
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

  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: lineItems } = await admin
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", id);

  const { data: client } = await admin
    .from("profiles")
    .select("full_name, company_name, email, billing_address, phone, tax_id")
    .eq("id", invoice.client_id)
    .single();

  let project = null;
  if (invoice.project_id) {
    const { data: p } = await admin
      .from("projects")
      .select("title, description")
      .eq("id", invoice.project_id)
      .single();
    project = p;
  }

  const { data: payments } = await admin
    .from("payments")
    .select("*")
    .eq("invoice_id", id);

  const logoPath = join(process.cwd(), "public", "images", "logo-with-black.png");
  const logoBuffer = readFileSync(logoPath);
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const paidStampPath = join(process.cwd(), "public", "images", "SCH E-Stamp small paid.png");
  const paidStampBuffer = readFileSync(paidStampPath);
  const paidStampSrc = `data:image/png;base64,${paidStampBuffer.toString("base64")}`;

  const unpaidStampPath = join(process.cwd(), "public", "images", "SCH E-Stamp small unpaid.png");
  const unpaidStampBuffer = readFileSync(unpaidStampPath);
  const unpaidStampSrc = `data:image/png;base64,${unpaidStampBuffer.toString("base64")}`;

  const partialStampPath = join(process.cwd(), "public", "images", "SCH E-Stamp small partially paid.png");
  const partialStampBuffer = readFileSync(partialStampPath);
  const partialStampSrc = `data:image/png;base64,${partialStampBuffer.toString("base64")}`;

  const cancelledStampPath = join(process.cwd(), "public", "images", "SCH E-Stamp small Cancelled.png");
  const cancelledStampBuffer = readFileSync(cancelledStampPath);
  const cancelledStampSrc = `data:image/png;base64,${cancelledStampBuffer.toString("base64")}`;

  const signaturePath = join(process.cwd(), "public", "images", "SCH E-Signature small.png");
  const signatureBuffer = readFileSync(signaturePath);
  const signatureSrc = `data:image/png;base64,${signatureBuffer.toString("base64")}`;

  const blob = await pdf(
    InvoicePDF({
      invoice,
      lineItems: lineItems ?? [],
      client: client ?? { email: "" },
      logoSrc,
      paidStampSrc,
      unpaidStampSrc,
      partialStampSrc,
      cancelledStampSrc,
      signatureSrc,
      project,
      payments: payments ?? [],
    })
  ).toBlob();

  const buffer = Buffer.from(await blob.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}
