import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "@/lib/pdf/invoice-template";

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
    .select("full_name, company_name, email, billing_address")
    .eq("id", invoice.client_id)
    .single();

  const blob = await pdf(
    InvoicePDF({ invoice, lineItems: lineItems ?? [], client: client ?? { email: "" } })
  ).toBlob();

  const buffer = Buffer.from(await blob.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}
