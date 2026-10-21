import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { quoteCorsHeaders } from "@/lib/cors/quote";
import { parseCatalog, validRate } from "@/lib/quote/catalog";

// Public, read-only: the active Synergy Capture Films price list for the
// marketing-site quotation builder. Prices change here (portal admin) without
// rebuilding the marketing site. USD is offered only when a valid rate is set.

const METHODS = "GET, OPTIONS";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: quoteCorsHeaders(request.headers.get("origin"), METHODS) });
}

export async function GET(request: Request) {
  const headers = quoteCorsHeaders(request.headers.get("origin"), METHODS);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quote_catalogs")
      .select("version, catalog, ugx_per_usd, published_at")
      .eq("business", "capture_films")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const parsed = data ? parseCatalog(data.catalog) : null;
    if (error || !data || !parsed || !parsed.ok) {
      console.error("quote catalogue: unavailable");
      return NextResponse.json({ error: "Price list unavailable." }, { status: 503, headers });
    }
    const rate = data.ugx_per_usd === null ? null : Number(data.ugx_per_usd);
    return NextResponse.json(
      {
        business: "capture_films",
        version: data.version,
        published_at: data.published_at,
        ugx_per_usd: validRate(rate) ? rate : null,
        usd_available: validRate(rate),
        catalog: parsed.catalog,
      },
      { status: 200, headers: { ...headers, "Cache-Control": "public, max-age=60, s-maxage=60" } }
    );
  } catch {
    console.error("quote catalogue: failed");
    return NextResponse.json({ error: "Price list unavailable." }, { status: 503, headers });
  }
}
