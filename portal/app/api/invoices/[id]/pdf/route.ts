import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewInvoiceDocument, isPortalRole, isUuid } from "@/lib/security/access";
import { checkApplicationAccess } from "@/lib/actions/application-suspension";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "@/lib/pdf/invoice-template";
import {
  splitLines,
  splitProjectNotes,
  DEFAULT_SIGNATURE,
  DEFAULT_PAYMENT_METHODS,
  type InvoiceDoc,
} from "@/lib/pdf/invoice-doc";
import ServiceInvoicePDF from "@/lib/pdf/service-invoice-template";
import { buildServiceInvoice, type SvcRequestRecord } from "@/lib/pdf/service-invoice-doc";
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

  // Authorization uses the caller's own session. Every read below goes through
  // row-level security, so a client can only ever load their own non-draft
  // invoice; the explicit check is a second, independent gate. The service-role
  // key is not used by this route.
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

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!canViewInvoiceDocument({ role, userId: user.id, invoice })) {
    // Same answer for "does not exist" and "not yours": no enumeration.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", id);

  const { data: client } = await supabase
    .from("profiles")
    .select("full_name, company_name, email, billing_address, phone, tax_id")
    .eq("id", invoice!.client_id)
    .single();

  let project = null;
  if (invoice!.project_id) {
    const { data: p } = await supabase
      .from("projects")
      .select("title, description")
      .eq("id", invoice!.project_id)
      .maybeSingle();
    project = p;
  }

  const { data: payments } = await supabase
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

  // Itemised service invoices (recurring agreements and per-request support,
  // migration 037) use the service layout. Its service record comes from a
  // database function that re-checks the caller may see this invoice.
  if (invoice!.document_style === "service") {
    const { data: record } = await supabase.rpc("invoice_service_record", { p_invoice_id: id });
    const rec = (record ?? {}) as {
      agreement?: { name: string; contract_reference: string | null; billing_cycle: string | null } | null;
      requests?: SvcRequestRecord[];
      incidents?: { severity: string; opened_at: string }[] | null;
      backups?: { status: string }[] | null;
    };
    const c: {
      company_name?: string | null;
      full_name?: string | null;
      email?: string | null;
      billing_address?: string | null;
      phone?: string | null;
      tax_id?: string | null;
    } = client ?? {};
    const svc = buildServiceInvoice({
      invoice: invoice!,
      lines: lineItems ?? [],
      client: {
        name: c.company_name || c.full_name || c.email || "Client",
        lines: [c.billing_address, c.email, c.phone, c.tax_id ? `Tax ID: ${c.tax_id}` : null].filter(Boolean) as string[],
      },
      agreement: rec.agreement ?? null,
      requests: rec.requests ?? [],
      incidents: rec.incidents ?? null,
      backups: rec.backups ?? null,
      paymentMethods: DEFAULT_PAYMENT_METHODS,
      signature: { ...DEFAULT_SIGNATURE, imageSrc: signatureSrc },
    });
    const status = invoice!.status;
    const stampSrc =
      status === "paid"
        ? paidStampSrc
        : status === "partially paid"
          ? partialStampSrc
          : status === "sent" || status === "overdue"
            ? unpaidStampSrc
            : status === "cancelled"
              ? cancelledStampSrc
              : null;
    const svcBlob = await pdf(ServiceInvoicePDF({ inv: svc, logoSrc, stampSrc })).toBlob();
    return new NextResponse(Buffer.from(await svcBlob.arrayBuffer()), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice!.invoice_number}.pdf"`,
      },
    });
  }

  // Build the document model: scope comes from the invoice's own Scope of Work
  // field (falling back to the linked project), notes from the invoice itself.
  // Anything not supplied simply does not render.
  const doc: InvoiceDoc = {};

  const scopeOfWork = splitLines(invoice!.scope_of_work);
  if (scopeOfWork.length > 0) {
    doc.scope = { items: scopeOfWork };
  } else if (project) {
    const scopeLines = splitLines(project.description);
    doc.scope = {
      title: project.title,
      items: scopeLines.length > 1 ? scopeLines : [],
      paragraphs: scopeLines.length === 1 ? scopeLines : [],
    };
  }

  const noteLines = splitProjectNotes(invoice!.notes);
  if (noteLines.length > 0) doc.projectNotes = noteLines;

  doc.signature = signatureSrc ? { ...DEFAULT_SIGNATURE, imageSrc: signatureSrc } : null;

  const blob = await pdf(
    InvoicePDF({
      invoice: invoice!,
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
      doc,
    })
  ).toBlob();

  const buffer = Buffer.from(await blob.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice!.invoice_number}.pdf"`,
    },
  });
}
