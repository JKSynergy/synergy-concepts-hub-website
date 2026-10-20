import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaystackStore } from "@/lib/finance/paystack-store";
import { onlinePaymentCurrencies, processPaystackWebhook } from "@/lib/finance/payments";

// Paystack calls this endpoint server-to-server. It is not covered by the
// session middleware (the matcher excludes /api), so authenticity rests on the
// HMAC signature checked inside processPaystackWebhook.
export async function POST(req: NextRequest) {
  try {
    // The signature is computed over the exact bytes Paystack sent.
    const rawBody = Buffer.from(await req.arrayBuffer());
    const result = await processPaystackWebhook(
      {
        rawBody,
        signature: req.headers.get("x-paystack-signature"),
        secret: process.env.PAYSTACK_SECRET_KEY,
        allowedCurrencies: onlinePaymentCurrencies(process.env.PAYSTACK_CURRENCY),
      },
      createPaystackStore(createAdminClient())
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Paystack webhook failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Temporary failure, please retry" }, { status: 500 });
  }
}
