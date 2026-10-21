"use server";

// Capture Films quotations: staff review and price-list management.
// The database functions add_quote_review() and publish_quote_catalog()
// (migration 040) enforce admin-only access themselves; these actions check
// first so the UI gets a clear message.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageQuoteCatalog, canReviewQuotes } from "@/lib/security/roles";
import { parseCatalog, validRate } from "@/lib/quote/catalog";

type ActionResult = { error?: string; success?: boolean; version?: number };

// Messages raised by our own database functions are written for people; anything
// else (an unexpected database error) is replaced by a generic message.
const SAFE_CODES = new Set(["23514", "42501", "P0002", "22023"]);
function safeError(e: { code?: string; message?: string } | null, fallback: string): string {
  if (e?.code && SAFE_CODES.has(e.code) && e.message && e.message.length < 200) return e.message;
  if (e) console.error("quotes action failed", e.code ?? "unknown");
  return fallback;
}

async function currentRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, role: null as string | null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { supabase, role: (profile?.role ?? null) as string | null };
}

function wholeUgx(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  if (s === "") return 0;
  if (!/^\d{1,13}$/.test(s)) return null;
  return Number(s);
}

export async function addQuoteReview(quoteRequestId: string, bookingId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, role } = await currentRole();
  if (!canReviewQuotes(role)) return { error: "Only an administrator can review a quotation." };

  const discount = wholeUgx(formData.get("discount_ugx"));
  const adjusted = wholeUgx(formData.get("adjusted_ugx"));
  const logistics = wholeUgx(formData.get("logistics_ugx"));
  if (discount === null || adjusted === null || logistics === null) {
    return { error: "Amounts must be whole UGX numbers." };
  }
  const currency = formData.get("final_currency") === "USD" ? "USD" : "UGX";
  const rateRaw = String(formData.get("ugx_per_usd") ?? "").trim();
  const rate = rateRaw === "" ? null : Number(rateRaw);
  if (currency === "USD" && !validRate(rate)) return { error: "Enter the UGX per USD rate for a USD quotation." };
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;

  const { error } = await supabase.rpc("add_quote_review", {
    p_quote_request_id: quoteRequestId,
    p_discount_ugx: discount,
    p_adjusted_ugx: adjusted,
    p_logistics_ugx: logistics,
    p_final_currency: currency,
    p_ugx_per_usd: currency === "USD" ? rate : null,
    p_notes: notes,
  });
  if (error) return { error: safeError(error, "The review could not be saved.") };
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { success: true };
}

export async function publishQuoteCatalog(input: { catalog: unknown; ugxPerUsd: string; note: string }): Promise<ActionResult> {
  const { supabase, role } = await currentRole();
  if (!canManageQuoteCatalog(role)) return { error: "Only an administrator can change the price list." };

  const parsed = parseCatalog(input.catalog);
  if (!parsed.ok) return { error: `The price list has problems: ${parsed.errors.slice(0, 3).join(" ")}` };
  const rateRaw = (input.ugxPerUsd ?? "").trim();
  const rate = rateRaw === "" ? null : Number(rateRaw);
  if (rate !== null && !validRate(rate)) return { error: "The exchange rate must be a positive number of UGX per 1 USD, or empty." };
  const note = (input.note ?? "").trim().slice(0, 500) || null;

  const { data, error } = await supabase.rpc("publish_quote_catalog", {
    p_business: "capture_films",
    p_catalog: parsed.catalog,
    p_ugx_per_usd: rate,
    p_note: note,
  });
  if (error) return { error: safeError(error, "The price list could not be published.") };
  revalidatePath("/admin/services/capture-films");
  return { success: true, version: data as number };
}
