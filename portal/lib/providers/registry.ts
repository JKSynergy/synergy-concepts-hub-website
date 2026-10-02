import { cloudflareAdapter } from "./cloudflare.ts";
import { railwayAdapter } from "./railway.ts";
import { supabaseAdapter } from "./supabase.ts";
import type { ProviderAdapter, ProviderKey } from "./types.ts";
import { vercelAdapter } from "./vercel.ts";

const ADAPTERS: Record<ProviderKey, ProviderAdapter> = {
  supabase: supabaseAdapter,
  railway: railwayAdapter,
  vercel: vercelAdapter,
  cloudflare: cloudflareAdapter,
};

export const PROVIDER_ADAPTER_KEYS = Object.keys(ADAPTERS) as ProviderKey[];

export function getAdapter(key: string | null | undefined): ProviderAdapter | null {
  if (!key || !(key in ADAPTERS)) return null;
  return ADAPTERS[key as ProviderKey];
}
