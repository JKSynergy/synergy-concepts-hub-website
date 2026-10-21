import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/notify";
import { quoteCorsHeaders } from "@/lib/cors/quote";
import { validateEnquiry, type FieldError } from "@/lib/quote/validate";
import { enquiryEmail } from "@/lib/quote/notify";
import { parseCatalog, validRate } from "@/lib/quote/catalog";
import { priceQuote, type PricedQuote } from "@/lib/quote/pricing";
import { validateQuotePayload, LOGISTICS_LABEL } from "@/lib/quote/structured";
import { quoteSummary, quoteTitle, lineAmount } from "@/lib/quote/summary";

// Public endpoint for the marketing-site enquiry and quotation forms.
// Validation happens here; the write (rate limit, duplicate check, lead and
// booking, and a structured quotation when present) is one atomic database
// call: submit_quote_request() (migrations 039, 040).
// Structured quotations (body.quote, from the Capture Films builder): the
// browser sends selections only; prices are computed here from the active
// catalogue, and a total the customer did not see is refused (409).
// Errors returned to the browser are generic: no database or internal detail.

const MAX_BODY_BYTES = 32 * 1024;

const GENERIC_FAILURE =
  "We could not send your request just now. Please try again, or email info@synergyconceptshub.com.";

function json(body: unknown, status: number, headers: Record<string, string>) {
  return NextResponse.json(body, { status, headers });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : request.headers.get("x-real-ip"))?.trim();
  return ip || null;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: quoteCorsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const headers = quoteCorsHeaders(request.headers.get("origin"));

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return json({ error: "This request is too large." }, 413, headers);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid request." }, 400, headers);
  }

  const structured = !!body && typeof body === "object" && "quote" in (body as Record<string, unknown>);
  const result = validateEnquiry(body, { requirePhone: structured });
  if (result.kind === "spam") {
    // Answer like a success so automated senders learn nothing; nothing is stored.
    return json({ success: true }, 201, headers);
  }
  if (result.kind === "invalid") {
    return json({ error: "Please check the highlighted fields.", fields: result.errors }, 400, headers);
  }
  const data = result.data;
  const ip = clientIp(request);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    console.error("quote: admin client unavailable");
    return json({ error: GENERIC_FAILURE }, 500, headers);
  }

  // A retry of a request that was already stored (same request id) returns the original
  // result before any price-list check, so a lost response never turns into a refusal.
  if (data.requestId) {
    const { data: prior } = await admin
      .from("bookings")
      .select("metadata")
      .eq("metadata->>request_id", data.requestId)
      .limit(1)
      .maybeSingle();
    if (prior) {
      const reference = (prior.metadata as { reference?: string } | null)?.reference ?? null;
      return json({ success: true, reference, duplicate: true }, 201, headers);
    }
  }

  // Structured quotation: validate, price on the server, refuse stale totals.
  let quote: Record<string, unknown> | null = null;
  let priced: PricedQuote | null = null;
  let message = data.brief;
  let title: string | null = null;
  let business: string | null = null;
  let service = data.service;
  if (structured) {
    const qv = validateQuotePayload((body as Record<string, unknown>).quote);
    const errs: FieldError[] = qv.ok ? [] : [...qv.errors];
    if (!data.requestId) errs.push({ field: "request_id", message: "Please reload the page and try again." });
    if (!qv.ok || errs.length) {
      return json({ error: "Please check the highlighted fields.", fields: errs }, 400, headers);
    }
    const { data: active, error: catErr } = await admin
      .from("quote_catalogs")
      .select("id, version, catalog, ugx_per_usd")
      .eq("business", "capture_films")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const parsed = active ? parseCatalog(active.catalog) : null;
    if (catErr || !active || !parsed || !parsed.ok) {
      console.error("quote: active catalogue unavailable");
      return json({ error: GENERIC_FAILURE }, 500, headers);
    }
    if (qv.data.catalogVersion !== active.version) {
      return json({ error: "Our prices were updated while you were choosing. Please review your quotation and send it again.", code: "catalog_changed" }, 409, headers);
    }
    const rate = active.ugx_per_usd === null ? null : Number(active.ugx_per_usd);
    const p = priceQuote(parsed.catalog, qv.data.selection, validRate(rate) ? rate : null);
    if (!p.ok) {
      return json({ error: "Please check your selections.", fields: p.errors }, 400, headers);
    }
    if (p.quote.estimate_ugx !== qv.data.expectedEstimateUgx) {
      return json({ error: "The total changed. Please review your quotation and send it again.", code: "estimate_mismatch" }, 409, headers);
    }
    priced = p.quote;
    const serviceLabels = priced.lines.filter((l) => l.kind === "service").map((l) => l.label.toLowerCase());
    title = quoteTitle(priced, serviceLabels);
    message = quoteSummary(priced, qv.data.details, qv.data.logistics, qv.data.details.notes);
    business = "Synergy Capture Films";
    service = "media";
    quote = {
      business: "capture_films",
      catalog_id: active.id,
      catalog_version: active.version,
      event_category: priced.event,
      event_label: priced.event_label,
      currency: priced.currency,
      ugx_per_usd: priced.ugx_per_usd,
      services: priced.services,
      lines: priced.lines,
      special_items: priced.special_items,
      deliverables: priced.deliverables,
      estimate_ugx: priced.estimate_ugx,
      estimate_usd: priced.estimate_usd,
      event_details: qv.data.details,
      logistics: qv.data.logistics,
      contact: { name: data.name, email: data.email, phone: data.phone },
    };
  }

  const { data: saved, error } = await admin.rpc("submit_quote_request", {
    p: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      service,
      message,
      title,
      business,
      request_id: data.requestId,
      email_hash: sha256(data.email.toLowerCase()),
      ip_hash: ip ? sha256(`ip:${ip}`) : null,
      ...(quote ? { quote } : {}),
    },
  });

  if (error) {
    if (/catalog_changed/.test(error.message ?? "")) {
      return json({ error: "Our prices were updated while you were choosing. Please review your quotation and send it again.", code: "catalog_changed" }, 409, headers);
    }
    if (/rate_limited/.test(error.message ?? "")) {
      return json(
        { error: "We have received several requests from you recently. Please wait a while, or email info@synergyconceptshub.com." },
        429,
        headers
      );
    }
    // Log the error class only: no customer details in logs.
    console.error("quote: submit failed", error.code ?? "unknown");
    return json({ error: GENERIC_FAILURE }, 500, headers);
  }

  const out = (saved ?? {}) as { reference?: string; duplicate?: boolean };

  if (!out.duplicate) {
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
    if (adminEmail) {
      const { subject, html } = enquiryEmail({
        reference: out.reference ?? null,
        name: data.name,
        email: data.email,
        phone: data.phone,
        service: priced ? `${priced.event_label} quotation` : service,
        message,
        rows: priced
          ? [
              ["Estimate", lineAmount(priced.estimate_ugx, priced.estimate_usd, priced.currency)],
              ["Logistics", LOGISTICS_LABEL[(quote as { logistics: keyof typeof LOGISTICS_LABEL }).logistics]],
            ]
          : undefined,
      });
      await sendEmail({ to: adminEmail, subject, html });
    }
  }

  return json(
    {
      success: true,
      reference: out.reference ?? null,
      ...(priced ? { estimate_ugx: priced.estimate_ugx, estimate_usd: priced.estimate_usd, currency: priced.currency } : {}),
    },
    201,
    headers
  );
}
