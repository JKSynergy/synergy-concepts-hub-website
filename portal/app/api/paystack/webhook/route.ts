import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  // In production, verify HMAC signature here.
  // For now we accept the webhook and process the event.
  const event = JSON.parse(body);

  if (event.event === "charge.success") {
    const data = event.data;
    const reference = data.reference as string;
    const amount = (data.amount as number) / 100; // Paystack sends kobo/cents
    const email = data.customer?.email as string;

    const admin = createAdminClient();

    // Find invoice by paystack_reference on payments table (if pre-created)
    // Or find the invoice via client email lookup and mark it paid.
    const { data: paymentRow } = await admin
      .from("payments")
      .select("id, invoice_id")
      .eq("paystack_reference", reference)
      .single();

    if (paymentRow) {
      await admin
        .from("payments")
        .update({ paid_at: new Date().toISOString(), amount })
        .eq("id", paymentRow.id);
    } else {
      // No pre-existing payment row; try to match by client email -> invoice
      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();

      if (profile) {
        // Find an unpaid invoice for this client and record the payment
        const { data: invoice } = await admin
          .from("invoices")
          .select("id")
          .eq("client_id", profile.id)
          .in("status", ["sent", "overdue"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (invoice) {
          await admin.from("payments").insert({
            invoice_id: invoice.id,
            amount,
            method: "paystack",
            paystack_reference: reference,
            paid_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
