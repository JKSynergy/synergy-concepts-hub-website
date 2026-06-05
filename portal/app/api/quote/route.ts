import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/notify";

// The marketing site lives on a different origin (Cloudflare Pages), so this
// public endpoint must send CORS headers. Restrict to the configured origin
// when set, otherwise allow all (useful in dev).
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = process.env.MARKETING_SITE_ORIGIN;
  const allowOrigin = allowed ?? origin ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  let body: {
    name?: string;
    email?: string;
    phone?: string;
    service?: string;
    brief?: string;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers }
    );
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400, headers }
    );
  }

  const admin = createAdminClient();

  // 1. Create lead
  const { error: leadError } = await admin.from("leads").insert({
    name,
    email,
    phone: body.phone?.trim() || null,
    service_interest: body.service?.trim() || null,
    message: (body.brief || body.message)?.trim() || null,
    source: "marketing_site",
    status: "new",
  });

  if (leadError) {
    return NextResponse.json({ error: leadError.message }, { status: 500, headers });
  }

  // 2. Also create a custom_request booking so it appears in the admin dashboard
  const { error: bookingError } = await admin.from("bookings").insert({
    client_id: null, // will be linked when lead is converted
    type: "custom_request",
    status: "pending",
    title: `Quote request: ${body.service ?? "Custom project"}`,
    description: (body.brief || body.message)?.trim() || null,
    metadata: {
      lead_name: name,
      lead_email: email,
      lead_phone: body.phone?.trim() || null,
      service_interest: body.service?.trim() || null,
    },
  });

  // Non-fatal if booking insert fails; lead is the primary record
  if (bookingError) {
    console.error("Quote booking insert failed:", bookingError.message);
  }

  // Best-effort staff notification
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `New quote request from ${name}`,
      html: `<p><strong>${name}</strong> (${email}) requested a quote.</p>
             <p>Service: ${body.service ?? "—"}</p>
             <p>${(body.brief || body.message) ?? ""}</p>`,
    });
  }

  return NextResponse.json({ success: true }, { status: 201, headers });
}
