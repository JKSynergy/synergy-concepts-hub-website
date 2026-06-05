import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const body = await req.json();
  const { invoiceId, amount, email } = body;

  if (!invoiceId || !amount) {
    return NextResponse.json({ error: "Missing invoice or amount" }, { status: 400 });
  }

  // Verify invoice belongs to user
  const { data: invoice } = await supabase
    .from("invoices")
    .select("client_id")
    .eq("id", invoiceId)
    .single();

  if (!invoice || invoice.client_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const customerEmail = profile?.email || email;
  if (!customerEmail) {
    return NextResponse.json({ error: "No email for customer" }, { status: 400 });
  }

  // Call Paystack API to initialize transaction
  const base = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000";
  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: customerEmail,
      amount: Math.round(amount * 100), // kobo
      callback_url: `${base}/client/invoices/${invoiceId}`,
      metadata: { invoice_id: invoiceId, user_id: user.id },
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    return NextResponse.json({ error: paystackData.message || "Paystack error" }, { status: 500 });
  }

  // Store reference for webhook matching
  await supabase.from("payments").insert({
    invoice_id: invoiceId,
    amount,
    method: "paystack",
    paystack_reference: paystackData.data.reference,
  });

  return NextResponse.json({ authorization_url: paystackData.data.authorization_url });
}
