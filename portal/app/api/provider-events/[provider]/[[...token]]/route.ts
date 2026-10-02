import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestProviderEvent } from "@/lib/provider-events/service";

/**
 * POST /api/provider-events/:provider[/token]
 *
 * Authenticated provider webhook ingestion (Phase 3G-5). The provider path
 * segment selects the adapter; the optional path token is the credential for
 * providers that cannot sign requests (Railway). The caller never supplies
 * account identifiers — authentication alone determines the account.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string; token?: string[] }> }
) {
  const { provider, token } = await params;
  if (token && token.length > 1) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  try {
    const rawBody = Buffer.from(await req.arrayBuffer());
    const result = await ingestProviderEvent(createAdminClient(), {
      providerKey: provider,
      urlToken: token?.[0],
      headers: req.headers,
      rawBody,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

// Webhooks are POST-only; every other verb is a plain 405.
export function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
