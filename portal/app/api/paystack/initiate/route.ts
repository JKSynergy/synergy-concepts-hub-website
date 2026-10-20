import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromMinor, onlinePaymentCurrencies, validatePaymentIntent } from "@/lib/finance/payments";
import { isUuid } from "@/lib/security/access";
import { getPortalBaseUrl } from "@/lib/portal-url";
import { checkApplicationAccess } from "@/lib/actions/application-suspension";

export async function POST(req: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

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

  let body: { invoiceId?: unknown; amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isUuid(body.invoiceId)) {
    return NextResponse.json({ error: "Missing invoice" }, { status: 400 });
  }
  const invoiceId = body.invoiceId;

  // Both reads use the caller's own session, so row-level security also applies:
  // a client only ever sees their own non-draft invoices and settled payments.
  const [{ data: invoice }, { data: settled }] = await Promise.all([
    supabase.from("invoices").select("client_id, status, total, currency").eq("id", invoiceId).maybeSingle(),
    supabase.from("payments").select("amount").eq("invoice_id", invoiceId).not("paid_at", "is", null),
  ]);

  // The server decides the amount. The browser may only ask for less than the
  // outstanding balance; by default the whole balance is paid.
  const intent = validatePaymentIntent({
    invoice,
    userId: user.id,
    settledAmounts: (settled ?? []).map((p) => p.amount),
    requestedAmount: body.amount,
    allowedCurrencies: onlinePaymentCurrencies(process.env.PAYSTACK_CURRENCY),
  });
  if (!intent.ok) {
    return NextResponse.json({ error: intent.error }, { status: intent.status });
  }

  // The customer e-mail comes from the signed-in account, never from the request.
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single();
  const customerEmail = profile?.email;
  if (!customerEmail) {
    return NextResponse.json({ error: "No email for customer" }, { status: 400 });
  }

  // Create the payment record BEFORE calling Paystack, under a reference we
  // generate, so the webhook can only ever match this exact row. The insert uses
  // the service role because clients have no INSERT policy on payments.
  const admin = createAdminClient();
  const reference = `SCH-${randomUUID()}`;
  const { data: pending, error: insertError } = await admin
    .from("payments")
    .insert({
      invoice_id: invoiceId,
      amount: fromMinor(intent.amountMinor),
      method: "paystack",
      paystack_reference: reference,
    })
    .select("id")
    .single();
  if (insertError || !pending) {
    console.error("Could not create pending payment:", insertError?.message);
    return NextResponse.json({ error: "Could not start payment" }, { status: 500 });
  }

  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: customerEmail,
      amount: intent.amountMinor, // minor units, computed on the server
      reference,
      // Always the invoice's own currency (validated above), never the browser's.
      currency: intent.currency,
      callback_url: `${getPortalBaseUrl()}/client/invoices/${invoiceId}`,
      metadata: { invoice_id: invoiceId, user_id: user.id },
    }),
  });

  const paystackData = await paystackRes.json().catch(() => null);
  if (!paystackData?.status || !paystackData.data?.authorization_url) {
    // Nothing was charged: remove the unused pending attempt.
    await admin.from("payments").delete().eq("id", pending.id).is("paid_at", null);
    return NextResponse.json({ error: "Payment provider error. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ authorization_url: paystackData.data.authorization_url });
}
